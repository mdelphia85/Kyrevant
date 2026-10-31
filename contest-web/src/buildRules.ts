export const BUILD_COSTS={Extractor:{minerals:60,energy:0},Barracks:{minerals:120,energy:20},Turret:{minerals:90,energy:20},PowerCore:{minerals:80,energy:60}} as const
export type StructureKind=keyof typeof BUILD_COSTS
export function placementProblem(type:StructureKind,x:number,y:number,player:{x:number;y:number;downed?:boolean},economy:{minerals:number;energy:number},buildings:readonly {x:number;y:number}[]){
  if(player.downed)return 'Wait for redeployment before constructing.'
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<150||x>2450||y<150||y>1450)return 'Choose a location inside the construction boundary.'
  if(Math.hypot(x-player.x,y-player.y)>700)return 'Move closer — this location is beyond construction range.'
  if(buildings.some(b=>Math.hypot(x-b.x,y-b.y)<140))return 'Leave more space between structures.'
  const cost=BUILD_COSTS[type]
  if(economy.minerals<cost.minerals||economy.energy<cost.energy)return `Requires ${cost.minerals} minerals and ${cost.energy} energy.`
  return null
}
