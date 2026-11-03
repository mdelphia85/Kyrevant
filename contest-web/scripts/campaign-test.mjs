import {frontierHeight,frontierLineClear,WORLD_METERS_PER_UNIT} from '../src/world.ts'
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import { setTimeout as sleep } from 'node:timers/promises'
const origin=process.env.TEST_SERVER_URL||'http://127.0.0.1:3101'
const host=io(origin,{autoConnect:false}), guest=io(origin,{autoConnect:false})
const once=(socket,event,ms=12000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(event,handler);reject(new Error(`Timeout ${event}`))},ms);function handler(data){clearTimeout(timer);resolve(data)}socket.once(event,handler)})
const ack=(socket,event,data)=>new Promise((resolve,reject)=>socket.timeout(12000).emit(event,data,(error,result)=>error?reject(error):resolve(result)))
let turretShots=0
host.on('turret-attack',data=>{assert.ok(Number.isFinite(data.startX)&&Number.isFinite(data.targetX));turretShots++})
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
async function synchronize(){const response=once(host,'session-state');host.emit('request-room-state');state=await response}
async function travel(x,y){
  const start=Date.now()
  while(Math.hypot(player(host).x-x,player(host).y-y)>65){
    if(Date.now()-start>60000)throw new Error(`Travel timeout ${x},${y}`)
    const p=player(host)
    if(p.downed){await sleep(500);await synchronize();continue}
    const distance=Math.hypot(p.x-x,p.y-y)
    const steps=Math.min(8,Math.max(1,Math.floor((distance-40)/14)))
    for(let step=0;step<steps;step++){
      for(const socket of [host,guest]){const ally=player(socket);if(!ally||ally.downed)continue;const dx=x-ally.x,dy=y-ally.y,m=Math.hypot(dx,dy);if(m>40)socket.emit('move-player',{roomCode:code,dx:dx/m,dy:dy/m})}
      await sleep(42)
    }
    // Drain the host's ordered input stream before using its position. This
    // avoids overshooting interactables when public-network updates are delayed.
    await synchronize()
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
    for(const socket of [host,guest]){
      const ally=player(socket);if(ally.downed)continue
      const ex=enemy.x-ally.x,ey=enemy.y-ally.y,dist=Math.hypot(ex,ey)
      if(dist>430||!frontierLineClear(ally.x*.05,frontierHeight(ally.x*.05,ally.y*.05)+1.65,ally.y*.05,enemy.x*.05,frontierHeight(enemy.x*.05,enemy.y*.05)+1.25,enemy.y*.05))socket.emit('move-player',{roomCode:code,dx:ex/dist,dy:ey/dist})
      socket.emit('attack',{roomCode:code,aimX:ex/dist,aimY:ey/dist,aimElevation:(()=>{const height=frontierHeight(enemy.x*WORLD_METERS_PER_UNIT,enemy.y*WORLD_METERS_PER_UNIT)-frontierHeight(ally.x*WORLD_METERS_PER_UNIT,ally.y*WORLD_METERS_PER_UNIT)-.4;return height/Math.hypot(dist*WORLD_METERS_PER_UNIT,height)})()})
    }
    await sleep(55)
  }
}
async function mine(type,target){const node=state.resourceNodes.find(n=>n.type===type);await travel(node.x,node.y);while(state.economy[type]<target){assert.equal((await ack(host,'mine-resource',{roomCode:code,nodeId:node.id})).success,true);await sleep(20)}}
async function build(type,x,y){await travel(x,y);const size=state.buildings.length,confirmed=once(host,'build-confirmed');host.emit('build-structure',{roomCode:code,type,x,y});assert.equal((await confirmed).type,type);await until(()=>state.buildings.length>size,`Build ${type}`)}
try{
  await Promise.all([host,guest].map(async s=>{const promise=once(s,'connect');s.connect();await promise}))
  const created=await ack(host,'create-room','Campaign Tester');code=created.roomCode;assert.ok(created.success)
  assert.ok((await ack(guest,'join-room',{roomCode:code,playerName:'Second Client'})).success)
  assert.ok((await ack(host,'start-game',code)).success)
  host.emit('select-class',{roomCode:code,characterClass:'Fighter',species:'Stoneborn'})
  guest.emit('select-class',{roomCode:code,characterClass:process.env.RESCUE_TACTIC==='sabotage'?'Wizard':process.env.RESCUE_TACTIC==='relief'?'Cleric':'Fighter',species:'Aelari'})
  const mission=once(host,'mission-started')
  await ack(host,'set-ready',code);await ack(guest,'set-ready',code);state=await mission
  assert.equal(player(host).maxHealth,140);assert.equal(player(guest).maxShield,135)
  assert.equal((await ack(host,'choose-talent',{roomCode:code,talent:'sentinel'})).success,false,'paths require rank two')
  const rejected=once(host,'build-denied');host.emit('build-structure',{roomCode:code,type:'Extractor',x:-100,y:1000});assert.match(await rejected,/boundary/);await synchronize();assert.equal(state.buildings.length,0)
  const original=player(host).x
  host.emit('move-player',{roomCode:code,dx:NaN,dy:0})
  host.emit('build-structure',{roomCode:code,type:'Invalid',x:0,y:0})
  await sleep(150);assert.equal(player(host).x,original)
  const restored=once(guest,'connect');const id=guest.id;guest.io.engine.close();await restored;assert.equal(guest.id,id)
  console.log('PASS: lineage bonuses, malformed-input rejection, transport reconnect')
  await travel(600,1100)
  const conversation=once(host,'kyrevant-dialogue');host.emit('interact',code);await conversation;await synchronize()
  const protectedHealth=player(host).health+player(host).shield
  await sleep(2600);await synchronize()
  assert.ok(player(host).health+player(host).shield>=protectedHealth,'Reading a friendly note must protect the reader')
  console.log('PASS: friendly story dialogue protects readers under fire')
  await talk(500,1100,'flightLog','download','recover-flight-log')
  await fight(e=>e.id==='l1-raider-1'||e.id==='l1-raider-2')
  await talk(1150,600,'innkeeper',process.env.RESCUE_TACTIC==='sabotage'?'plan_sabotage':process.env.RESCUE_TACTIC==='relief'?'plan_relief':'ask_missing','meet-innkeeper')
  await synchronize();assert.equal(state.questFlags.rescueTactic,process.env.RESCUE_TACTIC||'assault')
  if(process.env.RESCUE_TACTIC==='sabotage')assert.ok(state.enemies.filter(e=>['l1-outpost-1','l1-outpost-2'].includes(e.id)).every(e=>e.maxHealth===62))
  await fight(e=>e.id.startsWith('l1-outpost-'))
  await talk(2200,950,'missing','free','rescue-civilians')
  await synchronize();assert.ok(player(host).rank>=2)
  assert.equal((await ack(host,'choose-talent',{roomCode:code,talent:'evoker'})).success,false,'paths must match the class')
  const previousShield=player(host).maxShield
  assert.equal((await ack(host,'choose-talent',{roomCode:code,talent:'sentinel'})).success,true)
  await synchronize();assert.equal(player(host).talent,'sentinel');assert.equal(player(host).maxShield,previousShield+30)
  assert.equal((await ack(host,'choose-talent',{roomCode:code,talent:'breacher'})).success,false,'one path per campaign')
  console.log('PASS: rank gate, class validation, one-time path selection and shield bonus')
  if(process.env.RESCUE_ONLY){console.log(`PASS: ${process.env.RESCUE_TACTIC} class-specific rescue plan`)}else{
  await talk(1700,550,'resistance','alliance','meet-resistance')
  await mine('minerals',180);assert.ok(done('gather-minerals'))
  await mine('energy',60)
  await build('Extractor',1250,900);await build('Turret',1500,900)
  assert.ok(done('gather-minerals'),'spending must not undo mining objective')
  await talk(1500,690,'radio','begin_defense','activate-defense')
  for(let wave=1;wave<=3;wave++){await until(()=>state.enemies.some(e=>e.alive&&e.id.startsWith(`l1-defense-${wave}-`)),`Wave ${wave}`);await fight(e=>e.id.startsWith(`l1-defense-${wave}-`));console.log(`PASS: defense wave ${wave}`)}
  await until(()=>done('defend-settlement'),'Defense complete')
  await fight(e=>e.type==='Commander');await until(()=>state.level===2,'Chapter 2')
  assert.equal(player(host).talent,'sentinel');assert.equal(player(host).maxShield,100+(player(host).rank-1)*8+30)
  console.log('PASS: crash, note, rescue, mining, construction, settlement defense, path preserved across chapter transition')
  await mine('minerals',250);await mine('energy',120)
  await build('Barracks',850,1250);await build('PowerCore',1050,1250)
  await fight();console.log('PASS: frontier approach secured')
  await travel(1850,320);host.emit('interact',code);await sleep(100);host.emit('kyrevant-dialogue-choice',{roomCode:code,site:'artifact',choice:'disable'});await until(()=>done('recover-artifact'),'Recover artifact')
  await fight(e=>e.id==='l2-commander');await until(()=>state.level===3,'Chapter 3')
  await mine('minerals',220);await mine('energy',80)
  await build('Extractor',950,1250);await build('Turret',1150,1250);await build('Extractor',1350,1250)
  await fight();console.log('PASS: Citadel approach secured')
  await travel(1970,330);host.emit('interact',code);await sleep(100);host.emit('kyrevant-dialogue-choice',{roomCode:code,site:'citadel',choice:'restore'});await until(()=>done('activate-citadel-core'),'Citadel core')
  await fight(e=>e.id==='final-commander');await until(()=>won,'Shared victory')
  assert.ok(turretShots>0,'constructed turrets must visibly fire at hostiles')
  console.log('PASS: all three chapters reach shared victory using public player actions, including turret fire')
  host.emit('restart-campaign',code);await until(()=>state.level===1,'Restart')
  assert.ok(state.quests.every(q=>!q.complete));assert.equal(player(host).talent,undefined);assert.equal(player(host).maxShield,100);console.log('PASS: campaign restart resets objectives')
  }
}finally{host.disconnect();guest.disconnect()}
