import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {io} from 'socket.io-client'
import {makeCheckpoint,readCheckpoint} from '../src/checkpoint.ts'
import {weaponSpec,spendRound,beginReload,completeReload} from '../src/weapons.ts'
import {maintainBuilding} from '../src/baseStrategy.ts'
import {CombatInput} from '../src/Game/CombatInput.ts'

for(const role of ['Fighter','Monk','Cleric','Wizard']){
  const spec=weaponSpec(role),p={characterClass:role,ammo:spec.magazine}
  assert.equal(beginReload(p,100),false)
  for(let i=0;i<spec.magazine;i++)assert.equal(spendRound(p,100+i),true)
  assert.equal(spendRound(p,200),false);assert.equal(p.ammo,0)
  assert.equal(beginReload(p,201),false,'reload cannot be restarted')
  assert.equal(spendRound(p,200+spec.reloadMs-1),false)
  assert.equal(completeReload(p,200+spec.reloadMs),true)
  assert.equal(p.ammo,spec.magazine)
}
assert.deepEqual(weaponSpec('toString'),weaponSpec('Fighter'))
const input=new CombatInput();input.touchX=.3;input.touchZ=.4
assert.equal(Math.hypot(...Object.values(input.movement())),.5)
input.keys.w=true;assert.ok(Math.hypot(...Object.values(input.movement()))<=1.000001)
input.clear();assert.deepEqual(input.movement(),{x:0,z:0})
const building={health:20,maxHealth:250,level:1},economy={minerals:300,energy:100}
assert.equal(maintainBuilding(building,economy,'repair'),null);assert.equal(building.health,140)
assert.equal(maintainBuilding(building,economy,'upgrade'),null);assert.equal(building.level,2)
assert.equal(maintainBuilding(building,economy,'upgrade'),null);assert.equal(building.level,3)
const before=structuredClone({building,economy});assert.match(maintainBuilding(building,economy,'upgrade'),/fully/)
assert.deepEqual({building,economy},before)
console.log('PASS: all class magazines, timed reload gates, analog movement, repair and upgrade limits')

const port=3117,origin=`http://127.0.0.1:${port}`,clients=[]
let server,logs=''
async function start(){
  server=spawn(process.execPath,['--import','tsx','server/server.ts'],{env:{...process.env,PORT:String(port),PUBLIC_URL:origin,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']})
  server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b)
  for(let i=0;i<80;i++){if(server.exitCode!==null)throw new Error(logs);try{if((await fetch(`${origin}/healthz`)).ok)return}catch{}await delay(100)}
  throw new Error(`Server readiness: ${logs}`)
}
async function stop(){if(!server||server.exitCode!==null)return;const ended=new Promise(resolve=>server.once('exit',resolve));server.kill();await ended}
const ack=(s,event,data)=>new Promise((resolve,reject)=>s.timeout(10000).emit(event,data,(error,result)=>error?reject(error):resolve(result)))
const once=(s,event)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Timeout ${event}`)),10000);s.once(event,v=>{clearTimeout(timer);resolve(v)})})
async function client(){const s=io(origin,{autoConnect:false,reconnection:false});clients.push(s);const ready=once(s,'connect');s.connect();await ready;return s}
try{
  await start();const host=await client(),guest=await client()
  const created=await ack(host,'create-room','Checkpoint Host'),code=created.roomCode
  assert.equal((await ack(guest,'join-room',{roomCode:code,playerName:'Checkpoint Guest'})).success,true)
  await ack(host,'start-game',code)
  host.emit('select-class',{roomCode:code,characterClass:'Fighter',species:'Stoneborn'})
  guest.emit('select-class',{roomCode:code,characterClass:'Cleric',species:'Aelari'})
  const entered=once(host,'mission-started');await ack(host,'set-ready',code);await ack(guest,'set-ready',code)
  const room=await entered,save=(await ack(host,'save-campaign',code)).checkpoint
  assert.equal(readCheckpoint(save).players[0].species,'Stoneborn')
  assert.ok(!JSON.stringify(save).includes(created.resumeToken))
  assert.equal(makeCheckpoint(room,guest.id).players[0].name,'Checkpoint Guest')
  for(const mutate of [s=>s.version=99,s=>s.players[0].x=Infinity,s=>s.players[0].talent={},s=>s.enemies.push(s.enemies[0]),s=>s.savedAt='bad']){
    const bad=structuredClone(save);mutate(bad);assert.throws(()=>readCheckpoint(bad))
  }
  // A genuine server restart discards every in-memory room and recovery token.
  host.disconnect();guest.disconnect();await stop();await start()
  const restoredHost=await client(),restoredGuest=await client()
  assert.equal((await ack(restoredHost,'resume-session',{token:created.resumeToken})).success,false)
  const restored=await ack(restoredHost,'restore-campaign',{checkpoint:save})
  assert.equal(restored.success,true);assert.notEqual(restored.roomCode,code)
  assert.equal(restored.room.players[0].species,'Stoneborn')
  assert.equal(restored.room.enemies.length,save.enemies.length)
  const recovered=await ack(restoredGuest,'join-room',{roomCode:restored.roomCode,playerName:'Checkpoint Guest'})
  assert.equal(recovered.success,true);assert.equal(recovered.room.players.find(p=>p.id===restoredGuest.id).characterClass,'Cleric')
  const autosave=await once(restoredGuest,'campaign-checkpoint')
  assert.equal(autosave.players[0].name,'Checkpoint Guest');readCheckpoint(autosave)
  assert.equal((await ack(restoredHost,'restore-campaign',{checkpoint:save})).success,false,'cannot occupy two parties')
  console.log('PASS: checkpoint validation, owner ordering, server restart, fresh identities, friend reclaim and autosave')
  async function scenario(snapshot){
    await ack(restoredGuest,'leave-room',{});await ack(restoredHost,'leave-room',{})
    const result=await ack(restoredHost,'restore-campaign',{checkpoint:snapshot});assert.equal(result.success,true,result.message)
    return result.roomCode
  }
  async function state(){const value=once(restoredHost,'session-state');restoredHost.emit('request-room-state');return value}
  const base=structuredClone(save)
  base.players.forEach((p,i)=>{p.x=900-i*50;p.y=1240})
  base.enemies=base.enemies.map(e=>({...e,health:0,alive:false}))
  base.enemies.push({id:'l1-defense-fixture',type:'Raider',x:1250,y:1240,health:100,maxHealth:100,alive:true})
  base.buildings=[{id:'test-extractor',type:'Extractor',x:1100,y:1240,health:140,maxHealth:250,level:1}]
  base.economy={minerals:1000,energy:1000}
  const baseCode=await scenario(base)
  assert.equal((await ack(restoredHost,'maintain-building',{roomCode:baseCode,buildingId:'test-extractor',action:'upgrade'})).success,true)
  assert.equal((await state()).buildings[0].level,2)
  assert.equal((await ack(restoredHost,'maintain-building',{roomCode:baseCode,buildingId:'test-extractor',action:'repair'})).success,true)
  assert.equal((await state()).buildings[0].health,350)
  assert.equal((await ack(restoredHost,'maintain-building',{roomCode:baseCode,buildingId:'test-extractor',action:'invalid'})).success,false)
  const attacked=once(restoredHost,'structure-attack')
  assert.equal((await ack(restoredGuest,'join-room',{roomCode:baseCode,playerName:'Checkpoint Guest'})).success,true)
  await attacked;assert.ok((await state()).buildings[0].health<350)
  assert.equal((await ack(restoredGuest,'maintain-building',{roomCode:baseCode,buildingId:'test-extractor',action:'repair'})).success,false,'proximity required')
  console.log('PASS: shared structure upgrades, repair, invalid orders, range restrictions and actual wave damage')
  for(const [level,site,choice] of [[2,'artifact','study'],[3,'citadel','shutdown']]){
    const story=structuredClone(save);story.level=level;story.players[0].x=level===2?1850:1970;story.players[0].y=level===2?320:330
    story.players[1].characterClass='Wizard'
    story.enemies=[{id:level===2?'l2-commander':'final-commander',type:'Commander',x:2350,y:200,health:1000,maxHealth:1000,alive:true}]
    const storyCode=await scenario(story),conversation=once(restoredHost,'kyrevant-dialogue')
    restoredHost.emit('interact',storyCode);assert.ok((await conversation).choices.some(c=>c.id===choice))
    restoredHost.emit('kyrevant-dialogue-choice',{roomCode:storyCode,site,choice});await delay(100)
    const decided=await state()
    if(level===2){assert.equal(decided.relicChoice,'study');assert.equal(decided.economy.energy,story.economy.energy+90)}
    else{assert.equal(decided.citadelChoice,'shutdown');assert.equal(decided.enemies[0].health,750)}
    const repeated=once(restoredHost,'session-state');restoredHost.emit('kyrevant-dialogue-choice',{roomCode:storyCode,site,choice});restoredHost.emit('request-room-state')
    assert.deepEqual((await repeated).economy,decided.economy,'choice rewards apply only once')
  }
  console.log('PASS: specialist artifact choice, Citadel shutdown and one-time story rewards')
}finally{for(const s of clients)s.disconnect();await stop()}
