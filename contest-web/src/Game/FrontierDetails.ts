import {Color3,DynamicTexture,Mesh,MeshBuilder,PBRMaterial,Scene,StandardMaterial,Texture,TransformNode,Vector3} from '@babylonjs/core'
import {frontierHeight,distanceToTrail} from '../world'
import {fieldMetal} from './FieldGeometry'

// Shared plant geometry and materials keep the added landscape inexpensive on phones.
export function buildFrontierDetails(scene:Scene,parent:TransformNode){
  const root=new TransformNode('living-frontier',scene);root.parent=parent
  const foliage=new PBRMaterial('alien-waxy-fronds',scene);foliage.albedoColor=new Color3(.17,.26,.23);foliage.roughness=.7;foliage.metallic=.08;foliage.backFaceCulling=false
  const veins=new PBRMaterial('alien-amber-seedheads',scene);veins.albedoColor=new Color3(.34,.25,.12);veins.roughness=.85
  const fronds:Mesh[]=[]
  for(let i=0;i<9;i++){
    const angle=i*2.399,length=.75+(i%3)*.28
    const left:Vector3[]=[],right:Vector3[]=[]
    for(let k=0;k<=6;k++){const t=k/6,r=t*length,width=Math.sin(t*Math.PI)*.11,y=Math.sin(t*Math.PI*.8)*length*.65;left.push(new Vector3(Math.sin(angle)*r+Math.cos(angle)*width,y,Math.cos(angle)*r-Math.sin(angle)*width));right.push(new Vector3(Math.sin(angle)*r-Math.cos(angle)*width,y,Math.cos(angle)*r+Math.sin(angle)*width))}
    const leaf=MeshBuilder.CreateRibbon('curved-alien-leaf',{pathArray:[left,right],sideOrientation:Mesh.DOUBLESIDE},scene);leaf.material=foliage;fronds.push(leaf)
  }
  const prototype=Mesh.MergeMeshes(fronds,true,true)!;prototype.name='frontier-frond-prototype';prototype.parent=root;prototype.isPickable=false;prototype.setEnabled(false)
  const seed=MeshBuilder.CreateTube('seedhead-prototype',{path:[new Vector3(0,0,0),new Vector3(.05,.65,0),new Vector3(.22,1.15,0),new Vector3(.3,1.3,0)],radius:.035,tessellation:5},scene);seed.material=veins;seed.parent=root;seed.setEnabled(false)
  const random=(n:number)=>{const f=Math.sin(n*127.1+31.7)*43758.5453;return f-Math.floor(f)}
  let planted=0
  for(let i=0;i<250;i++){
    const x=4+random(i+1)*122,z=4+random(i+400)*70
    // Preserve mission paths, the camp, build sites and readable landmarks.
    if(distanceToTrail(x,z)<3.6||Math.hypot(x-57.5,z-26)<10||Math.hypot(x-10,z-47)<11||x>97&&z>34)continue
    const plant=prototype.createInstance(`frond-colony-${planted}`);plant.parent=root;plant.setEnabled(true);plant.position.set(x,frontierHeight(x,z),z);plant.rotation.y=random(i+800)*6.28;plant.scaling.setAll(.5+random(i+900)*.9);plant.isPickable=false
    if(i%3===0){const stalk=seed.createInstance(`seedhead-${planted}`);stalk.parent=root;stalk.setEnabled(true);stalk.position.copyFrom(plant.position);stalk.rotation.y=plant.rotation.y;stalk.isPickable=false}planted++
  }
  const metal=fieldMetal(scene,'camp-weathered-metal','#46565a',.65,.55),fabric=fieldMetal(scene,'camp-bedding','#5b6658',0,.95),dark=fieldMetal(scene,'camp-dark-rubber','#1c292b',.1,.85)
  metal.albedoTexture=new Texture('/assets/detailed/hull-metal-color.webp',scene)
  const box=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,material:PBRMaterial)=>{const m=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.parent=root;m.position.set(x,y,z);m.material=material;m.isPickable=false;m.receiveShadows=true;return m}
  // The refuge entrance is now open onto an equipped shelter, rather than a black card.
  scene.getMeshByName('last-light-refuge-inner-darkness')?.dispose()
  box('refuge-interior-deck',10.4,.12,7.5,57.5,.42,26,metal)
  for(const side of [-1,1])for(const y of [1,2.1]){
    box('survivor-bunk-frame',2.3,.12,1,57.5+side*3.4,y,25,metal)
    box('survivor-bunk-mattress',2.1,.16,.85,57.5+side*3.4,y+.13,25,fabric)
    box('survivor-pillow',.45,.12,.72,57.5+side*4.1,y+.25,25,fabric)
  }
  for(const side of [-1,1])box('bunk-support',.07,2.4,.07,57.5+side*4.5,1.55,25,metal)
  box('refuge-map-table',2.3,.14,1.4,57.5,1.25,25.7,metal)
  for(const side of [-1,1])box('table-pedestal',.16,.8,.8,57.5+side*.85,.8,25.7,dark)
  const map=new DynamicTexture('refuge-map',{width:512,height:320},scene,false),c=map.getContext();c.fillStyle='#152c32';c.fillRect(0,0,512,320);c.strokeStyle='#628a83';c.lineWidth=2
  for(let i=0;i<8;i++){c.beginPath();c.moveTo(0,i*42);c.lineTo(512,i*42);c.stroke();c.beginPath();c.moveTo(i*70,0);c.lineTo(i*70,320);c.stroke()}
  c.fillStyle='#d3ac61';c.font='bold 24px monospace';c.fillText('LAST LIGHT / EVAC ROUTES',25,45);c.fillText('REFUGE  >  DETENTION',25,150);map.update()
  const mapMat=new StandardMaterial('refuge-tactical-map',scene);mapMat.diffuseTexture=map;mapMat.emissiveColor=new Color3(.25,.36,.32);mapMat.specularColor=Color3.Black()
  const screen=MeshBuilder.CreateGround('refuge-map-screen',{width:2,height:1.1},scene);screen.parent=root;screen.position.set(57.5,1.33,25.7);screen.material=mapMat;screen.isPickable=false
  // A ruptured cargo compartment beside the wreck exposes seats, cables and equipment.
  const cargo=new TransformNode('torn-open-transport-bay',scene);cargo.parent=root;cargo.position.set(15,frontierHeight(15,47),47);cargo.rotation.y=-.35
  const localBox=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,mat:PBRMaterial)=>{const m=box(name,w,h,d,0,0,0,mat);m.parent=cargo;m.position.set(x,y,z);return m}
  localBox('cargo-floor',2.8,.12,6,0,.3,0,metal);localBox('cargo-remaining-wall',.12,2.4,6,-1.4,1.5,0,metal)
  for(let i=0;i<5;i++){
    localBox('cargo-seat',.8,.12,.7,-.8,.9,-2+i*.95,dark);const back=localBox('cargo-seat-back',.75,.8,.1,-1.1,1.3,-2+i*.95,fabric);back.rotation.z=.15
    const rib=MeshBuilder.CreateTube('fractured-cargo-rib',{path:[new Vector3(-1.4,.3,-2+i*.95),new Vector3(-1.4,2.8,-2+i*.95),new Vector3(-.4,3,-2+i*.95),new Vector3(.6,2.8,-2+i*.95)],radius:.06,tessellation:6},scene);rib.parent=cargo;rib.material=metal;rib.isPickable=false
  }
  return root
}
