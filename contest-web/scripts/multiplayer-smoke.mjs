import { io } from 'socket.io-client'
import assert from 'node:assert/strict'
const endpoint = process.env.TEST_SERVER_URL || 'http://127.0.0.1:3001'
const clients = [io(endpoint,{autoConnect:false,extraHeaders:{Origin:endpoint}}),io(endpoint,{autoConnect:false,extraHeaders:{Origin:endpoint}})]
const once = (socket,event) => new Promise((resolve,reject) => {const timer=setTimeout(()=>reject(new Error(`Timed out: ${event}`)),10000);socket.once(event,data=>{clearTimeout(timer);resolve(data)})})
const ack = (socket,event,data) => new Promise((resolve,reject) => socket.timeout(10000).emit(event,data,(error,result)=>error?reject(error):resolve(result)))
try {
  await Promise.all(clients.map(async socket=>{const connected=once(socket,'connect');socket.connect();await connected}))
  const [host,guest]=clients
  const created=await ack(host,'create-room','Test Commander')
  assert.equal(created.success,true)
  const code=created.roomCode
  const hostUpdate=once(host,'room-updated')
  const joined=await ack(guest,'join-room',{roomCode:code,playerName:'Test Scout'})
  assert.equal(joined.success,true)
  assert.equal((await hostUpdate).players.length,2)
  const started=await ack(host,'start-game',code)
  assert.equal(started.success,true)
  host.emit('select-class',{roomCode:code,characterClass:'Fighter'})
  guest.emit('select-class',{roomCode:code,characterClass:'Cleric'})
  const missions=clients.map(socket=>once(socket,'mission-started'))
  assert.equal((await ack(host,'set-ready',code)).success,true)
  assert.equal((await ack(guest,'set-ready',code)).success,true)
  const rooms=await Promise.all(missions)
  assert.ok(rooms.every(room=>room.phase==='mission' && room.players.length===2))
  assert.deepEqual(rooms[0].players.map(p=>p.characterClass).sort(),['Cleric','Fighter'])
  console.log('PASS: separate clients create/join a room, synchronize party, select classes, and enter the mission together.')
} finally {clients.forEach(socket=>socket.disconnect())}
