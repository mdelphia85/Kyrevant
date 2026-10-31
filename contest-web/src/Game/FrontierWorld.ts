import {frontierHeight} from '../world'
import { Color3, Color4, DynamicTexture, Matrix, Mesh, MeshBuilder, ParticleSystem, PBRMaterial, Quaternion, Scene, SceneLoader, ShadowGenerator, StandardMaterial, Texture, TransformNode, Vector3, VertexBuffer, VertexData } from '@babylonjs/core'
import { armorPanel, beamBetween, fieldMetal } from './FieldGeometry'

// Base mission coordinates are kept intact; the frontier now spans 130 x 80 metres.
export const FRONTIER_SCALE=2.5
export function buildFrontierWorld(scene:Scene,shadows:ShadowGenerator){
  const root=new TransformNode('frontier-art-rebuild',scene)
  const steel=fieldMetal(scene,'weathered-ship-hull','#555d5b',.8,.46)
  const dark=fieldMetal(scene,'burned-metal','#202725',.64,.75)
  const cream=fieldMetal(scene,'settlement-ceramic','#8d9080',.2,.72)
  const green=fieldMetal(scene,'unit-olive','#555f49',.35,.63)
  const rust=fieldMetal(scene,'oxidized-frames','#6b5140',.65,.72)
  const hullColor=new Texture('/assets/detailed/hull-metal-color.webp',scene)
  const hullNormal=new Texture('/assets/detailed/hull-metal-normal.webp',scene)
  for(const material of [steel,green,rust]){material.albedoTexture=hullColor;material.bumpTexture=hullNormal;material.roughness=.65}
  const wallColor=new Texture('/assets/detailed/concrete-color.webp',scene);wallColor.uScale=3;wallColor.vScale=2
  const wallNormal=new Texture('/assets/detailed/concrete-normal.webp',scene);wallNormal.uScale=3;wallNormal.vScale=2
  cream.albedoTexture=wallColor;cream.bumpTexture=wallNormal;cream.albedoColor=new Color3(.40,.52,.54);cream.roughness=.82
  const rubber=fieldMetal(scene,'seals','#171e1c',.05,.95)
  const glass=new PBRMaterial('glazed-viewport',scene);glass.albedoColor=new Color3(.11,.21,.22);glass.metallic=.65;glass.roughness=.14
  const lamp=fieldMetal(scene,'warm-practical-lights','#c9b38a',.2,.45);lamp.emissiveColor=new Color3(.45,.3,.12)
  const soil=new PBRMaterial('weathered-rocks',scene);soil.albedoTexture=new Texture('/assets/rock-ground-color.webp',scene);soil.bumpTexture=new Texture('/assets/rock-ground-normal.webp',scene);soil.albedoColor=new Color3(.47,.49,.43);soil.metallic=0;soil.roughness=.98
  const panel=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,mat:PBRMaterial,parent=root)=>{const m=armorPanel(scene,name,w,h,d,.07,parent);m.position.set(x,y,z);m.material=mat;shadows.addShadowCaster(m);return m}
  const cylinder=(name:string,diameter:number,height:number,x:number,y:number,z:number,mat:PBRMaterial,parent=root)=>{const m=MeshBuilder.CreateCylinder(name,{diameter,height,tessellation:24},scene);m.parent=parent;m.position.set(x,y,z);m.material=mat;m.isPickable=false;m.receiveShadows=true;shadows.addShadowCaster(m);return m}
  const at=(x:number,z:number)=>new Vector3(x*FRONTIER_SCALE,0,z*FRONTIER_SCALE)
  const rand=(i:number)=>{const v=Math.sin(i*127.1+21.3)*43758.5453;return v-Math.floor(v)}
  function rock(name:string,x:number,z:number,w:number,h:number,d:number){
    const m=MeshBuilder.CreateSphere(name,{diameter:2,segments:12,updatable:true},scene)
    const positions=m.getVerticesData(VertexBuffer.PositionKind)!,indices=m.getIndices()!
    for(let n=0;n<positions.length;n+=3){const x=positions[n],y=positions[n+1],z=positions[n+2];const v=1+Math.sin(x*8+z*7)*.10+Math.cos(y*11+x*3)*.08;positions[n]*=v;positions[n+1]*=v;positions[n+2]*=v}
    m.updateVerticesData(VertexBuffer.PositionKind,positions);const normals:number[]=[];VertexData.ComputeNormals(positions,Array.from(indices),normals);m.updateVerticesData(VertexBuffer.NormalKind,normals)
    m.parent=root;m.position.set(x,frontierHeight(x,z)+Math.max(.05,h*.25),z);m.scaling.set(w,h,d);m.material=soil;m.rotation.y=rand(x+z)*6;m.isPickable=false;m.receiveShadows=true;shadows.addShadowCaster(m);return m
  }
  // The transport is behind and to the left of the player, leaving the note approach clear.
  const wreck=new TransformNode('crashed-unit-transport',scene);wreck.parent=root;wreck.position=at(4.4,28.7);wreck.rotation.set(.08,.42,-.13)
  const fuselage=MeshBuilder.CreateCylinder('torn-open-fuselage',{height:14,diameter:4.6,tessellation:24,arc:.73,enclose:true,cap:Mesh.NO_CAP},scene);fuselage.parent=wreck;fuselage.position.y=1.2;fuselage.rotation.x=Math.PI/2;fuselage.rotation.z=.5;fuselage.material=steel;shadows.addShadowCaster(fuselage)
  panel('transport-lower-keel',3.5,.45,14,0,.05,0,dark,wreck)
  for(let i=0;i<8;i++){
    const ring=MeshBuilder.CreateTorus(`exposed-frame-${i}`,{diameter:4.45,thickness:.10,tessellation:32},scene);ring.parent=wreck;ring.position.set(0,1.2,-6.2+i*1.65);ring.rotation.x=Math.PI/2;ring.material=rust;shadows.addShadowCaster(ring)
    for(const side of [-1,1])panel(`hull-armor-${side}-${i}`,.16,1.25,1.45,side*2.17,.9,-6.2+i*1.65,i%3===0?dark:green,wreck)
  }
  const nose=MeshBuilder.CreateSphere('buried-cockpit',{diameter:4.5,segments:20},scene);nose.parent=wreck;nose.position.set(0,.8,7.1);nose.scaling.set(1,.65,1.25);nose.material=dark;shadows.addShadowCaster(nose)
  for(const side of [-1,1]){
    const window=panel(`cracked-cockpit-glass-${side}`,1.7,.7,.12,side*.9,1.62,8.5,glass,wreck);window.rotation.y=side*.3
    const wing=panel(`sheared-delta-wing-${side}`,5.8,.20,4.4,side*4.05,.6,-1.4,steel,wreck);wing.rotation.y=side*.47;wing.rotation.z=side*.15
    for(let k=0;k<3;k++)beamBetween(scene,`wing-rib-${side}-${k}`,new Vector3(side*1.9,.7,-3+k*1.1),new Vector3(side*6.2,.45,-2+k*.65),.10,wreck,dark)
    const engine=cylinder(`turbine-body-${side}`,1.5,4.4,side*2.4,1.4,-4.8,dark,wreck);engine.rotation.x=Math.PI/2
    const exhaust=MeshBuilder.CreateTorus(`turbine-rim-${side}`,{diameter:1.42,thickness:.11,tessellation:28},scene);exhaust.parent=wreck;exhaust.position.set(side*2.4,1.4,-7.05);exhaust.rotation.x=Math.PI/2;exhaust.material=steel
    for(let k=0;k<10;k++){const blade=panel(`turbine-blade-${side}-${k}`,.50,.05,.18,side*2.4+Math.sin(k*.628)*.4,1.4+Math.cos(k*.628)*.4,-7,dark,wreck);blade.rotation.z=k*.628}
  }
  for(let i=0;i<22;i++){
    const x=10+rand(i)*13,z=60+rand(i+50)*17
    const shard=panel(`torn-hull-debris-${i}`,.3+rand(i+70)*1.5,.04,.4+rand(i+90)*1.2,x,.05,z,i%2?steel:dark);shard.rotation.set(rand(i+5)*.3,rand(i+4)*6,rand(i+3)*.2)
  }
  const scorchTex=new DynamicTexture('impact-scorch',{width:256,height:256},scene,false)
  const ctx=scorchTex.getContext(),gradient=ctx.createRadialGradient(128,128,10,128,128,128);gradient.addColorStop(0,'rgba(10,11,9,.88)');gradient.addColorStop(.55,'rgba(20,17,12,.55)');gradient.addColorStop(1,'rgba(20,17,12,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);scorchTex.hasAlpha=true;scorchTex.update()
  const scorchMat=new StandardMaterial('burned-ground',scene);scorchMat.diffuseTexture=scorchTex;scorchMat.useAlphaFromDiffuseTexture=true;scorchMat.specularColor=Color3.Black();scorchMat.disableLighting=true;scorchMat.emissiveColor=new Color3(.55,.5,.4)
  const scorch=MeshBuilder.CreateGround('long-impact-scar',{width:13,height:27},scene);scorch.parent=root;scorch.position.set(12,.035,68);scorch.rotation.y=.4;scorch.material=scorchMat;scorch.isPickable=false
  // Scaled, weathered rock with a physical paper note.
  rock('plea-rock',25,55,1.4,.85,1.1)
  const paper=new DynamicTexture('handwritten-plea',{width:512,height:512},scene,false);const pc=paper.getContext();pc.fillStyle='#c8bb91';pc.fillRect(0,0,512,512);pc.fillStyle='#37392e';pc.font='italic 35px serif';['If anyone sees this,','please come to the','LAST LIGHT REFUGE.','','They took everyone.','We need help.','— Elias'].forEach((line,i)=>pc.fillText(line,30,65+i*57));paper.update()
  const paperMat=new StandardMaterial('old-paper',scene);paperMat.diffuseTexture=paper;paperMat.specularColor=Color3.Black();paperMat.backFaceCulling=false
  const note=MeshBuilder.CreatePlane('physical-note',{width:.65,height:.65},scene);note.parent=root;note.position.set(25,1.13,55);note.rotation.set(Math.PI/2,.2,0);note.material=paperMat
  function sign(name:string,text:string,x:number,y:number,z:number,width:number){const texture=new DynamicTexture(`${name}-ink`,{width:1024,height:256},scene,false);const c=texture.getContext();c.fillStyle='#202a28';c.fillRect(0,0,1024,256);c.strokeStyle='#8f9577';c.lineWidth=6;c.strokeRect(14,14,996,228);c.fillStyle='#d7d5b8';c.font='bold 65px monospace';(c as CanvasRenderingContext2D).textAlign='center';c.fillText(text,512,145);texture.update();const material=new StandardMaterial(`${name}-sign-material`,scene);material.diffuseTexture=texture;material.emissiveColor=new Color3(.1,.1,.08);material.specularColor=Color3.Black();material.backFaceCulling=false;const plane=MeshBuilder.CreatePlane(name,{width,height:width/4},scene);plane.parent=root;plane.position.set(x,y,z);plane.rotation.y=Math.PI;plane.material=material;return plane}
  function habitat(name:string,bx:number,bz:number,width:number,depth:number,material:PBRMaterial){
    const x=bx*FRONTIER_SCALE,z=bz*FRONTIER_SCALE
    panel(`${name}-foundation`,width+.4,.35,depth+.4,x,.18,z,dark)
    panel(`${name}-rear-wall`,width,3.8,.22,x,2.25,z-depth/2,material)
    for(const side of [-1,1]){
      panel(`${name}-side-wall-${side}`,.22,3.8,depth,x+side*width/2,2.25,z,material)
      panel(`${name}-front-jamb-${side}`,width/2-1.1,3.8,.24,x+side*(width/4+.55),2.25,z+depth/2,material)
      for(let k=0;k<3;k++){
        panel(`${name}-window-frame-${side}-${k}`,.27,1.45,1.5,x+side*(width/2+.025),2.4,z-depth*.3+k*depth*.3,dark)
        panel(`${name}-window-glass-${side}-${k}`,.29,1.12,1.22,x+side*(width/2+.035),2.4,z-depth*.3+k*depth*.3,glass)
      }
      const roof=panel(`${name}-armored-roof-${side}`,width*.53,.42,depth+.7,x+side*width*.25,4.35,z,steel);roof.rotation.z=side*.045
      const brace=panel(`${name}-angled-front-buttress-${side}`,.55,4.4,.85,x+side*(width/2+.3),2.3,z+depth/2-.4,dark);brace.rotation.z=side*.18
      panel(`${name}-roof-edge-trim-${side}`,.15,.08,depth+.5,x+side*(width/2+.2),4.55,z,lamp)
      panel(`${name}-corner-frame-${side}`,.30,4.1,.32,x+side*width/2,2.4,z+depth/2,steel)
      panel(`${name}-entry-light-${side}`,.12,.85,.15,x+side*1.2,2.7,z+depth/2+.15,lamp)
    }
    panel(`${name}-door-header`,2.3,.65,.26,x,3.85,z+depth/2,dark)
    panel(`${name}-inner-darkness`,2.1,2.9,.08,x,1.9,z+depth/2-.7,rubber)
    panel(`${name}-porch`,4.8,.24,2.4,x,.32,z+depth/2+.8,steel)
    for(let i=0;i<3;i++)panel(`${name}-step-${i}`,3.4,.12*(3-i),.4,x,.06*(3-i),z+depth/2+2+i*.4,steel)
    for(let i=0;i<5;i++)panel(`${name}-panel-seam-${i}`,.035,3.5,.025,x-width/2+.5+i*(width-1)/4,2.1,z+depth/2+.14,dark)
    const antenna=cylinder(`${name}-antenna`,.06,3,x+width*.32,5.7,z-depth*.3,dark);antenna.isPickable=false
    return {x,z}
  }
  const refuge=habitat('last-light-refuge',23,10.4,11,8,cream)
  // Colony infrastructure gives the refuge a recognisable silhouette from spawn.
  const solar=fieldMetal(scene,'photovoltaic-cells','#173346',.72,.22)
  const cyan=fieldMetal(scene,'colony-powered-trim','#58c3d2',.3,.3);cyan.emissiveColor=new Color3(.07,.38,.44)
  for(const [x,z] of [[57.5,26],[67.5,17.5],[85,23.75]]){
    for(const side of [-1,1]){
      const array=panel('roof-solar-bank',3.8,.12,5.6,x+side*2.4,4.8,z,solar);array.rotation.z=side*.13
      for(let k=0;k<6;k++)panel('solar-cell-divider',.025,.025,5.5,x+side*2.4-1.7+k*.65,4.96,z,steel)
      const buttress=panel('habitat-external-brace',.35,4.7,.65,x+side*5.8,2.35,z+2.2,steel);buttress.rotation.z=side*.16
      panel('powered-door-strip',.07,2.6,.08,x+side*1.13,1.9,z+4.3,cyan)
    }
  }
  const relay=new TransformNode('colony-orbital-relay',scene);relay.parent=root;relay.position.set(74,0,12)
  for(const side of [-1,1])beamBetween(scene,'relay-angled-leg',new Vector3(side*3,0,0),new Vector3(side*.6,13,0),.3,relay,steel)
  for(let i=0;i<6;i++)beamBetween(scene,'relay-cross-bracing',new Vector3(-2.7+i*.35,i*2,0),new Vector3(2.35-i*.35,i*2+2,0),.09,relay,dark)
  const antennaRing=MeshBuilder.CreateTorus('orbital-relay-ring',{diameter:7,thickness:.28,tessellation:48},scene);antennaRing.parent=relay;antennaRing.position.y=15;antennaRing.rotation.x=Math.PI/2;antennaRing.rotation.y=.35;antennaRing.material=steel
  const innerRing=MeshBuilder.CreateTorus('orbital-relay-live-channel',{diameter:6.6,thickness:.055,tessellation:48},scene);innerRing.parent=relay;innerRing.position.copyFrom(antennaRing.position);innerRing.rotation.copyFrom(antennaRing.rotation);innerRing.material=cyan
  // Broad dust routes and wheel ruts break the repeating gravel without obscuring objectives.
  const routeTexture=new DynamicTexture('colony-dust-routes',{width:1024,height:1024},scene,false)
  const routeCtx=routeTexture.getContext() as CanvasRenderingContext2D
  routeCtx.clearRect(0,0,1024,1024);routeCtx.lineCap='round';routeCtx.lineJoin='round'
  const routes=[[[18,65],[25,55],[36,47],[48,38],[57,31]],[[57,31],[75,34],[93,42],[110,48]],[[57,31],[73,25],[85,28],[103,19],[112,18]]]
  for(const route of routes){
    for(const [width,color] of [[50,'rgba(100,86,66,.09)'],[36,'rgba(100,86,66,.12)'],[23,'rgba(116,101,77,.24)']] as const){routeCtx.strokeStyle=color;routeCtx.lineWidth=width;routeCtx.beginPath();route.forEach(([x,z],i)=>i?routeCtx.lineTo(x/130*1024,z/80*1024):routeCtx.moveTo(x/130*1024,z/80*1024));routeCtx.stroke()}
    for(const offset of [-5,5]){routeCtx.strokeStyle='rgba(33,32,27,.24)';routeCtx.lineWidth=2;routeCtx.beginPath();route.forEach(([x,z],i)=>i?routeCtx.lineTo(x/130*1024+offset,z/80*1024):routeCtx.moveTo(x/130*1024+offset,z/80*1024));routeCtx.stroke()}
  }
  routeTexture.hasAlpha=true;routeTexture.update()
  const routeMaterial=new StandardMaterial('ground-dust-and-ruts',scene);routeMaterial.diffuseTexture=routeTexture;routeMaterial.useAlphaFromDiffuseTexture=true;routeMaterial.specularColor=Color3.Black();routeMaterial.zOffset=-2
  const routesMesh=MeshBuilder.CreateGround('colony-supply-routes',{width:130,height:80,subdivisions:128,updatable:true},scene);routesMesh.parent=root;routesMesh.position.set(65,.06,40);routesMesh.material=routeMaterial;routesMesh.isPickable=false
  const routeVertices=routesMesh.getVerticesData(VertexBuffer.PositionKind)!;for(let i=0;i<routeVertices.length;i+=3)routeVertices[i+1]=frontierHeight(routeVertices[i]+65,routeVertices[i+2]+40);routesMesh.updateVerticesData(VertexBuffer.PositionKind,routeVertices)
  sign('refuge-sign','LAST LIGHT REFUGE',refuge.x,3.55,refuge.z+4.16,4.4)
  habitat('abandoned-colony-habitat',27,7,8,6,cream)
  habitat('resistance-headquarters',34,9.5,12,8,green)
  sign('resistance-sign','FRONTIER RESISTANCE',85,3.5,27.98,5)
  // Rugged radio beside the captain; state changes with the defense mission.
  const radio=new TransformNode('defense-radio',scene);radio.parent=root;radio.position=at(30,13.8)
  panel('radio-console',1.6,1.25,.65,0,.75,0,dark,radio)
  const radioLamp=panel('radio-status',.10,.08,.02,.55,1.05,.34,lamp,radio)
  cylinder('radio-aerial',.035,4,-.55,2.5,0,steel,radio)
  const dish=MeshBuilder.CreateSphere('radio-dish',{diameter:1.1,slice:.3,segments:20},scene);dish.parent=radio;dish.position.set(-.55,4.25,0);dish.rotation.x=.8;dish.material=steel
  // Industrial detention yard, cage gate and watchtowers.
  const gates:Mesh[]=[]
  const fence=(x:number,z:number,length:number,rotation:number)=>{
    const part=new TransformNode('detention-fence-section',scene);part.parent=root;part.position.set(x,0,z);part.rotation.y=rotation
    for(let k=0;k<=Math.ceil(length/2);k++)cylinder(`prison-upright-${x}-${z}-${k}`,.09,3.1,-length/2+k*2,1.55,0,steel,part)
    for(const y of [.3,1.5,2.85])panel('prison-horizontal',length,.065,.06,0,y,0,dark,part)
    for(let k=0;k<Math.floor(length/.32);k++){
      const bar=cylinder('prison-mesh-wire',.012,3,-length/2+k*.32,1.5,0,steel,part);bar.rotation.z=.28
    }
    return part
  }
  fence(97.5,50,28.5,Math.PI/2);fence(127.5,50,28.5,Math.PI/2);fence(112.5,64.25,30,0)
  fence(103,35.75,11,0);fence(122,35.75,11,0)
  const gate=panel('detention-gate',7,3.2,.22,112.5,1.6,35.75,dark);gates.push(gate)
  sign('detention-sign','ASHFALL // RESTRICTED',112.5,4.0,35.9,5)
  for(const [x,z] of [[98,36],[127,36],[98,64],[127,64]]){
    for(const side of [-1,1])beamBetween(scene,'watchtower-support',new Vector3(x+side*.9,0,z),new Vector3(x+side*.9,5,z),.16,root,steel)
    panel('watchtower-deck',3,.22,3,x,4.8,z,dark)
    panel('watchtower-canopy',3.2,.18,3.2,x,7,z,green)
    for(const side of [-1,1])panel('watchtower-window',.12,1.6,2.6,x+side*1.35,5.9,z,glass)
  }
  habitat('prison-service-bunker',45,21.5,12,6,green)
  // Authored scanned equipment replaces the geometric supply-box stand-ins.
  const installProps=async(file:string,placements:Array<[number,number,number,number]>)=>{
    const container=await SceneLoader.LoadAssetContainerAsync('/assets/detailed/',file,scene)
    if(scene.isDisposed){container.dispose();return}
    for(const [index,[x,z,angle,scale]] of placements.entries()){
      const holder=new TransformNode(`${file}-${index}`,scene);holder.parent=root;holder.position.set(x,frontierHeight(x,z),z);holder.rotation.y=angle;holder.scaling.setAll(scale)
      const copy=container.instantiateModelsToScene(name=>`${file}-${index}-${name}`,false,{doNotInstantiate:false})
      copy.rootNodes.forEach(node=>node.parent=holder)
      holder.getChildMeshes().forEach(mesh=>{mesh.isPickable=false;mesh.receiveShadows=true;shadows.addShadowCaster(mesh)})
    }
  }
  void installProps('concrete-cover.glb',[[36,46,.3,1.5],[46,40,-.3,1.5],[68,51,.5,1.5],[99,41,0,1.5],[110,29,.2,1.5]]).catch(console.warn)
  void installProps('field-generator.glb',[[51,33,.5,1.8],[90,28,-.4,1.8],[112,58,.8,1.8]]).catch(console.warn)
  // Large, irregular terrain forms replace low-poly mushroom trees and the black ridge wall.
  for(let i=0;i<75;i++){
    const angle=i/75*Math.PI*2,r=74+rand(i+20)*24
    rock(`frontier-cliff-${i}`,65+Math.cos(angle)*r,40+Math.sin(angle)*r,6+rand(i+7)*11,2+Math.pow(rand(i+8),2)*20,4+rand(i+9)*8)
  }
  for(let i=0;i<34;i++){
    const x=rand(i+300)*132,z=rand(i+400)*80
    if((x>20&&x<95&&z>15&&z<65)||(x>96&&z>34&&z<66))continue
    rock(`surface-boulder-${i}`,x,z,.6+rand(i+2),.4+rand(i+3)*1.3,.6+rand(i+4))
  }
  const bark=fieldMetal(scene,'alien-tree-bark','#393f32',0,.96)
  for(let i=0;i<20;i++){
    const x=7+rand(i+600)*115,z=4+rand(i+700)*70
    if(x>20&&x<125&&z>15&&z<68)continue
    const h=5+rand(i+800)*4
    const trunk=MeshBuilder.CreateCylinder('wind-carved-tree',{height:h,diameterTop:.12,diameterBottom:.55,tessellation:10},scene);trunk.parent=root;trunk.position.set(x,frontierHeight(x,z)+h/2,z);trunk.material=bark;trunk.rotation.z=.1;shadows.addShadowCaster(trunk)
    for(let k=0;k<5;k++){
      const angle=k*2.4
      beamBetween(scene,'swept-branch',new Vector3(x,frontierHeight(x,z)+h*.6,z),new Vector3(x+Math.sin(angle)*2,frontierHeight(x,z)+h+.3-k*.3,z+Math.cos(angle)*2),.13,root,bark)

    }
  }
  // Sparse crossed grass cards use one draw call and keep the travel routes readable.
  const grassTexture=new DynamicTexture('dry-frontier-grass',{width:256,height:256},scene,true)
  const gc=grassTexture.getContext();gc.clearRect(0,0,256,256)
  for(let i=0;i<54;i++){
    const x=32+rand(i+2400)*192,top=15+rand(i+2500)*170,lean=(rand(i+2600)-.5)*65
    gc.strokeStyle=i%3?'rgba(135,131,85,.88)':'rgba(77,107,99,.85)';gc.lineWidth=1+rand(i+2700)*2;gc.beginPath();gc.moveTo(x,256);gc.quadraticCurveTo(x+lean*.3,top+55,x+lean,top);gc.stroke()
  }
  grassTexture.hasAlpha=true;grassTexture.update()
  const grassMaterial=new StandardMaterial('dry-grass-surface',scene);grassMaterial.diffuseTexture=grassTexture;grassMaterial.opacityTexture=grassTexture;grassMaterial.backFaceCulling=false;grassMaterial.specularColor=Color3.Black();grassMaterial.transparencyMode=2
  const card=MeshBuilder.CreatePlane('grass-cross-a',{width:1.2,height:1.1},scene);card.position.y=.55;const crossed=card.clone('grass-cross-b');crossed.rotation.y=Math.PI/2
  const grass=Mesh.MergeMeshes([card,crossed],true,true)!;grass.name='frontier-grass-clusters';grass.material=grassMaterial;grass.isPickable=false
  const transforms:number[]=[]
  for(let i=0;i<520;i++){
    const x=rand(i+2800)*130,z=rand(i+3400)*80
    if((x>48&&x<120&&z>12&&z<57)||Math.hypot(x-25,z-55)<3)continue
    const scale=.45+rand(i+4000)*.75
    transforms.push(...Matrix.Compose(new Vector3(scale,scale,scale),Quaternion.RotationAxis(Vector3.Up(),rand(i+4600)*6.28),new Vector3(x,frontierHeight(x,z),z)).toArray())
  }
  grass.thinInstanceSetBuffer('matrix',new Float32Array(transforms),16,true);grass.parent=root
  const soft=new DynamicTexture('soft-wreck-plume',{width:64,height:64},scene,false);const sc=soft.getContext(),sg=sc.createRadialGradient(32,32,0,32,32,32);sg.addColorStop(0,'#ffffff88');sg.addColorStop(.5,'#ffffff30');sg.addColorStop(1,'#ffffff00');sc.fillStyle=sg;sc.fillRect(0,0,64,64);soft.hasAlpha=true;soft.update()
  const smoke=new ParticleSystem('wreck-smoke',100,scene);smoke.particleTexture=soft;smoke.emitter=new Vector3(11,1.5,70);smoke.minEmitBox=new Vector3(-1,0,-2);smoke.maxEmitBox=new Vector3(1,0,2);smoke.color1=new Color4(.13,.14,.13,.25);smoke.color2=new Color4(.20,.21,.19,.12);smoke.colorDead=new Color4(.2,.21,.2,0);smoke.minSize=1;smoke.maxSize=3;smoke.minLifeTime=4;smoke.maxLifeTime=7;smoke.emitRate=9;smoke.direction1=new Vector3(.3,1,0);smoke.direction2=new Vector3(.8,1.5,.3);smoke.blendMode=ParticleSystem.BLENDMODE_STANDARD;smoke.start()
  // Merge static surfaces by material: the frontier stays within a phone's draw-call budget.
  const staticGroups=new Map<PBRMaterial,Mesh[]>()
  root.getChildMeshes().forEach(mesh=>{
    if(!(mesh instanceof Mesh) || mesh===gate || mesh===radioLamp || !(mesh.material instanceof PBRMaterial))return
    const group=staticGroups.get(mesh.material)??[];group.push(mesh);staticGroups.set(mesh.material,group)
  })
  for(const [material,meshes] of staticGroups){
    if(meshes.length<2)continue
    meshes.forEach(mesh=>shadows.removeShadowCaster(mesh,false))
    const merged=Mesh.MergeMeshes(meshes,true,true,undefined,false,false)
    if(merged){merged.name=`frontier-static-${material.name}`;merged.parent=root;merged.material=material;merged.isPickable=false;merged.receiveShadows=true;shadows.addShadowCaster(merged,false)}
  }
  let rescued=false
  const observer=scene.onBeforeRenderObservable.add(()=>{if(rescued)gate.position.y=Math.max(-3,gate.position.y-scene.getEngine().getDeltaTime()*.002)})
  return {root,confirmUplink(){radioLamp.material=glass},confirmRescue(){rescued=true},beginWave(_wave:number){radioLamp.material=lamp},dispose(){scene.onBeforeRenderObservable.remove(observer);smoke.dispose();root.dispose()}}
}

export function buildFieldStructure(scene:Scene,type:string,x:number,z:number){
  const root=new TransformNode(`constructed-${type}`,scene);root.position.set(x,frontierHeight(x,z),z)
  const shell=fieldMetal(scene,`${type}-olive-housing`,'#5f6955',.5,.56),steel=fieldMetal(scene,`${type}-steel`,'#303b38',.8,.42),edge=fieldMetal(scene,`${type}-edges`,'#8e9383',.65,.35)
  const status=fieldMetal(scene,`${type}-status`,'#83acb1',.2,.4);status.emissiveColor=new Color3(.06,.18,.20)
  const panel=(name:string,w:number,h:number,d:number,px:number,py:number,pz:number,m:PBRMaterial)=>{const o=armorPanel(scene,name,w,h,d,.06,root);o.position.set(px,py,pz);o.material=m;return o}
  const cyl=(name:string,diameter:number,height:number,px:number,py:number,pz:number,m:PBRMaterial)=>{const o=MeshBuilder.CreateCylinder(name,{diameter,height,tessellation:20},scene);o.parent=root;o.position.set(px,py,pz);o.material=m;o.isPickable=false;return o}
  panel('anchored-platform',3,.22,3,0,.11,0,steel)
  if(type==='Barracks'){
    panel('barracks-body',5,2.8,4,0,1.6,0,shell);panel('barracks-door',1.1,2.2,.08,0,1.3,2.05,steel);panel('barracks-roof',5.3,.28,4.3,0,3.15,0,edge)
    for(const side of [-1,1]){panel('barracks-window',1.2,.6,.09,side*1.6,2.1,2.05,status);panel('barracks-strut',.18,3,.18,side*2.35,1.7,2.02,steel)}
  }else if(type==='Turret'){
    cyl('turret-mount',1.5,.6,0,.5,0,steel);cyl('traverse-ring',1,.22,0,.9,0,edge)
    panel('turret-armored-head',1.15,.55,1.3,0,1.25,0,shell)
    for(const side of [-1,1]){const barrel=cyl('turret-barrel',.12,1.6,side*.24,1.28,1.1,steel);barrel.rotation.x=Math.PI/2;const collar=cyl('turret-barrel-collar',.21,.3,side*.24,1.28,1.7,edge);collar.rotation.x=Math.PI/2}
    panel('optical-targeting-sensor',.18,.13,.05,0,1.54,.67,status)
  }else if(type==='Extractor'){
    for(const side of [-1,1]){panel('drill-outrigger',.25,2.4,.28,side*.9,1.3,0,steel);panel('drill-foot',.8,.2,.8,side*.9,.2,0,edge)}
    panel('drill-crosshead',2.3,.4,.9,0,2.6,0,shell);cyl('drill-spindle',.24,2,0,1.35,0,edge)
    for(let i=0;i<8;i++)cyl('auger-flight',.65-i*.035,.08,0,.4+i*.18,0,steel)
    panel('ore-processing-unit',1.2,1.2,1.5,0,.85,-1,shell);panel('extraction-status',.3,.15,.02,0,1.1,-1.76,status)
    const rotating=root.getChildMeshes().filter(mesh=>mesh.name==='drill-spindle'||mesh.name==='auger-flight')
    const observer=scene.onBeforeRenderObservable.add(()=>rotating.forEach(mesh=>mesh.rotation.y+=scene.getEngine().getDeltaTime()*.004))
    root.onDisposeObservable.add(()=>scene.onBeforeRenderObservable.remove(observer))
  }else{
    cyl('reactor-vessel',1.6,2.8,0,1.6,0,steel)
    for(let i=0;i<6;i++){const a=i*Math.PI/3;panel('reactor-cooling-fin',.12,2.2,.5,Math.sin(a)*.9,1.55,Math.cos(a)*.9,shell).rotation.y=a}
    for(const y of [.5,1.1,1.8,2.5])cyl('reactor-heat-band',1.72,.09,0,y,0,edge)
    cyl('reactor-top',1.8,.22,0,3,0,shell);panel('reactor-status-screen',.4,.28,.05,0,1.7,.86,status)
  }
  return root
}

export function buildOreDeposit(scene:Scene,id:string,type:string,x:number,z:number){
  const root=new TransformNode(`ore-${id}`,scene);root.position.set(x,frontierHeight(x,z),z)
  const rock=new PBRMaterial(`ore-host-${id}`,scene);rock.albedoTexture=new Texture('/assets/rock-ground-color.webp',scene);rock.albedoColor=new Color3(.32,.34,.29);rock.roughness=.95;rock.metallic=.1
  const ore=fieldMetal(scene,`ore-veins-${id}`,type==='minerals'?'#5c8390':'#8e855f',.7,.3);ore.emissiveColor=type==='minerals'?new Color3(.015,.07,.09):new Color3(.07,.05,.01)
  for(let i=0;i<7;i++){
    const a=i*2.399
    const stone=MeshBuilder.CreateIcoSphere(`ore-stone-${id}-${i}`,{radius:.45+i%3*.12,subdivisions:2,flat:false},scene);stone.parent=root;stone.position.set(Math.sin(a)*.8,.18,Math.cos(a)*.8);stone.scaling.y=.6;stone.material=rock;stone.isPickable=false
    const crystal=MeshBuilder.CreateCylinder(`ore-vein-${id}-${i}`,{diameterTop:.04,diameterBottom:.25,height:.6+i%3*.16,tessellation:6},scene);crystal.parent=root;crystal.position.set(Math.sin(a)*.65,.4,Math.cos(a)*.65);crystal.rotation.set(.2*Math.sin(a),a,.4*Math.cos(a));crystal.material=ore;crystal.isPickable=false
  }
  return root
}
