const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000;
const DATA_DIR=fs.existsSync('/data')?'/data':__dirname;
const DB=path.join(DATA_DIR,'players.json');
let players={};
const activeUsers=new Map(); // sessionId -> {playerId,lastSeen}
const TEST_MODE_PASSWORD='02072482';
const testTokens=new Map();
function cleanTestTokens(){const now=Date.now();for(const [token,expires] of testTokens)if(expires<now)testTokens.delete(token);}
let globalEvent={id:'',type:'',active:false,until:0,doubleLuck:false,rewards:{},claimed:new Set(),startedAt:0};
function cleanOnline(){const now=Date.now();for(const [sid,info] of activeUsers){if(now-(info?.lastSeen||0)>20000)activeUsers.delete(sid);}}
function validAdmin(d){cleanTestTokens();const t=String(d?.token||'');return testTokens.has(t)&&testTokens.get(t)>=Date.now()}
function playerById(id){return players[String(id||'')]||null;}
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
const server=http.createServer(async(req,res)=>{try{
if(req.url==='/api/test-auth'&&req.method==='POST'){
 const d=await readBody(req);if(String(d.password||'')!==TEST_MODE_PASSWORD)return send(res,403,{ok:false,error:'forbidden'});
 cleanTestTokens();const token='test_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)+'_'+Math.random().toString(36).slice(2);testTokens.set(token,Date.now()+12*60*60*1000);return send(res,200,{ok:true,token,expiresIn:12*60*60*1000});
}
if(req.url==='/api/admin/players'&&req.method==='POST'){const d=await readBody(req);if(!validAdmin(d))return send(res,403,{ok:false,error:'forbidden'});cleanOnline();const ids=[...new Set([...activeUsers.values()].filter(x=>x?.playerId&&Date.now()-(x.lastSeen||0)<=20000).map(x=>x.playerId))];const online=ids.map(id=>players[id]).filter(p=>p&&!p.banned).map(p=>({playerId:p.playerId,nick:p.nick,level:+p.level||1,characterName:p.characterName||'',characterKey:p.characterKey||''}));const banned=Object.values(players).filter(p=>p&&p.banned).map(p=>({playerId:p.playerId,nick:p.nick,level:+p.level||1}));return send(res,200,{ok:true,online,banned});}
if(req.url==='/api/admin/action'&&req.method==='POST'){const d=await readBody(req);if(!validAdmin(d))return send(res,403,{ok:false,error:'forbidden'});const p=playerById(d.playerId);if(!p)return send(res,404,{ok:false,error:'player'});const action=String(d.action||'');if(action==='addLevel'){const amount=Math.max(1,Math.min(100000,Math.floor(Number(d.amount)||1)));p.level=Math.max(1,Number(p.level)||1)+amount;p.xp=0;save();return send(res,200,{ok:true,nick:p.nick,level:p.level});}if(action==='setClass'){const key=String(d.classKey||'').slice(0,30),name=String(d.className||'').trim().slice(0,40);if(!key||!name)return send(res,400,{ok:false,error:'class'});p.adminCommand={id:'cmd_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),type:'setClass',classKey:key,className:name};save();return send(res,200,{ok:true,nick:p.nick});}if(action==='ban'){p.banned=true;p.bannedAt=Date.now();save();for(const [sid,info] of activeUsers)if(info?.playerId===p.playerId)activeUsers.delete(sid);return send(res,200,{ok:true,nick:p.nick,banned:true});}if(action==='unban'){p.banned=false;delete p.bannedAt;save();return send(res,200,{ok:true,nick:p.nick,banned:false});}return send(res,400,{ok:false,error:'action'});}
if(req.url.startsWith('/api/event')&&req.method==='GET'){
 const requestedId=new URL(req.url,'http://localhost').searchParams.get('playerId');if(requestedId&&players[String(requestedId)]?.banned)return send(res,403,{ok:false,banned:true});
 const u=new URL(req.url,'http://localhost');const playerId=String(u.searchParams.get('playerId')||'');const session=String(u.searchParams.get('sessionId')||playerId);const nick=String(u.searchParams.get('nick')||'').trim().slice(0,16);cleanOnline();
 if(playerId){activeUsers.set(session,{playerId,lastSeen:Date.now()});}
 if(globalEvent.active&&Date.now()>=globalEvent.until)globalEvent.active=false;
 const rewardAvailable=!!(playerId&&globalEvent.id&&globalEvent.rewards[playerId]&&!globalEvent.claimed.has(playerId));
 const online=new Set([...activeUsers.values()].filter(x=>x?.playerId&&Date.now()-(x.lastSeen||0)<=20000).map(x=>x.playerId));
 return send(res,200,{ok:true,active:globalEvent.active,until:globalEvent.until,type:globalEvent.type,id:globalEvent.id,doubleLuck:globalEvent.doubleLuck,online:online.size,rewardAvailable,rewardEventId:rewardAvailable?globalEvent.id:''});
}
if(req.url==='/api/event/claim'&&req.method==='POST'){
 const d=await readBody(req);const playerId=String(d.playerId||'');const eventId=String(d.eventId||'');
 if(!playerId||!eventId||eventId!==globalEvent.id||!Object.prototype.hasOwnProperty.call(globalEvent.rewards,playerId))return send(res,404,{ok:false,error:'no-reward'});
 if(globalEvent.claimed.has(playerId))return send(res,200,{ok:true,points:0,alreadyClaimed:true});
 globalEvent.claimed.add(playerId);return send(res,200,{ok:true,points:Number(globalEvent.rewards[playerId])||0,alreadyClaimed:false});
}
if(req.url==='/api/event'&&req.method==='POST'){
 const d=await readBody(req);cleanTestTokens();const authToken=String(d.token||'');if(!testTokens.has(authToken)||testTokens.get(authToken)<Date.now())return send(res,403,{ok:false,error:'forbidden'});
 cleanOnline();const now=Date.now();const onlineIds=[...new Set([...activeUsers.values()].filter(x=>x?.playerId&&now-(x.lastSeen||0)<=20000).map(x=>x.playerId))];
 const type=['luck','points','full'].includes(String(d.type))?String(d.type):'full';const id='event_'+now.toString(36)+'_'+Math.random().toString(36).slice(2,8);
 const rewards={};if(type==='points'||type==='full')for(const pid of onlineIds)rewards[pid]=200;
 globalEvent={id,type,active:true,until:now+5*60*1000,doubleLuck:type==='luck'||type==='full',rewards,claimed:new Set(),startedAt:now};
 return send(res,200,{ok:true,id,type,until:globalEvent.until,doubleLuck:globalEvent.doubleLuck,online:onlineIds.length,rewarded: Object.keys(rewards).length});
}
if(req.url==='/api/player'&&req.method==='POST'){const d=await readBody(req);if(d.playerId&&players[String(d.playerId)]?.banned)return send(res,403,{ok:false,banned:true});const player=upsertPlayer(d);if(!player)return send(res,400,{error:'nick'});activeUsers.set(String(d.sessionId||player.playerId),{playerId:player.playerId,lastSeen:Date.now()});return send(res,200,{ok:true,...player,rank:rankForWins(player.wins),rankColor:rankColor(rankForWins(player.wins))})}if(req.url==='/api/heartbeat'&&req.method==='POST'){const d=await readBody(req);if(d.playerId&&players[String(d.playerId)]?.banned)return send(res,403,{ok:false,banned:true});const player=upsertPlayer(d);if(player)activeUsers.set(String(d.sessionId||player.playerId),{playerId:player.playerId,lastSeen:Date.now()});let command=null;if(player?.adminCommand){command=player.adminCommand;delete player.adminCommand;save();}return send(res,200,{ok:true,playerId:player?.playerId||null,level:player?.level||1,xp:player?.xp||0,adminCommand:command})}if(req.url==='/api/match-result'&&req.method==='POST'){const d=await readBody(req);const id=String(d.playerId||'');const p=players[id];if(!p||p.banned)return send(res,403,{ok:false});const kills=Math.max(0,Math.min(10000000,Math.floor(Number(d.rockKills)||0)));p.bestMatchRockKills=Math.max(0,Number(p.bestMatchRockKills)||0,kills);p.lastMatchRockKills=kills;p.matchesPlayed=Math.max(0,Number(p.matchesPlayed)||0)+1;save();return send(res,200,{ok:true,bestMatchRockKills:p.bestMatchRockKills})}if(req.url==='/api/rock-leaderboard'){const list=Object.values(players).filter(p=>p&&p.nick&&p.playerId&&!p.banned).sort((a,b)=>(Number(b.bestMatchRockKills)||0)-(Number(a.bestMatchRockKills)||0)||String(a.nick).localeCompare(String(b.nick))).slice(0,10).map(p=>({nick:p.nick,bestMatchRockKills:Number(p.bestMatchRockKills)||0,matchesPlayed:Number(p.matchesPlayed)||0}));return send(res,200,{players:list})}if(req.url==='/api/leaderboard'){const now=Date.now();for(const [sid,info] of activeUsers){if(now-(info?.lastSeen||0)>20000)activeUsers.delete(sid);}
const online=new Set(); for(const info of activeUsers.values()){if(info?.playerId)online.add(info.playerId);}
const list=Object.values(players).filter(p=>p&&p.nick&&p.playerId).sort((a,b)=>(+b.level||1)-(+a.level||1)||(+b.xp||0)-(+a.xp||0)||(+b.wins||0)-(+a.wins||0)||String(a.nick).localeCompare(String(b.nick))||String(a.playerId).localeCompare(String(b.playerId))).slice(0,10).map((p,i)=>({...p,position:i+1,wins:+p.wins||0,level:+p.level||1,xp:+p.xp||0,rank:rankForWins(p.wins),rankColor:rankColor(rankForWins(p.wins))}));return send(res,200,{players:list,online:online.size,total:Object.keys(players).length})}let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(__dirname,p);if(!f.startsWith(__dirname)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return send(res,404,'Not found','text/plain');const ext=path.extname(f);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'};send(res,200,fs.readFileSync(f),types[ext]||'application/octet-stream')}catch(e){send(res,500,{error:'server'})}});
server.listen(PORT,()=>console.log('RNG Pedras Shooter online'));
