import {Color3, DynamicTexture, FreeCamera, Matrix, MeshBuilder, PBRMaterial, Scene, SceneLoader, StandardMaterial, TransformNode, Vector3} from '@babylonjs/core'
import {armorPanel, fieldMetal} from './FieldGeometry'
import './DetailedAssets'
export type EquipmentStatus='loading'|'ready'|'failed'
const models:Record<string,string>={Fighter:'rifle-m4.glb',Monk:'rifle-recon.glb',Cleric:'rifle-support.glb',Wizard:'rifle-marksman.glb'}

export function createFieldRifle(scene:Scene,camera:FreeCamera,role='Fighter',onStatus?:(status:EquipmentStatus)=>void){
  const root=new TransformNode(`${role}-service-weapon`,scene);root.parent=camera;root.position.set(.23,-.16,.55);root.rotation.y=-.015
  const flash=MeshBuilder.CreateSphere('hot-propellant',{diameter:.17,segments:8},scene)
  flash.parent=root;flash.position.set(0,.055,.42);flash.scaling.set(.65,.65,2.2);flash.renderingGroupId=2
  const material=new StandardMaterial('propellant-light',scene);material.emissiveColor=role==='Wizard'?new Color3(.55,.5,1):new Color3(1,.65,.22);material.alpha=.8
  flash.material=material;flash.setEnabled(false);flash.isPickable=false
  onStatus?.('loading')
  void SceneLoader.LoadAssetContainerAsync('/assets/detailed/',models[role]??models.Fighter,scene).then(container=>{
    if(scene.isDisposed){container.dispose();return}
    const authored=new TransformNode('textured-weapon-and-gloved-hands',scene);authored.parent=root;authored.rotation.y=Math.PI;authored.scaling.setAll(.5)
    const copy=container.instantiateModelsToScene(name=>`view-${name}`,false,{doNotInstantiate:true})
    copy.rootNodes.forEach(node=>{node.parent=authored;node.setEnabled(true)})
    copy.animationGroups.forEach(group=>group.stop())
    // Retrofit the authored weapon, retaining its detailed grip, action and hands.
    const gun=authored.getDescendants().find(node=>/Gun_(m4a1|mp5a5|scarl|vss)$/.test(node.name))
    if(gun instanceof TransformNode){
      authored.computeWorldMatrix(true);gun.computeWorldMatrix(true)
      const inverse=Matrix.Invert(gun.getWorldMatrix()),lo=new Vector3(Infinity,Infinity,Infinity),hi=new Vector3(-Infinity,-Infinity,-Infinity)
      for(const mesh of gun.getChildMeshes()){
        mesh.computeWorldMatrix(true)
        for(const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld){const p=Vector3.TransformCoordinates(corner,inverse);lo.minimizeInPlace(p);hi.maximizeInPlace(p)}
        if(mesh.material instanceof PBRMaterial){const mat=mesh.material.clone(`frontier-${mesh.material.name}`);mat.albedoColor=new Color3(.30,.39,.43);mat.metallic=.7;mat.roughness=.38;mesh.material=mat}
      }
      if(Number.isFinite(lo.x)){
        const size=hi.subtract(lo),center=lo.add(hi).scale(.5)
        const shell=fieldMetal(scene,'ceramic-induction-casing','#344b54',.72,.34)
        const light=fieldMetal(scene,'charged-induction-channel',role==='Wizard'?'#a497e9':'#6bc9dc',.4,.3);light.emissiveColor=role==='Wizard'?new Color3(.32,.14,.65):new Color3(.03,.22,.30)
        // Gun assets run along local Y; these plates wrap the existing upper receiver.
        for(const side of [-1,1]){
          const plate=armorPanel(scene,'receiver-ceramic-jacket',size.x*.13,size.y*.30,size.z*.18,size.x*.03,gun)
          plate.position.set(center.x+side*size.x*.49,center.y+size.y*.12,center.z+size.z*.1);plate.material=shell
          for(let i=0;i<5;i++){const vent=armorPanel(scene,'induction-vent',size.x*.018,size.y*.012,size.z*.06,size.x*.008,gun);vent.position.set(center.x+side*size.x*.565,center.y+size.y*(.04+i*.035),center.z+size.z*.1);vent.material=light}
        }
        const display=new DynamicTexture('weapon-charge-readout',{width:256,height:128},scene,false),dc=display.getContext();dc.fillStyle='#081b24';dc.fillRect(0,0,256,128);dc.fillStyle='#8cf0ff';dc.font='bold 37px monospace';dc.fillText('K-7 //',15,48);dc.font='22px monospace';dc.fillText('INDUCTION',15,86);display.update()
        const screenMat=new StandardMaterial('weapon-readout',scene);screenMat.diffuseTexture=display;screenMat.emissiveTexture=display;screenMat.disableLighting=true
        const screen=MeshBuilder.CreatePlane('receiver-charge-display',{width:size.x*.75,height:size.y*.12},scene);screen.parent=gun;screen.position.set(center.x,center.y+size.y*.13,hi.z+size.z*.025);screen.material=screenMat
      }
    }
    authored.getChildMeshes().forEach(mesh=>{mesh.isPickable=false;mesh.renderingGroupId=2})
    const muzzle=authored.getDescendants().find(node=>/MuzzleSocket$/.test(node.name))
    if(muzzle instanceof TransformNode){flash.parent=muzzle;flash.position=Vector3.Zero()}
    scene.setRenderingAutoClearDepthStencil(2,true,true,true)
    onStatus?.('ready')
  }).catch(error=>{
    if(scene.isDisposed)return
    console.warn('Unable to load detailed equipment.',error)
    onStatus?.('failed')
  })
  return {root,flash}
}
