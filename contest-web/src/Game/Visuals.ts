import {
  Color3, FreeCamera, MeshBuilder, Scene,
  StandardMaterial, TransformNode,
} from '@babylonjs/core'

type Role = 'Fighter' | 'Monk' | 'Cleric' | 'Wizard' | 'Raider' | 'Heavy' | 'Commander'

function metal(scene: Scene, name: string, base: string, glow?: string) {
  const mat = new StandardMaterial(name, scene)
  mat.diffuseColor = Color3.FromHexString(base)
  mat.specularColor = new Color3(0.36, 0.41, 0.46)
  mat.specularPower = 95
  if (glow) mat.emissiveColor = Color3.FromHexString(glow)
  return mat
}

export function createArmoredSoldier(scene: Scene, role: Role, id: string): TransformNode {
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
  sphere('helmet', .48, 0,2.25,0,armor,1.05,.97,1.04)
  box('visor',.39,.16,.065,0,2.3,.235,visor)
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

export function createWeaponView(scene: Scene, camera: FreeCamera) {
  const root = new TransformNode('fps-rifle-viewmodel', scene)
  root.parent = camera
  root.position.set(.31,-.37,.72)
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
  cube('rifle-receiver',.24,.17,.53,0,0,.05,gun)
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
  const flash=MeshBuilder.CreateSphere('fps-muzzle-flash',{diameter:.17,segments:10},scene)
  flash.parent=root;flash.position.set(0,-.01,.96);flash.material=cyan
  flash.isPickable=false;flash.setEnabled(false)
  return { root, flash }
}

// Create an open-ended military prefabricated shelter. Open entrance is on +Z.
export function createOutpost(scene: Scene, name: string, x: number, z: number, angle=0, scale=1) {
  const root = new TransformNode(name,scene)
  root.position.set(x,0,z);root.rotation.y=angle;root.scaling.setAll(scale)
  const hull=metal(scene,`${name}-hull`,'#394754')
  const trim=metal(scene,`${name}-trim`,'#717b86')
  const shadow=metal(scene,`${name}-shadow`,'#18212e')
  const lamp=metal(scene,`${name}-lamp`,'#57c6ef','#216b99')
  const panel=(id:string,w:number,h:number,d:number,x0:number,y0:number,z0:number,mat:StandardMaterial) => {
    const m=MeshBuilder.CreateBox(`${name}-${id}`,{width:w,height:h,depth:d},scene)
    m.parent=root;m.position.set(x0,y0,z0);m.material=mat;m.receiveShadows=true
    return m
  }
  panel('floor',7,.2,5,0,.12,0,shadow)
  panel('left-wall',.24,3.3,5,-3.4,1.75,0,hull)
  panel('right-wall',.24,3.3,5,3.4,1.75,0,hull)
  panel('back-wall',7,3.3,.25,0,1.75,-2.45,hull)
  panel('roof',7.2,.26,5.2,0,3.44,0,hull)
  panel('door-header',7,.45,.24,0,3.16,2.48,trim)
  panel('left-door-frame',.2,2.94,.3,-3.4,1.53,2.48,trim)
  panel('right-door-frame',.2,2.94,.3,3.4,1.53,2.48,trim)
  panel('light',3,.075,.2,0,3.0,2.36,lamp)
  for (const s of [-1,1]) {
    panel(`wall-panel-${s}`, .08,2.7,3.3,s*3.57,1.75,-.1,trim)
    panel(`roof-rail-${s}`, .18,.45,5.2,s*3.45,3.78,0,shadow)
    panel(`interior-console-${s}`,.75,1.1,1.35,s*2.5,.68,-1.35,shadow)
    panel(`console-screen-${s}`,.7,.4,.06,s*2.5,1.05,-.65,lamp)
  }
  for(let i=-2;i<=2;i++) panel(`roof-strut-${i}`,.15,.18,5.2,i*1.3,3.28,0,trim)
  return root
}

export function createCrashShip(scene: Scene, x: number, z: number): TransformNode {
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
