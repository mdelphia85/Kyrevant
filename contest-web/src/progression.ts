export const CLASS_PATHS={
  Fighter:[{id:'breacher',name:'Breacher',description:'Fragmentation grenade damage rises from 60 to 84.'},{id:'sentinel',name:'Sentinel',description:'Gain 30 maximum shields, including after redeployment.'}],
  Monk:[{id:'skirmisher',name:'Skirmisher',description:'Dash distance rises from 10 to 15 metres.'},{id:'inner-calm',name:'Inner Calm',description:'Dash cooldown falls from 6 to 4.2 seconds.'}],
  Cleric:[{id:'field-medic',name:'Field Medic',description:'Heal 56 instead of 40 health; revive allies with 50 health.'},{id:'wardkeeper',name:'Wardkeeper',description:'The healing pulse restores 55 instead of 30 shields.'}],
  Wizard:[{id:'evoker',name:'Evoker',description:'Arcane blast damage rises from 75 to 105.'},{id:'channeler',name:'Channeler',description:'Arcane blast cooldown falls from 6 to 4.2 seconds.'}],
} as const
export type PathClass=keyof typeof CLASS_PATHS
export function chosenPath(characterClass:string|null,talent?:string){return characterClass&&Object.hasOwn(CLASS_PATHS,characterClass)?CLASS_PATHS[characterClass as PathClass].find(path=>path.id===talent):undefined}
export function shieldTalentBonus(characterClass:string|null,talent?:string){return characterClass==='Fighter'&&talent==='sentinel'?30:0}
export function abilityTuning(characterClass:string|null,talent?:string){
  const valid=chosenPath(characterClass,talent)?.id
  return {cooldown:valid==='inner-calm'||valid==='channeler'?4200:6000,heal:valid==='field-medic'?56:40,revive:valid==='field-medic'?50:35,shield:valid==='wardkeeper'?55:30,dash:valid==='skirmisher'?300:200,damage:characterClass==='Wizard'?(valid==='evoker'?105:75):(valid==='breacher'?84:60)}
}
export function pulseRecovery(ally:{health:number;maxHealth:number;shield:number;maxShield:number;downed:boolean},heal:number,shield:number,revive:number){
  return {health:ally.downed?Math.min(ally.maxHealth,revive):Math.min(ally.maxHealth,ally.health+heal),shield:Math.min(ally.maxShield,ally.shield+shield),downed:false}
}
