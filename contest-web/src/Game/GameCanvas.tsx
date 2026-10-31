import {
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  ArcRotateCamera,
  DefaultRenderingPipeline,
  DynamicTexture,
  Effect,
  ShaderMaterial,
  VertexBuffer,
  Matrix,
  Quaternion,

  FreeCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  AssetContainer,
  AnimationGroup,
  PBRMaterial,
  CubeTexture,
  PointerEventTypes,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core'
import '@babylonjs/loaders/glTF'
import type { Socket } from 'socket.io-client'
import './GameCanvas.css'
import Arrival from './Arrival'
import { buildFrontierWorld, buildFieldStructure, buildOreDeposit, FRONTIER_SCALE } from './FrontierWorld'
import { createFieldRifle, type EquipmentStatus } from './FieldRifle'
import { WORLD_METERS_PER_UNIT, frontierHeight, distanceToTrail } from '../world'
import { addArmoredHelmet, addWorldServiceRifle, loadFieldSquad } from './DetailedAssets'
import TouchControls from './TouchControls'
import { CombatAudio } from './CombatAudio'
import { CombatInput } from './CombatInput'
// Textured tactical character assets and retargeted clips are bundled locally.
// CC0 scanned rocky ground by Rob Tuytel / Poly Haven. Real photos, albedo and
// tangent-space normal detail -- not a noise-only placeholder material.
const KYREVANT_GROUND_COLOR_URL =
  '/assets/rock-ground-color.webp'
const KYREVANT_GROUND_NORMAL_URL =
  '/assets/rock-ground-normal.webp'

type MarineAnimation = { idle?: AnimationGroup; walk?: AnimationGroup; run?: AnimationGroup; moving: boolean }

type Role = 'Fighter' | 'Monk' | 'Cleric' | 'Wizard' | 'Raider' | 'Heavy' | 'Commander'

// Procedural textures provide a local fallback while the scanned PBR textures load.
const noise01 = (x: number, y: number, seed = 13) => {
  let n = Math.imul(x + seed * 17, 374761393) + Math.imul(y, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

function smoothNoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const tx = x - ix
  const ty = y - iy
  const u = tx * tx * (3 - 2 * tx)
  const v = ty * ty * (3 - 2 * ty)
  const a = noise01(ix, iy, seed) * (1 - u) + noise01(ix + 1, iy, seed) * u
  const b = noise01(ix, iy + 1, seed) * (1 - u) + noise01(ix + 1, iy + 1, seed) * u
  return a * (1 - v) + b * v
}

function createPlanetTerrainTextures(scene: Scene) {
  const size = 512
  const diffuse = new DynamicTexture('kyrevant-basalt-albedo', {width:size,height:size}, scene, true)
  const bump = new DynamicTexture('kyrevant-basalt-normal', {width:size,height:size}, scene, true)
  const ctx = diffuse.getContext()
  const normalCtx = bump.getContext()
  const img = ctx.getImageData(0,0,size,size)
  const normalImg = normalCtx.getImageData(0,0,size,size)
  const heights = new Float32Array(size * size)
  for (let y=0; y<size; y++) for(let x=0; x<size; x++) {
    const n0 = smoothNoise(x/120,y/120,7)
    const n1 = smoothNoise(x/38,y/38,17)
    const n2 = smoothNoise(x/11,y/11,23)
    const n3 = noise01(x,y,91)
    const ridge = 1 - Math.abs(n1 * 2 - 1)
    const height = n0*.48 + n1*.28 + n2*.16 + n3*.08
    heights[y*size+x] = height
    const sediment = Math.min(1, Math.max(0, height * 1.27 + .1))
    const crack = ridge > .936 && n0 > .57 ? -.28 : 0
    const dust = n3 > .994 ? 36 : 0
    const value = (sediment - .45)*135 + crack*165 + dust
    const i = (y*size+x)*4
    img.data[i] = Math.max(0, Math.min(255, 82 + value*1.05))
    img.data[i+1] = Math.max(0, Math.min(255, 87 + value*.88))
    img.data[i+2] = Math.max(0, Math.min(255, 99 + value*.75))
    img.data[i+3] = 255
  }
  const heightAt=(x:number,y:number)=>heights[((y+size)%size)*size+(x+size)%size]
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const dx=(heightAt(x+1,y)-heightAt(x-1,y))*2.2
    const dy=(heightAt(x,y+1)-heightAt(x,y-1))*2.2
    const inv=1/Math.sqrt(dx*dx+dy*dy+1)
    const i=(y*size+x)*4
    normalImg.data[i]=(0.5-dx*inv*.5)*255
    normalImg.data[i+1]=(0.5-dy*inv*.5)*255
    normalImg.data[i+2]=(0.5+inv*.5)*255
    normalImg.data[i+3]=255
  }
  ctx.putImageData(img,0,0)
  normalCtx.putImageData(normalImg,0,0)
  diffuse.update(false)
  bump.update(false)
  diffuse.uScale=12
  diffuse.vScale=8
  bump.uScale=12
  bump.vScale=8
  return {diffuse,bump}
}

// Sky is rendered analytically in linear color. This removes the broken
// additive sky texture and gives the planet a stable dusk atmosphere.
function createAtmosphere(scene: Scene) {
  const sky=MeshBuilder.CreateSphere('frontier-panorama',{diameter:900,segments:48,sideOrientation:Mesh.BACKSIDE},scene)
  Effect.ShadersStore['frontierSkyVertexShader']=`
    precision highp float;
    attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec2 vUV;
    void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`
  Effect.ShadersStore['frontierSkyFragmentShader']=`
    precision highp float;varying vec2 vUV;uniform sampler2D panorama;
    void main(){
      vec3 color=texture2D(panorama,vUV).rgb;
      float edge=1.0-smoothstep(0.0,0.085,min(vUV.x,1.0-vUV.x));
      vec3 opposite=texture2D(panorama,vec2(1.0-vUV.x,vUV.y)).rgb;
      color=mix(color,opposite,edge*0.5);
      gl_FragColor=vec4(pow(color,vec3(2.2)),1.0);
    }`
  const material=new ShaderMaterial('frontier-sky',scene,'frontierSky',{attributes:['position','uv'],uniforms:['worldViewProjection'],samplers:['panorama']})
  material.setTexture('panorama',new Texture('/assets/kyrevant-frontier-sky.webp',scene,false,false))
  material.backFaceCulling=false;material.disableDepthWrite=true
  sky.material=material;sky.isPickable=false;sky.applyFog=false
  return sky
}

const armorTextureCache = new WeakMap<Scene, DynamicTexture>()
function scratchedMetalTexture(scene: Scene) {
  const cached=armorTextureCache.get(scene)
  if (cached) return cached
  const texture=new DynamicTexture('kyrevant-brushed-metal',{width:256,height:256},scene,true)
  const ctx=texture.getContext()
  ctx.fillStyle='#c7c9c9'
  ctx.fillRect(0,0,256,256)
  for(let i=0;i<4200;i++) {
    const x=noise01(i,3)*256,y=noise01(i,5)*256
    const pale=noise01(i,11)>.54
    ctx.strokeStyle=pale?'rgba(255,255,255,.15)':'rgba(38,42,49,.21)'
    ctx.lineWidth=.25+noise01(i,14)*.75
    ctx.beginPath();ctx.moveTo(x,y)
    ctx.lineTo(x+(noise01(i,16)-.5)*17,y+(noise01(i,9)-.5)*2)
    ctx.stroke()
  }
  texture.update(false)
  texture.uScale=1.6
  texture.vScale=1.6
  armorTextureCache.set(scene,texture)
  return texture
}

function metal(scene: Scene, name: string, base: string, glow?: string) {
  const mat = new StandardMaterial(name, scene)
  mat.diffuseColor = Color3.FromHexString(base)
  mat.specularColor = new Color3(0.36, 0.41, 0.46)
  mat.specularPower = 74
  mat.diffuseTexture = scratchedMetalTexture(scene)
  if (glow) mat.emissiveColor = Color3.FromHexString(glow)
  return mat
}

type CharacterClass =
  | 'Fighter'
  | 'Monk'
  | 'Cleric'
  | 'Wizard'
type BuildingType =
  | 'Extractor'
  | 'Barracks'
  | 'Turret'
  | 'PowerCore'
type Player = {
  id: string
  name: string
  isHost?: boolean
  characterClass:
    | CharacterClass
    | null
  x: number
  y: number
  facingX: number
  facingY: number
  health?: number
  species?: string
  xp?: number
  rank?: number
  maxHealth?: number
  shield?: number
  maxShield?: number
  downed?: boolean
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
}
type ResourceNode = {
  id: string
  type:
    | 'minerals'
    | 'energy'
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
  category: string
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
  resourceNodes?: ResourceNode[]
  buildings?: Building[]
  quests?: QuestObjective[]
  economy?: Economy
  level?: number
}
type DialogueOption = { id: string; label: string }
type GameDialogue = { site: string; speaker: string; title: string; lines: string[]; choices: DialogueOption[] }
type ChapterStatus = { stage: number; totalStages: number; title: string; wave: number; waveTotal: number; weapon: string; description: string }
type GameCanvasProps = {
  room: Room
  socket: Socket
}
type CharacterVisual = {
  root: TransformNode
  model: TransformNode
  lastX: number
  lastY: number
  walkPhase: number
}
type EnemyVisual = {
  root: TransformNode
  model: TransformNode
  lastX: number
  lastY: number
  walkPhase: number
}
type AttackResult = {
  playerId: string
  characterClass:
    | CharacterClass
    | null
  startX: number
  startY: number
  aimX: number
  aimY: number
  targetId:
    | string
    | null
  damage: number
}
type EnemyAttack = {
  enemyId: string
  targetId: string
  startX: number
  startY: number
  targetX: number
  targetY: number
  damage: number
}
const SCALE = WORLD_METERS_PER_UNIT
// Mining has no resource depletion or cooldown; only server-verified distance matters.
// This matches the server's allowed range exactly.
const MINE_RANGE = 130
// Each fill of the progress bar represents one extraction (+20 resources).
// There is no cooldown, depletion, or limit to the number of cycles.
const MINING_CYCLE_MS = 650
const sx = (
  value: number,
) => value * SCALE
const sz = (
  value: number,
) => value * SCALE
// Chapter 1 coordinates match the authoritative server interaction checks.
// World coordinates are converted to Babylon units with sx/sz (scale 0.05).
const KYREVANT_STORY_SITES = [
  { quest: 'recover-flight-log', name: 'HANDWRITTEN NOTE ON A ROCK', x: 500, y: 1100, radius: 155, role: 'terminal' },
  { quest: 'meet-innkeeper', name: 'ELIAS / LAST LIGHT REFUGE', x: 1150, y: 600, radius: 165, role: 'innkeeper' },
  { quest: 'rescue-civilians', name: 'MISSING COLONISTS', x: 2200, y: 950, radius: 165, role: 'survivor' },
  { quest: 'meet-resistance', name: 'RESISTANCE LEADER', x: 1700, y: 550, radius: 165, role: 'leader' },
  { quest: 'activate-defense', name: 'RESISTANCE DEFENSE RADIO', x: 1500, y: 690, radius: 150, role: 'terminal' },
] as const

function GameCanvas({
  room,
  socket,
}: GameCanvasProps) {
  const roomSnapshot = useRef(room)
  useEffect(() => { roomSnapshot.current = room }, [room])
  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    )
  const attackRef =
    useRef<
      (() => void) | null
    >(null)
  const abilityRef =
    useRef<
      (() => void) | null
    >(null)
  const interactRef =
    useRef<
      (() => void) | null
    >(null)
  const mineRef =
    useRef<
      (() => void) | null
    >(null)
  const selectedBuildingRef =
    useRef<
      BuildingType | null
    >(null)
  const commandModeRef =
    useRef(false)
  const localId =
    socket.id ?? ''
  const [
    players,
    setPlayers,
  ] = useState<Player[]>(
    room.players,
  )
  const [
    enemies,
    setEnemies,
  ] = useState<Enemy[]>(
    room.enemies ?? [],
  )
  const [
    quests,
    setQuests,
  ] = useState<
    QuestObjective[]
  >(
    room.quests ?? [],
  )
  const [
    economy,
    setEconomy,
  ] = useState<Economy>(
    room.economy ?? {
      minerals: 0,
      energy: 0,
    },
  )
  const [
    level,
    setLevel,
  ] = useState(
    room.level ?? 1,
  )
  const [
    nearbyResource,
    setNearbyResource,
  ] = useState<
    ResourceNode | undefined
  >(undefined)
  const [
    commandMode,
    setCommandMode,
  ] = useState(false)
  const [soundEnabled,setSoundEnabled] = useState(true)
  const soundRef = useRef<CombatAudio | null>(null)
  useEffect(() => { if(soundRef.current) soundRef.current.enabled=soundEnabled },[soundEnabled])
  const [hitAt, setHitAt] = useState(0)
  const [showArrival, setShowArrival] = useState(true)
  const [showBuildMenu, setShowBuildMenu] = useState(false)
  const combatPaused = useRef(true)
  const [showFullQuestLog, setShowFullQuestLog] = useState(false)
  const [dialogue, setDialogue] = useState<GameDialogue | null>(null)
  const [uplink, setUplink] = useState<{active:boolean;progress:number;operators:number;message:string}|null>(null)
  const [chapterStatus, setChapterStatus] = useState<ChapterStatus | null>(null)
  const [progressMessage, setProgressMessage] = useState('')
  const [showRules, setShowRules] = useState(false)
  useEffect(() => { combatPaused.current = showArrival || dialogue !== null || showRules }, [showArrival, dialogue, showRules])
  const [mouseStatus, setMouseStatus] = useState<'ready' | 'locked' | 'fallback' | 'released'>('ready')
  const [equipmentStatus,setEquipmentStatus]=useState<EquipmentStatus>('loading')
  const [marineAssetStatus, setMarineAssetStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [miningFeedback, setMiningFeedback] = useState('')
  const [miningActive, setMiningActive] = useState(false)
  const [miningProgress, setMiningProgress] = useState(0)
  const [nearestMiningTarget, setNearestMiningTarget] = useState<{
    type: ResourceNode['type']
    distance: number
  } | null>(null)
  const [
    selectedBuilding,
    setSelectedBuilding,
  ] = useState<
    BuildingType | null
  >(null)
  const [
    announcement,
    setAnnouncement,
  ] = useState(
    'THE FALL',
  )
  const [
    victory,
    setVictory,
  ] = useState(false)
  const localPlayer =
    players.find(
      (player) =>
        player.id ===
        localId,
    )
  useEffect(() => {
    const room = roomSnapshot.current
    const canvas =
      canvasRef.current
    if (!canvas) {
      return
    }
    const engine =
      new Engine(
        canvas,
        true,
        {
          antialias: true,
          stencil: true,
        },
      )
    const touchDevice = window.matchMedia('(pointer: coarse)').matches
    if(touchDevice)engine.setHardwareScalingLevel(1)
    const scene =
      new Scene(engine)
    scene.clearColor =
      new Color4(
        0.011,
        0.019,
        0.039,
        1,
      )
    scene.fogMode =
      Scene.FOGMODE_EXP2
    scene.fogDensity =
      0.0017
    scene.fogColor =
      new Color3(
        0.37,
        0.46,
        0.48,
      )
    // Image-based reflections make metallic helmets and armour read as PBR,
    // rather than appearing as flat-shaded boxes. This does not replace
    // the custom alien sky, which remains the visible background.
    try {
      scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
        '/assets/reflections.env', scene,
      )
      scene.environmentIntensity = 0.72
    } catch (error) {
      // Optional environment lighting must never stop gameplay initialization.
      console.warn('Optional reflection environment unavailable.', error)
    }

    const audio = new CombatAudio()
    soundRef.current = audio
    let activeChapter = room.level ?? 1
    const chapterOneActors: TransformNode[] = []
    let chapterLandmark: TransformNode | null = null
    let chapterRelic: Mesh | null = null
    let chapterRelicLight: StandardMaterial | null = null
    let chapterRelicRecovered = false
    let currentPlayers =
      [...room.players]
    let currentEnemies =
      [...room.enemies]
    let currentNodes =
      [
        ...(room.resourceNodes ??
          []),
      ]
    let miningMessageTimer: number | undefined
    let miningEnabled = false
    let miningElapsed = 0
    let miningRequestPending = false
    let miningSession = 0
    let miningLastFrame = performance.now()
    let lastMiningPercent = -1
    let currentMiningNodeId: string | null = null
    let miningUnmounted = false

    function stopMining(message?: string) {
      if (!miningEnabled && !message) return
      miningEnabled = false
      miningElapsed = 0
      miningRequestPending = false
      currentMiningNodeId = null
      miningSession++
      lastMiningPercent = -1
      setMiningActive(false)
      setMiningProgress(0)
      if (message) showMiningMessage(message)
    }

    function showMiningMessage(message: string) {
      setMiningFeedback(message)
      window.clearTimeout(miningMessageTimer)
      miningMessageTimer = window.setTimeout(() => setMiningFeedback(''), 2600)
    }
    let currentBuildings =
      [
        ...(room.buildings ??
          []),
      ]
    const playerVisuals =
      new Map<
        string,
        CharacterVisual
      >()
    const enemyVisuals =
      new Map<
        string,
        EnemyVisual
      >()
    const resourceVisuals =
      new Map<
        string,
        TransformNode
      >()
    const buildingVisuals =
      new Map<
        string,
        TransformNode
      >()
    const levelVisuals:
      TransformNode[] = []
    function material(
      name: string,
      diffuse: Color3,
      emissive?: Color3,
    ) {
      const value =
        new StandardMaterial(
          name,
          scene,
        )
      value.diffuseColor =
        diffuse
      value.specularColor =
        new Color3(
          0.15,
          0.15,
          0.15,
        )
      if (emissive) {
        value.emissiveColor =
          emissive
      }
      return value
    }
    const groundMaterial =
      material(
        'planet-surface',
        new Color3(
          0.86,
          0.85,
          0.83,
        ),
      )
    const terrainMaps = createPlanetTerrainTextures(scene)
    groundMaterial.diffuseTexture = terrainMaps.diffuse
    groundMaterial.bumpTexture = terrainMaps.bump
    groundMaterial.specularColor = new Color3(0.04,0.05,0.055)
    groundMaterial.specularPower = 16
    const friendlyProjectileMaterial =
      material(
        'friendly-projectile',
        new Color3(
          0.1,
          0.55,
          1,
        ),
        new Color3(
          0.05,
          0.5,
          1,
        ),
      )
    const hostileProjectileMaterial =
      material(
        'hostile-projectile',
        new Color3(
          1,
          0.12,
          0.08,
        ),
        new Color3(
          1,
          0.03,
          0.01,
        ),
      )
    /*
      LIGHTING
    */
    const ambient =
      new HemisphericLight(
        'ambient',
        new Vector3(
          0,
          1,
          0,
        ),
        scene,
      )
    ambient.intensity =
      0.74
    ambient.groundColor =
      new Color3(
        0.12,
        0.06,
        0.12,
      )
    const sun =
      new DirectionalLight(
        'sun',
        new Vector3(
          -0.4,
          -1,
          0.35,
        ),
        scene,
      )
    sun.position.set(
      25,
      40,
      -20,
    )
    sun.diffuse = new Color3(1,.88,.69)
    sun.intensity =
      2.0
    const shadowGenerator =
      new ShadowGenerator(
        touchDevice ? 512 : 2048,
        sun,
      )
    shadowGenerator.usePercentageCloserFiltering =
      true
    /*
      GLOW
    */
const glow =
      new GlowLayer(
        'kyrevant-glow',
        scene,
      )
    glow.intensity =
      0.25
    const sky=createAtmosphere(scene)
    sky.position.copyFrom(new Vector3(25,0,16))


    // Floating atmospheric dust, barely visible until backlit by the sunset.
    // Independent of combat/physics and harmless to multiplayer synchronization.
    const dustTexture=new DynamicTexture('kyrevant-dust-particle', {width:64,height:64},scene,false)
    const dustCtx=dustTexture.getContext()
    const dustGradient=dustCtx.createRadialGradient(32,32,0,32,32,32)
    dustGradient.addColorStop(0,'rgba(240,208,176,.48)')
    dustGradient.addColorStop(.3,'rgba(191,173,151,.18)')
    dustGradient.addColorStop(1,'rgba(165,150,135,0)')
    dustCtx.fillStyle=dustGradient
    dustCtx.fillRect(0,0,64,64)
    dustTexture.hasAlpha=true
    dustTexture.update(false)
    const driftingDust=new ParticleSystem('kyrevant-drifting-dust',135,scene)
    driftingDust.particleTexture=dustTexture
    driftingDust.emitter=new Vector3(25,.55,16)
    driftingDust.minEmitBox=new Vector3(-24,0,-15)
    driftingDust.maxEmitBox=new Vector3(24,3,15)
    driftingDust.color1=new Color4(.71,.61,.52,.10)
    driftingDust.color2=new Color4(.53,.62,.69,.07)
    driftingDust.colorDead=new Color4(.2,.25,.34,0)
    driftingDust.minSize=.03
    driftingDust.maxSize=.18
    driftingDust.minLifeTime=5
    driftingDust.maxLifeTime=11
    driftingDust.emitRate=13
    driftingDust.minEmitPower=.08
    driftingDust.maxEmitPower=.32
    driftingDust.direction1=new Vector3(-.2,-.025,-.15)
    driftingDust.direction2=new Vector3(.4,.04,.28)
    driftingDust.gravity=new Vector3(0,-.005,0)
    driftingDust.updateSpeed=.014
    driftingDust.start()
    /*
      COMBAT CAMERA
      First-person in combat. ArcRotate in command mode.
    */
    const camera =
      new ArcRotateCamera(
        'combat-camera',
        -Math.PI / 2,
        1.19,
        4.8,
        new Vector3(
          sx(280),
          1.3,
          sz(1240),
        ),
        scene,
      )
    camera.lowerRadiusLimit =
      3.6
    camera.upperRadiusLimit =
      65
    camera.lowerBetaLimit =
      0.9
    camera.upperBetaLimit =
      1.42
    camera.panningSensibility =
      0
    camera.angularSensibilityX =
      800
    camera.angularSensibilityY =
      800
    camera.wheelPrecision =
      70
    camera.inputs.removeByType(
      'ArcRotateCameraKeyboardMoveInput',
    )
    // A separate camera gives combat a true eye-level first-person perspective.
    // The orbital camera is retained only for the strategy / building view.
    const localSpawn=currentPlayers.find(player=>player.id===localId)
    const fpsCamera = new FreeCamera(
      'kyrevant-fps-camera',
      new Vector3(sx(localSpawn?.x??280), 1.65, sz(localSpawn?.y??1240)),
      scene,
    )
    fpsCamera.minZ = 0.055
    fpsCamera.maxZ = 1000
    fpsCamera.fov = 1.18
    // Face toward the playable settlement, with the ground in view.
    // Starting with a level horizon and looking toward the map edge
    // made combat mode appear to show only a blue/empty background.
    fpsCamera.setTarget(new Vector3(25, 1.6, 55))
    scene.activeCamera = fpsCamera
    const { root: fpsWeapon, flash: fpsFlash } = createFieldRifle(scene, fpsCamera, currentPlayers.find(p=>p.id===localId)?.characterClass ?? 'Fighter',setEquipmentStatus)
    // Production-style antialiasing / tonemapping pipeline. The FPS and
    // strategy cameras share it, so mode switching cannot turn the effects off.
    // Bloom stays subtle: bright effects glow, not the entire landscape.
    const renderPipeline = new DefaultRenderingPipeline(
      'kyrevant-combat-pipeline', true, scene, [fpsCamera, camera],
    )
    renderPipeline.fxaaEnabled = true
    renderPipeline.bloomEnabled = true
    renderPipeline.bloomThreshold = 0.91
    renderPipeline.bloomWeight = 0.025
    renderPipeline.bloomKernel = 36
    renderPipeline.imageProcessingEnabled = true
    renderPipeline.imageProcessing.toneMappingEnabled = true
    renderPipeline.imageProcessing.toneMappingType = 1
    renderPipeline.imageProcessing.contrast = 1.10
    renderPipeline.imageProcessing.exposure = 1.0

    let weaponKick = 0
    let flashTime = 0

    // UNIFIED FPS INPUT
    // Mouse-look and WASD are independent and run during the same frames.
    // Escape frees the cursor without touching movement key state.
    // Pointer lock is preferred but not mandatory: if the browser blocks it,
    // movement over the canvas still turns the camera without dragging.
    fpsCamera.inputs.clear()
    fpsCamera.inertia = 0
    // Mouse-look uses rotation Euler angles. Imported animations must not
    // silently override the camera with a rotationQuaternion.
    fpsCamera.rotationQuaternion = null
    canvas.style.cursor = 'crosshair'
    canvas.style.pointerEvents = 'auto'
    // A canvas inside an editor preview is otherwise easy to leave unfocused.
    // It must own keyboard focus after the player clicks the 3D viewport.
    canvas.tabIndex = 0
    const inputDebug = document.createElement('div')
    inputDebug.setAttribute('aria-live', 'off')
    inputDebug.setAttribute('data-kyrevant-input-diagnostic', 'true')
    inputDebug.style.cssText = [
      'position:absolute', 'top:12px', 'right:12px', 'z-index:20',
      'display:none', 'padding:6px 9px', 'pointer-events:none',
      'font:600 10px/1.5 monospace', 'letter-spacing:.04em',
      'color:#c3ecfb', 'background:rgba(3,11,21,.74)',
      'border:1px solid rgba(109,202,244,.38)', 'border-radius:5px',
    ].join(';')
    canvas.parentElement?.appendChild(inputDebug)
    let lastInputText = ''
    const showInputDebug = (message: string) => {
      if (message !== lastInputText) {
        inputDebug.textContent = message
        lastInputText = message
      }
    }

    const inputState=new CombatInput(fpsCamera.rotation.y,fpsCamera.rotation.x)
    let mouseSessionActive = false
    let hasCapturedClick = false
    let cursorReleased = false
    let previouslyLocked = false
    let lastClientX: number | null = null
    let lastClientY: number | null = null

    const isMouseLocked = () => document.pointerLockElement === canvas

    const applyLookDelta = (dx: number, dy: number) => {
      if (combatPaused.current || commandModeRef.current) return
      inputState.look(dx,dy)
      fpsCamera.rotation.y=inputState.heading
      fpsCamera.rotation.x=inputState.pitch
    }

    const handlePointerLockChange = () => {
      if (isMouseLocked()) {
        previouslyLocked = true
        if (!commandModeRef.current) {
          mouseSessionActive = true
          cursorReleased = false
          setMouseStatus('locked')
        }
      } else if (previouslyLocked) {
        // Chrome can swallow the Escape key while leaving pointer-lock.
        // Handle the unlock event itself; it only releases the cursor.
        previouslyLocked = false
        // Escape release must free the cursor without stopping WASD. Moving
        // the mouse over the canvas re-enables look in fallback mode.
        mouseSessionActive = false
        hasCapturedClick = false
        cursorReleased = true
        if (!commandModeRef.current) setMouseStatus('released')
      } else if (!commandModeRef.current) {
        setMouseStatus(cursorReleased ? 'released' : mouseSessionActive ? 'fallback' : 'ready')
      }
      lastClientX = null
      lastClientY = null
    }

    const handlePointerLockError = () => {
      if (!commandModeRef.current && mouseSessionActive && !cursorReleased) {
        setMouseStatus('fallback')
      }
    }

    let triggerHeld = false
    let lastLocalShot = 0
    const releaseTrigger = () => { triggerHeld = false }
    const captureMouse = (event: MouseEvent) => {
      if (combatPaused.current) return
      if (event.button === 0) triggerHeld = true
      if (commandModeRef.current || event.button !== 0) return
      canvas.focus({ preventScroll: true })
      // Never disable keyboard movement while acquiring or releasing the cursor.
      if (isMouseLocked() || (hasCapturedClick && mouseSessionActive && !cursorReleased)) {
        fire()
        return
      }
      mouseSessionActive = true
      hasCapturedClick = true
      cursorReleased = false
      lastClientX = null
      lastClientY = null
      setMouseStatus('fallback')
      // Pointer lock provides unlimited turning, but the independent hover
      // fallback below also works inside previews that reject pointer lock.
      try {
        const request = canvas.requestPointerLock?.()
        if (request && typeof request.catch === 'function') {
          void request.catch(() => {
            if (!cursorReleased && !commandModeRef.current) setMouseStatus('fallback')
          })
        }
      } catch {
        setMouseStatus('fallback')
      }
    }

    const resumeMouseLook = () => {
      if(combatPaused.current || commandModeRef.current)return
      canvas.focus({preventScroll:true})
      mouseSessionActive=true;hasCapturedClick=true;cursorReleased=false
      lastClientX=null;lastClientY=null
      setMouseStatus(isMouseLocked()?'locked':'fallback')
    }

    const lookMoveEvent = 'PointerEvent' in window ? 'pointermove' : 'mousemove'
    const handleMouseMove = (event: MouseEvent) => {
      if('pointerType' in event && (event as PointerEvent).pointerType==='touch' && event.target!==canvas)return
      if (combatPaused.current || commandModeRef.current || cursorReleased) { lastClientX=null;lastClientY=null;return }
      if ((event.target as HTMLElement)?.closest?.('button,aside,[role="dialog"]')) {lastClientX=null;lastClientY=null;return}
      const bounds = canvas.getBoundingClientRect()
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom
      if (isMouseLocked()) {
        // With pointer lock the browser reports relative deltas, even when the
        // visible cursor stays at the center of the viewport.
        const dx=event.movementX || (lastClientX===null?0:event.clientX-lastClientX)
        const dy=event.movementY || (lastClientY===null?0:event.clientY-lastClientY)
        applyLookDelta(dx,dy)
        lastClientX=event.clientX;lastClientY=event.clientY
        return
      }
      if (!inside) {
        lastClientX = null
        lastClientY = null
        return
      }
      // Look begins only after an intentional click in the world. Menus and
      // the introduction must never turn the survivor toward the floor.
      if (!mouseSessionActive || !hasCapturedClick) {lastClientX=null;lastClientY=null;return}
      if (lastClientX !== null && lastClientY !== null) {
        applyLookDelta(event.clientX - lastClientX, event.clientY - lastClientY)
      }
      lastClientX = event.clientX
      lastClientY = event.clientY
    }

    const releaseCursor = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && commandModeRef.current) {
        // Escape leaves construction/overhead mode as well as releasing the mouse.
        window.dispatchEvent(new Event('kyrevant-cancel-command'))
        return
      }
      if (event.code === 'Escape' && !commandModeRef.current) {
        // Do not clear/disable the movement keys. Escape is NOT a movement mode.
        mouseSessionActive = false
        hasCapturedClick = false
        cursorReleased = true
        lastClientX = null
        lastClientY = null
        setMouseStatus('released')
        if (isMouseLocked()) void document.exitPointerLock()
        return
      }
      // Independent keyboard-look fallback. Does not alter WASD state.
      if (!commandModeRef.current &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
        event.preventDefault()
        const step = 22
        if (event.code === 'ArrowLeft') applyLookDelta(-step, 0)
        if (event.code === 'ArrowRight') applyLookDelta(step, 0)
        if (event.code === 'ArrowUp') applyLookDelta(0, -step)
        if (event.code === 'ArrowDown') applyLookDelta(0, step)
      }
    }

    canvas.addEventListener('mousedown', captureMouse)
    canvas.addEventListener('click', resumeMouseLook)
    window.addEventListener('mouseup', releaseTrigger)
    window.addEventListener('blur', releaseTrigger)
    window.addEventListener(lookMoveEvent, handleMouseMove)
    window.addEventListener('keydown', releaseCursor)
    document.addEventListener('pointerlockchange', handlePointerLockChange)
    document.addEventListener('pointerlockerror', handlePointerLockError)

    /*
      BASE PLANET SURFACE
    */
    const ground =
      MeshBuilder.CreateGround(
        'kyrevant-ground',
        {
          width: 55,
          height: 35,
          subdivisions: 128,
          updatable: true,
        },
        scene,
      )
    ground.position.set(
      26,
      0,
      16,
    )
    // Subtle 3D surface relief, keeping the server's flat player collision
    // plane clear; the visible slope is mostly outside the walkable path.
    const terrainPositions=ground.getVerticesData(VertexBuffer.PositionKind)
    const terrainIndices=ground.getIndices()
    if (terrainPositions && terrainIndices) {
      for(let i=0;i<terrainPositions.length;i+=3) {
        const px=terrainPositions[i]+26
        const pz=terrainPositions[i+2]+16
        terrainPositions[i+1]=frontierHeight(px*FRONTIER_SCALE,pz*FRONTIER_SCALE)
      }
      const surfaceColors:number[]=[]
      for(let i=0;i<terrainPositions.length;i+=3){
        const x=(terrainPositions[i]+26)*FRONTIER_SCALE,z=(terrainPositions[i+2]+16)*FRONTIER_SCALE
        const macro=smoothNoise(x/12,z/12,71),trail=Math.max(0,1-distanceToTrail(x,z)/3)
        surfaceColors.push(.55+macro*.5+trail*.12,.53+macro*.43+trail*.06,.48+macro*.34,1)
      }
      ground.setVerticesData(VertexBuffer.ColorKind,surfaceColors)
      ground.setVerticesData(VertexBuffer.PositionKind,terrainPositions,true)
      const normals:number[]=[]
      VertexData.ComputeNormals(terrainPositions,Array.from(terrainIndices),normals)
      ground.setVerticesData(VertexBuffer.NormalKind,normals)
    }

    ground.scaling.set(FRONTIER_SCALE,1,FRONTIER_SCALE)
    ground.position.set(26*FRONTIER_SCALE,0,16*FRONTIER_SCALE)
    ground.material = groundMaterial
    ground.receiveShadows = true

    // Physically-based, scanned terrain loads progressively; the built-in
    // procedural material remains visible if the remote texture is blocked.
    try {
    const scannedGround = new PBRMaterial('kyrevant-scanned-ground-pbr', scene)
    scannedGround.metallic = 0.0
    scannedGround.roughness = 0.94
    scannedGround.albedoColor = new Color3(.68, .63, .52)
    const groundAlbedo = new Texture(
      KYREVANT_GROUND_COLOR_URL, scene, true, false,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => { if (!scene.isDisposed) ground.material = scannedGround },
      () => { console.warn('Scanned ground unavailable: using built-in terrain texture') },
    )
    groundAlbedo.uScale = 15
    groundAlbedo.vScale = 10
    scannedGround.albedoTexture = groundAlbedo
    const groundNormal = new Texture(
      KYREVANT_GROUND_NORMAL_URL, scene, true, false,
      Texture.TRILINEAR_SAMPLINGMODE,
      undefined,
      () => { scannedGround.bumpTexture = null },
    )
    groundNormal.uScale = groundAlbedo.uScale
    groundNormal.vScale = groundAlbedo.vScale
    groundNormal.level = .72
    scannedGround.bumpTexture = groundNormal
    } catch (error) {
      // Texture initialization is optional and must never disable controls.
      ground.material = groundMaterial
      console.warn('PBR terrain unavailable; using embedded terrain.', error)
    }

    // Batching small, irregular surface debris gives depth cues without
    // creating hundreds of separate draw calls or blocking player movement.
    const rubble = MeshBuilder.CreatePolyhedron(
      'distant-ground-rubble', { type: 2, size: .16 }, scene,
    )
    const rubbleMat = new StandardMaterial('rubble-basalt', scene)
    rubbleMat.diffuseColor = new Color3(.23, .22, .2)
    rubbleMat.specularColor = new Color3(.05, .06, .06)
    rubble.material = rubbleMat
    rubble.isPickable = false
    rubble.receiveShadows = true
    const rubbleTransforms: number[] = []
    let rubbleSeed = 31793
    const rubbleRandom = () => {
      rubbleSeed = (Math.imul(rubbleSeed, 1664525) + 1013904223) >>> 0
      return rubbleSeed / 4294967296
    }
    for (let i = 0; i < 300; i++) {
      const x = 1.1 + rubbleRandom() * 52
      const z = .8 + rubbleRandom() * 33
      // Keep the spawn area and main approaches free of clipping debris.
      if (x > 3 && x < 10 && z > 19 && z < 29) continue
      const scale = .24 + rubbleRandom() * 1.65
      const rotation = Quaternion.RotationAxis(Vector3.Up(), rubbleRandom() * Math.PI * 2)
      const world = Matrix.Compose(
        new Vector3(scale * (.7 + rubbleRandom()), .28 + rubbleRandom() * .6, scale),
        rotation,
        new Vector3(x*FRONTIER_SCALE, .016, z*FRONTIER_SCALE),
      )
      rubbleTransforms.push(...world.toArray())
    }
    rubble.thinInstanceSetBuffer('matrix', new Float32Array(rubbleTransforms), 16, true)

    // Narrow trail through the settlement, contrasting with the dusty rock surface.
    const trail = MeshBuilder.CreateGround('settlement-road', {width:29,height:4}, scene)
    trail.position.set(22,.018,16)
    trail.rotation.y = .32
    const trailMat = new StandardMaterial('road-metal-dust',scene)
    trailMat.diffuseColor = new Color3(.16,.19,.22)
    trailMat.specularColor = new Color3(.07,.09,.11)
    trail.material = trailMat
    trail.setEnabled(false)
    /*
      IMPORT HELPERS
    */
    let frontierSetPiece: ReturnType<typeof buildFrontierWorld> | null = null
    async function buildEnvironment() {
      frontierSetPiece=buildFrontierWorld(scene,shadowGenerator)
      levelVisuals.push(frontierSetPiece.root)
      if((room.quests ?? []).some(q=>q.id==='recover-flight-log' && q.complete))frontierSetPiece.confirmUplink()
      if((room.quests ?? []).some(q=>q.id==='rescue-civilians' && q.complete))frontierSetPiece.confirmRescue()
      const actors=KYREVANT_STORY_SITES.filter(site=>site.role!=='terminal')
      const container=await loadFieldSquad(scene)
      if(scene.isDisposed){container.dispose();return}
      for(const site of actors){
        const npc=new TransformNode(`story-${site.quest}`,scene)
        npc.position.set(sx(site.x),frontierHeight(sx(site.x),sz(site.y)),sz(site.y));npc.rotation.y=-.5
        const copy=container.instantiateModelsToScene(name=>`${site.quest}-${name}`,false,{doNotInstantiate:true})
        copy.rootNodes.forEach(node=>node.parent=npc)
        copy.animationGroups.forEach(group=>group.stop());copy.animationGroups.find(group=>/^idle$/i.test(group.name))?.start(true)
        npc.getChildMeshes().forEach(mesh=>{mesh.isPickable=false;mesh.receiveShadows=true;shadowGenerator.addShadowCaster(mesh)})
        levelVisuals.push(npc);chapterOneActors.push(npc)
      }
    }

    function showChapterLandmarks(chapter: number) {
      chapterLandmark?.dispose()
      chapterOneActors.forEach(actor => actor.setEnabled(chapter === 1))
      chapterRelicRecovered = false
      if (chapter === 1) return
      chapterLandmark = new TransformNode('chapter-landmark',scene)
      const x = chapter === 2 ? 37 : 39.4, z = chapter === 2 ? 6.4 : 6.6
      chapterLandmark.position.set(x*FRONTIER_SCALE,0,z*FRONTIER_SCALE)
      chapterLandmark.scaling.setAll(1.5)
      const stone = metal(scene,'ancient-ruin-stone','#344850')
      const glow = metal(scene,'ancient-ruin-light',chapter===2?'#7ddfda':'#d7ac68',chapter===2?'#327d79':'#805a25')
      chapterRelicLight = glow
      const part = (name:string,w:number,h:number,d:number,px:number,py:number,pz:number,material:StandardMaterial) => {
        const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene)
        mesh.parent=chapterLandmark;mesh.position.set(px,py,pz);mesh.material=material;mesh.receiveShadows=true
      }
      part('ruin-floor',7,.16,5,0,.08,0,stone)
      for(const side of [-1,1]){
        part('ruin-pillar',.65,4.6,.8,side*3,2.3,0,stone)
        part('ruin-carved-inlay',.08,3,.84,side*3,2.4,0,glow)
      }
      part('ruin-lintel',6.7,.65,.9,0,4.6,0,stone)
      part('relic-pedestal',1.3,.9,1.3,0,.55,0,stone)
      chapterRelic=MeshBuilder.CreatePolyhedron('ancient-command-key',{type:1,size:chapter===2?.5:.75},scene)
      chapterRelic.parent=chapterLandmark;chapterRelic.position.y=1.9;chapterRelic.material=glow
    }
    void buildEnvironment().then(() => { if (!scene.isDisposed) showChapterLandmarks(activeChapter) })
    showChapterLandmarks(activeChapter)
    /*
      PLAYER CHARACTERS
      Human sci-fi marine GLB with rigged idle and running animations.
      Procedural armor exists only as a fallback when the asset CDN fails.
    */
    // One GLB download feeds the whole lobby, so enemy/player instances
    // share textures and geometry while keeping independent skeletons.
    let marineContainer: Promise<AssetContainer> | null = null
    const marineAnimations = new Map<string, MarineAnimation>()
    const marineLoading = new Set<string>()
    const loadMarines = () => {
      if (!marineContainer) {
        marineContainer = loadFieldSquad(scene)
          .then(container => {
            if (!scene.isDisposed) setMarineAssetStatus('ready')
            return container
          })
          .catch(error => {
            if (!scene.isDisposed) setMarineAssetStatus('fallback')
            throw error
          })
      }
      return marineContainer
    }

    // Faction art must not insert static props into a skinned GLB.
    // The previous rigid head/chest/backpack geometry used guessed world-space
    // positions and rendered as a floating block above several soldiers.
    // Keep the full animated military mesh intact: change the *materials* of
    // each independent enemy instance instead of hanging objects on its rig.
    function equipOccupationMarine(
      _root: TransformNode,
      meshes: ReturnType<TransformNode['getChildMeshes']>,
      role: Role,
      id: string,
    ) {
      if (role !== 'Raider' && role !== 'Heavy' && role !== 'Commander') return

      // Enemy units have genuinely different uniforms and surfaces. Albedo
      // textures in the sample GLB bake its friendly tan uniform; merely
      // multiplying them by gray left the units looking almost identical.
      // Remove that tan base layer only on enemy material clones, retaining
      // original geometry, skeleton, normals and other detail textures.
      const commander = role === 'Commander'
      const heavy = role === 'Heavy'
      const uniform = commander
        ? new Color3(.16, .095, .095)
        : heavy
          ? new Color3(.105, .135, .17)
          : new Color3(.15, .17, .19)

      let index = 0
      for (const mesh of meshes) {
        const source = mesh.material
        if (!source) continue
        const assigned = source.clone(`occupation-uniform-${id}-${index++}`)
        if (!assigned) continue

        if (assigned instanceof PBRMaterial) {
          assigned.albedoColor = uniform.scale(2.8)
          assigned.metallic = heavy ? .48 : .34
          assigned.roughness = commander ? .54 : .7
          assigned.emissiveColor = Color3.Black()
          assigned.emissiveTexture = null
        } else if (assigned instanceof StandardMaterial) {
          assigned.diffuseColor = uniform.scale(2.8)
          assigned.specularColor = new Color3(.2, .22, .24)
          assigned.emissiveTexture = null
          assigned.emissiveColor = Color3.Black()
        }
        mesh.material = assigned
        // Subtle dark-red silhouette reinforcement, not an enormous outline.
        mesh.renderOutline = true
        mesh.outlineWidth = commander ? .024 : .015
        mesh.outlineColor = commander
          ? new Color3(.42, .1, .08)
          : new Color3(.22, .045, .035)
      }
    }

    async function createMarine(id: string, role: Role) {
      const container = await loadMarines()
      if (scene.isDisposed) return null
      const copy = container.instantiateModelsToScene(
        (name) => `${id}-${name}`,
        false,
        { doNotInstantiate: true },
      )
      const root = new TransformNode(`marine-${id}`, scene)
      for (const node of copy.rootNodes) node.parent = root

      // The Vanguard mesh is full-sized, human-proportioned (~2 metres).
      // It is animated and retains its authored PBR texture set.
      root.scaling.setAll(role === 'Commander' ? 1.24 : role === 'Heavy' ? 1.12 : 1)
      const lineage=currentPlayers.find(player=>player.id===id)?.species
      if(lineage==='Stoneborn')root.scaling.set(1.12,.86,1.12)
      else if(lineage==='Aelari')root.scaling.set(.94,1.06,.94)
      const allMeshes = root.getChildMeshes()
      for (const mesh of allMeshes) {
        mesh.isPickable = false
        mesh.receiveShadows = true
        shadowGenerator.addShadowCaster(mesh)
      }
      equipOccupationMarine(root, allMeshes, role, id)
      void addArmoredHelmet(scene,root).catch(error=>console.warn('Helmet unavailable',error))
      void addWorldServiceRifle(scene,root).then(gun=>gun?.getChildMeshes().forEach(mesh=>shadowGenerator.addShadowCaster(mesh))).catch(error=>console.warn('Unit weapon unavailable',error))
      const idle = copy.animationGroups.find(g => /^aim_idle$/i.test(g.name)) ?? copy.animationGroups.find(g => /^idle$/i.test(g.name))
      const walk = copy.animationGroups.find(g => /^aim_walk$/i.test(g.name)) ?? copy.animationGroups.find(g => /^walk$/i.test(g.name))
      const run = copy.animationGroups.find(g => /^aim_run$/i.test(g.name)) ?? copy.animationGroups.find(g => /^run$/i.test(g.name))
      for (const group of copy.animationGroups) group.stop()
      idle?.start(true)
      marineAnimations.set(id, { idle, walk, run, moving: false })

      // No neck-height ring. Distinction comes from the armored enemy
      // material and shape, not hovering billboard accessories.
      return root
    }
    function setMarineMoving(id: string, moving: boolean) {
      const animation = marineAnimations.get(id)
      if (!animation || animation.moving === moving) return
      animation.moving = moving
      if (moving) {
        animation.idle?.stop()
        ;(animation.run ?? animation.walk)?.start(true)
      } else {
        animation.walk?.stop()
        animation.run?.stop()
        animation.idle?.start(true)
      }
    }
    function registerCombatant(
      id: string, role: Role, x: number, y: number, alive: boolean,
      map: Map<string, CharacterVisual>,
    ) {
      // Spawn a working character immediately. Network asset loads may be slow,
      // blocked, or fail; they must never hold up FPS camera/input/game startup.
      if (map.has(id) || scene.isDisposed) return
      const placeholder = new TransformNode(`loading-unit-${id}`,scene)
      placeholder.position.set(sx(x), frontierHeight(sx(x),sz(y)), sz(y))
      const visual: CharacterVisual = {
        root: placeholder,
        model: placeholder,
        lastX: x,
        lastY: y,
        walkPhase: 0,
      }
      map.set(id, visual)
      placeholder.setEnabled(alive && !(id === localId && !commandModeRef.current))

      if (marineLoading.has(id)) return
      marineLoading.add(id)
      void createMarine(id, role).then(marine => {
        if (!marine || scene.isDisposed) return
        const active = map.get(id)
        if (!active || active.root !== placeholder) {
          marine.dispose()
          return
        }
        marine.position.copyFrom(placeholder.position)
        marine.rotation.copyFrom(placeholder.rotation)
        marine.setEnabled(placeholder.isEnabled())
        // Preserve the current position rather than returning to an old spawn.
        map.set(id, { ...active, root: marine, model: marine })
        placeholder.dispose()
      }).catch(error => {
        // Keep the fully functional local character if loading failed.
        if (!scene.isDisposed) {
          console.warn('Optional marine asset could not load; gameplay remains active.', error)
          setMarineAssetStatus('fallback')
        }
      }).finally(() => marineLoading.delete(id))
    }
    function createPlayer(player: Player) {
      registerCombatant(player.id, player.characterClass ?? 'Fighter',
        player.x, player.y, !player.downed, playerVisuals)
    }
    function createEnemy(enemy: Enemy) {
      registerCombatant(enemy.id, enemy.type,
        enemy.x, enemy.y, enemy.alive, enemyVisuals)
    }
    /*
      RESOURCE NODES
    */
    function createResource(node:ResourceNode) {
      if(resourceVisuals.has(node.id))return
      resourceVisuals.set(node.id,buildOreDeposit(scene,node.id,node.type,sx(node.x),sz(node.y)))
    }
    async function createBuilding(building:Building) {
      if(buildingVisuals.has(building.id))return
      const visual=buildFieldStructure(scene,building.type,sx(building.x),sz(building.y))
      visual.getChildMeshes().forEach(mesh=>{shadowGenerator.addShadowCaster(mesh);mesh.receiveShadows=true})
      buildingVisuals.set(building.id,visual)
    }
    /*
      INITIAL ENTITIES
    */
    currentPlayers.forEach(
      (player) => {
        void createPlayer(
          player,
        )
      },
    )
    currentEnemies.forEach(
      (enemy) => {
        void createEnemy(
          enemy,
        )
      },
    )
    currentNodes.forEach(
      createResource,
    )
    currentBuildings.forEach(
      (building) => {
        void createBuilding(
          building,
        )
      },
    )
    /*
      AIM
    */
    function getAimDirection() {
      const direction =
        fpsCamera
          .getForwardRay()
          .direction
          .clone()
      direction.y = 0
      direction.normalize()
      return {
        x:
          direction.x,
        y:
          direction.z,
      }
    }
    function fire() {
      if (combatPaused.current || !socket.connected) return
      const role = currentPlayers.find(p => p.id === localId)?.characterClass
      const cadence = role === 'Monk' ? 200 : role === 'Cleric' ? 360 : role === 'Wizard' ? 600 : 250
      if (performance.now() - lastLocalShot < cadence) return
      lastLocalShot = performance.now()
      audio.play('shot')
      if (
        commandModeRef.current
      ) {
        return
      }
      weaponKick = .035
      flashTime = performance.now()+70
      fpsFlash.setEnabled(true)
      const aim =
        getAimDirection()
      socket.emit(
        'attack',
        {
          roomCode:
            room.code,
          aimX:
            aim.x,
          aimY:
            aim.y,
          aimElevation: fpsCamera.getForwardRay().direction.y,
        },
      )
    }
    attackRef.current =
      fire
    abilityRef.current =
      () => {
        if (
          commandModeRef.current
        ) {
          return
        }
        socket.emit(
          'use-ability',
          room.code,
        )
      }
    interactRef.current =
      () => {
        if (
          commandModeRef.current
        ) {
          return
        }
        socket.emit(
          'interact',
          room.code,
        )
      }
    // M and the MINE button toggle continuous extraction. Mining is unlimited;
    // the server checks distance independently on every completed extraction.
    mineRef.current = () => {
      if (miningEnabled) {
        stopMining('MINING STOPPED · PRESS M TO RESUME')
        return
      }

      const player = currentPlayers.find((candidate) => candidate.id === localId)
      if (!player) {
        showMiningMessage('Waiting for your player position.')
        return
      }

      const node = [...currentNodes]
        .sort((a, b) =>
          Math.hypot(a.x - player.x, a.y - player.y) -
          Math.hypot(b.x - player.x, b.y - player.y),
        )[0]

      if (!node) {
        showMiningMessage('No mining stations in this level.')
        return
      }

      const distance = Math.hypot(node.x - player.x, node.y - player.y)
      if (distance > MINE_RANGE) {
        showMiningMessage(
          `Move closer to ${node.type.toUpperCase()} (${Math.ceil(distance * SCALE)}m away).`,
        )
        return
      }

      miningEnabled = true
      miningElapsed = 0
      miningRequestPending = false
      miningSession++
      currentMiningNodeId = node.id
      miningLastFrame = performance.now()
      lastMiningPercent = 0
      setMiningProgress(0)
      setMiningActive(true)
      showMiningMessage(`EXTRACTING ${node.type.toUpperCase()} · UNLIMITED`)
    }
    /*
      CONTROLS
    */
    const keys=inputState.keys
    function keyDown(
      event: KeyboardEvent,
    ) {
      if (combatPaused.current || event.ctrlKey || event.altKey || event.metaKey) return
      if (!commandModeRef.current &&
        ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) {
        event.preventDefault()
      }
      switch (
        event.code
      ) {
        case 'KeyW':
          keys.w = true
          break
        case 'KeyA':
          keys.a = true
          break
        case 'KeyS':
          keys.s = true
          break
        case 'KeyD':
          keys.d = true
          break
        case 'Space':
          if (!keys.space) {
            keys.space =
              true
            event.preventDefault()
            fire()
          }
          break
        case 'KeyQ':
          abilityRef.current?.()
          break
        case 'KeyE':
          interactRef.current?.()
          break
        case 'KeyM':
          event.preventDefault()
          if (!event.repeat) mineRef.current?.() // Toggle continuous mining once.
          break
      }
    }
    function keyUp(
      event: KeyboardEvent,
    ) {
      switch (
        event.code
      ) {
        case 'KeyW':
          keys.w = false
          break
        case 'KeyA':
          keys.a = false
          break
        case 'KeyS':
          keys.s = false
          break
        case 'KeyD':
          keys.d = false
          break
        case 'Space':
          keys.space = false
          break
      }
    }
    document.addEventListener('keydown', keyDown, true)
    document.addEventListener('keyup', keyUp, true)
    // The editor's embedded browser can steal WASD before it reaches the page.
    // This status shows whether events reach our document, and if server input
    // is available. It is intentionally updated outside React's render loop.
    let lastKeyboardAt = 0
    const markKeyboardActivity = (event: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) lastKeyboardAt = performance.now()
    }
    document.addEventListener('keydown', markKeyboardActivity, true)
    // Clear held keys when the browser loses focus; avoids stuck movement.
    const clearMovementKeys = () => {
      keys.w = false
      keys.a = false
      keys.s = false
      keys.d = false
      keys.space = false
    }
    window.addEventListener('blur', clearMovementKeys)
    const handleTouch = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (combatPaused.current || commandModeRef.current) return
      if (typeof detail.lookX === 'number') applyLookDelta(detail.lookX * 1.8, detail.lookY * 1.8)
      if (detail.key === 'fire') { triggerHeld = detail.down; if (detail.down) fire() }
      if (['w','a','s','d'].includes(detail.key)) keys[detail.key as 'w'|'a'|'s'|'d'] = Boolean(detail.down)
      if (detail.action === 'interact') interactRef.current?.()
      if (detail.action === 'ability') abilityRef.current?.()
      if (detail.action === 'mine') mineRef.current?.()
    }
    window.addEventListener('kyrevant-touch', handleTouch)

    /*
      HALO COMBAT VIEW
      vs.
      STARCRAFT COMMAND VIEW
    */
    function enterCommandMode() {
      commandModeRef.current = true
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock()
      }
      mouseSessionActive = false
      hasCapturedClick = false
      cursorReleased = true
      lastClientX = null
      lastClientY = null
      setMouseStatus('released')
      scene.activeCamera = camera
      fpsWeapon.setEnabled(false)
      camera.radius = 35
      camera.beta = 0.42
      camera.attachControl(canvas, true)
      playerVisuals.get(localId)?.root.setEnabled(true)
      setCommandMode(true)
    }
    function exitCommandMode() {
      commandModeRef.current = false
      selectedBuildingRef.current = null
      mouseSessionActive = false
      hasCapturedClick = false
      cursorReleased = false
      lastClientX = null
      lastClientY = null
      setMouseStatus('ready')
      camera.detachControl()
      scene.activeCamera = fpsCamera
      fpsWeapon.setEnabled(true)
      playerVisuals.get(localId)?.root.setEnabled(false)
      setCommandMode(false)
      setSelectedBuilding(null)
    }
    const commandEvent =
      (
        event: Event,
      ) => {
        const customEvent =
          event as CustomEvent<{
            building:
              BuildingType
          }>
        selectedBuildingRef.current =
          customEvent.detail
            .building
        enterCommandMode()
      }
    const cancelCommandEvent =
      () => {
        exitCommandMode()
      }
    window.addEventListener(
      'kyrevant-command-mode',
      commandEvent,
    )
    window.addEventListener(
      'kyrevant-cancel-command',
      cancelCommandEvent,
    )
    /*
      BUILD PLACEMENT
    */
    scene.onPointerObservable.add(
      (pointerInfo) => {
        if (
          pointerInfo.type !==
          PointerEventTypes.POINTERDOWN
        ) {
          return
        }
        if (
          !commandModeRef.current
        ) {
          return
        }
        const building =
          selectedBuildingRef.current
        if (!building) {
          return
        }
        const pick =
          scene.pick(
            scene.pointerX,
            scene.pointerY,
            (mesh) =>
              mesh.name ===
              'kyrevant-ground',
          )
        if (
          !pick?.hit ||
          !pick.pickedPoint
        ) {
          return
        }
        socket.emit(
          'build-structure',
          {
            roomCode:
              room.code,
            type:
              building,
            x:
              pick.pickedPoint.x /
              SCALE,
            y:
              pick.pickedPoint.z /
              SCALE,
          },
        )
        exitCommandMode()
      },
    )
    /*
      PROJECTILE VISUALS
    */
    // Align the Y axis of a cylinder/cone with the shot trajectory.
    // Geometry is purely cosmetic: the server still decides every hit.
    const aimEffectAlong = (mesh: Mesh, direction: Vector3) => {
      const forward = direction.normalizeToNew()
      const axis = Vector3.Cross(Vector3.Up(), forward)
      const dot = Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Up(), forward)))
      mesh.rotationQuaternion = axis.lengthSquared() > 0.000001
        ? Quaternion.RotationAxis(axis.normalize(), Math.acos(dot))
        : Quaternion.RotationAxis(Vector3.Right(), dot < 0 ? Math.PI : 0)
    }

    function showImpact(position: Vector3, hostile: boolean) {
      const color = hostile ? new Color3(1, .28, .15) : new Color3(.58, .84, 1)
      // Tiny hot core and brief sparks instead of a large floating projectile.
      const hit = MeshBuilder.CreateSphere(
        `hit-${Date.now()}`, { diameter: .085, segments: 8 }, scene,
      )
      hit.position.copyFrom(position)
      hit.material = hostile ? hostileProjectileMaterial : friendlyProjectileMaterial
      hit.isPickable = false
      const sparks = [] as ReturnType<typeof MeshBuilder.CreateLines>[]
      for (let i = 0; i < 5; i++) {
        const theta = (Math.PI * 2 * i) / 5
        const away = new Vector3(Math.cos(theta) * .22, .09 + (i % 2) * .09, Math.sin(theta) * .22)
        const spark = MeshBuilder.CreateLines(
          `spark-${Date.now()}-${i}`,
          { points: [position, position.add(away)] }, scene,
        )
        spark.color = color
        spark.isPickable = false
        sparks.push(spark)
      }
      window.setTimeout(() => {
        if (!hit.isDisposed()) hit.dispose()
        sparks.forEach(spark => { if (!spark.isDisposed()) spark.dispose() })
      }, 95)
    }

    function animateProjectile(
      start: Vector3,
      end: Vector3,
      hostile = false,
      confirmedHit = false,
    ) {
      const path = end.subtract(start)
      const distance = path.length()
      if (distance < 0.03) return
      const forward = path.scale(1 / distance)
      const beamLength = Math.min(1.35, Math.max(0.28, distance * .14))
      // A slim, rapidly travelling tracer; NO spherical BB projectiles.
      const tracer = MeshBuilder.CreateCylinder(
        `tracer-${Date.now()}-${Math.random()}`,
        { height: beamLength, diameter: hostile ? .026 : .018, tessellation: 6 },
        scene,
      )
      tracer.material = hostile ? hostileProjectileMaterial : friendlyProjectileMaterial
      tracer.isPickable = false
      aimEffectAlong(tracer, forward)
      let distanceTraveled = 0
      const observer = scene.onBeforeRenderObservable.add(() => {
        // Cosmetic travel speed, in world metres/second.
        distanceTraveled = Math.min(distance, distanceTraveled + engine.getDeltaTime() * .082)
        tracer.position.copyFrom(start.add(forward.scale(distanceTraveled)))
        if (distanceTraveled >= distance) {
          scene.onBeforeRenderObservable.remove(observer)
          tracer.dispose()
          if (confirmedHit) showImpact(end, hostile)
        }
      })
    }

    function muzzleFlash(position: Vector3, hostile = false) {
      const flash = MeshBuilder.CreateCylinder(
        `muzzle-${Date.now()}-${Math.random()}`,
        { height: .3, diameterTop: 0, diameterBottom: .13, tessellation: 8 },
        scene,
      )
      flash.position.copyFrom(position)
      flash.material = hostile ? hostileProjectileMaterial : friendlyProjectileMaterial
      flash.isPickable = false
      const fwd = fpsCamera.getForwardRay().direction.clone()
      aimEffectAlong(flash, fwd.lengthSquared() > .00001 ? fwd : Vector3.Forward())
      window.setTimeout(() => { if (!flash.isDisposed()) flash.dispose() }, 52)
    }
    /*
      PLAYER UPDATES
    */
    function updatePlayers(
      updated: Player[],
    ) {
      currentPlayers =
        [...updated]
      setPlayers(updated)
      updated.forEach(
        (player) => {
          const visual =
            playerVisuals.get(
              player.id,
            )
          if (!visual) {
            void createPlayer(
              player,
            )
            return
          }
          visual.lastX =
            visual.root.position.x
          visual.lastY =
            visual.root.position.z
          visual.root.position.set(
            sx(player.x),
            frontierHeight(sx(player.x),sz(player.y)),
            sz(player.y),
          )
          setMarineMoving(player.id,
            Math.hypot(visual.root.position.x - visual.lastX,
                       visual.root.position.z - visual.lastY) > 0.002)
          /*
            Orient the full astronaut,
            including its built-in pistol.
          */
          visual.root.rotation.y =
            Math.atan2(
              player.facingX,
              player.facingY,
            ) +
            Math.PI
          if (
            player.downed
          ) {
            visual.root.rotation.z =
              Math.PI / 2
          } else {
            visual.root.rotation.z =
              0
          }
        },
      )
    }
    /*
      ENEMY UPDATES
    */
    function updateEnemies(
      updated: Enemy[],
    ) {
      currentEnemies =
        [...updated]
      setEnemies(updated)
      updated.forEach(
        (enemy) => {
          const visual =
            enemyVisuals.get(
              enemy.id,
            )
          if (!visual) {
            void createEnemy(
              enemy,
            )
            return
          }
          const oldPosition =
            visual.root.position.clone()
          visual.root.position.set(
            sx(enemy.x),
            frontierHeight(sx(enemy.x),sz(enemy.y)),
            sz(enemy.y),
          )
          /*
            Point moving enemies in the
            direction they are travelling.
          */
          const movement =
            visual.root.position
              .subtract(
                oldPosition,
              )
          setMarineMoving(enemy.id, movement.length() > 0.002)
          if (
            movement.length() >
            0.005
          ) {
            visual.root.rotation.y =
              Math.atan2(
                movement.x,
                movement.z,
              ) +
              Math.PI
          }
          visual.root.setEnabled(
            enemy.alive,
          )
        },
      )
    }
    /*
      RESOURCE UPDATES
    */
    function updateResources(
      data: {
        economy: Economy
        nodes:
          ResourceNode[]
      },
    ) {
      currentNodes =
        [...data.nodes]
      setEconomy(
        data.economy,
      )
      data.nodes.forEach(
        (node) => {
          if (
            !resourceVisuals.has(
              node.id,
            )
          ) {
            createResource(
              node,
            )
          }
          const visual =
            resourceVisuals.get(
              node.id,
            )
          // Stations never disappear from mining; the server does not deplete them.
          visual?.setEnabled(true)
        },
      )
    }
    /*
      BUILDING UPDATES
    */
    function updateBuildings(
      updated: Building[],
    ) {
      currentBuildings =
        [...updated]
      updated.forEach(
        (building) => {
          void createBuilding(
            building,
          )
        },
      )
    }
    /*
      PLAYER ATTACK VISUAL
    */
    function handleAttack(
      result: AttackResult,
    ) {
      if (result.playerId === localId && result.targetId) { setHitAt(performance.now());audio.play('hit') }
      const attacker =
        playerVisuals.get(
          result.playerId,
        )
      if (!attacker) {
        return
      }
      const forward =
        new Vector3(
          result.aimX,
          0,
          result.aimY,
        )
      /*
        The pistol is already part of the
        character model. Projectile begins
        around hand / weapon height.
      */
      const start =
        attacker.root.position.add(
          new Vector3(
            forward.x * 0.45,
            1.3,
            forward.z * 0.45,
          ),
        )
      let end =
        start.add(
          forward.scale(
            10,
          ),
        )
      if (
        result.targetId
      ) {
        const target =
          enemyVisuals.get(
            result.targetId,
          )
        if (target) {
          end =
            target.root.position.add(
              new Vector3(
                0,
                1.15,
                0,
              ),
            )
        }
      }
      muzzleFlash(
        start,
        false,
      )
      animateProjectile(
        start,
        end,
        false,
        Boolean(result.targetId),
      )
      /*
        Small recoil on whole upper model
        rather than creating a separate gun.
      */
      attacker.model.rotation.x =
        -0.035
      window.setTimeout(
        () => {
          attacker.model.rotation.x =
            0
        },
        70,
      )
    }
    /*
      ENEMY FIRE VISUAL
    */
    function handleEnemyAttack(
      attack: EnemyAttack,
    ) {
      if(attack.targetId===localId)audio.play('hurt')
      const start =
        new Vector3(
          sx(attack.startX),
          1.15+frontierHeight(sx(attack.startX),sz(attack.startY)),
          sz(attack.startY),
        )
      const end =
        new Vector3(
          sx(attack.targetX),
          1.2+frontierHeight(sx(attack.targetX),sz(attack.targetY)),
          sz(attack.targetY),
        )
      muzzleFlash(
        start,
        true,
      )
      animateProjectile(
        start,
        end,
        true,
        true,
      )
    }
    function handleTurretAttack(attack:EnemyAttack){
      const turret=buildingVisuals.get(attack.enemyId)
      if(turret)turret.rotation.y=Math.atan2(attack.targetX-attack.startX,attack.targetY-attack.startY)
      const start=new Vector3(sx(attack.startX),frontierHeight(sx(attack.startX),sz(attack.startY))+1.3,sz(attack.startY))
      const end=new Vector3(sx(attack.targetX),frontierHeight(sx(attack.targetX),sz(attack.targetY))+1.2,sz(attack.targetY))
      muzzleFlash(start,false);animateProjectile(start,end,false,true)
    }
    /*
      LEVEL TRANSITION
    */
    function handleLevelStarted(
      nextRoom: Room,
    ) {
      setVictory(false)
      setDialogue(null)
      setChapterStatus(null)
      setMiningFeedback('')
      setNearestMiningTarget(null)
      const nextLevel =
        nextRoom.level ??
        1
      activeChapter = nextLevel
      showChapterLandmarks(nextLevel)
      if (nextLevel > 1) setDialogue({site:'briefing',speaker:'CAPTAIN VALE / SECURE CHANNEL',title:nextLevel===2?'INTO THE FRONTIER':'THE CITADEL',lines:nextLevel===2?[
        'The rescued citizens are safe at the refuge. Jonah brought us a map: the militia is searching the northern ruins for a command key.',
        'Establish a forward base with a Barracks and Power Core. Recover the key from the marked ruin and defeat their frontier commander. The key will open the Citadel.'
      ]:[
        'The command key worked. Beneath the Citadel, the militia is using an ancient network to track every settlement on Kyrevant.',
        'Build an assault base of at least three structures. Activate the marked command core, then defeat the militia commander. Shut down their hold on this world.'
      ],choices:[{id:'leave',label:'Understood — begin the operation'}]})
      setLevel(
        nextLevel,
      )
      setQuests(
        nextRoom.quests ?? [],
      )
      setEconomy(
        nextRoom.economy ?? {
          minerals: 0,
          energy: 0,
        },
      )
      currentPlayers =
        [...nextRoom.players]
      currentEnemies =
        [...nextRoom.enemies]
      currentNodes =
        [
          ...(nextRoom.resourceNodes ??
            []),
        ]
      currentBuildings =
        [
          ...(nextRoom.buildings ??
            []),
        ]
      enemyVisuals.forEach(
        (visual) => {
          visual.root.dispose()
        },
      )
      enemyVisuals.clear()
      resourceVisuals.forEach(
        (visual) => {
          visual.dispose()
        },
      )
      resourceVisuals.clear()
      buildingVisuals.forEach(
        (visual) => {
          visual.dispose()
        },
      )
      buildingVisuals.clear()
      currentPlayers.forEach(
        (player) => {
          if (
            !playerVisuals.has(
              player.id,
            )
          ) {
            void createPlayer(
              player,
            )
          }
        },
      )
      currentEnemies.forEach(
        (enemy) => {
          void createEnemy(
            enemy,
          )
        },
      )
      currentNodes.forEach(
        createResource,
      )
      currentBuildings.forEach(
        (building) => {
          void createBuilding(
            building,
          )
        },
      )
      if (
        nextLevel === 1
      ) {
        setAnnouncement(
          'THE FALL',
        )
      } else if (
        nextLevel === 2
      ) {
        setAnnouncement(
          'INTO THE FRONTIER',
        )
      } else {
        setAnnouncement(
          'BENEATH THE SURFACE',
        )
      }
    }
    const onDialogue = (value: GameDialogue) => {
      triggerHeld = false
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      setDialogue(value)
    }
    const onChapter = (value: ChapterStatus) => setChapterStatus(value)
    const onProgress = (message: string) => setProgressMessage(message)
    const onDefense = (value: {wave: number; total: number; status: string}) => {
      setProgressMessage(`DEFENSE ${value.wave}/${value.total} · ${value.status.toUpperCase()}`)
      if (value.status === 'active') frontierSetPiece?.beginWave(value.wave)
    }
    socket.on('kyrevant-dialogue', onDialogue)
    socket.on('turret-attack',handleTurretAttack)
    const onUplink=(value:{active:boolean;progress:number;operators:number;message:string})=>setUplink(value)
    socket.on('kyrevant-uplink',onUplink)
    socket.on('kyrevant-chapter-state', onChapter)
    socket.on('kyrevant-progression', onProgress)
    socket.on('kyrevant-defense-state', onDefense)
    /* SOCKET EVENTS */
    socket.on(
      'player-positions',
      updatePlayers,
    )
    socket.on(
      'player-state',
      updatePlayers,
    )
    socket.on(
      'enemy-state',
      updateEnemies,
    )
    socket.on(
      'resource-state',
      updateResources,
    )
    socket.on(
      'building-state',
      updateBuildings,
    )
    socket.on(
      'quest-state',
      (
        updated:
          QuestObjective[],
      ) => {
        setQuests(updated)
        chapterRelicRecovered = updated.some(q => (q.id === 'recover-artifact' || q.id === 'activate-citadel-core') && q.complete)
        if (updated.some(q => q.id === 'recover-flight-log' && q.complete))
          frontierSetPiece?.confirmUplink()
        if (updated.some(q => q.id === 'rescue-civilians' && q.complete))
          frontierSetPiece?.confirmRescue()
      },
    )
    socket.on(
      'attack-result',
      handleAttack,
    )
    socket.on(
      'enemy-attack',
      handleEnemyAttack,
    )
    socket.on(
      'level-started',
      handleLevelStarted,
    )
    socket.on(
      'story-event',
      (message: string) => {
        setAnnouncement(
          message,
        )
      },
    )
    socket.on(
      'level-complete',
      (
        completedLevel:
          number,
      ) => {
        setAnnouncement(
          `LEVEL ${completedLevel} COMPLETE`,
        )
      },
    )
    socket.on(
      'build-denied',
      (message: string) => {
        setAnnouncement(
          message,
        )
        exitCommandMode()
      },
    )
    socket.on(
      'game-won',
      () => {
        setVictory(true)
        setAnnouncement(
          'KYREVANT',
        )
      },
    )
    /*
      GAME LOOP
    */
    let lastMove =
      performance.now()
    let lastNearbyNode = ''
    let lastNearestInfo = ''
    scene.onBeforeRenderObservable.add(
      () => {
        if (triggerHeld && !commandModeRef.current && !combatPaused.current) fire()
        if (combatPaused.current || !socket.connected) { clearMovementKeys();triggerHeld=false }
        if(chapterRelic && !chapterRelic.isDisposed()) {
          chapterRelic.rotation.y += engine.getDeltaTime()*.0006
          chapterRelic.position.y=1.9+Math.sin(performance.now()*.0015)*.13
          if(chapterRelicLight)chapterRelicLight.emissiveColor=Color3.FromHexString(chapterRelicRecovered?'#347947':activeChapter===2?'#327d79':'#805a25')
        }
        weaponKick=Math.max(0,weaponKick-engine.getDeltaTime()*.00075)
        fpsWeapon.position.z=.55-weaponKick
        fpsWeapon.position.y=-.16+Math.sin(performance.now()*.004)*.006
        if(flashTime>0 && performance.now()>flashTime){ fpsFlash.setEnabled(false);flashTime=0 }
        const local =
          currentPlayers.find(
            (player) =>
              player.id ===
              localId,
          )
        /*
          CAMERA FOLLOW: player position is server authoritative.
          It works even when the player model is still loading.
        */
        if (local) {
          const position = new Vector3(sx(local.x), frontierHeight(sx(local.x),sz(local.y)), sz(local.y))
          if (commandModeRef.current) {
            camera.setTarget(position)
          } else {
            const eye=position.add(new Vector3(0,1.65,0))
            if(Vector3.DistanceSquared(fpsCamera.position,eye)>64)fpsCamera.position.copyFrom(eye)
            else Vector3.LerpToRef(fpsCamera.position,eye,1-Math.exp(-Math.min(engine.getDeltaTime(),100)*.025),fpsCamera.position)
          }
        }
        // Keep the dusk dome centered on the current camera in every game mode.
        if(scene.activeCamera) sky.position.copyFrom(scene.activeCamera.position)
        /*
          RESOURCE PROXIMITY — same check for prompt, button, and M key.
        */
        if (local) {
          const node = currentNodes
            .sort((a, b) =>
              Math.hypot(a.x - local.x, a.y - local.y) -
              Math.hypot(b.x - local.x, b.y - local.y),
            )[0]
          const distance = node
            ? Math.hypot(node.x - local.x, node.y - local.y)
            : Infinity
          const nearby = node && distance <= MINE_RANGE ? node : undefined
          const nearbyId = nearby?.id ?? ''
          if (nearbyId !== lastNearbyNode) {
            lastNearbyNode = nearbyId
            setNearbyResource(nearby)
          }
          const nearestInfo = node ? `${node.id}:${Math.ceil(distance * SCALE)}` : ''
          if (nearestInfo !== lastNearestInfo) {
            lastNearestInfo = nearestInfo
            setNearestMiningTarget(
              node ? { type: node.type, distance: Math.ceil(distance * SCALE) } : null,
            )
          }
        }
        /*
          CONTINUOUS MINING — the progress bar is tied to actual extraction
          requests. Movement, aiming and shooting remain independent.
        */
        const miningNow = performance.now()
        const miningFrameDelta = Math.max(0, Math.min(100, miningNow - miningLastFrame))
        miningLastFrame = miningNow

        if (miningEnabled) {
          const player = local
          const miningNode = player
            ? [...currentNodes]
                .sort((a, b) =>
                  Math.hypot(a.x - player.x, a.y - player.y) -
                  Math.hypot(b.x - player.x, b.y - player.y),
                )[0]
            : undefined

          if (!player || !miningNode ||
              Math.hypot(miningNode.x - player.x, miningNode.y - player.y) > MINE_RANGE) {
            stopMining('OUT OF RANGE · MINING STOPPED')
          } else if (!miningRequestPending) {
            // A new nearby node is allowed, but always requires a complete cycle.
            if (currentMiningNodeId !== miningNode.id) {
              currentMiningNodeId = miningNode.id
              miningElapsed = 0
              lastMiningPercent = -1
            }

            miningElapsed = Math.min(MINING_CYCLE_MS, miningElapsed + miningFrameDelta)
            const percent = Math.floor((miningElapsed / MINING_CYCLE_MS) * 100)
            if (percent !== lastMiningPercent) {
              lastMiningPercent = percent
              setMiningProgress(percent)
            }

            if (miningElapsed >= MINING_CYCLE_MS) {
              miningRequestPending = true
              const session = miningSession
              socket.timeout(4000).emit(
                'mine-resource',
                { roomCode: room.code, nodeId: miningNode.id },
                (
                  error: Error | null,
                  result: {
                    success: boolean
                    amount?: number
                    type?: ResourceNode['type']
                    total?: number
                    message?: string
                  },
                ) => {
                  if (miningUnmounted || session !== miningSession) return
                  miningRequestPending = false
                  if (error) {
                    stopMining('MINING CONNECTION TIMEOUT · PRESS M TO RETRY')
                    return
                  }
                  if (!result?.success) {
                    stopMining(result?.message ?? 'Mining failed. Check your distance.')
                    return
                  }
                  miningElapsed = 0
                  lastMiningPercent = 0
                  setMiningProgress(0)
                  showMiningMessage(
                    `+${result.amount ?? 20} ${(result.type ?? miningNode.type).toUpperCase()} · TOTAL ${result.total ?? '—'} · MINING...`,
                  )
                },
              )
            }
          }
        }

        if (
          commandModeRef.current
        ) {
          return
        }
        // Input movement is handled by a standalone 50ms timer below.
        // A shader / model render failure must not block player movement.
      },
    )

    const movementInterval = window.setInterval(() => {
      const now = performance.now()
      const vertical = Number(keys.w) - Number(keys.s)
      const horizontal = Number(keys.d) - Number(keys.a)
      showInputDebug(
        `MOUSE: ${isMouseLocked() ? 'LOCKED' : cursorReleased ? 'RELEASED' : 'HOVER/CLICK'} | ` +
        `WASD: ${vertical !== 0 || horizontal !== 0 ? 'MOVING' : now - lastKeyboardAt < 1600 ? 'DETECTED' : 'WAITING'} | ` +
        `SERVER: ${socket.connected ? 'ONLINE' : 'OFFLINE'} | HEADING: ${fpsCamera.rotation.y.toFixed(3)} | PITCH: ${fpsCamera.rotation.x.toFixed(3)}`,
      )
      if (combatPaused.current || commandModeRef.current || !socket.connected) return
      if (now - lastMove < 45) return
      if (vertical === 0 && horizontal === 0) return
      const movement=inputState.movement()
      socket.emit('move-player', {
        roomCode: room.code,
        dx: movement.x,
        dy: movement.z,
      })
      lastMove = now
    }, 50)
    /*
      RENDER
    */
    let renderErrorReported = false
    engine.runRenderLoop(() => {
      try {
        scene.render()
      } catch (error) {
        if (!renderErrorReported) {
          renderErrorReported = true
          console.error('KYREVANT RENDER ERROR (controls remain active):', error)
          setMouseStatus('fallback')
        }
      }
    })
    const resize =
      () => {
        engine.resize()
      }
    window.addEventListener(
      'resize',
      resize,
    )
    /*
      CLEANUP
    */
    return () => {
      window.clearInterval(movementInterval)
      miningUnmounted = true
      window.clearTimeout(miningMessageTimer)
      mineRef.current = null
      document.removeEventListener('keydown', keyDown, true)
      document.removeEventListener('keyup', keyUp, true)
      document.removeEventListener('keydown', markKeyboardActivity, true)
      inputDebug.remove()
      window.removeEventListener(
        'resize',
        resize,
      )
      camera.detachControl()
      window.removeEventListener('mouseup', releaseTrigger)
      window.removeEventListener('kyrevant-touch', handleTouch)
      window.removeEventListener('blur', releaseTrigger)
      canvas.removeEventListener('mousedown', captureMouse)
      canvas.removeEventListener('click', resumeMouseLook)
      window.removeEventListener(lookMoveEvent, handleMouseMove)
      window.removeEventListener('keydown', releaseCursor)
      window.removeEventListener('blur', clearMovementKeys)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      document.removeEventListener('pointerlockerror', handlePointerLockError)
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock()
      }
      window.removeEventListener(
        'kyrevant-command-mode',
        commandEvent,
      )
      window.removeEventListener(
        'kyrevant-cancel-command',
        cancelCommandEvent,
      )
      socket.off(
        'player-positions',
        updatePlayers,
      )
      socket.off(
        'player-state',
        updatePlayers,
      )
      socket.off(
        'enemy-state',
        updateEnemies,
      )
      socket.off(
        'resource-state',
        updateResources,
      )
      socket.off(
        'building-state',
        updateBuildings,
      )
      socket.off(
        'attack-result',
        handleAttack,
      )
      socket.off(
        'enemy-attack',
        handleEnemyAttack,
      )
      socket.off('kyrevant-dialogue', onDialogue)
      socket.off('turret-attack',handleTurretAttack)
      socket.off('kyrevant-uplink', onUplink)
      socket.off('kyrevant-chapter-state', onChapter)
      socket.off('kyrevant-progression', onProgress)
      socket.off('kyrevant-defense-state', onDefense)
      socket.off(
        'level-started',
        handleLevelStarted,
      )
      levelVisuals.forEach(
        (visual) => {
          visual.dispose()
        },
      )
      audio.dispose()
      soundRef.current=null
      chapterLandmark?.dispose()
      scene.dispose()
      engine.dispose()
    }
  }, [
    room.code,
    socket,
    localId,
  ])
  function chooseBuilding(
    building:
      BuildingType,
  ) {
    if(combatPaused.current)return
    selectedBuildingRef.current =
      building
    setSelectedBuilding(
      building,
    )
    setCommandMode(
      true,
    )
    window.dispatchEvent(
      new CustomEvent(
        'kyrevant-command-mode',
        {
          detail: {
            building,
          },
        },
      ),
    )
  }
  function cancelCommandMode() {
    selectedBuildingRef.current =
      null
    setSelectedBuilding(
      null,
    )
    setCommandMode(
      false,
    )
    window.dispatchEvent(
      new Event(
        'kyrevant-cancel-command',
      ),
    )
  }
  const livingEnemies =
    enemies.filter(
      (enemy) =>
        enemy.alive,
    ).length
  const abilityName =
    localPlayer
      ?.characterClass ===
    'Fighter'
      ? 'GRENADE'
      : localPlayer
            ?.characterClass ===
          'Monk'
        ? 'DASH STRIKE'
        : localPlayer
              ?.characterClass ===
            'Cleric'
          ? 'HEAL PULSE'
          : 'ARCANE BLAST'
  // The first unfinished story objective identifies a real in-world interaction.
  const storyTarget = level === 1
    ? KYREVANT_STORY_SITES.find(site => quests.some(quest => quest.id === site.quest && !quest.complete))
      ?? (!quests.find(q=>q.id==='defeat-commander')?.complete ? {name:'OCCUPATION COMMANDER',x:2130,y:420,radius:155} : undefined)
    : level === 2
      ? !quests.find(q=>q.id==='recover-artifact')?.complete
        ? {name:'NORTHERN RUIN / COMMAND KEY',x:1850,y:320,radius:140}
        : {name:'FRONTIER COMMANDER',x:2240,y:360,radius:140}
      : !quests.find(q=>q.id==='activate-citadel-core')?.complete
        ? {name:'CITADEL / COMMAND CORE',x:1970,y:330,radius:140}
        : {name:'MILITIA COMMANDER',x:2240,y:300,radius:140}
  const storyDistance = storyTarget && localPlayer
    ? Math.hypot(localPlayer.x - storyTarget.x,
                 localPlayer.y - storyTarget.y)
    : Infinity

  return (
    <div className={`kyrevant-game immersive-hud ${commandMode ? "is-command" : ""}`}>
      {showArrival && <Arrival onComplete={() => setShowArrival(false)} />}

 
      <header className="battle-hud">
        <div className="world-build-id" title={marineAssetStatus === 'ready' ? 'Squad systems ready' : 'Squad systems initializing'}>KYREVANT // STRANDED UNIT</div>
        <div>
          <span>
            KYREVANT
          </span>
          <strong>
            LEVEL {level}
          </strong>
        </div>
        <div>
          <span>
            MINERALS
          </span>
          <strong>
            {economy.minerals}
          </strong>
        </div>
        <div>
          <span>
            ENERGY
          </span>
          <strong>
            {economy.energy}
          </strong>
        </div>
        <div>
          <span>
            HOSTILES
          </span>
          <strong>
            {livingEnemies}
          </strong>
        </div>
        <div className="player-bars">
          <label>
            SHIELD
          </label>
          <div className="stat-bar">
            <div
              className="shield-bar"
              style={{
                width: `${
                  Math.round((localPlayer?.shield ?? 100) / (localPlayer?.maxShield ?? 100) * 100)
                }%`,
              }}
            />
          </div>
          <label>
            HEALTH
          </label>
          <div className="stat-bar">
            <div
              className="health-bar"
              style={{
                width: `${
                  Math.round((localPlayer?.health ?? 100) / (localPlayer?.maxHealth ?? 100) * 100)
                }%`,
              }}
            />
          </div>
        </div>
      </header>
      <div className="game-window">
        {!showArrival && !dialogue && !commandMode && !victory && <TouchControls />}
        {!showArrival && (equipmentStatus!=='ready' || marineAssetStatus!=='ready') && <div className="equipment-status" role="status">{equipmentStatus==='loading'||marineAssetStatus==='loading'?'Preparing squad equipment…':'Equipment could not load. Reload to retry.'}</div>}
        {!commandMode && hitAt > 0 && <div key={hitAt} className="combat-hit-marker" aria-hidden="true">×</div>}
        <canvas
          ref={canvasRef}
          className="game-canvas"
          tabIndex={0}
          aria-label="Kyrevant FPS. WASD move while moving the mouse to look. Spacebar fires. Click to capture cursor. Escape frees cursor but WASD keeps working."
        />
        {!commandMode && (
          <div className={`fps-instructions fps-instructions--${mouseStatus}`} aria-live="polite">
            {mouseStatus === 'locked'
              ? 'WASD MOVE · HOLD CLICK FIRE · Q ABILITY · E USE · M MINE · ESC CURSOR'
              : mouseStatus === 'fallback'
                ? 'WASD MOVE · MOUSE AIM · HOLD CLICK FIRE · Q ABILITY'
                : mouseStatus === 'released'
                  ? 'CURSOR FREE · CLICK THE WORLD TO RESUME AIMING'
                  : 'CLICK TO AIM · WASD MOVE · E INTERACT · M MINE'}
          </div>
        )}
        {!commandMode && (
          <div className="crosshair">
            <span />
            <span />
          </div>
        )}
        <div className="mission-banner">
          {announcement}
        </div>
        {localPlayer?.downed && (
          <div role="alert" style={{
            position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
            zIndex: 30, padding: '10px 18px', borderRadius: 8,
            background: 'rgba(87, 17, 24, .92)', color: '#fff',
            font: 'bold 13px Arial, sans-serif', pointerEvents: 'none',
          }}>DOWNED · TEAMMATE HEAL OR SQUAD REDEPLOY</div>
        )}
        {!commandMode && <div className="squad-radar" aria-label="Tactical co-op radar" style={{
          position:'absolute',bottom:86,left:16,zIndex:11,width:207,padding:'8px 10px',
          background:'rgba(4,15,26,.88)',border:'1px solid rgba(105,191,215,.57)',
          borderRadius:7,color:'#bfeeff',pointerEvents:'none',
          font:'bold 10px Arial',boxShadow:'0 4px 18px rgba(0,0,0,.3)'}}>
          <div style={{display:'flex',justifyContent:'space-between',letterSpacing:1.1,marginBottom:4}}>
            <span>SQUAD RADAR</span><span>{players.length} OPERATORS</span>
          </div>
          <svg viewBox="0 0 2600 1600" width="100%" height="95" role="img" aria-label="Radar showing players, enemies and current mission">
            <rect width="2600" height="1600" fill="#102637" stroke="#3c8daa" strokeWidth="24"/>
            {Array.from({length:5},(_,i)=><line key={`rv${i}`} x1={(i+1)*433} x2={(i+1)*433} y1="0" y2="1600" stroke="#284759" strokeWidth="8"/>)}
            {Array.from({length:3},(_,i)=><line key={`rh${i}`} y1={(i+1)*400} y2={(i+1)*400} x1="0" x2="2600" stroke="#284759" strokeWidth="8"/>)}
            <rect x="550" y="450" width="850" height="450" fill="#174b54" fillOpacity=".5"/>
            <rect x="1850" y="700" width="650" height="500" fill="#5f2830" fillOpacity=".5"/>
            {storyTarget && <circle cx={storyTarget.x} cy={storyTarget.y} r="93" fill="none" stroke="#ffe280" strokeWidth="29" strokeDasharray="55 31"/>}
            {enemies.filter(e=>e.alive).slice(0,45).map(e=><circle key={e.id} cx={e.x} cy={e.y} r="37" fill="#ff5549"/>)}
            {players.map(p=><circle key={p.id} cx={p.x} cy={p.y} r={p.id===localId?"64":"52"} fill={p.id===localId?'#72f3ff':'#73e7a3'} stroke="#f8ffff" strokeWidth="18"/>)}
          </svg>
          <div style={{fontSize:9,color:'#97bbc9'}}>● CYAN YOU · GREEN ALLY · RED ENEMY · GOLD GOAL</div>
        </div>}
        {uplink?.active && <div role="status" aria-label="Cooperative black-box recovery" style={{
          position:'absolute',top:88,left:'50%',transform:'translateX(-50%)',zIndex:19,
          minWidth:290,padding:'12px 15px',border:'1px solid #64c9ee',borderRadius:8,
          color:'#dbf5ff',background:'rgba(4,17,27,.94)',font:'bold 12px Arial',
          boxShadow:'0 5px 22px rgba(0,0,0,.55)',pointerEvents:'none'}}>
          <div style={{marginBottom:8}}>BLACK BOX UPLINK · {Math.round(uplink.progress)}%</div>
          <div style={{height:9,background:'#253c49',borderRadius:4,overflow:'hidden'}}>
            <div style={{height:'100%',background:'#57d9f5',width:`${uplink.progress}%`}}/>
          </div>
          <div style={{marginTop:8,fontSize:10,color:'#a4cbd9'}}>
            {uplink.operators}/2 OPERATORS · {uplink.message}
          </div>
        </div>}
        {level === 1 && !quests.some(q => q.id === 'recover-flight-log' && q.complete) &&
         storyDistance < 180 && <div style={{position:'absolute',top:100,left:'50%',
           transform:'translateX(-50%)',zIndex:12,color:'#ffeca1',
           background:'rgba(16,26,35,.9)',padding:'9px 16px',borderRadius:6,
           font:'bold 12px Arial',pointerEvents:'none'}}>
           A NOTE ON THE ROCK · PRESS E TO READ
         </div>}
        {storyTarget && !commandMode && (
          <div className="story-location" role="status" aria-live="polite" style={{
            position: 'absolute', right: 18, bottom: 85,
            zIndex: 12, maxWidth: 335, padding: '10px 14px',
            background: 'rgba(4, 17, 30, .88)', color: '#d9f1fc',
            border: '1px solid rgba(125, 203, 233, .46)',
            borderRadius: 8, font: '600 12px/1.55 Arial, sans-serif',
            pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: '#92bac8' }}>
              STORY LOCATION
            </div>
            <div style={{ marginTop: 3 }}>{storyTarget.name}</div>
            <div style={{ color: '#acd0dc', marginTop: 5 }}>
              {Number.isFinite(storyDistance)
                ? `${Math.round(storyDistance * SCALE)}m away`
                : 'Waiting for player position'}
              {' · '}
              {storyDistance <= storyTarget.radius
                ? 'PRESS E TO INTERACT'
                : 'USE SQUAD RADAR TO NAVIGATE'}
            </div>
          </div>
        )}
        <div className="chapter-status" style={{position:'absolute',top:56,left:'50%',transform:'translateX(-50%)',
          zIndex:11,padding:'6px 10px',maxWidth:'44%',pointerEvents:'none',
          background:'rgba(3,16,28,.83)',border:'1px solid #526d83',borderRadius:7,
          color:'#d5eaf4',font:'600 11px Arial'}}>
          {chapterStatus
            ? `CHAPTER ${level} · ${chapterStatus.stage}/${chapterStatus.totalStages} · ${chapterStatus.title}`
            : 'THE FALL · CO-OP CAMPAIGN'}
        </div>
        {progressMessage && <div role="status" style={{position:'absolute',top:87,left:'50%',
          transform:'translateX(-50%)',background:'rgba(2,37,42,.87)',padding:'6px 12px',
          color:'#a0ffdc',zIndex:11,pointerEvents:'none',font:'bold 11px Arial'}}>{progressMessage}</div>}
        <button type="button" onClick={() => setShowRules(true)} style={{position:'absolute',
          top:52,right:14,zIndex:24,padding:'6px 10px',background:'#173650',
          color:'#e7f5ff',border:'1px solid #7194a9',borderRadius:5,cursor:'pointer'}}>
          HOW TO PLAY
        </button>
        {showRules && <div role="dialog" aria-label="How to play" style={{position:'absolute',
          top:'12%',left:'50%',transform:'translateX(-50%)',zIndex:40,width:'min(540px,90%)',
          padding:22,background:'rgba(4,15,27,.98)',border:'2px solid #7db5ce',borderRadius:10,
          color:'#e6f5ff',font:'14px/1.6 Arial'}}>
          <h2 style={{margin:'0 0 10px'}}>KYREVANT · CO-OP RULES</h2>
          <p>Two to four players join the same five-character room code from separate devices. The host starts once both players join; everyone selects a class and presses READY.</p>
          <p><b>Objective:</b> Work together to read the plea near the wreck, find Elias, defeat patrols, talk to settlers, rescue captives, mine minerals, build defenses, survive three waves and defeat the commander.</p>
          <p><b>Controls:</b> WASD move · Mouse aim/look · Hold left click / SPACE fire · E talk/interact · M mine · Q special ability · ESC release cursor. Build in Command Mode.</p>
          <p><b>Win:</b> Complete all the mission objectives. Shared resources and buildings belong to your squad; both players share the victory.</p>
          <p><a href="/credits.html" target="_blank" rel="noreferrer" style={{color:'#9ccad5'}}>Art and asset credits</a></p><button type="button" onClick={() => setShowRules(false)}>RETURN TO GAME</button>
        </div>}
        {dialogue && <div role="dialog" aria-label={dialogue.title} style={{position:'absolute',
          zIndex:42,top:'14%',left:'50%',transform:'translateX(-50%)',
          width:'min(520px,92%)',padding:20,background:'rgba(5,17,31,.98)',
          color:'#e8f7ff',border:'2px solid #78b2d1',borderRadius:11,
          boxShadow:'0 18px 50px rgba(0,0,0,.65)',font:'13px/1.6 Arial'}}>
          <div style={{fontSize:11,letterSpacing:2,color:'#85d8ff'}}>{dialogue.speaker}</div>
          <h2 style={{margin:'6px 0 12px',fontSize:19}}>{dialogue.title}</h2>
          {dialogue.lines.map((line,i)=><p key={i}>{line}</p>)}
          <div style={{display:'flex',flexDirection:'column',gap:7,marginTop:14}}>
            {dialogue.choices.map(choice=><button key={choice.id} type="button"
              style={{padding:'10px 12px',textAlign:'left',background:'#204763',color:'white',
                cursor:'pointer',border:'1px solid #75a5c3',borderRadius:5}}
              onClick={()=>{
                socket.emit('kyrevant-dialogue-choice',
                  {roomCode:room.code,site:dialogue.site,choice:choice.id})
                setDialogue(null)
              }}>{choice.label}</button>)}
          </div>
        </div>}
<button className="journal-toggle" onClick={() => setShowFullQuestLog(value => !value)} aria-expanded={showFullQuestLog}>MISSION LOG</button>
{showFullQuestLog && <aside className="quest-panel" style={{
          maxHeight: showFullQuestLog ? '46vh' : '174px',
          overflowY: 'auto', maxWidth: '300px',
        }}>
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            QUEST LOG
            <button type="button" onClick={() => setShowFullQuestLog(value => !value)}
              style={{ background: 'rgba(30,72,98,.8)', color: '#d7f4ff',
                border: '1px solid #507b94', borderRadius: 4,
                fontSize: 10, padding: '3px 7px', cursor: 'pointer' }}>
              {showFullQuestLog ? 'COLLAPSE' : 'ALL'}
            </button>
          </h3>
          {(showFullQuestLog ? quests : quests.filter(q => !q.complete).slice(0, 2)).map(
            (quest) => (
              <div
                key={quest.id}
                className={
                  quest.complete
                    ? 'quest complete'
                    : 'quest'
                }
              >
                <span>
                  {quest.complete
                    ? '✓'
                    : '◇'}
                </span>
                <p>
                  {quest.text}
                </p>
              </div>
            ),
          )}
        </aside>}
        {miningActive && (
          <div className="mining-progress-panel" aria-label="Mining progress">
            <div className="mining-progress-heading">
              <strong>MINING {nearbyResource?.type.toUpperCase() ?? 'RESOURCE'}</strong>
              <span>{miningProgress}%</span>
            </div>
            <div
              className="mining-progress-track"
              role="progressbar"
              aria-label="Current extraction progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={miningProgress}
            >
              <div
                className="mining-progress-fill"
                style={{ width: `${miningProgress}%` }}
              />
            </div>
            <small>+20 PER EXTRACTION · UNLIMITED · PRESS M TO STOP</small>
          </div>
        )}
        {!commandMode && (miningFeedback || nearbyResource) && (
          <div className="world-prompt" role="status" aria-live="polite">
            {miningFeedback || (nearbyResource
              ? miningActive
                ? `EXTRACTING ${nearbyResource.type.toUpperCase()} · MOVE FREELY WHILE MINING`
                : `PRESS M TO START MINING ${nearbyResource.type.toUpperCase()} · UNLIMITED`
              : nearestMiningTarget
                ? `${nearestMiningTarget.type.toUpperCase()} STATION — ${nearestMiningTarget.distance}m away · move closer to mine`
                : '')}
          </div>
        )}
        {commandMode && (
          <div className="build-mode-label">
            COMMAND MODE
            <small>
              PLACE{' '}
              {selectedBuilding}
            </small>
            <button
              type="button"
              onClick={
                cancelCommandMode
              }
            >
              RETURN TO COMBAT
            </button>
          </div>
        )}
        {victory && (
          <div className="victory-overlay">
            <span>
              KYREVANT
            </span>
            <h1>
              CAMPAIGN COMPLETE
            </h1>
            <strong>
              VICTORY
            </strong>
            <p>The militia is defeated. The captives are free. Elias lights the refuge beacon for your unit's return.</p>
            <p>You came here as survivors. You leave as the people who gave Kyrevant a future.</p>
            {room.players.find(p => p.id === localId)?.isHost && <button type="button" onClick={() => socket.emit('restart-campaign',room.code)}>Play again</button>}
            <button type="button" onClick={() => window.location.assign(window.location.pathname)}>Return to title</button>
          </div>
        )}
      </div>
      <section className="game-action-bar">
        <button type="button" className="sound-toggle" aria-pressed={soundEnabled} onClick={() => setSoundEnabled(value=>!value)}>{soundEnabled?'SOUND ON':'SOUND OFF'}</button>
        <div className="combat-actions">
          <button
            type="button"
            disabled={
              commandMode
            }
            onClick={() =>
              attackRef.current?.()
            }
          >
            FIRE
          </button>
          <button
            type="button"
            disabled={
              commandMode
            }
            onClick={() =>
              abilityRef.current?.()
            }
          >
            {abilityName}
          </button>
          <button
            type="button"
            disabled={
              commandMode
            }
            onClick={() =>
              interactRef.current?.()
            }
          >
            INTERACT
          </button>
          <button
            type="button"
            onClick={() => mineRef.current?.()}
            title="Start or stop automatic unlimited mining (distance must be within range)."
          >
            {miningActive ? 'STOP MINING' : 'MINE'}
          </button>
        </div>
        <button className="construction-toggle" aria-expanded={showBuildMenu} onClick={() => setShowBuildMenu(value => !value)}>{showBuildMenu ? `CLOSE BUILD · ${economy.minerals}M / ${economy.energy}E` : 'BUILD BASE'}</button>
        {showBuildMenu && <div className="build-actions">
          <span>
            BASE CONSTRUCTION
          </span>
          <button
            type="button"
            onClick={() =>
              chooseBuilding(
                'Extractor',
              )
            }
          >
            Extractor
            <small>
              60M
            </small>
          </button>
          <button
            type="button"
            onClick={() =>
              chooseBuilding(
                'Barracks',
              )
            }
          >
            Barracks
            <small>
              120M / 20E
            </small>
          </button>
          <button
            type="button"
            onClick={() =>
              chooseBuilding(
                'Turret',
              )
            }
          >
            Turret
            <small>
              90M / 20E
            </small>
          </button>
          <button
            type="button"
            onClick={() =>
              chooseBuilding(
                'PowerCore',
              )
            }
          >
            Power Core
            <small>
              80M / 60E
            </small>
          </button>
        </div>}
      </section>
    </div>
  )
}
export default GameCanvas
