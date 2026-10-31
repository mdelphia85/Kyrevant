import assert from 'node:assert/strict'
import {CombatInput} from '../src/Game/CombatInput.ts'
const input=new CombatInput(0,0)
input.keys.w=true
assert.deepEqual(input.movement(),{x:0,z:1})
for(let n=0;n<20;n++){
 const heading=input.heading
 input.look(12,-2)
 assert.ok(input.heading>heading)
 assert.equal(input.keys.w,true,'Mouse-look must preserve the held forward key')
 const move=input.movement()
 assert.ok(move.x>0&&move.z>0,'Forward motion follows the turning view')
 assert.ok(Math.abs(Math.hypot(move.x,move.z)-1)<1e-10)
}
input.keys.d=true
assert.ok(Math.abs(Math.hypot(...Object.values(input.movement()))-1)<1e-10,'Diagonal movement stays normalized')
input.keys.w=false;input.keys.d=false
assert.deepEqual(input.movement(),{x:0,z:0})
input.keys.a=true;input.look(10,10);assert.equal(input.keys.a,true)
input.clear();assert.deepEqual(input.movement(),{x:0,z:0})
console.log('PASS: held WASD and continuous mouse-look work together through the same controller used by the game; turning redirects movement, diagonals normalize, and blur clears input.')
