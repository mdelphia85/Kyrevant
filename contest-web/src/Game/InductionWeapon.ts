import {Color3, DynamicTexture, Matrix, Mesh, MeshBuilder, PBRMaterial, Scene, StandardMaterial, Texture, TransformNode, Vector3} from '@babylonjs/core'
import {armorPanel,fieldMetal} from './FieldGeometry'

/** Original induction weapon body in the hand rig's existing local coordinate system. */
export function buildInductionWeapon(scene:Scene,gun:TransformNode,role:string){
  gun.computeWorldMatrix(true)
  const inverse=Matrix.Invert(gun.getWorldMatrix()),lo=new Vector3(Infinity,Infinity,Infinity),hi=new Vector3(-Infinity,-Infinity,-Infinity)
  const originals=gun.getChildMeshes()
  for(const mesh of originals){mesh.computeWorldMatrix(true);for(const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld){const p=Vector3.TransformCoordinates(corner,inverse);lo.minimizeInPlace(p);hi.maximizeInPlace(p)}}
  if(!Number.isFinite(lo.x))return
  originals.forEach(mesh=>mesh.setEnabled(false))
  const size=hi.subtract(lo),center=lo.add(hi).scale(.5)
  const body=new TransformNode('original-kyrevant-induction-weapon',scene)
  const shell=fieldMetal(scene,'induction-ceramic','#46575c',.64,.40),dark=fieldMetal(scene,'induction-machined-core','#18252c',.82,.32),edge=fieldMetal(scene,'induction-titanium','#7b8e94',.8,.29)
  shell.albedoTexture=new Texture('/assets/detailed/hull-metal-color.webp',scene);shell.bumpTexture=new Texture('/assets/detailed/hull-metal-normal.webp',scene)
  const accent=role==='Wizard'?'#b6a5eb':role==='Cleric'?'#85dbc0':role==='Monk'?'#f1be77':'#79cfeb'
  const charge=fieldMetal(scene,'live-conduits',accent,.45,.3);charge.emissiveColor=Color3.FromHexString(accent).scale(.38)
  const panel=(name:string,w:number,l:number,h:number,x:number,y:number,z:number,mat= shell)=>{const m=armorPanel(scene,name,w,l,h,.025,body);m.position.set(x,y,z);m.material=mat;return m}
  const tube=(name:string,r:number,length:number,x:number,y:number,z:number,mat=dark)=>{const m=MeshBuilder.CreateCylinder(name,{diameter:r,height:length,tessellation:24},scene);m.parent=body;m.position.set(x,y,z);m.material=mat;return m}
  const heavy=role==='Wizard',compact=role==='Monk'
  // A continuous angular receiver, recessed reactor and a short magnetic accelerator.
  panel('ceramic-receiver',.86,.60,.36,0,.02,.12)
  panel('upper-sight-spine',.52,.55,.13,0,.01,.365,dark)
  panel('rear-recoil-buffer',.72,.23,.26,0,-.34,.17)
  panel('lower-action',.55,.31,.12,0,-.12,-.10,dark)
  const grip=panel('textured-pistol-grip',.48,.13,.32,0,-.23,-.29,dark);grip.rotation.x=-.2
  panel('grip-backstrap',.50,.025,.29,0,-.30,-.28,edge)
  // The power cell sits behind the support hand, instead of an assault-rifle magazine.
  panel('removable-power-cell',.62,.20,.24,0,-.02,-.23,dark)
  for(let i=0;i<3;i++)panel('power-cell-level',.38,.014,.018,0,-.075+i*.05,-.365,charge)
  tube('accelerator-core',heavy?.52:.32,compact?.27:.42,0,.39,.13)
  tube('recessed-emitter',heavy?.34:.20,.07,0,compact?.55:.63,.13,charge)
  for(const side of [-1,1]){
    const fairing=panel('tapered-forward-fairing',.18,compact?.24:.39,.25,side*.39,.35,.14);fairing.rotation.z=-side*.10
    panel('receiver-edge-rail',.06,.54,.035,side*.45,.02,.29,edge)
    for(let i=0;i<7;i++){
      panel('heat-exchanger-slot',.012,.020,.14,side*.44,-.15+i*.056,.13,dark)
      if(i<4)panel('induction-coil-window',.018,.015,.07,side*.49,.22+i*.052,.14,charge)
    }
    panel('optic-support',.07,.11,.14,side*.20,-.13,.47,dark)
  }
  panel('optic-crossbar',.48,.10,.035,0,-.13,.55,edge)
  panel('optic-lens',.29,.018,.11,0,-.105,.47,charge)
  for(let i=0;i<5;i++)panel('recoil-buffer-groove',.74,.012,.018,0,-.43+i*.035,.31,dark)
  const label=new DynamicTexture('induction-weapon-markings',{width:512,height:256},scene,false),c=label.getContext();c.fillStyle='#19272d';c.fillRect(0,0,512,256);c.strokeStyle='#61767a';c.lineWidth=3;c.strokeRect(12,12,488,232);c.fillStyle=accent;c.font='bold 62px monospace';c.fillText(heavy?'A-9 LANCE':compact?'K-3 WRAITH':role==='Cleric'?'S-4 WARDEN':'K-7 VANGUARD',24,86);c.font='25px monospace';c.fillText('KYREVANT // FIELD DIVISION',24,143);c.fillText('MAGNETIC INDUCTION SYSTEM',24,184);label.update()
  const marking=new StandardMaterial('etched-weapon-identification',scene);marking.diffuseTexture=label;marking.specularColor=new Color3(.25,.3,.32)
  const plate=MeshBuilder.CreatePlane('weapon-identification-plate',{width:.31,height:.155},scene);plate.parent=body;plate.position.set(.438,-.1,.15);plate.rotation.y=Math.PI/2;plate.material=marking
  // Bake the small machined parts into four material batches before applying rig transforms.
  const groups=new Map<PBRMaterial,Mesh[]>()
  for(const mesh of body.getChildMeshes())if(mesh instanceof Mesh&&mesh.material instanceof PBRMaterial){const group=groups.get(mesh.material)??[];group.push(mesh);groups.set(mesh.material,group)}
  for(const [material,meshes] of groups){const merged=Mesh.MergeMeshes(meshes,true,true);if(merged){merged.parent=body;merged.material=material}}
  // Authored gun rigs point along -Z with +Y up. Our modelling axes are +Y forward, +Z up.
  body.parent=gun;body.position.copyFrom(center);body.scaling.set(size.x,size.z,size.y);body.rotation.x=-Math.PI/2
  body.getChildMeshes().forEach(mesh=>{mesh.isPickable=false;mesh.receiveShadows=true})
  return body
}
