import {Color3, FreeCamera, MeshBuilder, Scene, SceneLoader, StandardMaterial, TransformNode, Vector3} from '@babylonjs/core'
import {buildInductionWeapon} from './InductionWeapon'
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
    const gun=authored.getDescendants().find(node=>/Gun_(m4a1|mp5a5|scarl|vss)$/.test(node.name))
    if(gun instanceof TransformNode)buildInductionWeapon(scene,gun,role)
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
