import { AnimationGroup, AssetContainer, Matrix, MeshoptCompression, Quaternion, Scene, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core'
// All compressed assets decode locally, including on a phone with no third-party CDN access.
MeshoptCompression.Configuration={decoder:{url:'/assets/detailed/meshopt_decoder.js'}}
const squadCache=new WeakMap<Scene,Promise<AssetContainer>>()
export function loadFieldSquad(scene:Scene){
  let pending=squadCache.get(scene)
  if(!pending){
    pending=Promise.all([
      SceneLoader.LoadAssetContainerAsync('/assets/detailed/','tactical-suit.glb',scene),
      SceneLoader.LoadAssetContainerAsync('/assets/detailed/','field-soldier.glb',scene),
    ]).then(([suit,motion])=>{
      if(scene.isDisposed){motion.dispose();return suit}
      suit.meshes.filter(mesh=>mesh.name==='0'||/GreenCap|HeadphonesT/.test(mesh.material?.name??'')).forEach(mesh=>mesh.setEnabled(false))
      const boneName=(name:string)=>name.replace(/^.*mixamorig:/,'').replace(/_0\d+$/,'')
      const targets=new Map(suit.transformNodes.map(node=>[boneName(node.name),node]))
      for(const group of motion.animationGroups){
        if(!['idle','walk','run','aim_idle','aim_walk','aim_run'].includes(group.name))continue
        const retargeted=new AnimationGroup(group.name,scene)
        for(const track of group.targetedAnimations){
          if(track.animation.targetProperty!=='rotationQuaternion')continue
          const target=targets.get(boneName(track.target.name))
          if(target){
            const keys=track.animation.getKeys()
            if(!keys.length)continue
            const rest=target.rotationQuaternion?.clone() ?? Quaternion.Identity()
            const offset=rest.multiply((keys[0].value as Quaternion).clone().invert())
            const animation=track.animation.clone()
            animation.setKeys(keys.map(key=>({frame:key.frame,value:offset.multiply(key.value as Quaternion).normalize(),interpolation:key.interpolation})))
            retargeted.addTargetedAnimation(animation,target)
          }
        }
        if(retargeted.targetedAnimations.length)suit.animationGroups.push(retargeted)
        else retargeted.dispose()
      }
      motion.dispose()
      return suit
    })
    squadCache.set(scene,pending)
  }
  return pending
}

const helmetCache=new WeakMap<Scene,Promise<AssetContainer>>()
export async function addArmoredHelmet(scene:Scene,unit:TransformNode){
  const head=unit.getDescendants().find(node=>/mixamorig:Head_0\d+$/.test(node.name))
  if(!(head instanceof TransformNode))return
  let pending=helmetCache.get(scene)
  if(!pending){pending=SceneLoader.LoadAssetContainerAsync('/assets/detailed/helmet/','helmet.gltf',scene);helmetCache.set(scene,pending)}
  const container=await pending
  if(scene.isDisposed || unit.isDisposed())return
  const holder=new TransformNode('armored-flight-helmet',scene)
  const shape=new TransformNode('normalized-flight-helmet',scene);shape.parent=holder
  const copy=container.instantiateModelsToScene(name=>`helmet-${unit.name}-${name}`,false,{doNotInstantiate:false})
  copy.rootNodes.forEach(node=>{node.parent=shape;node.setEnabled(true)})
  const bounds=shape.getHierarchyBoundingVectors(true)
  const scale=.36/Math.max(.01,bounds.max.y-bounds.min.y)
  const centre=Vector3.Center(bounds.min,bounds.max)
  shape.scaling.setAll(scale);shape.position=centre.scale(-scale)
  holder.parent=unit
  holder.getChildMeshes().forEach(mesh=>{mesh.isPickable=false;mesh.receiveShadows=true})
  const inverse=Matrix.Identity()
  const observer=scene.onBeforeRenderObservable.add(()=>{
    if(unit.isDisposed()){scene.onBeforeRenderObservable.remove(observer);holder.dispose();return}
    unit.computeWorldMatrix(true).invertToRef(inverse)
    Vector3.TransformCoordinatesToRef(head.getAbsolutePosition(),inverse,holder.position)
    holder.position.y-=.05
  })
  return holder
}

const worldWeaponCache=new WeakMap<Scene,Promise<AssetContainer>>()
export async function addWorldServiceRifle(scene:Scene,unit:TransformNode){
  const hand=unit.getDescendants().find(node=>/mixamorig:RightHand_0\d+$/.test(node.name))
  if(!(hand instanceof TransformNode))return
  let pending=worldWeaponCache.get(scene)
  if(!pending){pending=SceneLoader.LoadAssetContainerAsync('/assets/detailed/','rifle-m4.glb',scene);worldWeaponCache.set(scene,pending)}
  const container=await pending
  if(scene.isDisposed || unit.isDisposed())return
  const source=container.transformNodes.find(node=>node.name==='Gun_m4a1')
  const gun=source?.clone(`service-rifle-${unit.name}`,hand,false)
  if(!gun)return
  const worldScale=new Vector3()
  hand.computeWorldMatrix(true).decompose(worldScale)
  const factor=1/Math.max(.001,Math.abs(worldScale.x))
  gun.scaling.setAll(.5*factor);gun.position.set(0,.15*factor,0)
  gun.rotationQuaternion=null;gun.rotation.set(Math.PI/2,0,0)
  gun.getChildMeshes().forEach(mesh=>{mesh.isPickable=false;mesh.receiveShadows=true;mesh.setEnabled(true)})
  return gun
}
