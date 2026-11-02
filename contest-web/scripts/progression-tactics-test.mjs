import assert from 'node:assert/strict'
import {abilityTuning,chosenPath,pulseRecovery} from '../src/progression.ts'
import {enemyTactic} from '../src/enemyTactics.ts'

// Healing cannot damage healthy, high-vitality lineages or overfill injured ones.
const healthy={health:164,maxHealth:164,shield:151,maxShield:151,downed:false}
assert.deepEqual(pulseRecovery(healthy,40,30,35),{health:164,shield:151,downed:false})
assert.deepEqual(pulseRecovery({...healthy,health:150,shield:140},56,55,50),{health:164,shield:151,downed:false})
assert.deepEqual(pulseRecovery({...healthy,health:0,shield:0,downed:true},56,55,50),{health:50,shield:55,downed:false})
assert.equal(chosenPath('Fighter','evoker'),undefined)
assert.equal(chosenPath('toString','evoker'),undefined)
assert.equal(abilityTuning('Fighter','evoker').damage,60)
assert.equal(abilityTuning('Wizard','evoker').damage,105)
assert.equal(abilityTuning('Monk','inner-calm').cooldown,4200)
assert.equal(abilityTuning('Monk','skirmisher').dash,300)

const raider={id:'guard-a',type:'Raider',x:0,y:0,health:100,maxHealth:100}
let move=enemyTactic(raider,{x:500,y:0},2000,true)
assert.equal(move.mode,'advancing');assert.ok(move.dx>0)
move=enemyTactic(raider,{x:200,y:0},2000,false)
assert.equal(move.mode,'flanking');assert.ok(move.dx>0&&Math.abs(move.dy)>0,'blocked sight prompts a lateral approach')
move=enemyTactic(raider,{x:80,y:0},2000,true)
assert.equal(move.mode,'withdrawing');assert.ok(move.dx<0)
assert.equal(enemyTactic({...raider,type:'Heavy'},{x:200,y:0},0,true).mode,'holding')
assert.equal(enemyTactic({...raider,health:20},{x:200,y:0},0,true).mode,'withdrawing')
assert.notEqual(enemyTactic({...raider,health:20},{x:200,y:0},2000,true).mode,'withdrawing','injured enemies must not retreat forever')
for(const visible of [true,false])for(const distance of [0,80,200,500]){
 const step=enemyTactic(raider,{x:distance,y:0},0,visible)
 assert.ok(Number.isFinite(step.dx)&&Number.isFinite(step.dy))
 assert.ok(Math.hypot(step.dx,step.dy)<=8.00001)
}
console.log('PASS: healing maxima, revival, class validation, enemy approach/flank/retreat and finite movement')
