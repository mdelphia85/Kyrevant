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
  SceneLoader,
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
import { buildWildFrontier } from './WildFrontier'
import TouchControls from './TouchControls'
import { CombatAudio } from './CombatAudio'
// Self-contained Babylon scene visuals; no Visuals.ts dependency.
// A fully modeled, skinned and animated human sci-fi marine replaces the
// stand-in geometric character. Credit: Vanguard by T. Choonyung / Adobe
// Mixamo, bundled as the Three.js Soldier sample. The model stays an embedded
// gameplay asset and must not be redistributed as a standalone stock model.
const KYREVANT_MARINE_URL =
  '/assets/unit-marine.glb'

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
  Effect.ShadersStore['kyrevantSkyVertexShader'] = `
    precision highp float;
    attribute vec3 position;
    uniform mat4 worldViewProjection;
    uniform mat4 world;
    varying vec3 vDirection;
    void main() {
      vDirection = normalize((world * vec4(position, 0.0)).xyz);
      gl_Position = worldViewProjection * vec4(position, 1.0);
    }
  `
  Effect.ShadersStore['kyrevantSkyFragmentShader'] = `
    precision highp float;
    varying vec3 vDirection;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),
                 mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);
    }
    void main() {
      vec3 d=normalize(vDirection);
      float up=clamp(d.y*0.5+0.5,0.0,1.0);
      vec3 zenith=vec3(0.045,0.12,0.22);
      vec3 upper=vec3(0.16,0.30,0.39);
      vec3 horizon=vec3(0.48,0.43,0.33);
      vec3 bottom=vec3(0.084,0.077,0.086);
      vec3 col=mix(bottom,horizon,smoothstep(0.08,0.52,up));
      col=mix(col,upper,smoothstep(0.49,0.75,up));
      col=mix(col,zenith,smoothstep(0.71,1.0,up));
      vec3 sunDirection=normalize(vec3(-0.58, 0.12, -0.82));
      float sundot=max(dot(d,sunDirection),0.0);
      col+=vec3(0.34,0.16,0.085)*pow(sundot,24.0)*(1.0-smoothstep(0.5,0.95,up));
      col+=vec3(0.77,0.49,0.29)*pow(sundot,6000.0);
      float cloud=noise(d.xz*13.0+vec2(d.y*8.0,0.0))*.60+
                  noise(d.xz*35.0+d.y*17.0)*.28+
                  noise(d.xz*78.0)*.12;
      float veil=smoothstep(0.47,0.66,cloud)*(1.0-smoothstep(0.73,0.95,up));
      col=mix(col,vec3(.17,.19,.22),veil*.21);
      // The sky is designed for the post-process exposure used in the world.
      gl_FragColor=vec4(col,1.0);
    }
  `
  const sky = MeshBuilder.CreateSphere('kyrevant-atmosphere', {diameter:190,segments:40},scene)
  const shader=new ShaderMaterial('kyrevant-atmosphere-shader',scene,'kyrevantSky',{
    attributes:['position'], uniforms:['world','worldViewProjection'],
  })
  shader.backFaceCulling=false
  shader.disableDepthWrite=true
  sky.material=shader
  sky.isPickable=false
  sky.applyFog=false
  // The camera follows this sphere explicitly. Do not also set
  // infiniteDistance, which applies an additional camera translation.
  sky.infiniteDistance=false
  return sky
}

// The distant crater wall is original vertex geometry, not a ring of box props.
function buildFarLandscape(scene:Scene) {
  const root=new TransformNode('kyrevant-canyon-backdrop',scene)
  const center=new Vector3(25,0,16)
  for(let layer=0;layer<3;layer++) {
    const segments=192
    const verts:number[]=[]
    const indexes:number[]=[]
    const innerRadius=37+layer*15
    const outerRadius=innerRadius+9
    for(let i=0;i<=segments;i++) {
      const angle=(i%segments)/segments*Math.PI*2
      const r=innerRadius+smoothNoise(i/9,layer*13,8)*2
      const large=smoothNoise(Math.cos(angle)*7+12,Math.sin(angle)*7+23,18+layer)
      const ridged=smoothNoise(Math.cos(angle)*39,Math.sin(angle)*39,27+layer)
      const upper=3.4+large*8.5+ridged*2.5+layer*1.9
      for (const [radius,height] of [[r,-1],[r+1,upper*.72],[outerRadius,upper],[outerRadius+12,upper*.62]] as const) {
        verts.push(center.x+Math.cos(angle)*radius,height,center.z+Math.sin(angle)*radius)
      }
      if (i<segments) for(let ring=0;ring<3;ring++) {
        const a=i*4+ring,b=a+4
        indexes.push(a,b,a+1,a+1,b,b+1)
      }
    }
    const mesh=new Mesh(`canyon-ridge-${layer}`,scene)
    const data=new VertexData()
    data.positions=verts; data.indices=indexes
    const norms:number[]=[];VertexData.ComputeNormals(verts,indexes,norms)
    data.normals=norms;data.applyToMesh(mesh)
    const mat=new StandardMaterial(`ridge-rock-${layer}`,scene)
    mat.diffuseColor=layer===0?new Color3(.20,.18,.17):new Color3(.105,.13,.17)
    mat.specularColor=new Color3(.025,.03,.04)
    mat.backFaceCulling=false
    mesh.material=mat
    mesh.parent=root
    mesh.isPickable=false
    mesh.receiveShadows=true
  }
  return root
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

function createArmoredSoldier(scene: Scene, role: Role, id: string): TransformNode {
  const root = new TransformNode(`soldier-${id}`, scene)
  const enemy = ['Raider', 'Heavy', 'Commander'].includes(role)
  const heavy = role === 'Heavy' || role === 'Commander'
  const armor = metal(scene, `${id}-armor`, enemy ? '#50565c' : '#4c596a')
  const plates = metal(scene, `${id}-plates`, enemy ? '#7d4942' : '#84909a')
  const dark = metal(scene, `${id}-joints`, '#151d28')
  const detail = metal(scene, `${id}-detail`, enemy ? '#a05544' : '#344356')
  const visor = metal(scene, `${id}-visor`, '#091c28', enemy ? '#451813' : '#0d3848')
  const light = metal(scene, `${id}-light`, enemy ? '#e35535' : '#44aedd', enemy ? '#6e1305' : '#103f59')
  const weapon = metal(scene, `${id}-weapon`, '#1e2832')
  const scale = heavy ? 1.12 : 1
  root.scaling.setAll(scale)

  const box = (n: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: StandardMaterial, parent: TransformNode = root) => {
    const m = MeshBuilder.CreateBox(`${id}-${n}`, {width:w,height:h,depth:d}, scene)
    m.position.set(x,y,z)
    m.material = mat
    m.parent = parent
    return m
  }
  const sphere = (n:string, diameter:number, x:number,y:number,z:number,mat:StandardMaterial, sx=1,sy=1,sz=1) => {
    const m = MeshBuilder.CreateSphere(`${id}-${n}`, {diameter,segments:16},scene)
    m.position.set(x,y,z); m.scaling.set(sx,sy,sz); m.material=mat; m.parent=root
    return m
  }
  const limb = (n:string,x:number,y:number,z:number,length:number,width:number,mat:StandardMaterial,rotZ=0) => {
    const m=MeshBuilder.CreateCylinder(`${id}-${n}`,{height:length,diameterTop:width*0.92,diameterBottom:width,tessellation:12},scene)
    m.position.set(x,y,z);m.rotation.z=rotZ;m.material=mat;m.parent=root
    return m
  }

  // Transparent contact-shadow decal anchors each soldier to the ground.
  // Unlike expensive dynamic shadow casters, this also works with moving units.
  const contactShadow=MeshBuilder.CreateDisc(`${id}-contact-shadow`,{radius:.65,tessellation:24},scene)
  contactShadow.parent=root
  contactShadow.position.y=.018
  contactShadow.rotation.x=Math.PI/2
  contactShadow.isPickable=false
  const contactMaterial=new StandardMaterial(`${id}-contact-shadow-mat`,scene)
  contactMaterial.disableLighting=true
  contactMaterial.diffuseColor=new Color3(.025,.022,.027)
  contactMaterial.alpha=.32
  contactMaterial.zOffset=-1
  contactShadow.material=contactMaterial

  // Bipedal proportions, independent of the original novelty-character asset pack.
  box('pelvis', .54,.26,.36,0,.94,0,armor)
  box('abdomen', .43,.4,.32,0,1.24,0,dark)
  box('chest', .72,.64,.4,0,1.68,0,armor)
  box('breastplate', .62,.33,.1,0,1.76,.23,plates)
  box('sternum',.14,.43,.06,0,1.59,.31,detail)
  box('collar',.6,.13,.44,0,2.05,0,dark)
  box('backpack', .48,.58,.25,0,1.65,-.31,armor)
  box('backpack-fin-L',.12,.4,.12,-.19,1.6,-.5,detail)
  box('backpack-fin-R',.12,.4,.12,.19,1.6,-.5,detail)
  box('belt',.62,.14,.44,0,1.12,0,dark)
  box('belt-buckle',.14,.12,.07,0,1.13,.25,plates)

  for(const sign of [-1,1]) {
    const s = sign === -1 ? 'L' : 'R'
    limb(`thigh-${s}`,sign*.2,.7,0,.64,.27,armor,sign*.05)
    sphere(`knee-${s}`, .29,sign*.2,.39,.03,plates,.96,.75,1)
    limb(`shin-${s}`,sign*.21,.23,.01,.42,.23,dark)
    box(`shinplate-${s}`,.21,.3,.11,sign*.21,.23,.16,plates)
    box(`boot-${s}`,.28,.18,.45,sign*.21,.1,.09,dark)
    sphere(`shoulder-${s}`, .36,sign*.48,1.9,0,plates,1.12,.84,1.12)
    limb(`bicep-${s}`,sign*.51,1.64,0,.36,.19,dark,sign*.14)
    box(`upperarm-${s}`,.25,.24,.24,sign*.52,1.67,.04,armor)
    sphere(`elbow-${s}`, .23,sign*.53,1.43,.03,dark)
    limb(`forearm-${s}`,sign*.53,1.28,.11,.31,.2,armor,sign*.12)
    box(`forearm-plate-${s}`,.24,.24,.12,sign*.55,1.25,.2,plates)
    sphere(`glove-${s}`, .22,sign*.52,1.1,.18,dark)
    box(`hip-pouch-${s}`,.18,.21,.24,sign*.36,.92,-.08,detail)
  }
  sphere('helmet-shell', .48, 0,2.25,0,armor,1.07,1.15,1.14)
  sphere('helm-front-plate', .40,0,2.23,.12,plates,1.02,.74,.69)
  sphere('helmet-rear-shell',.42,0,2.30,-.13,armor,1.1,.92,.65)
  sphere('faceplate',.33,0,2.245,.232,visor,1.0,.45,.26)
  box('visor-lip',.32,.035,.035,0,2.17,.29,plates)
  sphere('goggle-lens',.32,0,2.32,.260,visor,1.17,.22,.18)
  box('visor-edge',.4,.026,.08,0,2.22,.267,light)
  box('respirator',.23,.13,.15,0,2.12,.25,dark)
  box('crown',.23,.1,.33,0,2.49,-.02,plates)
  box('helmet-ear-L',.12,.18,.2,-.255,2.25,.01,dark)
  box('helmet-ear-R',.12,.18,.2,.255,2.25,.01,dark)
  sphere('power-core', .14, 0,1.75,.31,light,.9,.9,.35)
  for(const sign of [-1,1]) {
    box(`chest-latch-${sign}`,.06,.18,.05,sign*.23,1.69,.31,dark)
    box(`helmet-light-${sign}`,.06,.045,.07,sign*.18,2.41,.21,light)
  }
  // Riveted armor segments, articulated soft joints and tactical utility kit.
  for(const side of [-1,1]) {
    const prefix=side===1?'R':'L'
    for(let j=0;j<3;j++) {
      const rib=box(`ribbed-plate-${prefix}-${j}`,.12,.07,.28,side*(.23+j*.045),1.44-j*.115,.065,plates)
      rib.rotation.z=side*.10
    }
    for(let j=0;j<3;j++) box(`thigh-straps-${prefix}-${j}`,.29,.032,.34,side*.2,.72+j*.10,0,dark)
    sphere(`hip-ball-${prefix}`,.25,side*.21,.86,0,dark)
    box(`comms-cable-${prefix}`,.035,.35,.035,side*.34,1.67,-.21,detail)
    box(`chevron-${prefix}`,.15,.055,.07,side*.18,1.90,.25,light)
    for(let k=0;k<4;k++) box(`glove-finger-${prefix}-${k}`,.045,.12,.075,side*(.44+k*.035),1.05,.20,dark)
  }
  box('collar-seal',.43,.12,.41,0,2.0,0,dark)
  box('breastplate-keel',.11,.35,.05,0,1.72,.318,plates)
  box('neck-comm-port',.17,.08,.085,-.18,2.04,.14,detail)
  // Integrated rifle: receiver, magazine, sight and a barrel connected to the arms.
  box('rifle-receiver',.54,.17,.22,.07,1.45,.40,weapon)
  box('rifle-stock',.25,.19,.16,-.26,1.43,.39,detail)
  box('rifle-grip',.11,.25,.13,.09,1.28,.42,dark)
  box('rifle-mag',.15,.24,.18,-.07,1.26,.42,dark)
  box('rifle-barrel',.13,.12,.53,.35,1.46,.40,weapon)
  box('rifle-optic',.13,.12,.17,.03,1.58,.38,visor)
  box('rifle-emitter',.08,.08,.04,.63,1.46,.4,light)
  return root
}

function createWeaponView(scene: Scene, camera: FreeCamera) {
  const root = new TransformNode('fps-rifle-viewmodel', scene)
  root.parent = camera
  root.position.set(.25,-.29,.72)
  root.scaling.setAll(.48)
  root.rotation.y = -.06
  const gun = metal(scene,'fps-gun-body','#263443')
  const edge = metal(scene,'fps-gun-edge','#637385')
  const grip = metal(scene,'fps-gun-grip','#131b27')
  const cyan = metal(scene,'fps-gun-cyan','#247b9c','#155779')
  const skin = metal(scene,'fps-gloves','#424c57')
  const cube=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,mat:StandardMaterial) => {
    const m=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene)
    m.parent=root;m.position.set(x,y,z);m.material=mat;m.isPickable=false
    return m
  }
  // Original compact service rifle: enclosed upper receiver and rear power pack.
  cube('rifle-stock',.25,.26,.34,0,-.02,-.33,gun)
  cube('rifle-stock-pad',.26,.27,.045,0,-.02,-.51,grip)
  cube('rifle-upper-shroud',.29,.16,.70,0,.13,.27,gun)
  cube('rifle-shroud-stripe',.293,.028,.48,0,.15,.34,edge)
  const designation = new DynamicTexture('rifle-identification', {width:256,height:128}, scene, false)
  const labelContext = designation.getContext()
  labelContext.fillStyle = '#14232b'; labelContext.fillRect(0,0,256,128)
  labelContext.fillStyle = '#b8e8e9'; labelContext.font = 'bold 40px monospace'
  labelContext.fillText('K-7',20,58)
  labelContext.font = '18px monospace'; labelContext.fillText('UNIT SERVICE',20,94)
  designation.update()
  const designationMaterial = new StandardMaterial('rifle-designation-material', scene)
  designationMaterial.diffuseTexture = designation
  designationMaterial.emissiveColor = new Color3(.18,.28,.29)
  const designationPlate = MeshBuilder.CreatePlane('rifle-designation-plate',{width:.17,height:.085},scene)
  designationPlate.parent=root;designationPlate.position.set(.149,.14,.12);designationPlate.rotation.y=-Math.PI/2
  designationPlate.material=designationMaterial;designationPlate.isPickable=false
  cube('rifle-receiver',.24,.17,.53,0,0,.05,gun)
  cube('rifle-machined-chassis',.265,.09,.62,0,.065,.09,edge)
  cube('rifle-top-rail',.18,.045,.43,0,.115,.07,edge)
  cube('rifle-barrel',.105,.1,.62,0,-.01,.57,grip)
  cube('rifle-muzzle',.16,.13,.08,0,-.01,.89,edge)
  cube('rifle-scope',.115,.1,.2,0,.2,.08,grip)
  cube('rifle-sight',.045,.065,.06,0,.25,.16,cyan)
  cube('rifle-mag',.14,.27,.17,0,-.2,.04,grip).rotation.x=-.12
  cube('rifle-pistol-grip',.12,.27,.14,.03,-.2,-.14,grip).rotation.x=.26
  cube('rifle-battery',.22,.12,.1,.0,.04,-.22,edge)
  cube('rifle-battery-light',.14,.035,.025,0,.1,-.22,cyan)
  cube('right-glove',.16,.13,.19,.14,-.18,-.1,skin)
  cube('left-glove',.16,.13,.2,-.16,-.11,.33,skin)
  cube('right-forearm',.25,.19,.52,.21,-.24,-.31,skin).rotation.y=.25
  cube('left-forearm',.24,.18,.54,-.26,-.24,.13,skin).rotation.y=-.23
  const cylinder=(name:string,diameter:number,length:number,x:number,y:number,z:number,mat:StandardMaterial) => {
    const mesh=MeshBuilder.CreateCylinder(name,{diameter,height:length,tessellation:20},scene)
    mesh.parent=root
    mesh.position.set(x,y,z)
    mesh.rotation.x=Math.PI/2
    mesh.material=mat
    mesh.isPickable=false
    return mesh
  }
  const optics=metal(scene,'rifle-optic-lens','#132f3d','#16445c')
  cylinder('rifle-heavy-barrel',.098,.67,0,-.01,.57,grip)
  cylinder('rifle-front-housing',.16,.12,0,-.01,.77,edge)
  cylinder('rifle-flash-suppressor',.14,.17,0,-.01,.94,grip)
  cylinder('rifle-optic-housing',.14,.22,0,.19,.1,edge)
  cylinder('rifle-rear-lens',.12,.01,0,.19,-.015,optics)
  for(const sign of [-1,1]) {
    cube(`rifle-lower-rail-${sign}`,.035,.06,.46,sign*.13,-.09,.26,edge)
    cube(`rifle-vent-${sign}`,.015,.055,.30,sign*.122,.08,.21,grip)
    for(let i=0;i<4;i++) cube(`vent-notch-${sign}-${i}`,.018,.04,.028,sign*.133,.085,.05+i*.095,cyan)
  }
  cube('rifle-bolt-plate',.014,.10,.18,.127,.025,-.025,edge)
  cube('rifle-trigger-guard',.025,.04,.16,.012,-.12,-.09,edge)
  // Layered machined detailing breaks up the block silhouette in first person.
  for(let side of [-1,1]) {
    cube(`optic-support-${side}`,.027,.072,.24,side*.11,.155,.08,edge)
    cube(`forend-armor-${side}`,.075,.13,.44,side*.13,-.013,.48,gun)
    cube(`muzzle-cutout-${side}`,.025,.08,.15,side*.09,-.012,.90,grip)
    cube(`palm-plate-${side}`,.12,.045,.21,side*.20,-.105,side===1?-.08:.3,edge)
    for(let i=0;i<6;i++) {
      cube(`barrel-heat-slot-${side}-${i}`,.014,.014,.048,side*.184,.041,.28+i*.077,grip)
    }
  }
  const muzzleCap=cylinder('muzzle-inner-core',.066,.095,0,-.01,1.017,grip)
  muzzleCap.position.z=1.014
  cylinder('optic-forward-lens',.117,.013,0,.19,.205,optics)
  for(let k=0;k<5;k++) cube(`top-rail-teeth-${k}`,.19,.024,.025,0,.151,-.08+k*.107,grip)
  cube('sling-anchor',.031,.09,.12,-.152,.07,-.22,edge)
  cube('ejection-port',.014,.078,.13,.133,.015,.07,grip)
  cube('ejection-guide',.02,.018,.15,.147,.078,.07,edge)

  // Camera-space viewmodel stays attached to the first-person camera.

  const flash=MeshBuilder.CreateCylinder('fps-muzzle-flash',{height:.36,diameterTop:0,diameterBottom:.2,tessellation:9},scene)
  flash.parent=root;flash.position.set(0,-.01,1.04);flash.rotation.x=Math.PI/2
  flash.material=metal(scene,'fps-muzzle-flash-material','#ffe6b1','#ff9837')
  flash.isPickable=false;flash.setEnabled(false)
  return { root, flash }
}

function createCrashShip(scene: Scene, x: number, z: number): TransformNode {
  const root=new TransformNode('kyrevant-crashed-courier',scene)
  root.position.set(x,.68,z);root.rotation.set(-.07,-.48,-.13)
  const hull=metal(scene,'crash-hull','#485868')
  const edge=metal(scene,'crash-edge','#25313e')
  const scorched=metal(scene,'crash-scorch','#201d1f')
  const glass=metal(scene,'crash-cockpit','#102a3b','#092334')
  const ember=metal(scene,'crash-embers','#a04d30','#511907')
  const box=(name:string,w:number,h:number,d:number,px:number,py:number,pz:number,mat:StandardMaterial,rz=0) => {
    const m=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene)
    m.parent=root;m.position.set(px,py,pz);m.rotation.z=rz;m.material=mat;m.receiveShadows=true
    return m
  }
  // Angular troop-carrier fuselage with a flattened cockpit and exposed engines.
  box('ship-center-fuselage',2.2,1.1,5.2,0,.55,0,hull)
  box('ship-upper-spine',1.2,.48,3.4,0,1.25,-.38,edge)
  box('ship-cockpit',1.4,.40,1.25,0,1.12,1.62,glass)
  box('ship-forward-nose',1.05,.55,1.25,0,.57,2.95,hull)
  box('ship-floor-grating',1.7,.07,1.8,0,.15,-2.1,scorched)
  for(const side of [-1,1]) {
    box(`ship-delta-wing-${side}`,3.3,.18,2.4,side*2.2,.61,-.26,hull,side*.17)
    box(`ship-wing-edge-${side}`,2.5,.10,.35,side*2.55,.69,.74,edge,side*.17)
    box(`ship-fin-${side}`,.26,.93,1.6,side*1.28,1.3,-1.35,edge,side*-.15)
    const engine=MeshBuilder.CreateCylinder(`ship-damaged-engine-${side}`,{height:1.95,diameter:1.0,tessellation:14},scene)
    engine.parent=root;engine.rotation.x=Math.PI/2;engine.position.set(side*1.55,.64,-1.72);engine.material=scorched
    const vent=MeshBuilder.CreateCylinder(`ship-exhaust-${side}`,{height:.07,diameter:.78,tessellation:18},scene)
    vent.parent=root;vent.rotation.x=Math.PI/2;vent.position.set(side*1.55,.64,-2.75);vent.material=ember
    box(`ship-side-armor-${side}`,.12,.6,3.2,side*1.17,.6,.06,hull)
  }
  // Struck-down vehicle: displaced metal plates and exhaust heat convey impact.
  box('ship-torn-plate',1.25,.08,1.2,-2.8,-.26,.5,scorched,.3)
  box('ship-impact-shard',.8,.14,.9,2.3,-.4,2.7,edge,-.2)
  return root
}


function createFrontierCivilian(scene: Scene, id:string, innkeeper:boolean): TransformNode {
  const root=new TransformNode(`civilian-${id}`,scene)
  const coat=new StandardMaterial(`civilian-coat-${id}`,scene)
  coat.diffuseColor=Color3.FromHexString(innkeeper?'#a4774f':'#777e74')
  const face=new StandardMaterial(`civilian-face-${id}`,scene)
  face.diffuseColor=Color3.FromHexString('#bd9377')
  const dark=new StandardMaterial(`civilian-boots-${id}`,scene)
  dark.diffuseColor=Color3.FromHexString('#252a31')
  const body=MeshBuilder.CreateCylinder(`civilian-body-${id}`,{height:1.15,diameterTop:.46,diameterBottom:.8,tessellation:12},scene)
  body.parent=root;body.position.y=.98;body.material=coat
  const head=MeshBuilder.CreateSphere(`civilian-head-${id}`,{diameter:.44,segments:14},scene)
  head.parent=root;head.position.y=1.78;head.material=face
  const hair=MeshBuilder.CreateSphere(`civilian-hair-${id}`,{diameter:.47,segments:10},scene)
  hair.parent=root;hair.position.y=1.93;hair.scaling.y=.40;hair.material=dark
  for(const side of [-1,1]){
    const arm=MeshBuilder.CreateCylinder(`civilian-arm-${id}-${side}`,{height:.9,diameter:.19,tessellation:8},scene)
    arm.parent=root;arm.position.set(side*.37,1.09,0);arm.rotation.z=side*.22;arm.material=coat
    const leg=MeshBuilder.CreateCylinder(`civilian-leg-${id}-${side}`,{height:.64,diameter:.22,tessellation:8},scene)
    leg.parent=root;leg.position.set(side*.19,.34,0);leg.material=dark
  }
  return root
}

// CHAPTER ONE SET PIECE — a physical mission world rather than objective markers
// over three identical shelters. The story locations intentionally share the
// server's world coordinate system (0.02 meters per unit).
function createFrontierChapterWorld(scene: Scene) {
  // Four districts occupy different parts of the server-authoritative world.
  // The detailed buildings are loaded from the bundled environment OBJ pack.
  // This foreground set provides unique landmarks and actual mission consequences.
  const root = new TransformNode('chapter-one-four-distinct-districts', scene)
  const mat = (name:string,color:string,glow?:string) => {
    const m = new StandardMaterial(`chapter-${name}`,scene)
    m.diffuseColor=Color3.FromHexString(color)
    m.specularColor=new Color3(.12,.16,.18)
    if(glow)m.emissiveColor=Color3.FromHexString(glow)
    return m
  }
  const black=mat('scorched-metal','#1d2730')
  const steel=mat('armored-steel','#435768')
  const dark=mat('settlement-concrete','#303b41')
  const copper=mat('amber-civic-lights','#a87c40','#795019')
  const ice=mat('recovery-cyan','#50c8eb','#2b91d3')
  const threat=mat('enemy-signal','#c06a30','#b75b24')
  const smoke=mat('impact-smoke','#242932')
  const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,m:StandardMaterial,r=0) => {
    const o=MeshBuilder.CreateBox(`chapter-${name}`,{width:w,height:h,depth:d},scene)
    o.parent=root;o.position.set(x,y,z);o.rotation.y=r;o.material=m;o.receiveShadows=true
    return o
  }
  const cyl=(name:string,x:number,y:number,z:number,diam:number,h:number,m:StandardMaterial) => {
    const o=MeshBuilder.CreateCylinder(`chapter-${name}`,{diameter:diam,height:h,tessellation:16},scene)
    o.parent=root;o.position.set(x,y,z);o.material=m;return o
  }
  // LANDING ZONE: a burned flight deck and torn fuselage, not a corridor of shops.
  for(let i=0;i<10;i++){
    const a=i*.63
    const x=15+Math.sin(a)*7.8,z=27+Math.cos(a)*5.7
    const deck=box(`impact-debris-${i}`,x,.12,z,2.4,.13,.6,i%2?steel:black,a)
    deck.rotation.z=(i%3-1)*.14
  }
  for(const side of [-1,1]){
    box(`struck-engine-${side}`,15+side*4.3,.65,28.6,1.3,1.3,2.9,black,side*.27)
    cyl(`engine-exhaust-${side}`,15+side*4.3,.66,30,1.12,.12,threat)
    box(`fallen-wing-${side}`,15+side*3.7,.85,25,5.3,.24,2.1,steel,side*.47)
  }
  // Recovery hardware is visible from spawn and changes after the co-op upload.
  // The plea rests on a rock created at the story anchor, beside the wreck.
  const activeBeam=cyl('note-locator-light',10,1.22,22,.07,.16,copper)
  const ring=MeshBuilder.CreateTorus('blackbox-recovery-ring',{diameter:1.9,thickness:.035,tessellation:48},scene)
  ring.parent=root;ring.position.set(10,.19,22);ring.material=ice
  for(let i=0;i<3;i++){
    const x=11+i*2.65,z=29+i*.37
    box(`emergency-pod-${i}`,x,.62,z,1.6,1.25,2.8,black,i*.22)
    box(`emergency-pod-window-${i}`,x,1.12,z-.65,1.26,.38,.08,threat,i*.22)
  }
  const fire=[] as ReturnType<typeof MeshBuilder.CreateSphere>[]
  for(let i=0;i<7;i++){
    const f=MeshBuilder.CreateSphere(`crash-fire-${i}`,{diameter:.35+(i%3)*.25,segments:9},scene)
    f.parent=root;f.position.set(9.8+i*.55,.4+(i%3)*.32,25.3+(i%2)*.6)
    f.material=threat;f.scaling.set(.4,1.8,.4);f.visibility=0;fire.push(f)
  }
  const sootCloud=[] as ReturnType<typeof MeshBuilder.CreateSphere>[]
  for(let i=0;i<9;i++){
    const f=MeshBuilder.CreateSphere(`crash-smoke-${i}`,{diameter:1.3+(i%4)*.52,segments:9},scene)
    f.parent=root;f.position.set(10.4+Math.sin(i)*1.6,2+i*.91,25.2+Math.cos(i)*.6)
    f.material=smoke;f.visibility=0;sootCloud.push(f)
  }
  const plumeTexture=new DynamicTexture('soft-impact-plume',{width:64,height:64},scene,false)
  const plumeCtx=plumeTexture.getContext()
  const plumeGradient=plumeCtx.createRadialGradient(32,32,0,32,32,32)
  plumeGradient.addColorStop(0,'rgba(255,255,255,.6)');plumeGradient.addColorStop(.35,'rgba(255,255,255,.28)');plumeGradient.addColorStop(1,'rgba(255,255,255,0)')
  plumeCtx.fillStyle=plumeGradient;plumeCtx.fillRect(0,0,64,64);plumeTexture.hasAlpha=true;plumeTexture.update()
  const plume=new ParticleSystem('wreck-smoke',100,scene)
  plume.particleTexture=plumeTexture;plume.emitter=new Vector3(14,.7,27)
  plume.minEmitBox=new Vector3(-1,0,-.4);plume.maxEmitBox=new Vector3(1,0,.4)
  plume.color1=new Color4(.12,.13,.14,.35);plume.color2=new Color4(.22,.23,.23,.2);plume.colorDead=new Color4(.2,.22,.24,0)
  plume.minSize=.5;plume.maxSize=2;plume.minLifeTime=3;plume.maxLifeTime=5
  plume.emitRate=14;plume.direction1=new Vector3(.1,.8,0);plume.direction2=new Vector3(.5,1.2,.1)
  plume.minEmitPower=.6;plume.maxEmitPower=1;plume.blendMode=ParticleSystem.BLENDMODE_STANDARD;plume.start()
  // SETTLEMENT: broad roads, market light and approach barricades. The inn OBJ
  // is at 23,12; its dialogue anchor stays at the server's 23,12 coordinates.
  for(let i=0;i<8;i++){
    box(`settlement-road-${i}`,19+i*.86,.025,16.1-i*.52,1.6,.065,2.9,dark,-.55)
  }
  for(const [x,z] of [[19.3,10],[26.4,10.2],[20,14.6],[26,14.5]] as const){
    cyl(`settlement-lamp-post-${x}`,x,2,z,.14,3.9,steel)
    cyl(`settlement-lamp-${x}`,x,4.05,z,.49,.23,copper)
  }
  // RESISTANCE: separate from civilians, its objective radio stays at 30,13.8.
  for(const [x,z] of [[29.7,7.1],[37.9,7.1],[29.7,16.2],[37.9,16.2]] as const){
    cyl(`resistance-watchtower-${x}-${z}`,x,2,z,.88,4,steel)
    box(`resistance-observation-${x}-${z}`,x,4.2,z,2.2,.25,2.2,dark)
  }
  const dish=MeshBuilder.CreateTorus('resistance-dish',{diameter:2.8,thickness:.2,tessellation:35},scene)
  dish.parent=root;dish.position.set(34,5.7,12);dish.rotation.x=.65;dish.material=ice
  cyl('resistance-radio-mast',34,4,12,.18,7,steel)
  // OCCUPIED DETENTION COMPOUND: tangible perimeter, guarded approach and
  // a barrier that visibly opens after the rescue objective is accomplished.
  const fence=[] as ReturnType<typeof MeshBuilder.CreateBox>[]
  for(let i=0;i<8;i++){
    for(const z of [14.3,25.7])fence.push(box(`prison-wall-${i}-${z}`,39+i*1.65,1.45,z,1.55,2.9,.30,black))
  }
  for(let i=0;i<6;i++){
    fence.push(box(`prison-west-${i}`,39,1.45,15.6+i*1.65,.30,2.9,1.55,black))
    fence.push(box(`prison-east-${i}`,51,1.45,15.6+i*1.65,.30,2.9,1.55,black))
  }
  for(const [x,z] of [[39,14.3],[51,14.3],[39,25.7],[51,25.7]] as const){
    cyl(`prison-tower-${x}-${z}`,x,2.3,z,.9,4.5,steel)
    box(`prison-tower-platform-${x}-${z}`,x,4.7,z,2.0,.25,2.0,black)
  }
  const prisonGate=box('prison-captive-gate',44.9,1.45,14.3,3.3,2.9,.28,threat)
  const rescuees=[] as TransformNode[]
  for(let i=0;i<3;i++){
    const civilian=createFrontierCivilian(scene,`released-colonist-${i}`,false)
    civilian.parent=root;civilian.position.set(43.5+i*1.35,0,19.2)
    rescuees.push(civilian)
  }
  // Hostile reinforcements arrive only when the server starts a defense wave.
  const dropship=new TransformNode('chapter-enemy-dropship',scene)
  dropship.parent=root
  const shipBody=MeshBuilder.CreateBox('occupation-dropship-body',{width:3.8,height:.85,depth:6},scene)
  shipBody.parent=dropship;shipBody.material=black
  for(const side of [-1,1]){
    const wing=MeshBuilder.CreateBox(`occupation-wing-${side}`,{width:3.2,height:.19,depth:2.3},scene)
    wing.parent=dropship;wing.position.set(side*2.9,0,-.65);wing.rotation.z=side*.11;wing.material=steel
    const engine=MeshBuilder.CreateSphere(`occupation-engine-${side}`,{diameter:.67},scene)
    engine.parent=dropship;engine.position.set(side*2.25,-.15,-3.1);engine.material=threat
  }
  dropship.setEnabled(false)
  let rescued=false,uplink=false,wave=0,time=0,fly=-1
  const observer=scene.onBeforeRenderObservable.add(()=>{
    const dt=Math.min(scene.getEngine().getDeltaTime()/1000,.06)
    time+=dt
    activeBeam.visibility=uplink?.09:.4+.22*Math.sin(time*3)
    ring.visibility=uplink?.25:1
    for(let i=0;i<fire.length;i++)fire[i].position.y=.6+Math.abs(Math.sin(time*5+i))*.35
    for(let i=0;i<sootCloud.length;i++){
      sootCloud[i].position.y=2+i*.91+(time*.25)%2.1
      sootCloud[i].visibility=0
    }
    if(rescued){
      prisonGate.position.y=Math.max(-1.65,prisonGate.position.y-dt*1.2)
      for(let i=0;i<rescuees.length;i++){
        rescuees[i].position.x+=(23.5-rescuees[i].position.x)*dt*.09
        rescuees[i].position.z+=(13+i*.5-rescuees[i].position.z)*dt*.09
      }
    }
    if(fly>=0){
      fly+=dt;const t=Math.min(1,fly/12)
      dropship.position.set(54-32*t,10+3*Math.sin(t*Math.PI),17+7*t)
      dropship.rotation.y=-1.2
      if(t===1){fly=-1;dropship.setEnabled(false)}
    }
  })
  return {
    root,
    confirmUplink(){uplink=true},
    confirmRescue(){rescued=true},
    beginWave(nextWave:number){if(nextWave===wave)return;wave=nextWave;fly=0;dropship.setEnabled(true)},
    dispose(){scene.onBeforeRenderObservable.remove(observer);root.dispose()},
  }
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
const SCALE = 0.02
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
const ENVIRONMENT_ROOT =
  '/New%20folder/drive-download-20261003T222822Z-1-001/Environment/OBJ/'
// Chapter 1 coordinates match the authoritative server interaction checks.
// World coordinates are converted to Babylon units with sx/sz (scale 0.02).
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
    if(touchDevice)engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio))
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
      0.0032
    scene.fogColor =
      new Color3(
        0.083,
        0.091,
        0.115,
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
    const mineralMaterial =
      material(
        'mineral-material',
        new Color3(
          0.05,
          0.34,
          0.95,
        ),
        new Color3(
          0.04,
          0.18,
          0.75,
        ),
      )
    const energyMaterial =
      material(
        'energy-material',
        new Color3(
          0.55,
          0.08,
          0.82,
        ),
        new Color3(
          0.45,
          0.03,
          0.75,
        ),
      )
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
    sun.intensity =
      1.32
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
    levelVisuals.push(buildFarLandscape(scene))
    levelVisuals.push(buildWildFrontier(scene))

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
      26
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
    const fpsCamera = new FreeCamera(
      'kyrevant-fps-camera',
      new Vector3(sx(280), 1.65, sz(1240)),
      scene,
    )
    fpsCamera.minZ = 0.055
    fpsCamera.maxZ = 250
    fpsCamera.fov = 1.18
    // Face toward the playable settlement, with the ground in view.
    // Starting with a level horizon and looking toward the map edge
    // made combat mode appear to show only a blue/empty background.
    fpsCamera.setTarget(new Vector3(10, 1.5, 22))
    scene.activeCamera = fpsCamera
    const { root: fpsWeapon, flash: fpsFlash } = createWeaponView(scene, fpsCamera)
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
    renderPipeline.imageProcessing.contrast = 1.10
    renderPipeline.imageProcessing.exposure = 1.08

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

    const LOOK_SENSITIVITY = 0.0028
    const MAX_PITCH = Math.PI * 0.43
    let mouseSessionActive = false
    let hasCapturedClick = false
    let cursorReleased = false
    let previouslyLocked = false
    let lastClientX: number | null = null
    let lastClientY: number | null = null

    const isMouseLocked = () => document.pointerLockElement === canvas

    const applyLookDelta = (dx: number, dy: number) => {
      if (commandModeRef.current) return
      // Ignore extreme deltas after tab-switches or pointer-lock transitions.
      const deltaX = Math.max(-180, Math.min(180, dx))
      const deltaY = Math.max(-180, Math.min(180, dy))
      fpsCamera.rotation.y += deltaX * LOOK_SENSITIVITY
      fpsCamera.rotation.x = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, fpsCamera.rotation.x + deltaY * LOOK_SENSITIVITY),
      )
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

    const handleMouseMove = (event: MouseEvent) => {
      if (commandModeRef.current || cursorReleased) return
      const bounds = canvas.getBoundingClientRect()
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom
      if (isMouseLocked()) {
        // With pointer lock the browser reports relative deltas, even when the
        // visible cursor stays at the center of the viewport.
        applyLookDelta(event.movementX, event.movementY)
        return
      }
      if (!inside) {
        lastClientX = null
        lastClientY = null
        return
      }
      // Any movement over the battlefield can turn the camera. The first click
      // still requests pointer lock and captures keyboard focus, but previews
      // that block pointer lock no longer make the player visually frozen.
      if (!mouseSessionActive) {
        mouseSessionActive = true
        setMouseStatus('fallback')
      }
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
    window.addEventListener('mouseup', releaseTrigger)
    window.addEventListener('blur', releaseTrigger)
    window.addEventListener('mousemove', handleMouseMove)
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
          subdivisions: 72,
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
        const pathDistance=Math.abs(pz-(14+.15*(px-23)))
        const playableFade=Math.min(1,Math.max(0,(pathDistance-2.6)/8))
        const noise=smoothNoise(px/3.8,pz/3.9,8)*.65+smoothNoise(px/1.3,pz/1.3,38)*.2
        terrainPositions[i+1]=Math.max(-.10,(noise-.47)*.52)*playableFade
      }
      ground.setVerticesData(VertexBuffer.PositionKind,terrainPositions,true)
      const normals:number[]=[]
      VertexData.ComputeNormals(terrainPositions,Array.from(terrainIndices),normals)
      ground.setVerticesData(VertexBuffer.NormalKind,normals)
    }

    ground.material = groundMaterial
    ground.receiveShadows = true

    // Physically-based, scanned terrain loads progressively; the built-in
    // procedural material remains visible if the remote texture is blocked.
    try {
    const scannedGround = new PBRMaterial('kyrevant-scanned-ground-pbr', scene)
    scannedGround.metallic = 0.0
    scannedGround.roughness = 0.94
    scannedGround.albedoColor = new Color3(.42, .40, .38)
    const groundAlbedo = new Texture(
      KYREVANT_GROUND_COLOR_URL, scene, true, false,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => { if (!scene.isDisposed) ground.material = scannedGround },
      () => { console.warn('Scanned ground unavailable: using built-in terrain texture') },
    )
    groundAlbedo.uScale = 8
    groundAlbedo.vScale = 5
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
        new Vector3(x, .016, z),
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
    /*
      IMPORT HELPERS
    */
    const objCache = new Map<string, Promise<{
      positions: number[]
      normals: number[]
      uvs: number[]
      indices: number[]
    }>>()
    const atlasTexture = new Texture(
      '/New%20folder/drive-download-20261003T222822Z-1-001/Atlas.png',
      scene,
      false,
      false,
    )
    atlasTexture.hasAlpha = false
    const spaceKitMaterial = new StandardMaterial(
      'space-kit-atlas-material',
      scene,
    )
    spaceKitMaterial.diffuseTexture = atlasTexture
    spaceKitMaterial.diffuseColor = new Color3(1, 1, 1)
    spaceKitMaterial.specularColor = new Color3(0.12, 0.12, 0.12)
    spaceKitMaterial.specularPower = 48
    spaceKitMaterial.backFaceCulling = false
    function objIndex(raw: string | undefined, length: number) {
      if (!raw) {
        return -1
      }
      const parsed = Number.parseInt(raw, 10)
      if (Number.isNaN(parsed) || parsed === 0) {
        return -1
      }
      return parsed > 0
        ? parsed - 1
        : length + parsed
    }
    async function loadObjSource(
      rootUrl: string,
      filename: string,
    ) {
      const objUrl = new URL(
        rootUrl + filename,
        window.location.origin,
      ).href
      const cached = objCache.get(objUrl)
      if (cached) {
        return cached
      }
      const loading = (async () => {
        const response = await fetch(objUrl)
        if (!response.ok) {
          throw new Error(
            `Could not load ${filename}: ${response.status} ${response.statusText}`,
          )
        }
        const source = await response.text()
        const sourcePositions: number[][] = []
        const sourceNormals: number[][] = []
        const sourceUvs: number[][] = []
        const positions: number[] = []
        const normals: number[] = []
        const uvs: number[] = []
        const indices: number[] = []
        function pushVertex(token: string) {
          const [vRaw, vtRaw, vnRaw] = token.split('/')
          const vIndex = objIndex(vRaw, sourcePositions.length)
          const vtIndex = objIndex(vtRaw, sourceUvs.length)
          const vnIndex = objIndex(vnRaw, sourceNormals.length)
          const sourcePosition = sourcePositions[vIndex]
          if (!sourcePosition) {
            throw new Error(
              `Invalid vertex index while reading ${filename}`,
            )
          }
          positions.push(
            sourcePosition[0],
            sourcePosition[1],
            -sourcePosition[2],
          )
          const sourceUv = sourceUvs[vtIndex]
          if (sourceUv) {
            uvs.push(
              sourceUv[0],
              1 - sourceUv[1],
            )
          } else {
            uvs.push(0, 0)
          }
          const sourceNormal = sourceNormals[vnIndex]
          if (sourceNormal) {
            normals.push(
              sourceNormal[0],
              sourceNormal[1],
              -sourceNormal[2],
            )
          } else {
            normals.push(0, 0, 0)
          }
          const index = positions.length / 3 - 1
          indices.push(index)
        }
        for (const rawLine of source.split(/\r?\n/)) {
          const line = rawLine.trim()
          if (!line || line.startsWith('#')) {
            continue
          }
          if (line.startsWith('v ')) {
            const values = line
              .slice(2)
              .trim()
              .split(/\s+/)
              .map(Number)
            sourcePositions.push([
              values[0] ?? 0,
              values[1] ?? 0,
              values[2] ?? 0,
            ])
            continue
          }
          if (line.startsWith('vn ')) {
            const values = line
              .slice(3)
              .trim()
              .split(/\s+/)
              .map(Number)
            sourceNormals.push([
              values[0] ?? 0,
              values[1] ?? 0,
              values[2] ?? 0,
            ])
            continue
          }
          if (line.startsWith('vt ')) {
            const values = line
              .slice(3)
              .trim()
              .split(/\s+/)
              .map(Number)
            sourceUvs.push([
              values[0] ?? 0,
              values[1] ?? 0,
            ])
            continue
          }
          if (!line.startsWith('f ')) {
            continue
          }
          const face = line
            .slice(2)
            .trim()
            .split(/\s+/)
          if (face.length < 3) {
            continue
          }
          for (let i = 1; i < face.length - 1; i += 1) {
            // Flipping Z changes handedness, so reverse triangle winding.
            pushVertex(face[0])
            pushVertex(face[i + 1])
            pushVertex(face[i])
          }
        }
        const hasRealNormals = normals.some(
          (value) => Math.abs(value) > 0.00001,
        )
        if (!hasRealNormals) {
          const generatedNormals: number[] = []
          VertexData.ComputeNormals(
            positions,
            indices,
            generatedNormals,
          )
          normals.splice(
            0,
            normals.length,
            ...generatedNormals,
          )
        }
        return {
          positions,
          normals,
          uvs,
          indices,
        }
      })()
      objCache.set(objUrl, loading)
      return loading
    }
    async function importAsset(
      rootUrl: string,
      filename: string,
      position: Vector3,
      scale: number,
      rotationY = 0,
    ) {
      const geometry = await loadObjSource(
        rootUrl,
        filename,
      )
      const holder = new TransformNode(
        `${filename}-${Math.random()}`,
        scene,
      )
      holder.position = position.clone()
      holder.rotation.y = rotationY
      holder.scaling.setAll(scale)
      const mesh = new Mesh(
        `${filename}-mesh-${Math.random()}`,
        scene,
      )
      const vertexData = new VertexData()
      vertexData.positions = geometry.positions
      vertexData.normals = geometry.normals
      vertexData.uvs = geometry.uvs
      vertexData.indices = geometry.indices
      vertexData.applyToMesh(mesh)
      mesh.material = spaceKitMaterial
      mesh.parent = holder
      mesh.receiveShadows = true
      shadowGenerator.addShadowCaster(mesh)
      return {
        holder,
        result: {
          meshes: [mesh],
        },
      }
    }
    /*
      PLANETARY ENVIRONMENT
      All assets below come directly
      from the downloaded pack.
    */
    let frontierSetPiece: ReturnType<typeof createFrontierChapterWorld> | null = null
    async function buildEnvironment() {
      // The landing corridor is intentionally clear so the player can see the settlement.
      // Larger terrain forms are placed at the edges instead of at eye level in spawn.
      const placements: Array<[string,number,number,number,number,string]> = [
        // All of these meshes ship INSIDE the archived project; no CDN required.
        ['House_Open.obj',23,12,1.28,.17,'civilian'],
        ['House_Long.obj',26.7,11.2,.91,-.32,'civilian'],
        ['House_Single.obj',20.1,12,1.08,.15,'civilian'],
        ['House_Cylinder.obj',24.4,7.6,.84,.26,'civilian'],
        ['Building_L.obj',21,6.4,.65,-.2,'civilian'],
        ['Base_Large.obj',34,11,1.3,.5,'resistance'],
        ['GeodesicDome.obj',33.5,6.5,.8,.2,'resistance'],
        ['Roof_Radar.obj',34,11,.90,0,'resistance'],
        ['SolarPanel_Ground.obj',30,16,.85,.3,'resistance'],
        ['Building_L.obj',44.8,20,.88,.45,'occupation'],
        ['House_OpenBack.obj',48,19,.86,1.1,'occupation'],
        ['House_Single.obj',41.4,19,.76,-.65,'occupation'],
        ['Rock_Large_1.obj',3,5,.47,.10,'rock'],
        ['Rock_Large_2.obj',12,4,.66,1,'rock'],
        ['Rock_Large_3.obj',25,3,.71,2,'rock'],
        ['Rock_Large_1.obj',49,5,.71,1,'rock'],
        ['Rock_Large_2.obj',4,30,.55,2,'rock'],
        ['Rock_Large_3.obj',27,31,.64,0,'rock'],
        ['Rock_Large_1.obj',34,29,.63,1,'rock'],
        ['Rock_Large_2.obj',50,30,.55,0,'rock'],
        ['Tree_Spikes_1.obj',19,28,.9,0,'rock'],
        ['Tree_Spiral_1.obj',29,25,.62,.6,'rock'],
      ]
      // Unlike OBJ imports, the chapter world is constructed immediately and
      // does not depend on external downloads to become visible.
      if (!scene.isDisposed) {
        frontierSetPiece = createFrontierChapterWorld(scene)
        levelVisuals.push(frontierSetPiece.root)
        if ((room.quests ?? []).some(q=>q.id==='recover-flight-log' && q.complete))
          frontierSetPiece.confirmUplink()
        if ((room.quests ?? []).some(q => q.id === 'rescue-civilians' && q.complete)) frontierSetPiece.confirmRescue()
      }
      for(const [file,x,z,scale,rot,district] of placements) {
        try {
          const imported=await importAsset(ENVIRONMENT_ROOT,file,new Vector3(x,0,z),scale,rot)
          const color = district==='civilian' ? new Color3(.30,.32,.29)
            : district==='resistance' ? new Color3(.23,.30,.31)
            : district==='occupation' ? new Color3(.39,.27,.29)
            : new Color3(.36,.34,.32)
          const surface=material(`district-${file}-${x}-${z}`,color)
          surface.specularColor=new Color3(.12,.15,.17)
          imported.result.meshes.forEach(mesh=>{mesh.material=surface})
          levelVisuals.push(imported.holder)
        } catch (error) { console.warn(`Environment asset unavailable: ${file}`,error) }
      }
      levelVisuals.push(createCrashShip(scene,15,27))

      // The old three identical shelter meshes are intentionally NOT built here.
      // They covered the Last Light Inn, Resistance HQ, and prison compound.
      // The real chapter geometry is created above in createFrontierChapterWorld.
      // Quest locations are physical landmarks, not only quest-log text.
      // The server decides whether each E interaction can complete its objective.
      const siteAccent = metal(scene, 'npc-friendly-trim', '#8cb6c0', '#0e3944')
      const terminalShell = metal(scene, 'quest-terminal-shell', '#33444e')
      const terminalPanel = metal(scene, 'quest-terminal-light', '#4db8d6', '#1d637b')
      for (const site of KYREVANT_STORY_SITES) {
        const wx = sx(site.x), wz = sz(site.y)
        const anchor = new TransformNode(`quest-site-${site.quest}`, scene)
        anchor.position.set(wx, 0, wz)
        levelVisuals.push(anchor)
        chapterOneActors.push(anchor)
        if (site.quest === 'recover-flight-log') {
          const rock = MeshBuilder.CreateSphere('note-rock', {diameter: 1.8, segments: 7}, scene)
          rock.parent = anchor
          rock.position.y = .5
          rock.scaling.set(1.2, .65, .9)
          rock.material = terminalShell
          const paper = MeshBuilder.CreateGround('weathered-plea', {width: .65, height: .85}, scene)
          paper.parent = anchor
          paper.position.set(0, 1.10, 0)
          paper.rotation.z = -.12
          const ink = new DynamicTexture('elias-handwritten-note', {width:256,height:256}, scene, false)
          const context = ink.getContext()
          context.fillStyle = '#dacba3'
          context.fillRect(0,0,256,256)
          context.fillStyle = '#302a22'
          context.font = 'bold 20px serif'
          ;['IF ANYONE SEES THIS', '', 'Please come to the', 'LAST LIGHT REFUGE.', '', 'They took our people.', 'Ask for Elias.', '', 'Please hurry.'].forEach((line,i) => context.fillText(line,14,28+i*24))
          ink.update()
          const paperMaterial = new StandardMaterial('weathered-note-paper', scene)
          paperMaterial.diffuseTexture = ink
          paperMaterial.backFaceCulling = false
          paper.material = paperMaterial
        } else if (site.role !== 'terminal') {
          // Clearly non-hostile humanoid NPCs at the actual interaction positions.
          const npc = site.role === 'innkeeper' || site.role === 'survivor'
            ? createFrontierCivilian(scene, `npc-${site.quest}`,site.role === 'innkeeper')
            : createArmoredSoldier(scene, 'Fighter', `npc-${site.quest}`)
          npc.parent = anchor
          npc.rotation.y = -.45
          npc.scaling.setAll(site.role === 'leader' ? 1 : 0.91)
          // Colored shoulder marker makes them distinguishable from enemy soldiers.
          const shoulder = MeshBuilder.CreateBox(`npc-marker-${site.quest}`, {
            width: .55, height: .09, depth: .15,
          }, scene)
          shoulder.parent = anchor
          shoulder.position.set(0, 1.98, .22)
          shoulder.material = siteAccent
          shoulder.isPickable = false
        } else {
          const base = MeshBuilder.CreateBox('crash-log-terminal', {
            width: .92, height: 1.35, depth: .58,
          }, scene)
          base.parent = anchor
          base.position.y = .70
          base.material = terminalShell
          const screen = MeshBuilder.CreateBox('crash-log-screen', {
            width: .76, height: .60, depth: .08,
          }, scene)
          screen.parent = anchor
          screen.position.set(0, 1.04, .33)
          screen.material = terminalPanel
          screen.isPickable = false
        }
        // HUD/radar are the only navigation labels; no floating world billboards.
        const ring = MeshBuilder.CreateTorus(`quest-site-ring-${site.quest}`, {
          diameter: 2.0, thickness: .042, tessellation: 40,
        }, scene)
        ring.parent = anchor
        ring.position.y = .06
        ring.material = siteAccent
        ring.isPickable = false
      }

      const wallMat = material('outpost-concrete',new Color3(.19,.24,.29))
      wallMat.specularColor = new Color3(.20,.25,.29)
      const stripeMat=material('outpost-warning',new Color3(.62,.35,.10))
      const barrier=(x:number,z:number,r=0) => {
        const b=MeshBuilder.CreateBox(`cover-${x}-${z}`,{width:2.8,height:1.45,depth:.55},scene)
        b.position.set(x,.73,z);b.rotation.y=r;b.material=wallMat;b.receiveShadows=true
        const top=MeshBuilder.CreateBox(`cover-stripe-${x}-${z}`,{width:2.83,height:.13,depth:.6},scene)
        top.position.set(x,1.42,z);top.rotation.y=r;top.material=stripeMat
      }
      barrier(13,17,.17)
      barrier(17,13,-.15)
      barrier(27,21,.4)
      barrier(39,21,-.35)
      const steel=metal(scene,'field-wreckage-steel','#46525d')
      const soot=metal(scene,'field-wreckage-char','#1b252d')
      const hazard=metal(scene,'field-hazard-markings','#b07b37')
      const panelMesh=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,rot=0,mat:StandardMaterial=steel)=> {
        const m=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene)
        m.position.set(x,y,z);m.rotation.y=rot;m.material=mat;m.receiveShadows=true
        return m
      }
      // Damaged spaceport and walkable approaches to an occupied settlement.
      for(const [x,z] of [[15.5,24.5],[17.1,25.8],[12.8,25.8],[19.2,24.2]] as const) {
        const plate=panelMesh(`crash-deck-${x}-${z}`,1.8,.14,1.2,x,.065,z,(x+z)*.17,soot)
        plate.rotation.z=.04
        panelMesh(`crash-marking-${x}-${z}`,1.5,.018,.10,x,.144,z,(x+z)*.17,hazard)
      }
      for(let i=0;i<7;i++) {
        const x=10.2+noise01(i,44)*10
        const z=20+noise01(i,56)*10
        const piece=panelMesh(`impact-fragment-${i}`, .15+noise01(i,61)*.5,.06,.7+noise01(i,62)*.6,x,.1,z,noise01(i,66)*6.28,steel)
        piece.rotation.z=(noise01(i,71)-.5)*.9
      }
      const solarFrame=metal(scene,'solar-frame','#2a404f')
      const solarGlass=metal(scene,'solar-glass','#16384d','#061e2b')
      for(const [x,z] of [[24,8],[40,17],[46,14]] as const) {
        panelMesh(`array-frame-${x}`,3,.13,1.5,x,1.25,z,.45,solarFrame)
        for(let i=-2;i<=2;i++) panelMesh(`array-cell-${x}-${i}`,.52,.04,1.3,x+i*.54,1.35,z,.45,solarGlass)
        panelMesh(`array-support-${x}`, .14,1.3,.14,x,.67,z,0,solarFrame)
      }

      // Practical security floodlights instead of glowing carnival beacons.
      const securityLamp=metal(scene,'security-lamp-frame','#414b54')
      const lampLens=metal(scene,'security-lamp-lens','#c6d5d7','#526c76')
      for(const [x,z] of [[17,21],[29,17],[41,15],[48,10]] as const) {
        const post=MeshBuilder.CreateCylinder(`security-light-post-${x}-${z}`,{
          diameter:.14,height:3.2,tessellation:20},scene)
        post.position.set(x,1.60,z);post.material=securityLamp;post.isPickable=false
        const arm=MeshBuilder.CreateBox(`security-light-arm-${x}-${z}`,{
          width:.10,height:.10,depth:.9},scene)
        arm.position.set(x,3.1,z+.38);arm.material=securityLamp;arm.isPickable=false
        for(const side of [-1,1]) {
          const fixture=MeshBuilder.CreateBox(`security-fixture-${x}-${z}-${side}`,{
            width:.46,height:.21,depth:.20},scene)
          fixture.position.set(x+side*.29,3.05,z+.78);fixture.material=securityLamp
          const lens=MeshBuilder.CreateBox(`security-lens-${x}-${z}-${side}`,{
            width:.40,height:.15,depth:.025},scene)
          lens.position.set(x+side*.29,3.03,z+.897);lens.material=lampLens
        }
      }
      // Short modular stacks function as military storage and combat cover.
      for(const [x,z] of [[19,19],[26,9],[35,17],[46,23]] as const) {
        for(let i=0;i<3;i++) {
          const crate=MeshBuilder.CreateBox(`supply-${x}-${z}-${i}`,{width:1.1,height:1,depth:1.1},scene)
          crate.position.set(x+(i%2)*1.14,.51+(i===2?1.01:0),z)
          crate.material=i===2?wallMat:stripeMat
          crate.receiveShadows=true
        }
      }
    }

    function showChapterLandmarks(chapter: number) {
      chapterLandmark?.dispose()
      chapterOneActors.forEach(actor => actor.setEnabled(chapter === 1))
      chapterRelicRecovered = false
      if (chapter === 1) return
      chapterLandmark = new TransformNode('chapter-landmark',scene)
      const x = chapter === 2 ? 37 : 39.4, z = chapter === 2 ? 6.4 : 6.6
      chapterLandmark.position.set(x,0,z)
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
        marineContainer = SceneLoader.LoadAssetContainerAsync(KYREVANT_MARINE_URL, undefined, scene)
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
          assigned.albedoTexture = null
          assigned.albedoColor = uniform.clone()
          assigned.metallic = heavy ? .48 : .34
          assigned.roughness = commander ? .54 : .7
          assigned.emissiveColor = Color3.Black()
          assigned.emissiveTexture = null
        } else if (assigned instanceof StandardMaterial) {
          assigned.diffuseTexture = null
          assigned.diffuseColor = uniform.clone()
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
      const allMeshes = root.getChildMeshes()
      for (const mesh of allMeshes) {
        mesh.isPickable = false
        mesh.receiveShadows = true
        shadowGenerator.addShadowCaster(mesh)
      }
      equipOccupationMarine(root, allMeshes, role, id)
      const idle = copy.animationGroups.find(g => /idle/i.test(g.name))
      const walk = copy.animationGroups.find(g => /walk/i.test(g.name))
      const run = copy.animationGroups.find(g => /run/i.test(g.name))
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
      const placeholder = createArmoredSoldier(scene, role, id)
      placeholder.position.set(sx(x), 0, sz(y))
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
      if(resourceVisuals.has(node.id)) return
      const root=new TransformNode(`node-${node.id}`,scene)
      root.position.set(sx(node.x),0,sz(node.y))
      const bodyMaterial=material(`${node.id}-metal`,new Color3(.13,.17,.22))
      const signal=node.type==='minerals'?mineralMaterial:energyMaterial
      const pad=MeshBuilder.CreateCylinder(`${node.id}-foundation`,{diameter:1.5,height:.22,tessellation:12},scene)
      pad.parent=root;pad.position.y=.11;pad.material=bodyMaterial
      const canister=MeshBuilder.CreateCylinder(`${node.id}-extractor`,{diameter:.65,height:1.13,tessellation:12},scene)
      canister.parent=root;canister.position.y=.81;canister.material=bodyMaterial
      const core=MeshBuilder.CreateCylinder(`${node.id}-core`,{diameter:.28,height:.75,tessellation:10},scene)
      core.parent=root;core.position.y=.85;core.material=signal
      const ring=MeshBuilder.CreateTorus(`${node.id}-ring`,{diameter:1.05,thickness:.09,tessellation:24},scene)
      ring.parent=root;ring.position.y=1.29;ring.material=signal
      for(let i=0;i<4;i++) {
        const fin=MeshBuilder.CreateBox(`${node.id}-fin-${i}`,{width:.18,height:.62,depth:.28},scene)
        fin.parent=root;fin.position.set(Math.cos(i*Math.PI/2)*.54,.48,Math.sin(i*Math.PI/2)*.54)
        fin.rotation.y=i*Math.PI/2;fin.material=bodyMaterial
      }
      // Vertical signal marker makes mining locations identifiable in FPS view.
      const beacon = MeshBuilder.CreateCylinder(
        `${node.id}-location-beacon`,
        { height: 3.5, diameter: 0.055, tessellation: 10 },
        scene,
      )
      beacon.parent = root
      beacon.position.y = 3.0
      beacon.material = signal
      beacon.isPickable = false
      beacon.setEnabled(false)
      const beaconHead = MeshBuilder.CreateSphere(
        `${node.id}-location-beacon-head`,
        { diameter: 0.3, segments: 12 },
        scene,
      )
      beaconHead.parent = root
      beaconHead.position.y = 4.75
      beaconHead.material = signal
      beaconHead.isPickable = false
      beaconHead.setEnabled(false)
      root.setEnabled(true)
      resourceVisuals.set(node.id,root)
    }
    /*
      REAL BUILDING ASSETS
    */
    async function createBuilding(
      building: Building,
    ) {
      if (
        buildingVisuals.has(
          building.id,
        )
      ) {
        return
      }
      let filename:
        string
      let scale:
        number
      switch (
        building.type
      ) {
        case 'Extractor':
          filename =
            'GeodesicDome.obj'
          scale =
            0.38
          break
        case 'Barracks':
          filename =
            'Building_L.obj'
          scale =
            0.48
          break
        case 'PowerCore':
          filename =
            'Base_Large.obj'
          scale =
            0.38
          break
        case 'Turret': {
          /*
            The asset pack has no dedicated
            turret GLTF, so this remains a
            compact constructed defense
            instead of inventing another
            floating weapon.
          */
          const root =
            new TransformNode(
              `turret-${building.id}`,
              scene,
            )
          root.position.set(
            sx(building.x),
            0,
            sz(building.y),
          )
          const base =
            MeshBuilder.CreateCylinder(
              `${building.id}-base`,
              {
                diameter: 1.2,
                height: 0.55,
                tessellation: 12,
              },
              scene,
            )
          base.position.y =
            0.275
          base.parent =
            root
          const turretMaterial =
            new StandardMaterial(
              `${building.id}-material`,
              scene,
            )
          turretMaterial.diffuseColor =
            new Color3(
              0.16,
              0.18,
              0.23,
            )
          base.material =
            turretMaterial
          const head =
            MeshBuilder.CreateBox(
              `${building.id}-head`,
              {
                width: 0.9,
                height: 0.35,
                depth: 0.65,
              },
              scene,
            )
          head.position.y =
            0.8
          head.parent =
            root
          head.material =
            turretMaterial
          const barrel =
            MeshBuilder.CreateCylinder(
              `${building.id}-barrel`,
              {
                diameter: 0.08,
                height: 1.1,
              },
              scene,
            )
          barrel.rotation.x =
            Math.PI / 2
          barrel.position.set(
            0,
            0.85,
            0.72,
          )
          barrel.parent =
            root
          barrel.material =
            friendlyProjectileMaterial
          buildingVisuals.set(
            building.id,
            root,
          )
          return
        }
      }
      try {
        const imported =
          await importAsset(
            ENVIRONMENT_ROOT,
            filename,
            new Vector3(
              sx(building.x),
              0,
              sz(building.y),
            ),
            scale,
            0,
          )
        buildingVisuals.set(
          building.id,
          imported.holder,
        )
      } catch (error) {
        console.error(
          'Unable to load constructed building.',
          error,
        )
      }
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
      weaponKick = .12
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
    const keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false,
    }
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
      camera.radius = 18
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
            0,
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
            0,
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
          1.15,
          sz(attack.startY),
        )
      const end =
        new Vector3(
          sx(attack.targetX),
          1.2,
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
        fpsWeapon.position.z=.72-weaponKick
        fpsWeapon.position.y=-.29+Math.sin(performance.now()*.004)*.006
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
          const position = new Vector3(sx(local.x), 0, sz(local.y))
          if (commandModeRef.current) {
            camera.setTarget(position)
          } else {
            fpsCamera.position.copyFrom(position.add(new Vector3(0, 1.65, 0)))
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
        `SERVER: ${socket.connected ? 'ONLINE' : 'OFFLINE'}`,
      )
      if (commandModeRef.current || !socket.connected) return
      if (now - lastMove < 45) return
      if (vertical === 0 && horizontal === 0) return
      const yaw = fpsCamera.rotation.y
      // Match the original FreeCamera forward and right vectors, using the
      // yaw directly so graphics state cannot make movement undefined.
      const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw))
      const right = new Vector3(forward.z, 0, -forward.x)
      const movement = forward.scale(vertical).add(right.scale(horizontal))
      if (movement.lengthSquared() > 1) movement.normalize()
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
      window.removeEventListener('mousemove', handleMouseMove)
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
              ? 'WASD MOVE · HOLD CLICK TO FIRE · E INTERACT · ESC CURSOR'
              : mouseStatus === 'fallback'
                ? 'WASD MOVE · MOUSE AIM · HOLD CLICK TO FIRE'
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
          <button type="button" onClick={() => setShowRules(false)}>RETURN TO GAME</button>
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
        <button className="construction-toggle" aria-expanded={showBuildMenu} onClick={() => setShowBuildMenu(value => !value)}>{showBuildMenu ? "CLOSE BUILD" : "BUILD BASE"}</button>
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
