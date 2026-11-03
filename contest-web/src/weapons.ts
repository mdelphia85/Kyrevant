export const WEAPONS={Fighter:{magazine:30,reloadMs:1700},Monk:{magazine:40,reloadMs:1400},Cleric:{magazine:24,reloadMs:1600},Wizard:{magazine:12,reloadMs:2100}} as const
export function weaponSpec(role:string|null){return role&&Object.hasOwn(WEAPONS,role)?WEAPONS[role as keyof typeof WEAPONS]:WEAPONS.Fighter}
export type Magazine={ammo?:number;reloadUntil?:number;characterClass:string|null}
export function completeReload(player:Magazine,now:number){
  if(player.reloadUntil&&now>=player.reloadUntil){player.ammo=weaponSpec(player.characterClass).magazine;player.reloadUntil=0;return true}return false
}
export function beginReload(player:Magazine,now:number){
  completeReload(player,now)
  if(player.reloadUntil||((player.ammo??weaponSpec(player.characterClass).magazine)>=weaponSpec(player.characterClass).magazine))return false
  player.reloadUntil=now+weaponSpec(player.characterClass).reloadMs;return true
}
export function spendRound(player:Magazine,now:number){
  completeReload(player,now);player.ammo??=weaponSpec(player.characterClass).magazine
  if(player.reloadUntil)return false
  if(player.ammo<=0){beginReload(player,now);return false}
  player.ammo--;return true
}
