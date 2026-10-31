import assert from 'node:assert/strict'
import {frontierHeight,distanceToTrail,frontierLineClear} from '../src/world.ts'
for(const [x,z] of [[14,62],[25,55],[57.5,30],[85,27.5],[110,47.5],[98.5,16.5]])assert.equal(frontierHeight(x,z),0,'mission route must remain level')
let highest=0,steepest=0
for(let x=0;x<=130;x+=.5)for(let z=0;z<=80;z+=.5){
  const h=frontierHeight(x,z);assert.ok(Number.isFinite(h)&&h>=0);highest=Math.max(highest,h)
  steepest=Math.max(steepest,Math.abs(frontierHeight(x+.1,z)-h)/.1,Math.abs(frontierHeight(x,z+.1)-h)/.1)
  if(distanceToTrail(x,z)<=2.5)assert.equal(h,0)
}
assert.ok(highest>3,'the world must contain real elevated terrain')
assert.ok(steepest<2,'height must change continuously without vertical steps')
assert.equal(frontierLineClear(20,1.65,61,56,1.65,61),false,'a raised hill blocks a low shot')
assert.equal(frontierLineClear(20,9,61,56,9,61),true,'a shot above the same hill stays clear')
console.log(`PASS: level mission routes, continuous shared terrain, ${highest.toFixed(1)}m rise, maximum slope ${steepest.toFixed(2)}.`)
