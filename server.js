const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000, DB=path.join(__dirname,'players.json'), ONLINE_MS=60000;
let players={}; try{players=JSON.parse(fs.readFileSync(DB,'utf8')||'{}')}catch(e){}
function save(){try{fs.writeFileSync(DB,JSON.stringify(players,null,2))}catch(e){}}
function clean(){/* Dados dos jogadores permanecem salvos; lastSeen serve apenas para contar quem está online. */}
function send(res,code,data,type='application/json'){res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type==='application/json'?JSON.stringify(data):data)}
function readBody(req){return new Promise((ok,bad)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{ok(JSON.parse(s||'{}'))}catch(e){bad(e)}})})}
http.createServer(async(req,res)=>{try{
 if(req.url==='/api/player'&&req.method==='POST'){const d=await readBody(req);const nick=String(d.nick||'').trim().slice(0,16);if(!nick)return send(res,400,{error:'nick'});const id=nick.toLowerCase();const old=players[id]||{};players[id]={nick,level:Math.max(old.level||1,+d.level||1),xp:Math.max(old.xp||0,+d.xp||0),lastSeen:Date.now()};save();clean();return send(res,200,{ok:true})}
 if(req.url==='/api/leaderboard'){clean();const now=Date.now();const list=Object.values(players).sort((a,b)=>b.level-a.level||b.xp-a.xp||a.nick.localeCompare(b.nick)).slice(0,5);const online=Object.values(players).filter(p=>now-(p.lastSeen||0)<=ONLINE_MS).length;return send(res,200,{players:list,online})}
 let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(__dirname,p);if(!f.startsWith(__dirname)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return send(res,404,'Not found','text/plain');const ext=path.extname(f);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'};send(res,200,fs.readFileSync(f),types[ext]||'application/octet-stream');
}catch(e){send(res,500,{error:'server'})}}).listen(PORT,()=>console.log('RNG online '+PORT));