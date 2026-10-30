import { species, characterClasses, type Species } from '../src/characters.ts'
import express from 'express'
import path from 'node:path'
import { existsSync } from 'node:fs'
import cors from 'cors'
import http from 'node:http'
import { Server } from 'socket.io'
type CharacterClass =
  | 'Fighter'
  | 'Monk'
  | 'Cleric'
  | 'Wizard'
type GamePhase =
  | 'lobby'
  | 'class-selection'
  | 'mission'
  | 'victory'
type ResourceType =
  | 'minerals'
  | 'energy'
type BuildingType =
  | 'Extractor'
  | 'Barracks'
  | 'Turret'
  | 'PowerCore'
type Player = {
  id: string
  name: string
  isHost: boolean
  characterClass: CharacterClass | null
  ready: boolean
  x: number
  y: number
  facingX: number
  facingY: number
  health: number
  maxHealth: number
  shield: number
  maxShield: number
  downed: boolean
  downedAt?: number
  xp?: number
  rank?: number
  weaponTier?: number
  species?: Species
  lastDamagedAt?: number
  dialogueUntil?: number
  dialogueSite?: ChapterSite
}
type Enemy = {
  id: string
  type:
    | 'Raider'
    | 'Heavy'
    | 'Commander'
  x: number
  y: number
  health: number
  maxHealth: number
  alive: boolean
  lastAttack: number
}
type ResourceNode = {
  id: string
  type: ResourceType
  x: number
  y: number
  remaining: number
}
type Building = {
  id: string
  type: BuildingType
  x: number
  y: number
  health: number
  maxHealth: number
}
type QuestObjective = {
  id: string
  text: string
  category:
    | 'combat'
    | 'exploration'
    | 'mining'
    | 'building'
    | 'interaction'
    | 'boss'
  complete: boolean
}
type Economy = {
  minerals: number
  energy: number
}
type Room = {
  code: string
  players: Player[]
  enemies: Enemy[]
  resourceNodes: ResourceNode[]
  buildings: Building[]
  quests: QuestObjective[]
  economy: Economy
  gameStarted: boolean
  phase: GamePhase
  level: number
  wipeAt?: number
  minedMinerals?: number
  defenseWave?: number
  defenseComplete?: boolean
  lastEconomyAt?: number
  waveAdvanceAt?: number
  bossReinforcements?: boolean
  chapterDigest?: string
  uplink?: { active: boolean; progressMs: number; lastTick: number; reported: number }
  questFlags: {
    artifactRecovered: boolean
    citadelCoreActivated: boolean
    crashLogRecovered?: boolean
    innkeeperContacted?: boolean
    civiliansRescued?: boolean
    resistanceContacted?: boolean
    raidLaunched?: boolean
    watchLaunched?: boolean
    defenseAuthorized?: boolean
  }
}
const WORLD_WIDTH = 2600
const WORLD_HEIGHT = 1600
const app = express()
const httpServer =
  http.createServer(app)
const io = new Server(
  httpServer,
  {
    maxHttpBufferSize: 16384,
    connectionStateRecovery: { maxDisconnectionDuration: 45000, skipMiddlewares: true },
    cors: {
      // Restrict production clients with CLIENT_ORIGINS (comma-separated URLs).
      // During local development, allow localhost and private-network Vite clients.
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) {
          callback(null, true)
          return
        }
        const configured = (process.env.CLIENT_ORIGINS ?? process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? '')
          .split(',').map((item: string) => item.trim()).filter(Boolean)
        if (configured.includes(origin)) {
          callback(null, true)
          return
        }
        if (process.env.NODE_ENV !== 'production') {
          try {
            const url = new URL(origin)
            const host = url.hostname
            const isLocal = host === 'localhost' ||
              host === '127.0.0.1' || host.startsWith('192.168.') ||
              host.startsWith('10.') ||
              /^172\.(1[6-9]|2\d|3[01])\./.test(host)
            if (url.protocol === 'http:' && ['5173', '5174', '5175'].includes(url.port) && isLocal) {
              callback(null, true)
              return
            }
          } catch { /* Invalid Origin */ }
        }
        callback(new Error('Origin not allowed by KYREVANT'))
      },
      methods: ['GET', 'POST'],
    },
  },
)
app.use(cors())
app.use(express.json())
const rooms =
  new Map<string, Room>()
const attackCooldowns =
  new Map<string, number>()
const abilityCooldowns =
  new Map<string, number>()
function distance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  return Math.hypot(
    bx - ax,
    by - ay,
  )
}
function normalize(
  x: number,
  y: number,
) {
  const magnitude =
    Math.hypot(x, y)
  if (magnitude === 0) {
    return {
      x: 1,
      y: 0,
    }
  }
  return {
    x: x / magnitude,
    y: y / magnitude,
  }
}
function createRoomCode() {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  do {
    result = ''
    for (
      let i = 0;
      i < 5;
      i++
    ) {
      result +=
        alphabet.charAt(
          Math.floor(
            Math.random() *
              alphabet.length,
          ),
        )
    }
  } while (
    rooms.has(result)
  )
  return result
}
function createEnemy(
  id: string,
  type: Enemy['type'],
  x: number,
  y: number,
  health: number,
): Enemy {
  return {
    id,
    type,
    x,
    y,
    health,
    maxHealth: health,
    alive: true,
    lastAttack: 0,
  }
}
function assignSpawnPoints(
  players: Player[],
) {
  const spawnPoints = [
    {
      x: 280,
      y: 1240,
    },
    {
      x: 240,
      y: 1090,
    },
    {
      x: 410,
      y: 1100,
    },
    {
      x: 180,
      y: 1380,
    },
  ]
  players.forEach(
    (player, index) => {
      const spawn =
        spawnPoints[index] ??
        spawnPoints[0]
      player.x = spawn.x
      player.y = spawn.y
      player.facingX = 1
      player.facingY = 0
      const lineage = species.find(option => option.name === player.species) ?? species[0]
      player.maxHealth = lineage.health + ((player.rank ?? 1)-1)*12
      player.maxShield = lineage.shield + ((player.rank ?? 1)-1)*8
      player.health = player.maxHealth
      player.shield = player.maxShield
      player.downed = false
      player.downedAt = undefined
      player.dialogueUntil = 0
      player.dialogueSite = undefined
    },
  )
}
function levelOne() {
  return {
    enemies: [
      createEnemy(
        'l1-raider-1',
        'Raider',
        720,
        1110,
        80,
      ),
      createEnemy(
        'l1-raider-2',
        'Raider',
        880,
        1020,
        80,
      ),
      createEnemy(
        'l1-raider-3',
        'Raider',
        1120,
        900,
        90,
      ),
      createEnemy(
        'l1-heavy',
        'Heavy',
        1660,
        650,
        180,
      ),
      createEnemy(
        'l1-commander',
        'Commander',
        2130,
        420,
        300,
      ),
    ],
    resourceNodes: [
      {
        id: 'l1-minerals-1',
        type:
          'minerals' as const,
        x: 650,
        y: 1250,
        remaining: 400,
      },
      {
        id: 'l1-energy-1',
        type:
          'energy' as const,
        x: 920,
        y: 1170,
        remaining: 260,
      },
    ],
    quests: [
      {
        id: 'recover-flight-log',
        text: 'AFTER THE FALL: Explore beyond the wreck. Read the note left on a rock (E).',
        category: 'interaction' as const,
        complete: false,
      },
      {
        id: 'secure-landing-zone',
        text:
          'Clear the hostile patrol near the crash site.',
        category:
          'combat' as const,
        complete: false,
      },
      {
        id: 'meet-innkeeper',
        text: 'A LIGHT IN THE DARK: Follow the note to the Last Light Refuge and speak to Elias (E).',
        category: 'interaction' as const,
        complete: false,
      },
      {
        id: 'rescue-civilians',
        text: 'THE MISSING: Eliminate the occupation guards and free captives from the detention compound (E).',
        category: 'interaction' as const,
        complete: false,
      },
      {
        id: 'meet-resistance',
        text: 'THE RESISTANCE: Meet Captain Vale at Resistance Headquarters (E).',
        category: 'interaction' as const,
        complete: false,
      },
      {
        id: 'defend-settlement',
        text: 'HOLD THE LINE: Defeat the reinforcement assault on the settlement.',
        category: 'combat' as const,
        complete: false,
      },
      {
        id: 'gather-minerals',
        text:
          'Mine at least 80 minerals.',
        category:
          'mining' as const,
        complete: false,
      },
      {
        id: 'build-extractor',
        text:
          'Establish an Extractor.',
        category:
          'building' as const,
        complete: false,
      },
      {
        id: 'build-defense',
        text:
          'Construct a defensive Turret.',
        category:
          'building' as const,
        complete: false,
      },
      {
        id: 'activate-defense',
        text: 'CALL TO ARMS: With a turret and extractor built, activate the defense radio (E).',
        category: 'interaction' as const,
        complete: false,
      },
      {
        id: 'defeat-commander',
        text:
          'Defeat the occupation commander.',
        category:
          'boss' as const,
        complete: false,
      },
    ],
  }
}
function levelTwo() {
  return {
    enemies: [
      createEnemy(
        'l2-r1',
        'Raider',
        580,
        970,
        100,
      ),
      createEnemy(
        'l2-r2',
        'Raider',
        820,
        800,
        100,
      ),
      createEnemy(
        'l2-heavy-1',
        'Heavy',
        1230,
        850,
        200,
      ),
      createEnemy(
        'l2-r3',
        'Raider',
        1500,
        670,
        110,
      ),
      createEnemy(
        'l2-heavy-2',
        'Heavy',
        1820,
        560,
        220,
      ),
      createEnemy(
        'l2-commander',
        'Commander',
        2240,
        360,
        360,
      ),
      createEnemy('l2-patrol-4', 'Raider', 970, 930, 110),
      createEnemy('l2-patrol-5', 'Raider', 1090, 860, 110),
      createEnemy('l2-patrol-heavy', 'Heavy', 1390, 680, 220),
      createEnemy('l2-bastion-1', 'Raider', 1730, 480, 120),
      createEnemy('l2-bastion-2', 'Raider', 1850, 520, 120),
      createEnemy('l2-bastion-heavy', 'Heavy', 2040, 450, 250),
      createEnemy('l2-scout-1', 'Raider', 500, 630, 100),
      createEnemy('l2-scout-2', 'Raider', 680, 510, 100),
    ],
    resourceNodes: [
      {
        id: 'l2-minerals-1',
        type:
          'minerals' as const,
        x: 640,
        y: 1180,
        remaining: 500,
      },
      {
        id: 'l2-energy-1',
        type:
          'energy' as const,
        x: 1320,
        y: 1020,
        remaining: 350,
      },
    ],
    quests: [
      {
        id: 'expand-base',
        text:
          'Construct a Barracks.',
        category:
          'building' as const,
        complete: false,
      },
      {
        id: 'establish-power',
        text:
          'Construct a Power Core.',
        category:
          'building' as const,
        complete: false,
      },
      {
        id: 'recover-artifact',
        text:
          'Enter the ruin and recover the ancient artifact.',
        category:
          'exploration' as const,
        complete: false,
      },
      {
        id: 'defeat-frontier-command',
        text:
          'Destroy the enemy frontier commander.',
        category:
          'boss' as const,
        complete: false,
      },
    ],
  }
}
function levelThree() {
  return {
    enemies: [
      createEnemy(
        'l3-r1',
        'Raider',
        700,
        900,
        120,
      ),
      createEnemy(
        'l3-heavy-1',
        'Heavy',
        1000,
        790,
        230,
      ),
      createEnemy(
        'l3-r2',
        'Raider',
        1300,
        680,
        120,
      ),
      createEnemy(
        'l3-heavy-2',
        'Heavy',
        1580,
        570,
        240,
      ),
      createEnemy(
        'l3-r3',
        'Raider',
        1880,
        480,
        130,
      ),
      createEnemy(
        'final-commander',
        'Commander',
        2240,
        300,
        520,
      ),
      createEnemy('l3-raider-4', 'Raider', 820, 790, 130),
      createEnemy('l3-raider-5', 'Raider', 1100, 620, 130),
      createEnemy('l3-heavy-3', 'Heavy', 1260, 790, 255),
      createEnemy('l3-heavy-4', 'Heavy', 1700, 730, 255),
      createEnemy('l3-fortress-1', 'Raider', 2040, 620, 150),
      createEnemy('l3-fortress-2', 'Raider', 2110, 520, 150),
      createEnemy('l3-scout-1', 'Raider', 700, 600, 130),
      createEnemy('l3-scout-2', 'Raider', 900, 480, 130),
    ],
    resourceNodes: [
      {
        id: 'l3-minerals',
        type:
          'minerals' as const,
        x: 750,
        y: 1180,
        remaining: 450,
      },
      {
        id: 'l3-energy',
        type:
          'energy' as const,
        x: 1480,
        y: 900,
        remaining: 400,
      },
    ],
    quests: [
      {
        id: 'fortify-assault-base',
        text:
          'Construct at least three structures for the assault.',
        category:
          'building' as const,
        complete: false,
      },
      {
        id: 'activate-citadel-core',
        text:
          'Enter the Citadel and activate the ancient command core.',
        category:
          'interaction' as const,
        complete: false,
      },
      {
        id: 'final-boss',
        text:
          'Defeat the Citadel commander.',
        category:
          'boss' as const,
        complete: false,
      },
    ],
  }
}
function getLevelData(
  level: number,
) {
  if (level === 1) {
    return levelOne()
  }
  if (level === 2) {
    return levelTwo()
  }
  return levelThree()
}
function attackProfile(
  characterClass:
    | CharacterClass
    | null,
) {
  switch (characterClass) {
    case 'Fighter':
      return {
        range: 520,
        damage: 34,
        cooldown: 250,
        cone: 0.92,
      }
    case 'Monk':
      return {
        range: 400,
        damage: 31,
        cooldown: 200,
        cone: 0.7,
      }
    case 'Cleric':
      return {
        range: 470,
        damage: 27,
        cooldown: 360,
        cone: 0.9,
      }
    case 'Wizard':
      return {
        range: 580,
        damage: 48,
        cooldown: 600,
        cone: 0.88,
      }
    default:
      return {
        range: 300,
        damage: 20,
        cooldown: 400,
        cone: 0.9,
      }
  }
}
function buildingCost(
  type: BuildingType,
) {
  switch (type) {
    case 'Extractor':
      return {
        minerals: 60,
        energy: 0,
      }
    case 'Barracks':
      return {
        minerals: 120,
        energy: 20,
      }
    case 'Turret':
      return {
        minerals: 90,
        energy: 20,
      }
    case 'PowerCore':
      return {
        minerals: 80,
        energy: 60,
      }
  }
}
// Guard level changes so the 300ms simulation loop cannot schedule duplicates.
const chapterTransitions = new Set<string>()
function updateQuestState(
  room: Room,
) {
  const livingEnemies =
    room.enemies.filter(
      (enemy) =>
        enemy.alive,
    )
  room.quests.forEach(
    (quest) => {
      if (
        quest.id ===
        'secure-landing-zone'
      ) {
        const patrolAlive =
          livingEnemies.some(
            (enemy) =>
              enemy.id ===
                'l1-raider-1' ||
              enemy.id ===
                'l1-raider-2',
          )
        quest.complete =
          !patrolAlive
      }
      if (quest.id === 'recover-flight-log') {
        quest.complete = Boolean(room.questFlags.crashLogRecovered)
      }
      if (quest.id === 'meet-innkeeper') {
        quest.complete = Boolean(room.questFlags.innkeeperContacted)
      }
      if (quest.id === 'rescue-civilians') {
        quest.complete = Boolean(room.questFlags.civiliansRescued)
      }
      if (quest.id === 'meet-resistance') {
        quest.complete = Boolean(room.questFlags.resistanceContacted)
      }
      if (quest.id === 'activate-defense') {
        quest.complete = Boolean(room.questFlags.raidLaunched)
      }
      if (quest.id === 'defend-settlement') {
        quest.complete = Boolean(room.defenseComplete)
      }
      if (
        quest.id ===
        'gather-minerals'
      ) {
        // Stay completed after minerals have been spent on buildings.
        quest.complete = quest.complete || (room.minedMinerals ?? 0) >= 80
      }
      if (
        quest.id ===
        'build-extractor'
      ) {
        quest.complete =
          room.buildings.some(
            (building) =>
              building.type ===
              'Extractor',
          )
      }
      if (
        quest.id ===
        'build-defense'
      ) {
        quest.complete =
          room.buildings.some(
            (building) =>
              building.type ===
              'Turret',
          )
      }
      if (
        quest.id ===
        'defeat-commander'
      ) {
        quest.complete =
          !room.enemies.some(
            (enemy) =>
              enemy.type ===
                'Commander' &&
              enemy.alive,
          )
      }
      if (
        quest.id ===
        'expand-base'
      ) {
        quest.complete =
          room.buildings.some(
            (building) =>
              building.type ===
              'Barracks',
          )
      }
      if (
        quest.id ===
        'establish-power'
      ) {
        quest.complete =
          room.buildings.some(
            (building) =>
              building.type ===
              'PowerCore',
          )
      }
      if (
        quest.id ===
        'recover-artifact'
      ) {
        quest.complete =
          room.questFlags
            .artifactRecovered
      }
      if (
        quest.id ===
        'defeat-frontier-command'
      ) {
        quest.complete =
          !room.enemies.some(
            (enemy) =>
              enemy.id ===
                'l2-commander' &&
              enemy.alive,
          )
      }
      if (
        quest.id ===
        'fortify-assault-base'
      ) {
        quest.complete =
          room.buildings.length >=
          3
      }
      if (
        quest.id ===
        'activate-citadel-core'
      ) {
        quest.complete =
          room.questFlags
            .citadelCoreActivated
      }
      if (
        quest.id ===
        'final-boss'
      ) {
        quest.complete =
          !room.enemies.some(
            (enemy) =>
              enemy.id ===
                'final-commander' &&
              enemy.alive,
          )
      }
    },
  )
  io.to(room.code).emit(
    'quest-state',
    room.quests,
  )
  emitChapterSummary(room)
  const levelComplete =
    room.quests.length > 0 &&
    room.quests.every(
      (quest) =>
        quest.complete,
    )
  if (!levelComplete || chapterTransitions.has(room.code)) {
    return
  }
  chapterTransitions.add(room.code)
  if (room.level < 3) {
    const completedLevel =
      room.level
    io.to(room.code).emit(
      'level-complete',
      completedLevel,
    )
    setTimeout(() => {
      const activeRoom =
        rooms.get(room.code)
      if (
        !activeRoom ||
        activeRoom.level !==
          completedLevel
      ) {
        return
      }
      chapterTransitions.delete(room.code)
      startLevel(
        activeRoom,
        completedLevel + 1,
      )
    }, 2500)
    return
  }
  room.phase = 'victory'
  io.to(room.code).emit(
    'game-won',
  )
}
function startLevel(
  room: Room,
  level: number,
) {
  const data =
    getLevelData(level)
  room.level = level
  room.phase = 'mission'
  room.minedMinerals = 0
  room.defenseWave = 0
  room.defenseComplete = false
  room.waveAdvanceAt = undefined
  room.bossReinforcements = false
  room.chapterDigest = undefined
  room.uplink = undefined
  room.enemies =
    data.enemies
  room.resourceNodes =
    data.resourceNodes
  room.quests =
    data.quests
  if (level === 1) {
    const sequence = [
      'recover-flight-log', 'secure-landing-zone', 'meet-innkeeper',
      'rescue-civilians', 'meet-resistance', 'gather-minerals',
      'build-extractor', 'build-defense', 'activate-defense',
      'defend-settlement', 'defeat-commander',
    ]
    room.quests.sort((a, b) => sequence.indexOf(a.id) - sequence.indexOf(b.id))
  }
  room.buildings = []
  room.questFlags = {
    artifactRecovered: false,
        citadelCoreActivated: false,
    crashLogRecovered: false,
    innkeeperContacted: false,
    civiliansRescued: false,
    resistanceContacted: false,
    raidLaunched: false,
    watchLaunched: false,
    defenseAuthorized: false,
  }
  assignSpawnPoints(
    room.players,
  )
  if (level === 1) {
    /*
      App.tsx uses this event
      to leave class selection.
    */
    io.to(room.code).emit(
      'mission-started',
      room,
    )
  }
  io.to(room.code).emit(
    'level-started',
    room,
  )
  io.to(room.code).emit(
    'player-state',
    room.players,
  )
  io.to(room.code).emit(
    'enemy-state',
    room.enemies,
  )
  io.to(room.code).emit(
    'resource-state',
    {
      economy:
        room.economy,
      nodes:
        room.resourceNodes,
    },
  )
  io.to(room.code).emit(
    'building-state',
    room.buildings,
  )
  io.to(room.code).emit(
    'quest-state',
    room.quests,
  )
}
// CONTEST CHAPTER: THE FALL — server-authoritative narrative and encounter state.
// Same world coordinates as GameCanvas, scale 0.02. The server validates both
// distance and story conditions; client button clicks cannot award rewards alone.
const chapterOneSites = {
  flightLog: { x: 500, y: 1100, radius: 155 },
  innkeeper: { x: 1150, y: 600, radius: 165 },
  missing: { x: 2200, y: 950, radius: 165 },
  resistance: { x: 1700, y: 550, radius: 165 },
  radio: { x: 1500, y: 690, radius: 150 },
} as const
type ChapterSite = keyof typeof chapterOneSites
type DialogueOption = { id: string; label: string }
function notifyPlayer(player: Player, site: ChapterSite, speaker: string,
                      title: string, lines: string[], choices: DialogueOption[]) {
  if (['flightLog','innkeeper','resistance'].includes(site)) {
    player.dialogueSite = site
    player.dialogueUntil = Date.now() + 60000
  }
  io.to(player.id).emit('kyrevant-dialogue', { site, speaker, title, lines, choices })
}
function awardXp(player: Player, amount: number) {
  player.xp = (player.xp ?? 0) + amount
  player.rank ??= 1
  while (player.rank < 10 && player.xp >= player.rank * 100) {
    player.xp -= player.rank * 100
    player.rank += 1
    player.maxHealth += 12
    player.maxShield += 8
    player.health = player.maxHealth
    player.shield = player.maxShield
    io.to(player.id).emit('kyrevant-progression',
      `LEVEL ${player.rank} REACHED · Health and shields increased`)
  }
}
function rewardSquad(room: Room, xp: number) {
  room.players.forEach(player => awardXp(player, xp))
  io.to(room.code).emit('player-state', room.players)
}
function grantResources(room: Room, minerals: number, energy: number) {
  room.economy.minerals += minerals
  room.economy.energy += energy
  io.to(room.code).emit('resource-state', {
    economy: room.economy, nodes: room.resourceNodes,
  })
}
function spawnOutpostWatch(room: Room) {
  if (room.questFlags.watchLaunched) return
  room.questFlags.watchLaunched = true
  // Enemies remain at their posts, far from the protected crash-spawn area.
  room.enemies.push(
    createEnemy('l1-outpost-1', 'Raider', 2100, 1090, 95),
    createEnemy('l1-outpost-2', 'Raider', 2260, 1090, 95),
    createEnemy('l1-outpost-heavy', 'Heavy', 2350, 850, 165),
    createEnemy('l1-watch-1', 'Raider', 1650, 950, 90),
    createEnemy('l1-watch-2', 'Raider', 1850, 890, 90),
  )
  io.to(room.code).emit('enemy-state', room.enemies)
  io.to(room.code).emit('story-event',
    'OCCUPATION ALERT · Armed guards occupy the eastern detention compound.')
}
const defenseSpawns = [
  [
    ['Raider', 1920, 1030, 95], ['Raider', 2030, 1010, 95],
    ['Raider', 1940, 1180, 100], ['Heavy', 2180, 1000, 180],
  ],
  [
    ['Raider', 1930, 1100, 110], ['Raider', 2010, 1130, 110],
    ['Heavy', 2240, 1050, 210], ['Raider', 1880, 1080, 110],
  ],
  [
    ['Heavy', 2110, 1070, 220], ['Raider', 1940, 1140, 120],
    ['Raider', 2240, 1100, 120], ['Heavy', 2300, 980, 220],
  ],
] as const
function spawnDefenseWave(room: Room, wave: number) {
  if (room.level !== 1 || wave < 1 || wave > defenseSpawns.length) return
  room.defenseWave = wave
  room.waveAdvanceAt = undefined
  const fresh = defenseSpawns[wave - 1].map(([type,x,y,hp], index) =>
    createEnemy(`l1-defense-${wave}-${index}`, type, x, y, hp))
  room.enemies.push(...fresh)
  io.to(room.code).emit('enemy-state', room.enemies)
  io.to(room.code).emit('kyrevant-defense-state', {
    wave, total: 3, remaining: fresh.length, status: 'active',
  })
  io.to(room.code).emit('story-event',
    `DEFENSE WAVE ${wave}/3 · Hostiles are approaching the settlement!`)
}
function findStorySite(player: Player): ChapterSite | null {
  const sites = Object.keys(chapterOneSites) as ChapterSite[]
  const available = sites.filter(site => {
    const point = chapterOneSites[site]
    return distance(player.x, player.y, point.x, point.y) <= point.radius
  })
  available.sort((a,b) => {
    const pa=chapterOneSites[a], pb=chapterOneSites[b]
    return distance(player.x,player.y,pa.x,pa.y) -
           distance(player.x,player.y,pb.x,pb.y)
  })
  return available[0] ?? null
}
function chapterDialogue(room: Room, player: Player, site: ChapterSite) {
  const f = room.questFlags
  const display = (speaker:string, title:string, lines:string[], choices:DialogueOption[]) =>
    notifyPlayer(player, site, speaker, title, lines, choices)
  const leave = {id:'leave', label:'Step away'}
  if (site === 'flightLog') {
    if (!f.crashLogRecovered) {
      display('A WEATHERED NOTE', 'TO ANYONE STILL OUT THERE', [
        'If anyone sees this, please come to the Last Light Refuge, beyond the ridge. The door with the amber lamp is still open.',
        'They took our people. I could not stop them. If you can help, ask for Elias. Please hurry.',
        'Your unit survived an asteroid strike and a crash on an unknown world. Someone here needs survivors as much as you need shelter.',
      ], [{id:'download',label:'Keep the note — find Elias'},leave])
    } else display('NOTE FROM ELIAS','THE LAST LIGHT REFUGE',[
      'Beyond the ridge. Look for the amber lamp. Ask for Elias.',
    ],[leave])
  } else if (site === 'innkeeper') {
    if (!f.crashLogRecovered) {
      display('ELIAS · REFUGE KEEPER','THE LAST LIGHT REFUGE',[
        'I saw your ship fall after the asteroid struck. There is a note on the rock beside the wreck. I left it hoping someone would come.',
      ],[leave])
    } else if (!f.innkeeperContacted) {
      display('ELIAS · REFUGE KEEPER','THE MISSING COLONISTS',[
        'I am Elias. This used to be a refuge for everyone on Kyrevant. Then the Ashfall militia turned on the people they were sent to protect.',
        'They dragged our families to the eastern detention compound. My brother Jonah is among them. Will your unit help bring them home?',
      ],[{id:'ask_missing',label:'We will help. Where are they holding your people?'},{id:'ask_history',label:'Who controls this planet?'},leave])
    } else display('ELIAS · REFUGE KEEPER','THE LAST LIGHT REFUGE',[
      'The captives are east of here inside the guarded detention compound. Their guards control the approach.',
    ],[leave])
  } else if (site === 'missing') {
    if (!f.innkeeperContacted) {
      display('SURVIVOR · PRISONER','LOCKED DETENTION AREA',[
        'The captives are afraid to leave. Someone at the settlement may know how to help.',
      ],[leave])
    } else if (!f.civiliansRescued) {
      const guards = room.enemies.filter(enemy => enemy.alive &&
        ['l1-outpost-1','l1-outpost-2'].includes(enemy.id))
      if (guards.length) display('JONAH · CAPTIVE','GUARDS AT THE GATE',[
        `The guards are still outside. Take down ${guards.length} remaining guard${guards.length === 1 ? '' : 's'} before opening the shelter.`,
      ],[leave])
      else display('JONAH · CAPTIVE','THE MISSING',[
        'You got through! There are others in the transport crates. We can run if you release the locks.',
        'We hid equipment and supplies for the resistance. Take them, and find their leader at Shelter Bravo.',
      ],[{id:'free',label:'Free the colonists and recover supplies'},leave])
    } else display('JONAH · SURVIVOR','CIVILIANS EVACUATED',[
      'The prisoners escaped. Their salvaged supplies are now part of your squad inventory.',
    ],[leave])
  } else if (site === 'resistance') {
    if (!f.civiliansRescued) {
      display('CAPTAIN VALE','NO TRUST WITHOUT ACTION',[
        'Free our people from the occupied shelter. Then we can discuss fighting back.',
      ],[leave])
    } else if (!f.resistanceContacted) {
      display('CAPTAIN VALE','JOIN THE RESISTANCE',[
        'The occupation army is building toward the Citadel. They will march on this town at dusk.',
        'Mining stations are still operational. Gather minerals, build an extractor and a turret, then signal us from the defense radio.',
      ],[{id:'alliance',label:'Join the resistance and prepare defenses'},{id:'ask_history',label:'What is the Citadel?'},leave])
    } else display('CAPTAIN VALE','HOLD THE SETTLEMENT',[
      f.raidLaunched ? 'Hold all three attacks. If we survive, the occupation commander must fall.' :
        'Get the extractor and turret operational. Use the radio west of this shelter to begin the defense.',
    ],[leave])
  } else if (site === 'radio') {
    if (!f.resistanceContacted) {
      display('DEFENSE RADIO','SECURED CHANNEL REQUIRED',[
        'The resistance leader must authorize this transmitter.',
      ],[leave])
    } else if (room.defenseComplete) {
      display('DEFENSE RADIO','SETTLEMENT SECURED',[
        'All three assault waves defeated. Intelligence points toward the occupation commander in the northeast.',
      ],[leave])
    } else if (f.raidLaunched) {
      display('DEFENSE RADIO',`WAVE ${room.defenseWave ?? 1}/3`,[
        'Defend the buildings and clear the attackers. Barracks and turrets can help the squad.',
      ],[leave])
    } else {
      const missing = room.quests.filter(q =>
        ['gather-minerals','build-extractor','build-defense'].includes(q.id) && !q.complete)
      display('DEFENSE RADIO','PREPARE THE LINE',[
        missing.length ? `Not ready. Complete: ${missing.map(q => q.text).join(' · ')}` :
          'All defenses are online. The resistance is in position. This will trigger three enemy assault waves.',
      ], missing.length ? [leave] : [{id:'begin_defense',label:'Transmit signal — begin the defense'},leave])
    }
  }
}
function handleChapterOneInteraction(room: Room, player: Player): boolean {
  if (room.level !== 1 || room.phase !== 'mission') return false
  const site = findStorySite(player)
  if (!site) return false
  chapterDialogue(room, player, site)
  return true
}
function handleChapterChoice(room: Room, player: Player,
                             input:{site: ChapterSite; choice: string}) {
  if (room.level !== 1 || room.phase !== 'mission' || player.downed) return
  const here = findStorySite(player)
  if (!here || input.site !== here) return
  const f = room.questFlags
  if (input.choice === 'leave') { player.dialogueUntil = 0; return }
  if (input.choice === 'ask_history' && (here === 'innkeeper' || here === 'resistance')) {
    notifyPlayer(player,here,'FRONTIER RECORDS','A PLANET UNDER OCCUPATION',[
      'The planet was settled quietly until an unauthorized military faction seized its technology and communications.',
      'The resistance leader believes the occupation needs an ancient control system beneath the Citadel.',
    ],[{id:'leave',label:'Continue'}])
    return
  }
  let accepted = false
  let reply = ''
  if (here === 'flightLog' && input.choice === 'download' && !f.crashLogRecovered) {
    f.crashLogRecovered = true
    rewardSquad(room, 35)
    reply = 'NOTE RECOVERED · Find Elias at the Last Light Refuge, beyond the ridge. Look for the amber lamp.'
    accepted = true
  }
  if (here === 'innkeeper' && input.choice === 'ask_missing' &&
      f.crashLogRecovered && !f.innkeeperContacted) {
    f.innkeeperContacted = true
    rewardSquad(room, 40)
    spawnOutpostWatch(room)
    reply = 'NEW INTEL · Two armed guards hold captives at Shelter Charlie. Eliminate them and release the prisoners.'
    accepted = true
  }
  if (here === 'missing' && input.choice === 'free' &&
      f.innkeeperContacted && !f.civiliansRescued &&
      !room.enemies.some(e => e.alive && ['l1-outpost-1','l1-outpost-2'].includes(e.id))) {
    f.civiliansRescued = true
    grantResources(room, 50, 40)
    rewardSquad(room, 80)
    reply = 'SURVIVORS SAVED · +50 minerals, +40 energy, +80 XP. Captain Vale is waiting at Shelter Bravo.'
    accepted = true
  }
  if (here === 'resistance' && input.choice === 'alliance' &&
      f.civiliansRescued && !f.resistanceContacted) {
    f.resistanceContacted = true
    rewardSquad(room, 50)
    grantResources(room, 40, 20)
    reply = 'RESISTANCE ALLIANCE · +40 minerals, +20 energy. Mine 80 minerals; build an Extractor and Turret.'
    accepted = true
  }
  if (here === 'radio' && input.choice === 'begin_defense' &&
      f.resistanceContacted && !f.raidLaunched &&
      ['gather-minerals','build-extractor','build-defense'].every(id =>
        room.quests.some(q => q.id === id && q.complete))) {
    f.raidLaunched = true
    f.defenseAuthorized = true
    spawnDefenseWave(room, 1)
    reply = 'SIGNAL SENT · First wave incoming! Protect the settlement.'
    accepted = true
  }
  if (!accepted) {
    chapterDialogue(room, player, here)
    return
  }
  io.to(room.code).emit('story-event', reply)
  updateQuestState(room)
  notifyPlayer(player, here, 'MISSION UPDATED',
    here === 'flightLog' && room.uplink?.active ? 'CO-OP UPLINK IN PROGRESS' : 'OBJECTIVE COMPLETE',
    [reply],[{id:'leave',label:'Continue'}])
}
function chapterSummary(room: Room) {
  if (room.level !== 1) {
    const complete = room.quests.filter(q => q.complete).length
    return {stage:Math.min(complete+1,room.quests.length),totalStages:room.quests.length,
      title:room.level===2?'INTO THE FRONTIER':'THE CITADEL',wave:0,waveTotal:0,
      weapon:'K-7 RESISTANCE CARBINE',description:room.quests.find(q=>!q.complete)?.text ?? 'Operation complete.'}
  }
  const flags=room.questFlags
  const done=(id:string)=>Boolean(room.quests.find(q=>q.id===id)?.complete)
  const stage = !flags.crashLogRecovered ? 1
    : !done('secure-landing-zone') ? 2
    : !flags.innkeeperContacted ? 3
    : !flags.civiliansRescued ? 4
    : !flags.resistanceContacted ? 5
    : !done('gather-minerals') ? 6
    : !done('build-extractor') || !done('build-defense') ? 7
    : !flags.raidLaunched ? 8
    : !room.defenseComplete ? 9 : 10
  const stages = [
    'READ THE WEATHERED NOTE','SECURE THE LANDING ZONE','FIND ELIAS',
    'FREE THE MISSING COLONISTS','FIND CAPTAIN VALE',
    'MINE FOR THE RESISTANCE','BUILD YOUR DEFENSES',
    'SIGNAL THE RESISTANCE','DEFEND THE SETTLEMENT','CONFRONT THE COMMANDER',
  ]
  return {stage,totalStages:10,title:stages[stage-1],
    wave:room.defenseWave??0, waveTotal:3,
    weapon:room.players[0]?.weaponTier === 2 ? 'RESISTANCE PULSE CARBINE' : 'SALVAGE CARBINE',
    description:room.quests.find(q=>!q.complete)?.text ?? 'Campaign objectives completed.'}
}
function emitChapterSummary(room: Room) {
  const summary = chapterSummary(room)
  if (!summary) return
  const digest=JSON.stringify(summary)
  if (room.chapterDigest === digest) return
  room.chapterDigest=digest
  io.to(room.code).emit('kyrevant-chapter-state',summary)
}
function dialogueProtected(player: Player) {
  if (!player.dialogueSite || Date.now() >= (player.dialogueUntil ?? 0)) return false
  const shelter = chapterOneSites[player.dialogueSite]
  return distance(player.x,player.y,shelter.x,shelter.y) <= shelter.radius
}
function damagePlayer(
  player: Player,
  amount: number,
) {
  if (dialogueProtected(player)) return
  player.lastDamagedAt = Date.now()
  let remaining =
    amount
  if (player.shield > 0) {
    const absorbed =
      Math.min(
        player.shield,
        remaining,
      )
    player.shield -=
      absorbed
    remaining -=
      absorbed
  }
  if (remaining > 0) {
    player.health =
      Math.max(
        0,
        player.health -
          remaining,
      )
  }
  if (
    player.health <= 0
  ) {
    player.downed =
      true
    player.downedAt = Date.now()
  }
}
const departures = new Map<string, ReturnType<typeof setTimeout>>()
io.on(
  'connection',
  (socket: any) => {
    socket.use((packet: unknown[], next: (error?: Error) => void) => {
      const [event, data, callback] = packet as [string, any, any]
      const requiresCode = ['start-game','set-ready','interact','use-ability','restart-campaign'].includes(event)
      const requiresData = ['join-room','select-class','move-player','attack','mine-resource','build-structure'].includes(event)
      const invalid = (event === 'create-room' && typeof data !== 'string') ||
        (requiresCode && typeof data !== 'string') ||
        (requiresData && (!data || typeof data !== 'object' || typeof data.roomCode !== 'string')) ||
        (['create-room','join-room','start-game','set-ready'].includes(event) && typeof callback !== 'function')
      if (invalid) { if (typeof callback === 'function') callback({success:false,message:'Invalid request.'}); return }
      next()
    })
    const pendingDeparture = departures.get(socket.id)
    if (pendingDeparture) { clearTimeout(pendingDeparture); departures.delete(socket.id) }
    socket.on('request-room-state', () => {
      const room = [...rooms.values()].find(candidate => candidate.players.some(player => player.id === socket.id))
      socket.emit('session-state', room ?? null)
      if (room) emitChapterSummary(room)
    })
    socket.on('restart-campaign', (code: string) => {
      const room = rooms.get(code)
      if (room?.phase !== 'victory' || !room.players.some(p => p.id === socket.id && p.isHost)) return
      chapterTransitions.delete(code)
      room.players.forEach(p => { p.xp = 0; p.rank = 1; p.weaponTier = 1 })
      startLevel(room, 1)
    })
    socket.on(
      'create-room',
      (
        playerName: string,
        callback: (response: {
          success: boolean
          message?: string
          roomCode?: string
          room?: Room
        }) => void,
      ) => {
        const name =
          typeof playerName === 'string' ? playerName.trim().slice(0,20) : ''
        if (!name) {
          callback({
            success: false,
            message:
              'Player name is required.',
          })
          return
        }
        const code =
          createRoomCode()
        const player: Player = {
          id: socket.id,
          name,
          isHost: true,
          characterClass: null,
          ready: false,
          x: 0,
          y: 0,
          facingX: 1,
          facingY: 0,
          health: 100,
          maxHealth: 100,
          shield: 100,
          maxShield: 100,
          downed: false,
          xp: 0, rank: 1, weaponTier: 1,
        }
        const room: Room = {
          code,
          players: [
            player,
          ],
          enemies: [],
          resourceNodes: [],
          buildings: [],
          quests: [],
          economy: {
            minerals: 0,
            energy: 0,
          },
          gameStarted: false,
          phase: 'lobby',
          level: 1,
          questFlags: {
            artifactRecovered:
              false,
                          citadelCoreActivated:
                false,
              crashLogRecovered: false,
              innkeeperContacted: false,
              civiliansRescued: false,
              resistanceContacted: false,
              raidLaunched: false,
    watchLaunched: false,
            },
        }
        rooms.set(
          code,
          room,
        )
        socket.join(code)
        callback({
          success: true,
          roomCode: code,
          room,
        })
      },
    )
    socket.on(
      'join-room',
      (
        data: {
          playerName: string
          roomCode: string
        },
        callback: (response: {
          success: boolean
          message?: string
          room?: Room
        }) => void,
      ) => {
        if (!data || typeof data.roomCode !== 'string' || typeof data.playerName !== 'string') { callback?.({ success:false, message:'Enter a player name and room code.' }); return }
        const code =
          data.roomCode
            .trim()
            .toUpperCase()
        const room =
          rooms.get(code)
        const name =
          data.playerName.trim().slice(0,20)
        if (!room || !name) {
          callback({
            success: false,
            message:
              'Room not found.',
          })
          return
        }
        if (
          room.gameStarted
        ) {
          callback({
            success: false,
            message:
              'Game has already started.',
          })
          return
        }
        if (
          room.players.length >=
          4
        ) {
          callback({
            success: false,
            message:
              'Party is full.',
          })
          return
        }
        room.players.push({
          id: socket.id,
          name,
          isHost: false,
          characterClass: null,
          ready: false,
          x: 0,
          y: 0,
          facingX: 1,
          facingY: 0,
          health: 100,
          maxHealth: 100,
          shield: 100,
          maxShield: 100,
          downed: false,
          xp: 0, rank: 1, weaponTier: 1,
        })
        socket.join(code)
        io.to(code).emit(
          'room-updated',
          room,
        )
        callback({
          success: true,
          room,
        })
      },
    )
    socket.on(
      'start-game',
      (
        roomCode: string,
        callback: (response: {
          success: boolean
          message?: string
          room?: Room
        }) => void,
      ) => {
        const room =
          rooms.get(roomCode)
        const player =
          room?.players.find(
            (candidate) =>
              candidate.id ===
              socket.id,
          )
        if (
          !room ||
          !player?.isHost
        ) {
          callback({
            success: false,
          })
          return
        }
        if (
          room.players.length <
          2
        ) {
          callback({
            success: false,
            message:
              'At least two players are required.',
          })
          return
        }
        room.gameStarted =
          true
        room.phase =
          'class-selection'
        io.to(room.code).emit(
          'game-started',
          room,
        )
        callback({
          success: true,
        })
      },
    )
    socket.on(
      'select-class',
      (data: {
        roomCode: string
        characterClass:
          CharacterClass
        species?: Species
      }) => {
        const room =
          rooms.get(
            data?.roomCode,
          )
        const player =
          room?.players.find(
            (candidate) =>
              candidate.id ===
              socket.id,
          )
        if (
          !room ||
          !player ||
          player.ready
        ) {
          return
        }
        if (room.phase !== 'class-selection' || !characterClasses.some(option => option.name === data.characterClass)) return
        if (data.species !== undefined && !species.some(option => option.name === data.species)) return
        player.species = data.species ?? player.species ?? 'Human'
        player.characterClass =
          data.characterClass
        io.to(room.code).emit(
          'room-updated',
          room,
        )
      },
    )
    socket.on(
      'set-ready',
      (
        roomCode: string,
        callback: (response: {
          success: boolean
        }) => void,
      ) => {
        const room =
          rooms.get(roomCode)
        const player =
          room?.players.find(
            (candidate) =>
              candidate.id ===
              socket.id,
          )
        if (
          !room ||
          !player ||
          !player.characterClass
        ) {
          callback({
            success: false,
          })
          return
        }
        player.ready = true
        io.to(room.code).emit(
          'room-updated',
          room,
        )
        const everyoneReady =
          room.players.length >=
            2 &&
          room.players.every(
            (candidate) =>
              candidate.ready,
          )
        if (everyoneReady) {
          startLevel(
            room,
            1,
          )
        }
        callback({
          success: true,
        })
      },
    )
    socket.on(
      'move-player',
      (data: {
        roomCode: string
        dx: number
        dy: number
      }) => {
        if (!data || !Number.isFinite(data.dx) || !Number.isFinite(data.dy)) return
        const room =
          rooms.get(
            data?.roomCode,
          )
        const player =
          room?.players.find(
            (candidate) =>
              candidate.id ===
              socket.id,
          )
        if (
          !room ||
          !player ||
          player.downed ||
          room.phase !==
            'mission'
        ) {
          return
        }
        let dx =
          Math.max(
            -1,
            Math.min(
              1,
              data.dx,
            ),
          )
        let dy =
          Math.max(
            -1,
            Math.min(
              1,
              data.dy,
            ),
          )
        if (
          dx !== 0 &&
          dy !== 0
        ) {
          dx *= Math.SQRT1_2
          dy *= Math.SQRT1_2
        }
        if (
          dx !== 0 ||
          dy !== 0
        ) {
          const facing =
            normalize(
              dx,
              dy,
            )
          player.facingX =
            facing.x
          player.facingY =
            facing.y
        }
        const speed =
          player.characterClass ===
          'Monk'
            ? 18
            : 14
        player.x =
          Math.max(
            30,
            Math.min(
              WORLD_WIDTH - 30,
              player.x +
                dx * speed,
            ),
          )
        player.y =
          Math.max(
            30,
            Math.min(
              WORLD_HEIGHT - 30,
              player.y +
                dy * speed,
            ),
          )
        io.to(room.code).emit(
          'player-positions',
          room.players,
        )
      },
    )
    /*
      HALO-STYLE DIRECTIONAL ATTACK
      The client sends the direction
      the camera/crosshair is aiming.
      Enemies are only hittable if they
      are actually inside that direction.
    */
    socket.on(
      'attack',
      (data: {
        roomCode: string
        aimX: number
        aimY: number
        aimElevation?: number
      }) => {
        if (!data || !Number.isFinite(data.aimX) || !Number.isFinite(data.aimY) || (data.aimElevation !== undefined && !Number.isFinite(data.aimElevation))) return
        const room =
          rooms.get(
            data?.roomCode,
          )
        const player =
          room?.players.find(
            (candidate) =>
              candidate.id ===
              socket.id,
          )
        if (
          !room ||
          !player ||
          player.downed || room.phase !== 'mission'
        ) {
          return
        }
        player.dialogueUntil = 0
        const profile =
          attackProfile(
            player.characterClass,
          )
        const now =
          Date.now()
        const previous =
          attackCooldowns.get(
            socket.id,
          ) ?? 0
        if (
          now - previous <
          profile.cooldown
        ) {
          return
        }
        attackCooldowns.set(
          socket.id,
          now,
        )
        const aim =
          normalize(
            data.aimX,
            data.aimY,
          )
        player.facingX =
          aim.x
        player.facingY =
          aim.y
        let target:
          | Enemy
          | undefined
        let bestDistance =
          Infinity
        for (
          const enemy
          of room.enemies
        ) {
          if (!enemy.alive) {
            continue
          }
          const dx =
            enemy.x -
            player.x
          const dy =
            enemy.y -
            player.y
          const targetDistance =
            Math.hypot(
              dx,
              dy,
            )
          if (
            targetDistance >
            profile.range
          ) {
            continue
          }
          const direction =
            normalize(
              dx,
              dy,
            )
          const dot =
            aim.x *
              direction.x +
            aim.y *
              direction.y
          if (
            dot <= 0 || Math.sqrt(Math.max(0, 1-dot*dot)) * targetDistance > 32 ||
            (data.aimElevation !== undefined && (() => {
              const elevation = Math.max(-.999,Math.min(.999,data.aimElevation))
              const hitHeight = 1.65 + elevation / Math.sqrt(1-elevation*elevation) * targetDistance * .02
              return hitHeight < .15 || hitHeight > 2.65
            })())
          ) {
            continue
          }
          if (
            targetDistance <
            bestDistance
          ) {
            target = enemy
            bestDistance =
              targetDistance
          }
        }
        if (target) {
          target.health =
            Math.max(
              0,
              target.health -
                (profile.damage + ((player.weaponTier ?? 1) - 1) * 14 + ((player.rank ?? 1) - 1) * 2),
            )
          if (
            target.health === 0
          ) {
            target.alive =
              false
              const xp = target.type === 'Commander' ? 150 : target.type === 'Heavy' ? 55 : 25
              awardXp(player, xp)
              io.to(player.id).emit('kyrevant-progression', `+${xp} XP · ${target.type} eliminated`)
              io.to(room.code).emit('player-state', room.players)
            }
        }
        io.to(room.code).emit(
          'attack-result',
          {
            playerId:
              player.id,
            characterClass:
              player.characterClass,
            startX:
              player.x,
            startY:
              player.y,
            aimX:
              aim.x,
            aimY:
              aim.y,
            targetId:
              target?.id ??
              null,
            damage:
              target
                ? profile.damage
                : 0,
          },
        )
        io.to(room.code).emit(
          'enemy-state',
          room.enemies,
        )
        updateQuestState(
          room,
        )
      },
    )
    socket.on(
      'mine-resource',
      (
        data: { roomCode: string; nodeId: string },
        callback?: (result: {
          success: boolean
          amount?: number
          type?: ResourceType
          total?: number
          message?: string
        }) => void,
      ) => {
        const room = rooms.get(data?.roomCode)
        const player = room?.players.find((candidate) => candidate.id === socket.id)
        const node = room?.resourceNodes.find((candidate) => candidate.id === data?.nodeId)
        if (!room || !player || !node) {
          callback?.({ success: false, message: 'Mining station unavailable.' })
          return
        }
        if (room.phase !== 'mission' || player.downed) { callback?.({ success: false, message: 'Regroup before mining.' }); return }
        // Extract only within reach of a station.
        if (distance(player.x, player.y, node.x, node.y) > 130) {
          callback?.({ success: false, message: 'Move closer to the mining station.' })
          return
        }
        // Stations NEVER run out. No depletion, daily cap, or mining cooldown.
        const amount = 20
        if (node.type === 'minerals') {
          room.economy.minerals += amount
            room.minedMinerals = (room.minedMinerals ?? 0) + amount
        } else {
          room.economy.energy += amount
        }
        const total = node.type === 'minerals'
          ? room.economy.minerals
          : room.economy.energy
        callback?.({ success: true, amount, type: node.type, total })
        io.to(room.code).emit('resource-state', {
          economy: room.economy,
          nodes: room.resourceNodes,
        })
        updateQuestState(room)
      },
    )
    /*
      STARCRAFT-STYLE BUILDING
      Client chooses structure and clicks
      a world position in command mode.
    */
    socket.on(
      'build-structure',
      (data: {
        roomCode: string
        type: BuildingType
        x: number
        y: number
      }) => {
        if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.y) || !['Extractor','Barracks','Turret','PowerCore'].includes(data.type)) return
        const room =
          rooms.get(
            data?.roomCode,
          )
        const player =
          room?.players.find(
            (candidate) =>
              candidate.id ===
              socket.id,
          )
        if (
          !room ||
          !player
        ) {
          return
        }
        const x =
          Math.max(
            150,
            Math.min(
              WORLD_WIDTH - 150,
              data.x,
            ),
          )
        const y =
          Math.max(
            150,
            Math.min(
              WORLD_HEIGHT - 150,
              data.y,
            ),
          )
        /*
          Players can only construct
          reasonably close to themselves.
        */
        if (
          distance(
            player.x,
            player.y,
            x,
            y,
          ) > 700
        ) {
          socket.emit(
            'build-denied',
            'Build location is too far away.',
          )
          return
        }
        const overlaps =
          room.buildings.some(
            (building) =>
              distance(
                building.x,
                building.y,
                x,
                y,
              ) < 140,
          )
        if (overlaps) {
          socket.emit(
            'build-denied',
            'Another structure occupies that area.',
          )
          return
        }
        if (room.phase !== 'mission' || player.downed) return
        const cost =
          buildingCost(
            data.type,
          )
        if (
          room.economy.minerals <
            cost.minerals ||
          room.economy.energy <
            cost.energy
        ) {
          socket.emit(
            'build-denied',
            'Insufficient resources.',
          )
          return
        }
        room.economy.minerals -=
          cost.minerals
        room.economy.energy -=
          cost.energy
        const building: Building = {
          id:
            `${data.type}-${Date.now()}-${Math.floor(
              Math.random() *
                10000,
            )}`,
          type:
            data.type,
          x,
          y,
          health: 250,
          maxHealth: 250,
        }
        room.buildings.push(
          building,
        )
        io.to(room.code).emit(
          'building-state',
          room.buildings,
        )
        io.to(room.code).emit(
          'resource-state',
          {
            economy:
              room.economy,
            nodes:
              room.resourceNodes,
          },
        )
        updateQuestState(
          room,
        )
      },
    )
    /*
      D&D EXPLORATION / INTERACTION
    */
    socket.on(
      'interact',
      (roomCode: string) => {
        const room =
          rooms.get(roomCode)
        const player =
          room?.players.find(
            (candidate) =>
              candidate.id ===
              socket.id,
          )
        if (
          !room ||
          !player
        ) {
          return
        }
        if (player.downed || room.phase !== 'mission') return
        if (handleChapterOneInteraction(room, player)) {
          return
        }
        if (
          room.level === 2
        ) {
          const artifactX =
            1850
          const artifactY =
            320
          if (
            distance(
              player.x,
              player.y,
              artifactX,
              artifactY,
            ) <= 140
          ) {
            room.questFlags.artifactRecovered =
              true
            io.to(room.code).emit(
              'story-event',
              'ANCIENT ARTIFACT RECOVERED',
            )
            updateQuestState(
              room,
            )
            return
          }
        }
        if (
          room.level === 3
        ) {
          const coreX =
            1970
          const coreY =
            330
          if (
            distance(
              player.x,
              player.y,
              coreX,
              coreY,
            ) <= 140
          ) {
            room.questFlags.citadelCoreActivated =
              true
            io.to(room.code).emit(
              'story-event',
              'THE CITADEL CORE AWAKENS',
            )
            updateQuestState(
              room,
            )
          }
        }
      },
    )
    socket.on('kyrevant-dialogue-choice',
      (data: { roomCode: string; site: ChapterSite; choice: string }) => {
        if (!data || typeof data.roomCode !== 'string' ||
            typeof data.site !== 'string' || typeof data.choice !== 'string') return
        const room = rooms.get(data.roomCode)
        const player = room?.players.find(p => p.id === socket.id)
        if (!room || !player) return
        handleChapterChoice(room, player, { site: data.site, choice: data.choice })
      })
    socket.on(
      'use-ability',
      (
        roomCode: string,
      ) => {
        const room =
          rooms.get(roomCode)
        const player =
          room?.players.find(
            (candidate) =>
              candidate.id ===
              socket.id,
          )
        if (
          !room ||
          !player ||
          !player.characterClass ||
          player.downed
        ) {
          return
        }
        const now =
          Date.now()
        const previous =
          abilityCooldowns.get(
            socket.id,
          ) ?? 0
        if (
          now - previous <
          6000
        ) {
          return
        }
        abilityCooldowns.set(
          socket.id,
          now,
        )
        if (
          player.characterClass ===
          'Cleric'
        ) {
          room.players.forEach(
            (ally) => {
              if (
                distance(
                  player.x,
                  player.y,
                  ally.x,
                  ally.y,
                ) <= 400
              ) {
                if (
                  ally.downed
                ) {
                  ally.downed =
                    false
                  ally.health =
                    35
                } else {
                  ally.health =
                    Math.min(
                      100,
                      ally.health +
                        40,
                    )
                }
                ally.shield =
                  Math.min(
                    100,
                    ally.shield +
                      30,
                  )
              }
            },
          )
        }
        if (
          player.characterClass ===
          'Monk'
        ) {
          player.x +=
            player.facingX *
            200
          player.y +=
            player.facingY *
            200
        }
        if (
          player.characterClass ===
            'Fighter' ||
          player.characterClass ===
            'Wizard'
        ) {
          const damage =
            player.characterClass ===
            'Wizard'
              ? 75
              : 60
          room.enemies.forEach(
            (enemy) => {
              if (
                enemy.alive &&
                distance(
                  player.x,
                  player.y,
                  enemy.x,
                  enemy.y,
                ) <= 320
              ) {
                enemy.health =
                  Math.max(
                    0,
                    enemy.health -
                      damage,
                  )
                if (
                  enemy.health ===
                  0
                ) {
                  enemy.alive =
                    false
                }
              }
            },
          )
        }
        io.to(room.code).emit(
          'ability-result',
          {
            playerId:
              player.id,
            characterClass:
              player.characterClass,
          },
        )
        io.to(room.code).emit(
          'player-state',
          room.players,
        )
        io.to(room.code).emit(
          'player-positions',
          room.players,
        )
        io.to(room.code).emit(
          'enemy-state',
          room.enemies,
        )
        updateQuestState(
          room,
        )
      },
    )
    socket.on(
      'disconnect',
      () => {
        departures.set(socket.id, setTimeout(() => {
        departures.delete(socket.id)
        attackCooldowns.delete(
          socket.id,
        )
        abilityCooldowns.delete(
          socket.id,
        )
        for (
          const [
            code,
            room,
          ]
          of rooms.entries()
        ) {
          const index =
            room.players.findIndex(
              (player) =>
                player.id ===
                socket.id,
            )
          if (index < 0) {
            continue
          }
          const leaving =
            room.players[index]
          room.players.splice(
            index,
            1,
          )
          if (
            room.players.length ===
            0
          ) {
            rooms.delete(code)
            continue
          }
          if (
            leaving.isHost
          ) {
            room.players[0].isHost =
              true
          }
          io.to(code).emit(
            'room-updated',
            room,
          )
        }
        }, 45000))
      },
    )
  },
)
/*
  ENEMY COMBAT LOOP
*/
// Current chapter-specific enemy spawns are tracked to keep NPC squads near their post.
const patrolHomes = new Map<string, { x: number; y: number }>()
setInterval(() => {
  rooms.forEach(
    (room) => {
      if (
        room.phase !==
        'mission'
      ) {
        return
      }
      const now =
        Date.now()
      if (now - (room.lastEconomyAt ?? 0) >= 5000) {
        room.lastEconomyAt = now
        const extractors = room.buildings.filter(b => b.type === 'Extractor').length
        const cores = room.buildings.filter(b => b.type === 'PowerCore').length
        if (extractors || cores) grantResources(room, extractors * 4, cores * 3)
        for (const barracks of room.buildings.filter(b => b.type === 'Barracks')) {
          for (const player of room.players) if (!player.downed && distance(player.x,player.y,barracks.x,barracks.y)<220) {
            player.health = Math.min(player.maxHealth, player.health + 4)
          }
        }
      }
      // Server-authoritative co-op encryption: two living operators must
      // remain beside the wreck for eight seconds. Leaving resets the progress.
      // Never use client timestamps or accept a success message from a browser.
      const uplink=room.uplink
      if (room.level===1 && uplink?.active && !room.questFlags.crashLogRecovered) {
        const operatorCount=room.players.filter(p=>!p.downed &&
          distance(p.x,p.y,chapterOneSites.flightLog.x,chapterOneSites.flightLog.y)<=
            chapterOneSites.flightLog.radius).length
        const delta=Math.min(400,Math.max(0,now-uplink.lastTick))
        uplink.lastTick=now
        if(operatorCount<2){
          uplink.progressMs=0
        }else{
          uplink.progressMs+=delta
        }
        const progress=Math.min(100,Math.floor(uplink.progressMs/8000*100))
        if(progress===100) {
          room.questFlags.crashLogRecovered=true
          room.uplink=undefined
          rewardSquad(room,35)
          io.to(room.code).emit('kyrevant-uplink',{
            active:false,progress:100,operators:operatorCount,message:'DECRYPTION COMPLETE',
          })
          io.to(room.code).emit('story-event',
            'NOTE RECOVERED · Find Elias at the Last Light Refuge.')
          updateQuestState(room)
          emitChapterSummary(room)
        }else if(uplink.reported!==progress || operatorCount<2){
          uplink.reported=progress
          io.to(room.code).emit('kyrevant-uplink',{
            active:true,progress,operators:operatorCount,
            message:operatorCount<2?'LINK LOST · Both operators must return':
              'HOLD POSITION · Protect your partner while the signal decrypts',
          })
        }
      }
      // Each settlement defense wave must actually be defeated to progress.
      if (room.level === 1 && room.questFlags.raidLaunched && !room.defenseComplete) {
        const wave = room.defenseWave ?? 0
        if (wave > 0) {
          const remaining = room.enemies.filter(e => e.alive &&
            e.id.startsWith(`l1-defense-${wave}-`)).length
          if (!remaining) {
            room.waveAdvanceAt ??= now + 1800
            if (now >= room.waveAdvanceAt) {
              if (wave < 3) spawnDefenseWave(room, wave + 1)
              else {
                room.defenseComplete = true
                room.waveAdvanceAt = undefined
                grantResources(room, 90, 60)
                room.players.forEach(p => {
                  p.weaponTier = 2
                  awardXp(p, 125)
                  io.to(p.id).emit('kyrevant-progression',
                    'RESISTANCE PULSE CARBINE UNLOCKED · +125 XP')
                })
                io.to(room.code).emit('player-state', room.players)
                io.to(room.code).emit('kyrevant-defense-state',
                  { wave: 3, total: 3, remaining: 0, status: 'victory' })
                io.to(room.code).emit('story-event',
                  'SETTLEMENT DEFENDED · Pulse carbines unlocked. Hunt the occupation commander!')
              }
              updateQuestState(room)
            }
          } else room.waveAdvanceAt = undefined
        }
      }
      if (room.level === 1 && room.defenseComplete && !room.bossReinforcements) {
        const boss = room.enemies.find(e => e.id === 'l1-commander')
        if (boss?.alive && boss.health <= boss.maxHealth * .5) {
          room.bossReinforcements = true
          room.enemies.push(
            createEnemy('l1-boss-escort-1', 'Raider', 2070, 530, 100),
            createEnemy('l1-boss-escort-2', 'Raider', 2180, 520, 100),
          )
          io.to(room.code).emit('enemy-state', room.enemies)
          io.to(room.code).emit('story-event',
            'COMMANDER: Reinforcements deployed! The Citadel will not fall!')
        }
      }
      // Preserve movement after a wipe: revive the party rather than leaving
      // players permanently downed and unable to issue movement commands.
      if (room.players.length > 0 && room.players.every(player => player.downed)) {
        if (room.wipeAt === undefined) room.wipeAt = now
        if (now - room.wipeAt >= 4500) {
          assignSpawnPoints(room.players)
          room.wipeAt = undefined
          io.to(room.code).emit('player-state', room.players)
          io.to(room.code).emit('player-positions', room.players)
          io.to(room.code).emit('story-event',
            'SQUAD REDEPLOYED AT THE CRASH SITE — regroup and continue the mission.')
        }
      } else {
        room.wipeAt = undefined
      }
      // A single downed player must also be able to resume play when teammates
      // are still alive (the four-player game should not lock anyone out).
      // Cleric abilities can revive them earlier.
      for (const player of room.players) {
        if (!player.downed) {
          if (now - (player.lastDamagedAt ?? 0) > 4500) player.shield = Math.min(player.maxShield, player.shield + 5)
          player.downedAt = undefined
          continue
        }
        if (player.downedAt === undefined) player.downedAt = now
        if (now - player.downedAt >= 7000) {
          assignSpawnPoints([player])
          io.to(room.code).emit('player-positions', room.players)
          io.to(room.code).emit('player-state', room.players)
          io.to(room.code).emit('story-event',
            `${player.name} has redeployed at the crash site.`)
        }
      }
      room.enemies.forEach(
        (enemy) => {
          if (!enemy.alive) {
            return
          }
          let target:
            | Player
            | undefined
          let best =
            Infinity
          room.players.forEach(
            (player) => {
              if (
                player.downed
              ) {
                return
              }
              const d =
                distance(
                  enemy.x,
                  enemy.y,
                  player.x,
                  player.y,
                )
              if (d < best) {
                best = d
                target = player
              }
            },
          )
                    if (!target) {
            return
          }
          const homeId = `${room.code}/${room.level}/${enemy.id}`
          if (!patrolHomes.has(homeId)) {
            patrolHomes.set(homeId, { x: enemy.x, y: enemy.y })
          }
          // Enemies patrol their position rather than aggroing from across the map.
          if (best > 330) {
            const home = patrolHomes.get(homeId)!
            const wanderX = home.x + Math.sin(now * .00028 + enemy.id.length) * 55
            const wanderY = home.y + Math.cos(now * .00031 + enemy.id.length) * 55
            const drift = normalize(wanderX - enemy.x, wanderY - enemy.y)
            if (distance(enemy.x, enemy.y, wanderX, wanderY) > 6) {
              enemy.x += drift.x * 2.6
              enemy.y += drift.y * 2.6
            }
            return
          }
          // Returning enemies cannot chase into the crash-landing safe zone.
          // They retain their original home position and resume patrolling.
          const home = patrolHomes.get(homeId)!
          if (distance(enemy.x, enemy.y, home.x, home.y) > 320 ||
              (room.level === 1 &&
               distance(target.x, target.y, 315, 1270) < 270)) {
            const toHome = normalize(home.x - enemy.x, home.y - enemy.y)
            if (distance(enemy.x, enemy.y, home.x, home.y) > 10) {
              enemy.x += toHome.x * 8
              enemy.y += toHome.y * 8
            }
            return
          }
          const attackRange =
            enemy.type ===
            'Commander'
              ? 430
              : enemy.type ===
                  'Heavy'
                ? 320
                : 280
          if (
            best >
            attackRange
          ) {
            const direction =
              normalize(
                target.x -
                  enemy.x,
                target.y -
                  enemy.y,
              )
            const speed =
              enemy.type ===
              'Heavy'
                ? 5
                : 8
            enemy.x +=
              direction.x *
              speed
            enemy.y +=
              direction.y *
              speed
            return
          }
          if (
            now -
              enemy.lastAttack <
            1100
          ) {
            return
          }
          enemy.lastAttack =
            now
          const damage =
            enemy.type ===
            'Commander'
              ? 28
              : enemy.type ===
                  'Heavy'
                ? 20
                : 13
          if (dialogueProtected(target)) return
          damagePlayer(
            target,
            damage,
          )
          io.to(room.code).emit(
            'enemy-attack',
            {
              enemyId:
                enemy.id,
              targetId:
                target.id,
              startX:
                enemy.x,
              startY:
                enemy.y,
              targetX:
                target.x,
              targetY:
                target.y,
              damage,
            },
          )
        },
      )
      /*
        Turrets automatically defend
        the base.
      */
      room.buildings
        .filter(
          (building) =>
            building.type ===
            'Turret',
        )
        .forEach(
          (turret) => {
            const target =
              room.enemies
                .filter(
                  (enemy) =>
                    enemy.alive,
                )
                .sort(
                  (a, b) =>
                    distance(
                      turret.x,
                      turret.y,
                      a.x,
                      a.y,
                    ) -
                    distance(
                      turret.x,
                      turret.y,
                      b.x,
                      b.y,
                    ),
                )[0]
            if (!target) {
              return
            }
            if (
              distance(
                turret.x,
                turret.y,
                target.x,
                target.y,
              ) > 420
            ) {
              return
            }
            target.health =
              Math.max(
                0,
                target.health -
                  5,
              )
            if (
              target.health ===
              0
            ) {
              target.alive =
                false
            }
          },
        )
      io.to(room.code).emit(
        'enemy-state',
        room.enemies,
      )
      io.to(room.code).emit(
        'player-state',
        room.players,
      )
      updateQuestState(
        room,
      )
    },
  )
}, 300)
const distDirectory = path.resolve(process.cwd(), 'dist')
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, game: 'KYREVANT', multiplayer: true, build: '2026-10-30.2' }))
if (existsSync(path.join(distDirectory, 'index.html'))) {
  app.use(express.static(distDirectory, { maxAge: 3600000 }))
  app.get('/', (_req, res) => res.sendFile(path.join(distDirectory, 'index.html')))
} else {
  app.get('/', (_req, res) => res.send('KYREVANT multiplayer server running. Build the client for the game UI.'))
}
const port = Number(process.env.PORT ?? 3001)
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`KYREVANT multiplayer server running on port ${port}`)
})
