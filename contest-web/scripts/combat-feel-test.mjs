import assert from 'node:assert/strict'
import {WeaponMotion} from '../src/Game/WeaponMotion.ts'
import {placementProblem,BUILD_COSTS} from '../src/buildRules.ts'
const motion=new WeaponMotion();motion.aimed=true
for(let i=0;i<90;i++)motion.update(1/60,false)
const aimed=motion.update(1/60,false);assert.ok(aimed.fov<.8)
motion.shoot(1.5);assert.ok(motion.update(1/60,false).z<aimed.z,'a shot moves the weapon back')
motion.release();for(let i=0;i<180;i++)motion.update(1/60,false)
assert.ok(motion.recoil<.00001);assert.ok(motion.aim<.00001)
for(const fps of [20,30,60,144]){const m=new WeaponMotion();m.aimed=true;for(let i=0;i<fps;i++)m.update(1/fps,true);assert.ok(m.aim>.99);assert.ok(Number.isFinite(m.update(1/fps,true).y))}
const player={x:1000,y:1000},rich={minerals:1000,energy:1000}
assert.equal(placementProblem('Turret',1100,1000,player,rich,[]),null)
assert.match(placementProblem('Turret',2499,1000,player,rich,[]),/boundary/)
assert.match(placementProblem('Turret',1800,1000,player,rich,[]),/closer/)
assert.match(placementProblem('Turret',1100,1000,player,rich,[{x:1100,y:1000}]),/space/)
assert.match(placementProblem('Turret',1100,1000,player,{minerals:0,energy:0},[]),/90 minerals/)
assert.equal(BUILD_COSTS.Turret.energy,20)
console.log('PASS: aiming/recoil settle across frame rates; placement rejects off-map, distant, occupied and unaffordable locations.')
