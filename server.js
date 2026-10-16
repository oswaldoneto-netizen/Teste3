const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
const PORT=process.env.PORT||3000;
const DATA_DIR=fs.existsSync('/data')?'/data':__dirname;
const DB=path.join(DATA_DIR,'players.json');
let players={};
const activeUsers=new Map(); // sessionId -> {playerId,lastSeen}
const PLAYER_HITBOX=0.16;try{const raw=JSON.parse(fs.readFileSync(DB,'utf8')||'{}'); if(Array.isArray(raw)) for(const p of raw){if(p&&p.nick) players[String(p.nick).toLowerCase()]={...p};} else if(raw&&raw.players&&Array.isArray(raw.players)) for(const p of raw.players){if(p&&p.nick) players[String(p.nick).toLowerCase()]={...p};} else if(raw&&typeof raw==='object') players=raw;}catch(e){players={}}
function save(){try{fs.writeFileSync(DB,JSON.stringify(players,null,2))}catch(e){}}
function makePlayerId(){return 'p_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10)}
function normNick(v){return String(v||'').trim().toLowerCase()}
function findByNickOrHistory(nick, previousNick){
  const nn=normNick(nick), pp=normNick(previousNick);
  if(pp){
    for(const [key,p] of Object.entries(players)){
      if(p && (normNick(p.nick)===pp || (Array.isArray(p.nickHistory)&&p.nickHistory.map(normNick).includes(pp)))) return key;
    }
  }
  return null;
}
function findPlayer(id,nick,previousNick){
  // The persistent playerId is the identity. Never merge two accounts just
  // because they happen to have the same Nick.
  if(id && players[id]) return [id,players[id]];
  const byRename=findByNickOrHistory(nick,previousNick);
  if(byRename) return [byRename,players[byRename]];
  return [null,null];
}
function upsertPlayer(d){
  const nick=String(d.nick||'').trim().slice(0,16);
  if(!nick) return null;
  const suppliedId=String(d.playerId||'').trim();
  const previousNick=String(d.previousNick||'').trim().slice(0,16);

  // Identity rules:
  // 1) Existing playerId always wins.
  // 2) If this is a rename from an older client, previousNick/history can
  //    recover the old account when the browser lost its cookie.
  // 3) A matching current Nick alone NEVER merges two different accounts.
  let id=suppliedId && players[suppliedId] ? suppliedId : null;
  if(!id && previousNick) id=findByNickOrHistory(nick,previousNick);
  if(!id) id=suppliedId||makePlayerId();

  const old=players[id]||{};
  const history=new Set([...(Array.isArray(old.nickHistory)?old.nickHistory:[]), ...(previousNick?[previousNick]:[])].filter(Boolean));
  const player={
    ...old, playerId:id, nick, nickHistory:[...history].slice(-20),
    level:Math.max(+old.level||1,+d.level||1),
    xp:Math.max(+old.xp||0,+d.xp||0),
    wins:Math.max(+old.wins||0,+d.wins||0),
    lastSeen:Date.now()
  };
  players[id]=player;
  save();
  return player;
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
const server=http.createServer(async(req,res)=>{try{if(req.url==='/api/player'&&req.method==='POST'){const d=await readBody(req);const player=upsertPlayer(d);if(!player)return send(res,400,{error:'nick'});activeUsers.set(String(d.sessionId||player.playerId),{playerId:player.playerId,lastSeen:Date.now()});return send(res,200,{ok:true,...player,rank:rankForWins(player.wins),rankColor:rankColor(rankForWins(player.wins))})}if(req.url==='/api/heartbeat'&&req.method==='POST'){const d=await readBody(req);const player=upsertPlayer(d);if(player)activeUsers.set(String(d.sessionId||player.playerId),{playerId:player.playerId,lastSeen:Date.now()});return send(res,200,{ok:true,playerId:player?.playerId||null})}if(req.url==='/api/leaderboard'){const now=Date.now();for(const [sid,info] of activeUsers){if(now-(info?.lastSeen||0)>20000)activeUsers.delete(sid);}
const online=new Set(); for(const info of activeUsers.values()){if(info?.playerId)online.add(info.playerId);}
const list=Object.values(players).filter(p=>p&&p.nick&&p.playerId).sort((a,b)=>(+b.level||1)-(+a.level||1)||(+b.xp||0)-(+a.xp||0)||(+b.wins||0)-(+a.wins||0)||String(a.nick).localeCompare(String(b.nick))||String(a.playerId).localeCompare(String(b.playerId))).slice(0,10).map((p,i)=>({...p,position:i+1,wins:+p.wins||0,level:+p.level||1,xp:+p.xp||0,rank:rankForWins(p.wins),rankColor:rankColor(rankForWins(p.wins))}));return send(res,200,{players:list,online:online.size,total:Object.keys(players).length})}let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(__dirname,p);if(!f.startsWith(__dirname)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return send(res,404,'Not found','text/plain');const ext=path.extname(f);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'};send(res,200,fs.readFileSync(f),types[ext]||'application/octet-stream')}catch(e){send(res,500,{error:'server'})}});
const wss=new WebSocketServer({server,path:'/ws'});let nextId=1,waiting=null,rooms=new Map(),clients=new Map();
function safeNick(n){return String(n||'Player').trim().slice(0,16)||'Player'}
function sendC(c,m){if(c?.ws?.readyState===1)c.ws.send(JSON.stringify(m))}
function broadcast(room,m){for(const c of room.players)sendC(c,m)}
function bossStats(stage,playersInRoom){return {name:stage===1?'TITÃ COLOSSAL':stage===2?'DESTRUIDOR GALÁCTICO':stage===3?'DEVORADOR DE MUNDOS':`SENHOR DO CAOS • FASE ${stage}`,maxHp:Math.floor(50000*Math.pow(1.7,stage-1)*playersInRoom),hp:Math.floor(50000*Math.pow(1.7,stage-1)*playersInRoom),damage:Math.min(35,12+stage*3)}}
function roomState(room){return {type:'coopState',stage:room.stage,boss:{name:room.boss.name,hp:room.boss.hp,maxHp:room.boss.maxHp},players:room.players.map(p=>({id:p.id,nick:p.nick,level:p.level,rarity:p.rarity,x:p.x,hp:p.hp,shield:p.shield,c:p.color}))}}
function startBossAttack(room){if(room.attackTimer)clearInterval(room.attackTimer);room.attackTimer=setInterval(()=>{if(!rooms.has(room.players[0]?.id)||room.boss.hp<=0)return;const alive=room.players.filter(p=>p.hp>0);if(!alive.length){broadcast(room,{type:'coopFail',stage:room.stage});clearInterval(room.attackTimer);return}const target=alive[Math.floor(Math.random()*alive.length)];if(target.shield>0){target.shield--;sendC(target,{type:'coopHit',hp:target.hp,shield:target.shield,blocked:true});}else{target.hp=Math.max(0,target.hp-room.boss.damage);sendC(target,{type:'coopHit',hp:target.hp,shield:0,damage:room.boss.damage});}broadcast(room,{type:'bossAttack',target:target.id,damage:room.boss.damage});if(target.hp<=0){target.hp=0;broadcast(room,{type:'playerDown',id:target.id,nick:target.nick})}if(room.players.every(p=>p.hp<=0)){broadcast(room,{type:'coopFail',stage:room.stage});clearInterval(room.attackTimer)}},Math.max(1800,6500-room.stage*350))}
function makeRoom(a,b){const room={id:'raid_'+Date.now()+'_'+a.id,players:[a,b],stage:1,boss:null,attackTimer:null};for(const p of room.players){p.room=room;p.x=p===a?.32:.68;p.hp=Math.max(100,Math.min(500,Math.floor(100+(p.level-1)*3)));p.shield=0;p.lastShot=0;p.lastSkill=0;p.shieldReadyAt=0;rooms.set(p.id,room)}room.boss=bossStats(room.stage,room.players.length);for(const p of room.players)sendC(p,{type:'coopMatch',room:room.id,you:{x:p.x,hp:p.hp,shield:0},stage:room.stage,boss:{name:room.boss.name,hp:room.boss.hp,maxHp:room.boss.maxHp},players:room.players.map(q=>({id:q.id,nick:q.nick,level:q.level,rarity:q.rarity,x:q.x,hp:q.hp,shield:q.shield,c:q.color}))});startBossAttack(room)}
function clearRoom(room){if(room.attackTimer)clearInterval(room.attackTimer);for(const p of room.players){p.room=null;rooms.delete(p.id)}}
function nextStage(room){room.stage++;room.boss=bossStats(room.stage,room.players.length);for(const p of room.players){p.hp=Math.min(Math.max(100,Math.floor(100+(p.level-1)*3)),p.hp+40);p.shield=0}broadcast(room,{type:'stageClear',stage:room.stage-1});broadcast(room,roomState(room));startBossAttack(room)}
wss.on('connection',ws=>{const id=String(nextId++),c={id,playerId:'',ws,nick:'Player',level:1,rarity:'comum',x:.5,hp:100,room:null,color:'#fff',shield:0,lastShot:0,lastSkill:0,shieldReadyAt:0};clients.set(id,c);sendC(c,{type:'welcome',id});ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}if(m.type==='join'){c.playerId=String(m.playerId||'');c.nick=safeNick(m.nick);c.level=Math.max(1,+m.level||1);c.rarity=String(m.rarity||'comum');const [pid,stored]=findPlayer(c.playerId,c.nick,m.previousNick);if(pid){c.playerId=pid;c.wins=+(stored.wins||0);c.level=Math.max(c.level,+stored.level||1)}else c.playerId=c.playerId||makePlayerId();const colors={comum:'#fff',raro:'#39a7ff',epico:'#b85cff',lendario:'#ff9b20',mitico:'#ff263c',secreto:'#ff55ff',god:'#ff4fd8',admin:'#fff'};c.color=colors[c.rarity]||'#fff';if(c.room)return;if(waiting&&waiting.ws.readyState===1&&waiting.id!==c.id){const o=waiting;waiting=null;makeRoom(o,c)}else{waiting=c;sendC(c,{type:'waiting'})}}
else if(m.type==='move'&&c.room){c.x=Math.max(.05,Math.min(.95,Number.isFinite(+m.x)?+m.x:c.x));broadcast(c.room,roomState(c.room))}
else if(m.type==='shoot'&&c.room){const room=c.room,now=Date.now();if(now-c.lastShot<850)return;c.lastShot=now;const rarityDamage={comum:35,raro:55,epico:80,lendario:120,mitico:170,secreto:230,god:300,admin:400,criador:500};let damage=(rarityDamage[c.rarity]||35)+Math.max(0,c.level-1)*2;damage=Math.min(1500,damage);room.boss.hp=Math.max(0,room.boss.hp-damage);broadcast(room,{type:'coopShot',id:c.id,x:c.x,damage,hp:room.boss.hp,maxHp:room.boss.maxHp});if(room.boss.hp<=0)nextStage(room);else broadcast(room,{type:'bossUpdate',stage:room.stage,boss:{name:room.boss.name,hp:room.boss.hp,maxHp:room.boss.maxHp}})}
else if(m.type==='skill'&&c.room){const now=Date.now();if(now-c.lastSkill<8000)return;c.lastSkill=now;const room=c.room,damage=({comum:180,raro:280,epico:400,lendario:600,mitico:850,secreto:1100,god:1500,admin:2000,criador:2500}[c.rarity]||180)+Math.max(0,c.level-1)*5;room.boss.hp=Math.max(0,room.boss.hp-damage);broadcast(room,{type:'coopSkill',id:c.id,x:c.x,damage});if(room.boss.hp<=0)nextStage(room);else broadcast(room,{type:'bossUpdate',stage:room.stage,boss:{name:room.boss.name,hp:room.boss.hp,maxHp:room.boss.maxHp}})}
else if(m.type==='shield'&&c.room){const now=Date.now();if(c.shield>0||now<c.shieldReadyAt)return;c.shield=2;c.shieldReadyAt=now+12000;sendC(c,{type:'shield',blocks:c.shield});}
else if(m.type==='leave')disconnect(c)});ws.on('close',()=>disconnect(c))});
function disconnect(c){if(!clients.has(c.id))return;if(waiting?.id===c.id)waiting=null;if(c.room){const room=c.room;broadcast(room,{type:'left',nick:c.nick});clearRoom(room)}clients.delete(c.id)}
server.listen(PORT,()=>console.log('RNG online | cooperative boss raids active'));
