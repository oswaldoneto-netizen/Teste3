const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000;
const DATA_DIR=fs.existsSync('/data')?'/data':__dirname;
const DB=path.join(DATA_DIR,'players.json');
let players={};
const activeUsers=new Map(); // sessionId -> {playerId,lastSeen}
const TEST_MODE_PASSWORD='02072482';
let globalEvent={id:'',type:'',active:false,until:0,doubleLuck:false,rewards:{},claimed:new Set(),startedAt:0};
function cleanOnline(){const now=Date.now();for(const [sid,info] of activeUsers){if(now-(info?.lastSeen||0)>20000)activeUsers.delete(sid);}}
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
if(req.url.startsWith('/api/event')&&req.method==='GET'){
 const u=new URL(req.url,'http://localhost');const playerId=String(u.searchParams.get('playerId')||'');const session=String(u.searchParams.get('sessionId')||playerId);const nick=String(u.searchParams.get('nick')||'').trim().slice(0,16);cleanOnline();
 if(playerId){activeUsers.set(session,{playerId,lastSeen:Date.now()});}
 if(globalEvent.active&&Date.now()>=globalEvent.until)globalEvent.active=false;
 let reward=null;if(playerId&&globalEvent.id&&globalEvent.rewards[playerId]&&!globalEvent.claimed.has(playerId)){reward={eventId:globalEvent.id,points:globalEvent.rewards[playerId]};globalEvent.claimed.add(playerId);}
 const online=new Set([...activeUsers.values()].filter(x=>x?.playerId&&Date.now()-(x.lastSeen||0)<=20000).map(x=>x.playerId));
 return send(res,200,{ok:true,active:globalEvent.active,until:globalEvent.until,type:globalEvent.type,id:globalEvent.id,doubleLuck:globalEvent.doubleLuck,online:online.size,reward});
}
if(req.url==='/api/event'&&req.method==='POST'){
 const d=await readBody(req);if(String(d.password||'')!==TEST_MODE_PASSWORD)return send(res,403,{ok:false,error:'forbidden'});
 cleanOnline();const now=Date.now();const onlineIds=[...new Set([...activeUsers.values()].filter(x=>x?.playerId&&now-(x.lastSeen||0)<=20000).map(x=>x.playerId))];
 const type=['luck','points','full'].includes(String(d.type))?String(d.type):'full';const id='event_'+now.toString(36)+'_'+Math.random().toString(36).slice(2,8);
 const rewards={};if(type==='points'||type==='full')for(const pid of onlineIds)rewards[pid]=200;
 globalEvent={id,type,active:true,until:now+5*60*1000,doubleLuck:type==='luck'||type==='full',rewards,claimed:new Set(),startedAt:now};
 return send(res,200,{ok:true,id,type,until:globalEvent.until,doubleLuck:globalEvent.doubleLuck,online:onlineIds.length,rewarded: Object.keys(rewards).length});
}
if(req.url==='/api/player'&&req.method==='POST'){const d=await readBody(req);const player=upsertPlayer(d);if(!player)return send(res,400,{error:'nick'});activeUsers.set(String(d.sessionId||player.playerId),{playerId:player.playerId,lastSeen:Date.now()});return send(res,200,{ok:true,...player,rank:rankForWins(player.wins),rankColor:rankColor(rankForWins(player.wins))})}if(req.url==='/api/heartbeat'&&req.method==='POST'){const d=await readBody(req);const player=upsertPlayer(d);if(player)activeUsers.set(String(d.sessionId||player.playerId),{playerId:player.playerId,lastSeen:Date.now()});return send(res,200,{ok:true,playerId:player?.playerId||null})}if(req.url==='/api/leaderboard'){const now=Date.now();for(const [sid,info] of activeUsers){if(now-(info?.lastSeen||0)>20000)activeUsers.delete(sid);}
const online=new Set(); for(const info of activeUsers.values()){if(info?.playerId)online.add(info.playerId);}
const list=Object.values(players).filter(p=>p&&p.nick&&p.playerId).sort((a,b)=>(+b.level||1)-(+a.level||1)||(+b.xp||0)-(+a.xp||0)||(+b.wins||0)-(+a.wins||0)||String(a.nick).localeCompare(String(b.nick))||String(a.playerId).localeCompare(String(b.playerId))).slice(0,10).map((p,i)=>({...p,position:i+1,wins:+p.wins||0,level:+p.level||1,xp:+p.xp||0,rank:rankForWins(p.wins),rankColor:rankColor(rankForWins(p.wins))}));return send(res,200,{players:list,online:online.size,total:Object.keys(players).length})}let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(__dirname,p);if(!f.startsWith(__dirname)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return send(res,404,'Not found','text/plain');const ext=path.extname(f);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'};send(res,200,fs.readFileSync(f),types[ext]||'application/octet-stream')}catch(e){send(res,500,{error:'server'})}});
server.listen(PORT,()=>console.log('RNG Pedras Shooter online'));
