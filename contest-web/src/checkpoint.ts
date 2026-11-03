import {species,characterClasses} from './characters.ts'
import {chosenPath} from './progression.ts'
const flags=['artifactRecovered','citadelCoreActivated','crashLogRecovered','innkeeperContacted','civiliansRescued','resistanceContacted','raidLaunched','watchLaunched','defenseAuthorized'] as const
const booleanFlags=(value:Record<string,unknown>)=>Object.fromEntries(flags.map(key=>[key,value[key]===true]))
const number=(value:unknown,min:number,max:number)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error('Checkpoint contains invalid numbers.');return value}
const text=(value:unknown,max=80)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Checkpoint contains invalid text.');return value}
const list=(value:unknown,max:number)=>{if(!Array.isArray(value)||value.length>max)throw new Error('Checkpoint contains an invalid list.');return value}
const option=(value:unknown,options:readonly string[])=>{if(value===undefined)return undefined;if(typeof value!=='string'||!options.includes(value))throw new Error('Checkpoint contains an unknown option.');return value}
export function makeCheckpoint(room:any,ownerId:string){
  const own=room.players.find((p:any)=>p.id===ownerId)
  return {format:'kyrevant-campaign',version:1,savedAt:new Date().toISOString(),level:room.level,phase:room.phase,
    players:[own,...room.players.filter((p:any)=>p!==own)].filter(Boolean).map((p:any)=>({name:p.name,characterClass:p.characterClass,species:p.species??'Human',x:p.x,y:p.y,facingX:p.facingX,facingY:p.facingY,health:p.health,shield:p.shield,xp:p.xp??0,rank:p.rank??1,weaponTier:p.weaponTier??1,talent:p.talent})),
    enemies:room.enemies.map((e:any)=>({id:e.id,type:e.type,x:e.x,y:e.y,health:e.health,maxHealth:e.maxHealth,alive:e.alive})),
    buildings:room.buildings.map((b:any)=>({id:b.id,type:b.type,x:b.x,y:b.y,health:b.health,maxHealth:b.maxHealth,level:b.level??1})),
    quests:room.quests.map((q:any)=>({id:q.id,complete:q.complete})),economy:{...room.economy},questFlags:{...room.questFlags},
    minedMinerals:room.minedMinerals??0,defenseWave:room.defenseWave??0,defenseComplete:room.defenseComplete??false,bossReinforcements:room.bossReinforcements??false,
    doctrine:room.doctrine,relicChoice:room.relicChoice,citadelChoice:room.citadelChoice}
}
// Explicit whitelist: imported saves cannot supply socket identities, tokens, timers or arbitrary room fields.
export function readCheckpoint(value:any){
  if(!value||value.format!=='kyrevant-campaign'||value.version!==1||JSON.stringify(value).length>100000)throw new Error('This is not a supported Kyrevant checkpoint.')
  if(typeof value.savedAt!=='string'||!Number.isFinite(Date.parse(value.savedAt)))throw new Error('Invalid checkpoint date.')
  const level=number(value.level,1,3);if(!Number.isInteger(level))throw new Error('Invalid chapter.')
  const players=list(value.players,4).map(p=>{
    const characterClass=option(p.characterClass,characterClasses.map(c=>c.name));if(!characterClass)throw new Error('Missing class.')
    const lineage=option(p.species,species.map(s=>s.name));if(!lineage)throw new Error('Missing lineage.')
    const rank=number(p.rank,1,10),weaponTier=number(p.weaponTier,1,2);if(!Number.isInteger(rank)||!Number.isInteger(weaponTier))throw new Error('Invalid rank.')
    if(p.talent!==undefined&&(typeof p.talent!=='string'||rank<2||!chosenPath(characterClass,p.talent)))throw new Error('Invalid class path.')
    return {name:text(p.name,20),characterClass,species:lineage,x:number(p.x,30,2570),y:number(p.y,30,1570),facingX:number(p.facingX,-1,1),facingY:number(p.facingY,-1,1),health:number(p.health,0,500),shield:number(p.shield,0,500),rank,weaponTier,xp:number(p.xp,0,10000),talent:p.talent}
  });if(players.length<2)throw new Error('A campaign requires at least two saved characters.')
  const enemies=list(value.enemies,100).map(e=>({id:text(e.id),type:option(e.type,['Raider','Heavy','Commander'])!,x:number(e.x,0,2600),y:number(e.y,0,1600),health:number(e.health,0,5000),maxHealth:number(e.maxHealth,1,5000),alive:e.alive===true,lastAttack:0}))
  if(enemies.some(e=>!e.type||e.health>e.maxHealth||e.alive!==(e.health>0)))throw new Error('Invalid enemy state.')
  const buildings=list(value.buildings,80).map(b=>({id:text(b.id),type:option(b.type,['Extractor','Barracks','Turret','PowerCore'])!,x:number(b.x,150,2450),y:number(b.y,150,1450),health:number(b.health,1,2000),maxHealth:number(b.maxHealth,1,2000),level:number(b.level,1,3)}))
  if(buildings.some(b=>!b.type||b.health>b.maxHealth||!Number.isInteger(b.level)))throw new Error('Invalid structure state.')
  if(new Set(enemies.map(e=>e.id)).size!==enemies.length||new Set(buildings.map(b=>b.id)).size!==buildings.length)throw new Error('Duplicate checkpoint entities.')
  const quests=list(value.quests,30).map(q=>({id:text(q.id),complete:q.complete===true}))
  if(new Set(quests.map(q=>q.id)).size!==quests.length)throw new Error('Duplicate checkpoint objectives.')
  const defenseWave=number(value.defenseWave,0,3);if(!Number.isInteger(defenseWave))throw new Error('Invalid defense wave.')
  const questFlags={...booleanFlags(value.questFlags??{}),rescueTactic:option(value.questFlags?.rescueTactic,['assault','sabotage','relief'])}
  return {level,phase:option(value.phase,['mission','victory'])??'mission',players,enemies,buildings,quests,economy:{minerals:number(value.economy?.minerals,0,1000000),energy:number(value.economy?.energy,0,1000000)},questFlags,minedMinerals:number(value.minedMinerals,0,1000000),defenseWave,defenseComplete:value.defenseComplete===true,bossReinforcements:value.bossReinforcements===true,doctrine:option(value.doctrine,['bastion','reclaimer']),relicChoice:option(value.relicChoice,['disable','study']),citadelChoice:option(value.citadelChoice,['shutdown','restore'])}
}
