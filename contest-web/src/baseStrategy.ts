export function upgradeCost(level:number){return {minerals:60*level,energy:20*level}}
export function maintainBuilding(building:{level?:number;health:number;maxHealth:number},economy:{minerals:number;energy:number},action:string){
  if(action==='repair'){
    if(building.health>=building.maxHealth)return 'Hull is already intact.'
    if(economy.minerals<25)return 'Repair requires 25 minerals.'
    economy.minerals-=25;building.health=Math.min(building.maxHealth,building.health+120);return null
  }
  if(action!=='upgrade')return 'Unknown maintenance order.'
  const level=building.level??1,cost=upgradeCost(level)
  if(level>=3)return 'Structure is fully upgraded.'
  if(economy.minerals<cost.minerals||economy.energy<cost.energy)return `Upgrade requires ${cost.minerals} minerals and ${cost.energy} energy.`
  economy.minerals-=cost.minerals;economy.energy-=cost.energy;building.level=level+1;building.maxHealth+=100;building.health=Math.min(building.maxHealth,building.health+100);return null
}
