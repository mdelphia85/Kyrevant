import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import { setTimeout as sleep } from 'node:timers/promises'
const origin=process.env.TEST_SERVER_URL||'http://127.0.0.1:3101'
const host=io(origin,{autoConnect:false}), guest=io(origin,{autoConnect:false})
const once=(socket,event,ms=12000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(event,handler);reject(new Error(`Timeout ${event}`))},ms);function handler(data){clearTimeout(timer);resolve(data)}socket.once(event,handler)})
const ack=(socket,event,data)=>new Promise((resolve,reject)=>socket.timeout(12000).emit(event,data,(error,result)=>error?reject(error):resolve(result)))
let state={players:[],enemies:[],quests:[],resourceNodes:[],buildings:[],level:1,economy:{minerals:0,energy:0}},code,won=false
host.on('player-state',players=>state.players=players)
host.on('player-positions',players=>state.players=players)
host.on('enemy-state',enemies=>state.enemies=enemies)
host.on('quest-state',quests=>state.quests=quests)
host.on('resource-state',data=>{state.economy=data.economy;state.resourceNodes=data.nodes})
host.on('building-state',buildings=>state.buildings=buildings)
host.on('level-started',room=>{state=room;console.log(`CHAPTER ${state.level} started`)})
host.on('game-won',()=>{won=true})
const done=id=>state.quests.some(q=>q.id===id&&q.complete)
const player=socket=>state.players.find(p=>p.id===socket.id)
async function until(test,label,ms=20000){const start=Date.now();while(!test()){if(Date.now()-start>ms)throw new Error(`${label}: ${JSON.stringify({level:state.level,quests:state.quests,players:state.players.map(p=>({name:p.name,x:p.x,y:p.y,hp:p.health,down:p.downed}))})}`);await sleep(50)}}
async function travel(x,y){
  const start=Date.now()
  while(Math.hypot(player(host).x-x,player(host).y-y)>65){
    if(Date.now()-start>35000)throw new Error(`Travel timeout ${x},${y}`)
    for(const socket of [host,guest]){const p=player(socket);if(!p||p.downed)continue;const dx=x-p.x,dy=y-p.y,m=Math.hypot(dx,dy);if(m>40)socket.emit('move-player',{roomCode:code,dx:dx/m,dy:dy/m})}
    await sleep(42)
  }
}
async function talk(x,y,site,choice,id){await travel(x,y);host.emit('interact',code);await sleep(100);host.emit('kyrevant-dialogue-choice',{roomCode:code,site,choice});await until(()=>done(id),`Dialogue ${id}`)}
async function fight(filter=()=>true){
  const start=Date.now()
  while(state.enemies.some(e=>e.alive&&filter(e))){
    if(Date.now()-start>100000)throw new Error('Combat timeout')
    const p=player(host)
    if(p.downed){await sleep(500);continue}
    const enemy=state.enemies.filter(e=>e.alive&&filter(e)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0]
    const dx=enemy.x-p.x,dy=enemy.y-p.y,d=Math.hypot(dx,dy)
    for(const socket of [host,guest]){
      const ally=player(socket);if(ally.downed)continue
      const ex=enemy.x-ally.x,ey=enemy.y-ally.y,dist=Math.hypot(ex,ey)
      if(dist>430)socket.emit('move-player',{roomCode:code,dx:ex/dist,dy:ey/dist})
      socket.emit('attack',{roomCode:code,aimX:ex/dist,aimY:ey/dist,aimElevation:0})
    }
    await sleep(55)
  }
}
async function mine(type,target){const node=state.resourceNodes.find(n=>n.type===type);await travel(node.x,node.y);while(state.economy[type]<target){assert.equal((await ack(host,'mine-resource',{roomCode:code,nodeId:node.id})).success,true);await sleep(20)}}
async function build(type,x,y){await travel(x,y);const size=state.buildings.length;host.emit('build-structure',{roomCode:code,type,x,y});await until(()=>state.buildings.length>size,`Build ${type}`)}
try{
  await Promise.all([host,guest].map(async s=>{const promise=once(s,'connect');s.connect();await promise}))
  const created=await ack(host,'create-room','Campaign Tester');code=created.roomCode;assert.ok(created.success)
  assert.ok((await ack(guest,'join-room',{roomCode:code,playerName:'Second Client'})).success)
  assert.ok((await ack(host,'start-game',code)).success)
  host.emit('select-class',{roomCode:code,characterClass:'Fighter',species:'Stoneborn'})
  guest.emit('select-class',{roomCode:code,characterClass:'Fighter',species:'Aelari'})
  const mission=once(host,'mission-started')
  await ack(host,'set-ready',code);await ack(guest,'set-ready',code);state=await mission
  assert.equal(player(host).maxHealth,140);assert.equal(player(guest).maxShield,135)
  const original=player(host).x
  host.emit('move-player',{roomCode:code,dx:NaN,dy:0})
  host.emit('build-structure',{roomCode:code,type:'Invalid',x:0,y:0})
  await sleep(150);assert.equal(player(host).x,original)
  const restored=once(guest,'connect');const id=guest.id;guest.io.engine.close();await restored;assert.equal(guest.id,id)
  console.log('PASS: lineage bonuses, malformed-input rejection, transport reconnect')
  await talk(500,1100,'flightLog','download','recover-flight-log')
  await fight(e=>e.id==='l1-raider-1'||e.id==='l1-raider-2')
  await talk(1150,600,'innkeeper','ask_missing','meet-innkeeper')
  await fight(e=>e.id.startsWith('l1-outpost-'))
  await talk(2200,950,'missing','free','rescue-civilians')
  await talk(1700,550,'resistance','alliance','meet-resistance')
  await mine('minerals',180);assert.ok(done('gather-minerals'))
  await mine('energy',60)
  await build('Extractor',1250,900);await build('Turret',1500,900)
  assert.ok(done('gather-minerals'),'spending must not undo mining objective')
  await talk(1500,690,'radio','begin_defense','activate-defense')
  for(let wave=1;wave<=3;wave++){await until(()=>state.enemies.some(e=>e.alive&&e.id.startsWith(`l1-defense-${wave}-`)),`Wave ${wave}`);await fight(e=>e.id.startsWith(`l1-defense-${wave}-`));console.log(`PASS: defense wave ${wave}`)}
  await until(()=>done('defend-settlement'),'Defense complete')
  await fight(e=>e.type==='Commander');await until(()=>state.level===2,'Chapter 2')
  console.log('PASS: crash, note, rescue, mining, construction, settlement defense, chapter transition')
  await mine('minerals',250);await mine('energy',120)
  await build('Barracks',850,1250);await build('PowerCore',1050,1250)
  await travel(1850,320);host.emit('interact',code);await until(()=>done('recover-artifact'),'Recover artifact')
  await fight(e=>e.id==='l2-commander');await until(()=>state.level===3,'Chapter 3')
  await mine('minerals',220);await mine('energy',80)
  await build('Extractor',950,1250);await build('Turret',1150,1250);await build('Extractor',1350,1250)
  await travel(1970,330);host.emit('interact',code);await until(()=>done('activate-citadel-core'),'Citadel core')
  await fight(e=>e.id==='final-commander');await until(()=>won,'Shared victory')
  console.log('PASS: all three chapters reach shared victory using public player actions')
  host.emit('restart-campaign',code);await until(()=>state.level===1,'Restart')
  assert.ok(state.quests.every(q=>!q.complete));console.log('PASS: campaign restart resets objectives')
}finally{host.disconnect();guest.disconnect()}
