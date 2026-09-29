const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
const PORT=process.env.PORT||3000, DB=path.join(__dirname,'players.json');
let players={};
const activeUsers=new Map();try{const raw=JSON.parse(fs.readFileSync(DB,'utf8')||'{}'); if(Array.isArray(raw)) for(const p of raw){if(p&&p.nick) players[String(p.nick).toLowerCase()]={...p};} else if(raw&&raw.players&&Array.isArray(raw.players)) for(const p of raw.players){if(p&&p.nick) players[String(p.nick).toLowerCase()]={...p};} else if(raw&&typeof raw==='object') players=raw;}catch(e){players={}}
function save(){try{fs.writeFileSync(DB,JSON.stringify(players,null,2))}catch(e){}}
function makePlayerId(){return 'p_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10)}
function normNick(v){return String(v||'').trim().toLowerCase()}
function mergePlayerRecords(preferredId, nick, previousNick){
  const names=[previousNick,nick].filter(Boolean).map(normNick);
  let targetId=preferredId && players[preferredId] ? preferredId : null;
  // Previous Nick has priority: it proves this is a rename, even if a new
  // browser-generated playerId was accidentally created in an earlier version.
  if(previousNick){
    for(const [key,p] of Object.entries(players)){
      if(p && (normNick(p.nick)===normNick(previousNick) || (Array.isArray(p.nickHistory)&&p.nickHistory.map(normNick).includes(normNick(previousNick))))){
        targetId=key; break;
      }
    }
  }
  if(!targetId && nick){
    for(const [key,p] of Object.entries(players)){
      if(p && normNick(p.nick)===normNick(nick)){targetId=key;break;}
    }
  }
  return targetId;
}
function findPlayer(id,nick,previousNick){
  const target=mergePlayerRecords(null,nick,previousNick);
  if(target) return [target,players[target]];
  if(id&&players[id]) return [id,players[id]];
  return [null,null];
}
function upsertPlayer(d){
  const nick=String(d.nick||'').trim().slice(0,16);
  if(!nick) return null;
  const suppliedId=String(d.playerId||'').trim();
  const previousNick=String(d.previousNick||'').trim().slice(0,16);
  // Rename resolution ALWAYS happens before trusting a newly supplied id.
  let id=mergePlayerRecords(null,nick,previousNick);
  if(!id && suppliedId && players[suppliedId]) id=suppliedId;
  if(!id) id=suppliedId||makePlayerId();
  let old=players[id]||{};
  const history=new Set([...(Array.isArray(old.nickHistory)?old.nickHistory:[]), ...(previousNick?[previousNick]:[])].filter(Boolean));
  const player={...old,playerId:id,nick,nickHistory:[...history].slice(-20),level:Math.max(+old.level||1,+d.level||1),xp:Math.max(+old.xp||0,+d.xp||0),wins:Math.max(+old.wins||0,+d.wins||0),lastSeen:Date.now()};
  // Remove stale duplicate records created by the old Nick-as-key system or a
  // previous bad playerId. Merge their progress into the canonical record.
  for(const [key,p] of Object.entries(players)){
    if(key===id || !p) continue;
    const aliases=Array.isArray(p.nickHistory)?p.nickHistory.map(normNick):[];
    const sameAlias=aliases.some(a=>history.has(a));
    const samePrevious=previousNick && (normNick(p.nick)===normNick(previousNick)||aliases.includes(normNick(previousNick)));
    if(sameAlias||samePrevious){
      player.level=Math.max(+player.level||1,+p.level||1);
      player.xp=Math.max(+player.xp||0,+p.xp||0);
      player.wins=Math.max(+player.wins||0,+p.wins||0);
      for(const h of (p.nickHistory||[])) if(h && !history.has(h)){history.add(h);}
      delete players[key];
    }
  }
  player.nickHistory=[...history].slice(-20);
  players[id]=player; save(); return player;
}
function normalizePlayers(){
  let changed=false; const out={};
  for(const [key,p0] of Object.entries(players||{})){
    if(!p0||!p0.nick) continue;
    const p={...p0,playerId:p0.playerId||makePlayerId(),nickHistory:Array.isArray(p0.nickHistory)?p0.nickHistory:[]};
    const k=p.playerId; const old=out[k];
    if(!old) out[k]=p; else {
      out[k]={...old,...p,level:Math.max(+old.level||1,+p.level||1),xp:Math.max(+old.xp||0,+p.xp||0),wins:Math.max(+old.wins||0,+p.wins||0),nickHistory:[...new Set([...(old.nickHistory||[]),...(p.nickHistory||[])])].slice(-20)};
      changed=true;
    }
    if(key!==k||!p0.playerId) changed=true;
  }
  players=out; if(changed) save();
}
normalizePlayers()
function rankForWins(w){w=+w||0;if(w>=30)return 'Champion';if(w>=25)return 'Diamante';if(w>=20)return 'Platina';if(w>=15)return 'Ouro';if(w>=10)return 'Prata';if(w>=5)return 'Bronze';return 'Sem Rank'}
function rankColor(r){return ({'Sem Rank':'#fff','Bronze':'#cd7f32','Prata':'#c0c0c0','Ouro':'#ffd700','Platina':'#7ee6e8','Diamante':'#55b9ff','Champion':'#ff4d9d'})[r]||'#fff'}
function send(res,code,data,type='application/json'){res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type==='application/json'?JSON.stringify(data):data)}
function readBody(req){return new Promise((ok,bad)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{ok(JSON.parse(s||'{}'))}catch(e){bad(e)}})})}
const server=http.createServer(async(req,res)=>{try{if(req.url==='/api/player'&&req.method==='POST'){const d=await readBody(req);const player=upsertPlayer(d);if(!player)return send(res,400,{error:'nick'});activeUsers.set(player.playerId,Date.now());return send(res,200,{ok:true,...player,rank:rankForWins(player.wins),rankColor:rankColor(rankForWins(player.wins))})}if(req.url==='/api/heartbeat'&&req.method==='POST'){const d=await readBody(req);const player=upsertPlayer(d);if(player)activeUsers.set(player.playerId,Date.now());return send(res,200,{ok:true,playerId:player?.playerId||null})}if(req.url==='/api/leaderboard'){const now=Date.now();for(const [id,t] of activeUsers){if(now-t>20000)activeUsers.delete(id);}
for(const [id,t] of activeUsers){if(players[id])players[id].lastSeen=t;}
const list=Object.values(players).filter(p=>p&&p.nick).sort((a,b)=>(+b.level||1)-(+a.level||1)||(+b.xp||0)-(+a.xp||0)||(+b.wins||0)-(+a.wins||0)||String(a.nick).localeCompare(String(b.nick))).slice(0,10).map(p=>({...p,wins:+p.wins||0,level:+p.level||1,xp:+p.xp||0,rank:rankForWins(p.wins),rankColor:rankColor(rankForWins(p.wins))}));const online=activeUsers.size;return send(res,200,{players:list,online,total:Object.keys(players).length})}let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(__dirname,p);if(!f.startsWith(__dirname)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return send(res,404,'Not found','text/plain');const ext=path.extname(f);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'};send(res,200,fs.readFileSync(f),types[ext]||'application/octet-stream')}catch(e){send(res,500,{error:'server'})}});
const wss=new WebSocketServer({server,path:'/ws'});let nextId=1,waiting=null,rooms=new Map(),clients=new Map();
function safeNick(n){return String(n||'Player').trim().slice(0,16)||'Player'}
function broadcast(room,msg){for(const c of room.players)if(c.ws.readyState===1)c.ws.send(JSON.stringify(msg))}
function makeRoom(a,b){const room={players:[a,b]};a.room=room;b.room=room;a.x=.3;b.x=.7;a.hp=100;b.hp=100;a.shield=0;b.shield=0;a.lastShot=0;b.lastShot=0;a.lastSkill=0;b.lastSkill=0;a.shieldReadyAt=0;b.shieldReadyAt=0;for(const [me,o] of [[a,b],[b,a]])me.ws.send(JSON.stringify({type:'match',room:me.id,you:{x:me.x,hp:me.hp,shield:0},enemy:{id:o.id,nick:o.nick,level:o.level,rarity:o.rarity,x:o.x,hp:o.hp,shield:0,c:o.color}}))}
function finish(c,o){
 const wpId=c.playerId||makePlayerId(), lpId=o.playerId||makePlayerId();
 const wp=players[wpId]||{playerId:wpId,nick:c.nick,level:c.level,xp:0,wins:0,lastSeen:Date.now()};
 wp.playerId=wpId; wp.nick=c.nick; wp.level=Math.max(+wp.level||1,+c.level||1); wp.wins=(+wp.wins||0)+1; wp.lastSeen=Date.now(); players[wpId]=wp;
 const lp=players[lpId]||{playerId:lpId,nick:o.nick,level:o.level,xp:0,wins:0,lastSeen:Date.now()};
 lp.playerId=lpId; lp.nick=o.nick; lp.level=Math.max(+lp.level||1,+o.level||1); lp.lastSeen=Date.now(); players[lpId]=lp;
 save();
 c.ws.send(JSON.stringify({type:'win',wins:wp.wins,rank:rankForWins(wp.wins),rankColor:rankColor(rankForWins(wp.wins))}));
 o.ws.send(JSON.stringify({type:'lose',wins:lp.wins,rank:rankForWins(lp.wins),rankColor:rankColor(rankForWins(lp.wins))}));
 c.room=null;o.room=null;rooms.delete(c.id);rooms.delete(o.id)
}
function applyHit(attacker,target,damage){if(!target.room)return;if(target.shield>0){target.shield--;target.ws.send(JSON.stringify({type:'hit',target:target.id,hp:target.hp,shield:target.shield,blocked:true}));attacker.ws.send(JSON.stringify({type:'enemyHit',blocked:true}));broadcast(target.room,{type:'state',id:target.id,player:{id:target.id,nick:target.nick,level:target.level,rarity:target.rarity,x:target.x,hp:target.hp,shield:target.shield,c:target.color}});return}target.hp=Math.max(0,target.hp-damage);target.ws.send(JSON.stringify({type:'hit',target:target.id,hp:target.hp,shield:0}));attacker.ws.send(JSON.stringify({type:'enemyHit',target:target.id,hp:target.hp}));if(target.hp<=0)finish(attacker,target)}
wss.on('connection',ws=>{const id=String(nextId++),c={id,playerId:'',ws,nick:'Player',level:1,rarity:'comum',x:.5,hp:100,room:null,color:'#fff',shield:0,lastShot:0,lastSkill:0,shieldReadyAt:0};clients.set(id,c);ws.send(JSON.stringify({type:'welcome',id}));ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}if(m.type==='join'){c.playerId=String(m.playerId||''); c.nick=safeNick(m.nick);c.level=+m.level||1;c.rarity=String(m.rarity||'comum');const [pid,stored]=findPlayer(c.playerId,c.nick,m.previousNick);if(pid){c.playerId=pid;c.wins=+(stored.wins||0);c.level=Math.max(c.level,+stored.level||1)}else{c.playerId=c.playerId||makePlayerId();c.wins=+m.wins||0;}const colors={comum:'#fff',raro:'#39a7ff',epico:'#b85cff',lendario:'#ff9b20',mitico:'#ff263c',secreto:'#ff55ff'};c.color=colors[c.rarity]||'#fff';if(c.room)return;if(waiting&&waiting.ws.readyState===1&&waiting.id!==c.id){const o=waiting;waiting=null;makeRoom(o,c)}else{waiting=c;ws.send(JSON.stringify({type:'waiting'}))}}else if(m.type==='move'&&c.room){c.x=Math.max(.08,Math.min(.92,+m.x||.5));broadcast(c.room,{type:'state',id:c.id,player:{id:c.id,nick:c.nick,level:c.level,rarity:c.rarity,x:c.x,hp:c.hp,shield:c.shield,c:c.color}})}else if(m.type==='shoot'&&c.room){const now=Date.now();if(now-c.lastShot<2000)return;c.lastShot=now;const o=c.room.players.find(p=>p.id!==c.id);if(!o)return;const x=Math.max(.08,Math.min(.92,Number.isFinite(+m.x)?+m.x:c.x));broadcast(c.room,{type:'shot',id:c.id,x});if(Math.abs(x-o.x)<.12)applyHit(c,o,20)}else if(m.type==='skill'&&c.room){const now=Date.now();if(now-c.lastSkill<10000)return;c.lastSkill=now;const o=c.room.players.find(p=>p.id!==c.id);if(!o)return;broadcast(c.room,{type:'skill',id:c.id,x:c.x});for(let i=0;i<5;i++){if(!o.room)break;const x=Math.max(.05,Math.min(.95,c.x+(i-2)*.035));if(Math.abs(x-o.x)<.12){applyHit(c,o,10);if(!o.room)break}}}else if(m.type==='shield'&&c.room){const now=Date.now();if(c.shield>0||now<c.shieldReadyAt)return;c.shield=3;c.shieldReadyAt=now+15000;broadcast(c.room,{type:'shield',id:c.id,blocks:3});broadcast(c.room,{type:'state',id:c.id,player:{id:c.id,nick:c.nick,level:c.level,rarity:c.rarity,x:c.x,hp:c.hp,shield:c.shield,c:c.color}})}else if(m.type==='leave')disconnect(c)});ws.on('close',()=>disconnect(c))});
function disconnect(c){if(!clients.has(c.id))return;if(waiting?.id===c.id)waiting=null;if(c.room){const o=c.room.players.find(p=>p.id!==c.id);if(o&&o.ws.readyState===1){o.room=null;o.ws.send(JSON.stringify({type:'left'}))}rooms.delete(c.id);if(o)rooms.delete(o.id);c.room=null}clients.delete(c.id)}
server.listen(PORT,()=>console.log('RNG online | leaderboard | PvP skills active'));
