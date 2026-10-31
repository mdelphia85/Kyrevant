import { Color3, DynamicTexture, Mesh, PBRMaterial, Scene, TransformNode, Vector3, VertexData } from '@babylonjs/core'

// Closed chamfered solid with flat face normals, so edges catch the light.
export function armorPanel(scene:Scene,name:string,w:number,h:number,d:number,bevel:number,parent?:TransformNode){
  const r=Math.min(bevel,w*.24,h*.24,d*.24)
  const points=[[-w/2+r,-h/2],[w/2-r,-h/2],[w/2,-h/2+r],[w/2,h/2-r],[w/2-r,h/2],[-w/2+r,h/2],[-w/2,h/2-r],[-w/2,-h/2+r]]
  const rings=[{z:-d/2,k:.86},{z:-d/2+r,k:1},{z:d/2-r,k:1},{z:d/2,k:.86}]
  const vertices=rings.flatMap(ring=>points.map(([x,y])=>[x*ring.k,y*ring.k,ring.z]))
  const positions:number[]=[],indices:number[]=[],uvs:number[]=[]
  const face=(ids:number[])=>{
    const base=positions.length/3
    const a=vertices[ids[0]],b=vertices[ids[1]],c=vertices[ids[2]]
    const normal=Vector3.Cross(new Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),new Vector3(c[0]-a[0],c[1]-a[1],c[2]-a[2]))
    const axis=Math.abs(normal.z)>Math.abs(normal.y)&&Math.abs(normal.z)>Math.abs(normal.x)?'z':Math.abs(normal.y)>Math.abs(normal.x)?'y':'x'
    ids.forEach(id=>{const p=vertices[id];positions.push(...p)
      uvs.push(axis==='x'?p[2]/d+.5:p[0]/w+.5,axis==='y'?p[2]/d+.5:p[1]/h+.5)
    })
    for(let i=1;i<ids.length-1;i++)indices.push(base,base+i,base+i+1)
  }
  face([7,6,5,4,3,2,1,0]);face([24,25,26,27,28,29,30,31])
  for(let ring=0;ring<3;ring++)for(let n=0;n<8;n++){const a=ring*8+n,b=ring*8+(n+1)%8;face([a,b,b+8,a+8])}
  const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals)
  const data=new VertexData();data.positions=positions;data.indices=indices;data.normals=normals;data.uvs=uvs
  const mesh=new Mesh(name,scene);data.applyToMesh(mesh);if(parent)mesh.parent=parent
  mesh.isPickable=false;mesh.receiveShadows=true
  return mesh
}
const surfaceCache=new WeakMap<Scene,DynamicTexture>()
export function fieldMetal(scene:Scene,name:string,color:string,metallic=.65,roughness=.48){
  let texture=surfaceCache.get(scene)
  if(!texture){
    texture=new DynamicTexture('machined-surface',{width:256,height:256},scene,true)
    const ctx=texture.getContext();ctx.fillStyle='#e8e8e8';ctx.fillRect(0,0,256,256)
    for(let i=0;i<1600;i++){const x=(Math.sin(i*127.1)*43758.5%1+1)%1*256,y=(Math.sin(i*73.2)*1947.3%1+1)%1*256;ctx.fillStyle=i%3?'#d1d1d1':'#fbfbfb';ctx.fillRect(x,y,.5+i%2,1+i%7)}
    texture.update();surfaceCache.set(scene,texture)
  }
  const material=new PBRMaterial(name,scene);material.albedoColor=Color3.FromHexString(color);material.albedoTexture=texture;material.metallic=metallic;material.roughness=roughness
  material.backFaceCulling=false
  return material
}
export function beamBetween(scene:Scene,name:string,a:Vector3,b:Vector3,width:number,parent:TransformNode,material:PBRMaterial){
  const beam=armorPanel(scene,name,width,width,Vector3.Distance(a,b),width*.15,parent)
  beam.position=Vector3.Center(a,b);beam.lookAt(b);beam.material=material;return beam
}
