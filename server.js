const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
const PORT=process.env.PORT||3000, DB=path.join(__dirname,'players.json'), ONLINE_MS=15000;
let players={}; try{players=JSON.parse(fs.readFileSync(DB,'utf8')||'{}')}catch(e){}
function save(){try{fs.writeFileSync(DB,JSON.stringify(players,null,2))}catch(e){}}
function rankForWins(w){w=+w||0; if(w>=30)return 'Champion'; if(w>=25)return 'Diamante'; if(w>=20)return 'Platina'; if(w>=15)return 'Ouro'; if(w>=10)return 'Prata'; if(w>=5)return 'Bronze'; return 'Sem Rank'}
function rankColor(r){return ({'Sem Rank':'#fff','Bronze':'#cd7f32','Prata':'#c0c0c0','Ouro':'#ffd700','Platina':'#7ee6e8','Diamante':'#55b9ff','Champion':'#ff4d9d'})[r]||'#fff'}
function send(res,code,data,type='application/json'){res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type==='application/json'?JSON.stringify(data):data)}
function readBody(req){return new Promise((ok,bad)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{ok(JSON.parse(s||'{}'))}catch(e){bad(e)}})})}
const server=http.createServer(async(req,res)=>{try{
 if(req.url==='/api/player'&&req.method==='POST'){const d=await readBody(req);const nick=String(d.nick||'').trim().slice(0,16);if(!nick)return send(res,400,{error:'nick'});const id=nick.toLowerCase();const old=players[id]||{};players[id]={...old,nick,level:Math.max(old.level||1,+d.level||1),xp:Math.max(old.xp||0,+d.xp||0),wins:Math.max(0,+(old.wins||0)),lastSeen:Date.now()};save();return send(res,200,{ok:true,wins:players[id].wins,rank:rankForWins(players[id].wins)})}
 if(req.url==='/api/leaderboard'){const now=Date.now();const list=Object.values(players).sort((a,b)=>b.level-a.level||b.xp-a.xp||a.nick.localeCompare(b.nick)).slice(0,5).map(p=>({...p,wins:+p.wins||0,rank:rankForWins(p.wins),rankColor:rankColor(rankForWins(p.wins))}));const online=Object.values(players).filter(p=>now-(p.lastSeen||0)<=ONLINE_MS).length;return send(res,200,{players:list,online})}
 let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(__dirname,p);if(!f.startsWith(__dirname)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return send(res,404,'Not found','text/plain');const ext=path.extname(f);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'};send(res,200,fs.readFileSync(f),types[ext]||'application/octet-stream');
}catch(e){send(res,500,{error:'server'})}});
const wss=new WebSocketServer({server,path:'/ws'});let nextId=1,waiting=null,rooms=new Map(),clients=new Map();
function safeNick(n){return String(n||'Player').trim().slice(0,16)||'Player'}
function broadcast(room,msg){for(const c of room.players)if(c.ws.readyState===1)c.ws.send(JSON.stringify(msg))}
function makeRoom(a,b){const room={players:[],started:true};room.players=[a,b];a.room=room;b.room=room;a.x=.5;b.x=.5;a.hp=100;b.hp=100;rooms.set(a.id,room);rooms.set(b.id,room);a.ws.send(JSON.stringify({type:'match',room:a.id,you:{x:a.x,hp:a.hp},enemy:{id:b.id,nick:b.nick,level:b.level,rarity:b.rarity,x:b.x,hp:b.hp,c:b.color}}));b.ws.send(JSON.stringify({type:'match',room:b.id,you:{x:b.x,hp:b.hp},enemy:{id:a.id,nick:a.nick,level:a.level,rarity:a.rarity,x:a.x,hp:a.hp,c:a.color}}))}
wss.on('connection',ws=>{const id=String(nextId++);const c={id,ws,nick:'Player',level:1,rarity:'comum',x:.5,hp:100,room:null,color:'#fff'};clients.set(id,c);ws.send(JSON.stringify({type:'welcome',id}));ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
 if(m.type==='join'){c.nick=safeNick(m.nick);c.level=+m.level||1;c.rarity=String(m.rarity||'comum');const colors={comum:'#fff',raro:'#39a7ff',epico:'#b85cff',lendario:'#ff9b20',mitico:'#ff263c',secreto:'#ff55ff'};c.color=colors[c.rarity]||'#fff'; if(c.room)return; if(waiting&&waiting.ws.readyState===1&&waiting.id!==c.id){const o=waiting;waiting=null;makeRoom(o,c)}else{waiting=c;ws.send(JSON.stringify({type:'waiting'}))}}
 if(m.type==='move'&&c.room){c.x=Math.max(.08,Math.min(.92,+m.x||.5));broadcast(c.room,{type:'state',id:c.id,player:{id:c.id,nick:c.nick,level:c.level,rarity:c.rarity,x:c.x,hp:c.hp,c:c.color}})}
 if(m.type==='shoot'&&c.room){const o=c.room.players.find(p=>p.id!==c.id);if(!o)return;const shotX=Math.max(.08,Math.min(.92,Number.isFinite(+m.x)?+m.x:c.x));broadcast(c.room,{type:'shot',id:c.id,x:shotX});const dist=Math.abs(shotX-o.x);if(dist<.12){o.hp=Math.max(0,o.hp-20);o.ws.send(JSON.stringify({type:'hit',target:o.id,hp:o.hp}));
c.ws.send(JSON.stringify({type:'enemyHit',target:o.id,hp:o.hp}));if(o.hp<=0){
const winnerId=c.nick.toLowerCase(), loserId=o.nick.toLowerCase();
const wp=players[winnerId]||{nick:c.nick,level:c.level,xp:0,wins:0,lastSeen:Date.now()};
wp.nick=c.nick;wp.level=Math.max(wp.level||1,c.level||1);wp.wins=(+wp.wins||0)+1;wp.lastSeen=Date.now();players[winnerId]=wp;
const lp=players[loserId]||{nick:o.nick,level:o.level,xp:0,wins:0,lastSeen:Date.now()};lp.nick=o.nick;lp.level=Math.max(lp.level||1,o.level||1);lp.lastSeen=Date.now();players[loserId]=lp;save();
c.ws.send(JSON.stringify({type:'win',wins:wp.wins,rank:rankForWins(wp.wins),rankColor:rankColor(rankForWins(wp.wins))}));o.ws.send(JSON.stringify({type:'lose',wins:lp.wins,rank:rankForWins(lp.wins),rankColor:rankColor(rankForWins(lp.wins))}));c.room=null;o.room=null;rooms.delete(c.id);rooms.delete(o.id)}}}
 if(m.type==='leave')disconnect(c);
 });ws.on('close',()=>disconnect(c));});
function disconnect(c){if(!clients.has(c.id))return;if(waiting?.id===c.id)waiting=null;if(c.room){const o=c.room.players.find(p=>p.id!==c.id);if(o&&o.ws.readyState===1){o.room=null;o.ws.send(JSON.stringify({type:'left'}));}rooms.delete(c.id);if(o)rooms.delete(o.id);c.room=null}clients.delete(c.id)}
setInterval(()=>{for(const p of Object.values(players)){}},5000);
server.listen(PORT,()=>console.log('RNG online '+PORT+' | PvP WebSocket ativo'));
