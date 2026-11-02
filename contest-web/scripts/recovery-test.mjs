import assert from 'node:assert/strict'
import {io} from 'socket.io-client'
import {setTimeout as sleep} from 'node:timers/promises'
const url=process.env.TEST_SERVER_URL||'http://127.0.0.1:3101'
const clients=[]
function once(socket,event,ms=10000){return new Promise((resolve,reject)=>{const handler=data=>{clearTimeout(timer);resolve(data)};const timer=setTimeout(()=>{socket.off(event,handler);reject(new Error(`Timeout: ${event}`))},ms);socket.once(event,handler)})}
async function open(){const socket=io(url,{autoConnect:false,forceNew:true,reconnection:false});clients.push(socket);const connected=once(socket,'connect');socket.connect();await connected;return socket}
const ack=(socket,event,data)=>new Promise((resolve,reject)=>socket.timeout(10000).emit(event,data,(error,response)=>error?reject(error):resolve(response)))
async function state(socket){const response=once(socket,'session-state');socket.emit('request-room-state');return response}
try{
  const host=await open(),guest=await open()
  const created=await ack(host,'create-room','Recovery leader'),code=created.roomCode,token=created.resumeToken
  assert.match(token,/^[a-f0-9]{64}$/)
  const joined=await ack(guest,'join-room',{roomCode:code,playerName:'Recovery teammate'})
  assert.ok(joined.success);assert.notEqual(joined.resumeToken,token)
  assert.ok(!JSON.stringify(joined.room).includes(token),'private token must never appear in shared room data')
  await ack(host,'start-game',code)
  host.emit('select-class',{roomCode:code,characterClass:'Wizard',species:'Stoneborn'})
  guest.emit('select-class',{roomCode:code,characterClass:'Cleric',species:'Aelari'})
  const mission=once(host,'mission-started');await ack(host,'set-ready',code);await ack(guest,'set-ready',code);await mission
  let room=await state(host),p=room.players.find(p=>p.id===host.id)
  const vitals=room.players.map(p=>({id:p.id,health:p.health,shield:p.shield}))
  guest.emit('use-ability',code);await sleep(100);room=await state(host)
  for(const before of vitals){const ally=room.players.find(p=>p.id===before.id);assert.ok(ally.health>=before.health);assert.ok(ally.shield>=before.shield,'Cleric must not reduce lineage shields above 100')}
  const recharging=once(guest,'kyrevant-progression');guest.emit('use-ability',code);assert.match(await recharging,/RECHARGING/)
  console.log('PASS: real Cleric healing preserves lineage maxima and reports cooldown')
  for(let i=0;i<70&&Math.hypot(p.x-500,p.y-1100)>90;i++){
    const d=Math.hypot(500-p.x,1100-p.y);host.emit('move-player',{roomCode:code,dx:(500-p.x)/d,dy:(1100-p.y)/d});await sleep(55);room=await state(host);p=room.players.find(p=>p.id===host.id)
  }
  const note=once(host,'kyrevant-dialogue');host.emit('interact',code);await note
  host.emit('kyrevant-dialogue-choice',{roomCode:code,site:'flightLog',choice:'download'});await sleep(100)
  const nextObjective=once(host,'kyrevant-chapter-state');room=await state(host);assert.equal(room.questFlags.crashLogRecovered,true);assert.equal((await nextObjective).title,'FIND ELIAS')
  const before=room.players.find(p=>p.id===host.id),oldId=host.id
  const offline=once(guest,'room-updated');host.disconnect();assert.equal((await offline).players.find(p=>p.id===oldId).connected,false)
  const replacement=await open()
  assert.equal((await ack(replacement,'resume-session',{token:'0'.repeat(64)})).success,false)
  const resumed=await ack(replacement,'resume-session',{token})
  assert.equal(resumed.success,true);assert.equal(resumed.room.players.length,2)
  const restored=resumed.room.players.find(p=>p.id===replacement.id)
  assert.notEqual(restored.id,oldId);assert.equal(restored.name,before.name);assert.equal(restored.isHost,true)
  assert.equal(restored.characterClass,'Wizard');assert.equal(restored.species,'Stoneborn');assert.equal(restored.connected,true)
  assert.equal(restored.x,before.x);assert.equal(restored.y,before.y);assert.equal(resumed.room.questFlags.crashLogRecovered,true)
  assert.ok(!resumed.room.players.some(p=>p.id===oldId))
  console.log('PASS: a fresh socket restores class, lineage, position, leadership and mission without duplicate slots or shared tokens.')
  // Reclaiming the same character closes its previous connection rather than creating two owners.
  const takeover=await open(),replaced=once(replacement,'session-replaced')
  assert.equal((await ack(takeover,'resume-session',{token})).success,true);await replaced
  assert.equal((await state(takeover)).players.length,2)
  // Old clients used to lose the room after 45 seconds. Recovery now survives that boundary.
  takeover.disconnect();await sleep(46000)
  const afterSleep=await open(),wake=await ack(afterSleep,'resume-session',{token})
  assert.equal(wake.success,true);assert.equal(wake.room.players.length,2);assert.equal(wake.room.questFlags.crashLogRecovered,true)
  const chapter=once(afterSleep,'kyrevant-chapter-state');await state(afterSleep);assert.ok((await chapter).stage>=2,'recovered clients receive the current objective even when it has not changed')
  assert.equal((await ack(afterSleep,'create-room','Duplicate room')).success,false)
  assert.equal((await ack(afterSleep,'leave-room',{})).success,true)
  assert.equal((await ack(afterSleep,'resume-session',{token})).success,false,'leaving invalidates the saved character token')
  const remaining=await state(guest);assert.equal(remaining.players.length,1);assert.equal(remaining.players[0].isHost,true)
  const newParty=await ack(afterSleep,'create-room','New party');assert.equal(newParty.success,true);assert.notEqual(newParty.resumeToken,token)
  await ack(afterSleep,'leave-room',{})
  console.log('PASS: single-owner takeover, recovery past 45 seconds, explicit leave, token invalidation and leadership transfer.')
}finally{clients.forEach(socket=>socket.disconnect())}
