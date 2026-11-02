export const WORLD_METERS_PER_UNIT = 0.05
export const PLAYER_HIT_RADIUS_UNITS = 12

const routes = [
  [[14,62],[25,55],[39,44],[57.5,30],[75,34],[110,47.5]],
  [[57.5,30],[85,27.5],[98.5,16.5],[112,15]],
] as const
export function distanceToTrail(x:number,z:number){
  let distance=Infinity
  for(const route of routes)for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b[0]-a[0],dz=b[1]-a[1]
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)))
    distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz))
  }
  return distance
}
/** Metres, shared by rendering and server-side vertical hit validation. */
export function frontierHeight(x:number,z:number){
  const hill=(cx:number,cz:number,rx:number,rz:number,h:number)=>h*Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2))
  const height=hill(39,61,11,14,4.8)+hill(42,20,12,12,4)+hill(81,62,18,11,4.3)+hill(94,8,11,9,6)+hill(8,34,11,14,3)
  // Mission pads stay level; smooth shoulders preserve continuous movement.
  const pads=[[10,47,9],[25,55,4],[57.5,26,10],[67.5,17.5,7],[85,24,10],[110,47.5,11],[112.5,53.75,8],[92.5,16,5],[98.5,16.5,5],[112,15,6]]
  let clearance=Math.max(0,(distanceToTrail(x,z)-2.5)/5)
  for(const [px,pz,r] of pads)clearance=Math.min(clearance,Math.max(0,(Math.hypot(x-px,z-pz)-r)/5))
  const t=Math.min(1,clearance),smooth=t*t*(3-2*t)
  return height*smooth
}

export function frontierLineClear(ax:number,ay:number,az:number,bx:number,by:number,bz:number){
  const steps=Math.ceil(Math.hypot(bx-ax,bz-az)/.65)
  for(let i=1;i<steps;i++){
    const t=i/steps
    if(frontierHeight(ax+(bx-ax)*t,az+(bz-az)*t)+.08>ay+(by-ay)*t)return false
  }
  return true
}
