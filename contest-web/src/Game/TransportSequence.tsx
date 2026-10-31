import { loadFieldSquad } from './DetailedAssets'
import { useEffect, useRef } from 'react'
import { Color3, Color4, Engine, Scene, FreeCamera, Vector3, MeshBuilder, StandardMaterial, PointLight, HemisphericLight, Texture, TransformNode, DynamicTexture, GlowLayer } from '@babylonjs/core'

// An actual 3D troop compartment viewed through the survivor's eyes.
export default function TransportSequence({stage}:{stage:number}) {
  const canvas=useRef<HTMLCanvasElement>(null)
  const phase=useRef(stage)
  useEffect(()=>{phase.current=stage},[stage])
  useEffect(()=>{
    if(!canvas.current)return
    const engine=new Engine(canvas.current,true,{preserveDrawingBuffer:true})
    const scene=new Scene(engine);scene.clearColor=new Color4(.004,.009,.018,1)
    const camera=new FreeCamera('survivor-eyes',new Vector3(0,1.55,-4.4),scene)
    camera.setTarget(new Vector3(0,1.7,9));camera.fov=1.15
    camera.minZ=.05
    const cabin=new TransformNode('transport-cabin',scene)
    const mat=(name:string,color:string,emission?:string)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(.35,.4,.45);if(emission)m.emissiveColor=Color3.FromHexString(emission);return m}
    const hull=mat('ceramic-armor','#34434b'),seam=mat('recessed-metal','#101a22'),trim=mat('titanium-ribs','#62737a'),seat=mat('restraint-padding','#24382e'),blue=mat('cabin-light','#8ae5ff','#4599c0'),red=mat('warning-light','#e77542','#b63211')
    hull.diffuseTexture=new Texture('/assets/detailed/hull-metal-color.webp',scene);hull.bumpTexture=new Texture('/assets/detailed/hull-metal-normal.webp',scene)
    trim.diffuseTexture=hull.diffuseTexture;trim.bumpTexture=hull.bumpTexture
    const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,m:StandardMaterial)=>{const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);mesh.position.set(x,y,z);mesh.material=m;mesh.parent=cabin;return mesh}
    box('deck',0,-.12,1,6,.24,19,hull);box('ceiling',0,3.6,1,6,.2,19,seam)
    for(const side of [-1,1]){
      box('armored-wall',side*3,1.7,1,.2,3.5,19,hull)
      for(let i=0;i<8;i++){
        const z=-6+i*2
        box('structural-rib',side*2.85,1.7,z,.22,3.4,.16,trim)
        box('overhead-light',side*1.9,3.43,z,.12,.06,1.35,blue)
        box('troop-seat',side*2.35,.58,z,.85,.16,.9,seat)
        box('seat-back',side*2.7,1.05,z,.18,.92,.88,seat)
        box('head-restraint',side*2.64,1.67,z,.22,.32,.42,seam)
        box('harness',side*2.57,1.1,z,.025,.8,.08,trim)
        box('deck-track',side*.8,.014,z,.045,.02,1.8,trim)
        for(let n=0;n<4;n++)box('floor-grip',side*1.55,.015,z+n*.25,.75,.02,.035,seam)
      }
    }
    box('forward-bulkhead',0,2.9,9.2,6,1.4,.2,hull)
    box('window-base',0,.46,9.2,6,.9,.2,hull)
    for(const x of [-2.9,-1,1,2.9])box('viewport-frame',x,1.7,9.2,.12,2.4,.25,trim)
    const glass=mat('flight-glass','#132d3b');glass.alpha=.18
    box('flight-window',0,1.8,9.3,5.8,2.2,.035,glass)
    const screenTexture=new DynamicTexture('flight-status',{width:512,height:256},scene,false)
    const ctx=screenTexture.getContext();ctx.fillStyle='#08131b';ctx.fillRect(0,0,512,256);ctx.fillStyle='#9be4e7';ctx.font='26px monospace';ctx.fillText('UNIT TRANSPORT // 07',24,45);ctx.font='18px monospace';ctx.fillText('FLIGHT PATH: KYREVANT SECTOR',24,95);ctx.fillText('CREW STATUS: NOMINAL',24,132);ctx.fillText('PROXIMITY SCAN ACTIVE',24,190);screenTexture.update()
    const screenMat=mat('console-display','#ffffff','#345a65');screenMat.diffuseTexture=screenTexture
    const screen=MeshBuilder.CreatePlane('flight-console',{width:1.5,height:.75},scene);screen.parent=cabin;screen.position.set(0,1,8.4);screen.rotation.y=Math.PI;screen.material=screenMat;screenMat.backFaceCulling=false
    const planet=MeshBuilder.CreateSphere('alien-world',{diameter:14,segments:40},scene);planet.position.set(5,3,28);planet.material=mat('ocean-world','#335e69','#123441')
    const cloud=MeshBuilder.CreateTorus('orbital-cloud-band',{diameter:14.3,thickness:.12,tessellation:90},scene);cloud.position.copyFrom(planet.position);cloud.rotation.z=.5;cloud.material=blue
    const asteroid=MeshBuilder.CreateIcoSphere('incoming-asteroid',{radius:1.1,subdivisions:2,flat:true},scene);asteroid.position.set(-14,8,24);asteroid.material=mat('asteroid-basalt','#625348')
    ;(asteroid.material as StandardMaterial).diffuseTexture=new Texture('/assets/rock-ground-color.webp',scene)
    ;(asteroid.material as StandardMaterial).bumpTexture=new Texture('/assets/rock-ground-normal.webp',scene)
    const stars=mat('stars','#c9e5ff','#c9e5ff')
    for(let i=0;i<90;i++){const star=MeshBuilder.CreateSphere('distant-star',{diameter:.035+(i%3)*.015,segments:3},scene);star.position.set(Math.sin(i*127.1)*35,Math.cos(i*53.2)*20,38+Math.sin(i)*8);star.material=stars}
    const ambient=new HemisphericLight('ship-fill',new Vector3(0,1,0),scene);ambient.intensity=.42
    const light=new PointLight('compartment-light',new Vector3(0,2.9,-1),scene);light.diffuse=new Color3(.55,.8,1);light.intensity=1.6;light.range=18
    const alarm=new PointLight('emergency-light',new Vector3(0,2.5,7),scene);alarm.diffuse=new Color3(1,.14,.03);alarm.range=17;alarm.intensity=0
    box('warning-beacon',0,3.1,8.9,.7,.12,.15,red)
    void loadFieldSquad(scene).then(container=>{
      if(scene.isDisposed){container.dispose();return}
      for(const [index,x] of [-1.9,1.9].entries()){
        const crew=container.instantiateModelsToScene(name=>`transport-crew-${index}-${name}`,false,{doNotInstantiate:true})
        const member=new TransformNode(`unit-member-${index}`,scene);member.parent=cabin;member.position.set(x,0,5.5);member.rotation.y=index===0 ? .7 : -.7
        crew.rootNodes.forEach(node=>node.parent=member)
        crew.animationGroups.forEach(group=>group.stop());crew.animationGroups.find(group=>/^idle$/i.test(group.name))?.start(true)
      }
    }).catch(()=>{/* The cabin remains usable if the optional crew model cannot load. */})
    const glow=new GlowLayer('cabin-bloom',scene);glow.intensity=.35
    let previous=-1,started=performance.now()
    scene.onBeforeRenderObservable.add(()=>{
      const current=phase.current;if(current!==previous){previous=current;started=performance.now()}
      const t=(performance.now()-started)/1000
      const impact=current===1
      const shake=impact ? .035+Math.min(t/5,1)*.09 : .002
      camera.position.x=Math.sin(t*19)*shake;camera.position.y=1.55+Math.sin(t*27)*shake*.4
      camera.rotation.z=impact ? Math.sin(t*2)*.07 : Math.sin(t*.5)*.006
      alarm.intensity=impact ? 2+Math.sin(t*9)*1.6 : 0
      light.intensity=impact ? .45+Math.max(0,Math.sin(t*21))*.7 : 1.6
      if(impact){asteroid.position.set(-12+t*3,6-t*.8,24-t*3);asteroid.rotation.x=t;planet.scaling.setAll(1+t*.06)}
      cabin.rotation.z=current>=2 ? -.14 : 0
      if(current>=2){camera.rotation.x=.14;alarm.intensity=.8;light.intensity=.45;scene.clearColor=new Color4(.13,.17,.18,1)}
    })
    engine.runRenderLoop(()=>scene.render())
    const resize=()=>engine.resize();window.addEventListener('resize',resize)
    return()=>{window.removeEventListener('resize',resize);scene.dispose();engine.dispose()}
  },[])
  return <canvas className="transport-cinematic" ref={canvas} aria-label="First-person view inside the troop transport as an asteroid strikes" />
}
