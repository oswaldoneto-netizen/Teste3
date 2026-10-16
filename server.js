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
const wss=new WebSocketServer({server,path:'/ws'});
let nextId=1,waiting=[],lobbyTimer=null,lobbyTicker=null,lobbyEndsAt=0,rooms=new Map(),clients=new Map();
const MAX_RAID_PLAYERS=10,LOBBY_MS=15000;
function safeNick(n){return String(n||'Player').trim().slice(0,16)||'Player'}
function sendC(c,m){if(c?.ws?.readyState===1)c.ws.send(JSON.stringify(m))}
function broadcast(room,m){for(const c of room.players)sendC(c,m)}
function bossStats(stage,playersInRoom){const hp=Math.floor(50000*Math.pow(1.7,stage-1)*Math.max(1,playersInRoom));return {name:stage===1?'TITÃ COLOSSAL':stage===2?'DESTRUIDOR GALÁCTICO':stage===3?'DEVORADOR DE MUNDOS':`SENHOR DO CAOS • FASE ${stage}`,maxHp:hp,hp,damage:Math.min(75,18+stage*4)}}
function roomState(room){return {type:'coopState',stage:room.stage,boss:{name:room.boss.name,hp:room.boss.hp,maxHp:room.boss.maxHp},players:room.players.map(p=>({id:p.id,nick:p.nick,characterName:p.characterName,level:p.level,rarity:p.rarity,x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,shield:p.shield,c:p.color}))}}
function stopLobbyTimers(){if(lobbyTimer){clearTimeout(lobbyTimer);lobbyTimer=null}if(lobbyTicker){clearInterval(lobbyTicker);lobbyTicker=null}lobbyEndsAt=0}
function sendLobbyState(){const seconds=Math.max(0,Math.ceil((lobbyEndsAt-Date.now())/1000));for(const p of waiting)sendC(p,{type:'lobbyState',seconds,players:waiting.length,maxPlayers:MAX_RAID_PLAYERS})}
function startLobby(){if(lobbyTimer||!waiting.length)return;lobbyEndsAt=Date.now()+LOBBY_MS;sendLobbyState();lobbyTicker=setInterval(sendLobbyState,1000);lobbyTimer=setTimeout(()=>startRaidFromLobby(),LOBBY_MS)}
function startRaidFromLobby(){stopLobbyTimers();const group=waiting.filter(p=>clients.has(p.id)&&p.ws.readyState===1).slice(0,MAX_RAID_PLAYERS);waiting=[];if(!group.length)return;makeRoom(group)}
function startBossAttack(room){if(room.attackTimer)clearInterval(room.attackTimer);const interval=Math.max(1050,2600-(room.stage-1)*120);room.attackTimer=setInterval(()=>{if(room.ended||room.boss.hp<=0)return;const alive=room.players.filter(p=>p.hp>0);if(!alive.length){room.ended=true;broadcast(room,{type:'coopFail',stage:room.stage});clearInterval(room.attackTimer);return}const targetCount=Math.min(alive.length,room.stage>=8?3:room.stage>=4?2:1);const targets=[...alive].sort(()=>Math.random()-.5).slice(0,targetCount);for(const target of targets){const attack={x:target.x,y:target.y};const damage=room.boss.damage;broadcast(room,{type:'bossAttack',target:target.id,x:attack.x,y:attack.y,damage,delay:650,stage:room.stage});const timer=setTimeout(()=>{if(room.ended||!rooms.has(target.id)||target.hp<=0)return;const dx=(target.x??.5)-attack.x,dy=(target.y??.8)-attack.y;const dodged=Math.hypot(dx,dy)>.115;if(dodged){sendC(target,{type:'attackDodged'});room.pendingAttacks.delete(timer);return}if(target.shield>0){target.shield--;sendC(target,{type:'coopHit',hp:target.hp,shield:target.shield,blocked:true});}else{target.hp=Math.max(0,target.hp-damage);sendC(target,{type:'coopHit',hp:target.hp,shield:0,damage});}broadcast(room,{type:'attackImpact',target:target.id,x:attack.x,y:attack.y,damage});if(target.hp<=0){target.hp=0;broadcast(room,{type:'playerDown',id:target.id,nick:target.nick})}if(room.players.every(p=>p.hp<=0)&&!room.ended){room.ended=true;broadcast(room,{type:'coopFail',stage:room.stage});if(room.attackTimer)clearInterval(room.attackTimer)}room.pendingAttacks.delete(timer)},650);room.pendingAttacks.add(timer)}},interval)}
function makeRoom(group){const room={id:'raid_'+Date.now()+'_'+group[0].id,players:group,stage:1,boss:null,attackTimer:null,pendingAttacks:new Set(),ended:false};group.forEach((p,i)=>{p.room=room;const cols=Math.min(5,group.length),row=Math.floor(i/cols),col=i%cols;p.x=cols===1?.5:.12+(col/(cols-1))*.76;p.y=Math.min(.9,.18+row*.25);p.hp=Math.max(100,Math.min(5000,Math.floor(p.maxHp||600)));p.shield=0;p.lastShot=0;p.lastSkill=0;p.shieldReadyAt=0;rooms.set(p.id,room)});room.boss=bossStats(room.stage,group.length);for(const p of group)sendC(p,{type:'coopMatch',room:room.id,you:{x:p.x,y:p.y,hp:p.hp,shield:0},stage:room.stage,boss:{name:room.boss.name,hp:room.boss.hp,maxHp:room.boss.maxHp},players:group.map(q=>({id:q.id,nick:q.nick,characterName:q.characterName,level:q.level,rarity:q.rarity,x:q.x,y:q.y,hp:q.hp,maxHp:q.maxHp,shield:q.shield,c:q.color})),playerCount:group.length});startBossAttack(room)}
function clearRoom(room){room.ended=true;if(room.attackTimer)clearInterval(room.attackTimer);for(const t of room.pendingAttacks)clearTimeout(t);room.pendingAttacks.clear();for(const p of room.players){p.room=null;rooms.delete(p.id)}}
function nextStage(room){if(room.ended)return;room.stage++;room.boss=bossStats(room.stage,room.players.length);for(const p of room.players){p.hp=Math.min(Math.max(100,Math.floor(p.maxHp||600)),p.hp+Math.max(40,Math.floor((p.maxHp||600)*.12)));p.shield=0}broadcast(room,{type:'stageClear',stage:room.stage-1});broadcast(room,roomState(room));startBossAttack(room)}
wss.on('connection',ws=>{const id=String(nextId++),c={id,playerId:'',ws,nick:'Player',level:1,rarity:'comum',characterName:'Player',damage:20,maxHp:600,shots:1,x:.5,y:.8,hp:100,room:null,color:'#fff',shield:0,lastShot:0,lastSkill:0,shieldReadyAt:0};clients.set(id,c);sendC(c,{type:'welcome',id});ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}if(m.type==='join'){c.playerId=String(m.playerId||'');c.nick=safeNick(m.nick);c.level=Math.max(1,+m.level||1);c.rarity=String(m.rarity||'comum');c.characterName=safeNick(m.characterName||c.nick);c.damage=Math.max(1,Math.min(9999,+m.damage||20));c.maxHp=Math.max(100,Math.min(5000,+m.maxHp||600));c.shots=Math.max(1,Math.min(30,+m.shots||1));const [pid,stored]=findPlayer(c.playerId,c.nick,m.previousNick);if(pid){c.playerId=pid;c.wins=+(stored.wins||0);c.level=Math.max(c.level,+stored.level||1)}else c.playerId=c.playerId||makePlayerId();const colors={comum:'#fff',raro:'#39a7ff',epico:'#b85cff',lendario:'#ff9b20',mitico:'#ff263c',secreto:'#ff55ff',god:'#ff4fd8',admin:'#fff',criador:'#ffe100'};c.color=colors[c.rarity]||'#fff';if(c.room||waiting.some(p=>p.id===c.id))return;if(waiting.length>=MAX_RAID_PLAYERS){sendC(c,{type:'queueFull'});return}waiting.push(c);startLobby();sendLobbyState();if(waiting.length>=MAX_RAID_PLAYERS)startRaidFromLobby()}
else if(m.type==='move'&&c.room&&c.hp>0){const nx=Number(m.x),ny=Number(m.y);if(Number.isFinite(nx))c.x=Math.max(.025,Math.min(.975,nx));if(Number.isFinite(ny))c.y=Math.max(.06,Math.min(.94,ny));const moveNow=Date.now();if(moveNow-(c.lastMoveBroadcast||0)>45){c.lastMoveBroadcast=moveNow;broadcast(c.room,roomState(c.room))}}
else if(m.type==='shoot'&&c.room&&c.hp>0){const room=c.room,now=Date.now();if(now-c.lastShot<850||room.ended)return;c.lastShot=now;const rarityMultiplier={comum:1.75,raro:1.8,epico:1.9,lendario:2,mitico:2.2,secreto:2.4,god:2.7,admin:3,criador:3.5};let damage=(c.damage||20)*(rarityMultiplier[c.rarity]||1.75)+Math.max(0,c.level-1)*2;damage=Math.min(12000,Math.round(damage));room.boss.hp=Math.max(0,room.boss.hp-damage);broadcast(room,{type:'coopShot',id:c.id,x:c.x,damage,hp:room.boss.hp,maxHp:room.boss.maxHp});if(room.boss.hp<=0)nextStage(room);else broadcast(room,{type:'bossUpdate',stage:room.stage,boss:{name:room.boss.name,hp:room.boss.hp,maxHp:room.boss.maxHp}})}
else if(m.type==='skill'&&c.room&&c.hp>0){const now=Date.now();if(now-c.lastSkill<8000||c.room.ended)return;c.lastSkill=now;const room=c.room;const skillMultiplier={comum:7,raro:8,epico:9,lendario:10,mitico:12,secreto:14,god:16,admin:20,criador:30};let damage=Math.round((c.damage||20)*(skillMultiplier[c.rarity]||7)+Math.max(0,c.level-1)*5);if(/oswaldo/i.test(c.characterName||''))damage=Math.max(damage,50000);if(/leo pedreiro/i.test(c.characterName||''))damage=Math.round(damage*1.8);if(/rl charrado/i.test(c.characterName||''))damage=Math.round(damage*1.5);room.boss.hp=Math.max(0,room.boss.hp-damage);broadcast(room,{type:'coopSkill',id:c.id,x:c.x,damage});if(room.boss.hp<=0)nextStage(room);else broadcast(room,{type:'bossUpdate',stage:room.stage,boss:{name:room.boss.name,hp:room.boss.hp,maxHp:room.boss.maxHp}})}
else if(m.type==='shield'&&c.room&&c.hp>0){const now=Date.now();if(c.shield>0||now<c.shieldReadyAt)return;c.shield=2;c.shieldReadyAt=now+12000;sendC(c,{type:'shield',blocks:c.shield})}
else if(m.type==='leave')disconnect(c)});ws.on('close',()=>disconnect(c))});
function disconnect(c){if(!clients.has(c.id))return;if(waiting.some(p=>p.id===c.id)){waiting=waiting.filter(p=>p.id!==c.id);if(!waiting.length)stopLobbyTimers();else sendLobbyState()}if(c.room){const room=c.room;broadcast(room,{type:'left',nick:c.nick});clearRoom(room)}clients.delete(c.id)}
server.listen(PORT,()=>console.log('RNG online | cooperative boss raids: 15s lobby, max 10 players'));
