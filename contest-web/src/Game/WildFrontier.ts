import { Color3, Matrix, Quaternion, MeshBuilder, PBRMaterial, Scene, StandardMaterial, Texture, TransformNode, Vector3 } from '@babylonjs/core'

export function buildWildFrontier(scene:Scene){
  const root=new TransformNode('wild-frontier',scene)
  const stone=new PBRMaterial('weathered-basalt',scene);stone.albedoColor=new Color3(.32,.35,.31);stone.roughness=.96
  stone.albedoTexture=new Texture('/assets/rock-ground-color.webp',scene)
  const moss=new StandardMaterial('silver-alien-grass',scene);moss.diffuseColor=new Color3(.31,.39,.26);moss.specularColor=Color3.Black();moss.backFaceCulling=false
  const bark=new PBRMaterial('ancient-alien-bark',scene);bark.albedoColor=new Color3(.18,.22,.2);bark.roughness=.9
  const leaf=new StandardMaterial('canopy',scene);leaf.diffuseColor=new Color3(.16,.28,.24);leaf.specularColor=Color3.Black()
  const random=(i:number)=>{const n=Math.sin(i*127.1+37.7)*43758.5453;return n-Math.floor(n)}
  // Natural silhouettes beyond the navigable mission corridor; clear sight lines inside.
  for(let i=0;i<100;i++){
    const angle=random(i)*Math.PI*2,r=29+random(i+300)*13
    const x=26+Math.cos(angle)*r,z=16+Math.sin(angle)*r
    const rock=MeshBuilder.CreateIcoSphere(`basalt-outcrop-${i}`,{radius:1,subdivisions:2,flat:true},scene)
    rock.parent=root;rock.position.set(x,.2,z);rock.scaling.set(1+random(i+1)*3,1.3+random(i+2)*5,1+random(i+3)*2);rock.rotation.set(random(i+4),random(i+5)*6,.1);rock.material=stone;rock.isPickable=false
  }
  for(let i=0;i<34;i++){
    const x=2+random(i+1000)*48,z=2+random(i+2000)*28
    if((x>7&&x<37&&z>7&&z<29)||(x>38&&z>14))continue
    const h=4+random(i+4000)*5
    const trunk=MeshBuilder.CreateCylinder(`alien-trunk-${i}`,{height:h,diameterTop:.13,diameterBottom:.48,tessellation:9},scene);trunk.parent=root;trunk.position.set(x,h/2,z);trunk.rotation.z=(random(i+45)-.5)*.18;trunk.material=bark;trunk.isPickable=false
    for(let k=0;k<3;k++){
      const crown=MeshBuilder.CreateSphere(`wind-canopy-${i}-${k}`,{diameter:1,segments:8},scene);crown.parent=root;crown.position.set(x+Math.sin(k*2)*.7,h-k*.6,z+Math.cos(k*2)*.7);crown.scaling.set(2.5-k*.4,.5,1.7);crown.material=leaf;crown.isPickable=false
    }
  }
  const grass=MeshBuilder.CreateCylinder('frontier-grass',{height:1,diameterTop:0,diameterBottom:.035,tessellation:3},scene)
  grass.parent=root;grass.material=moss;grass.isPickable=false
  const blades:number[]=[]
  for(let i=0;i<420;i++){
    const x=random(i+5000)*53,z=random(i+6000)*32
    if((x>8&&x<12&&z>20&&z<24)||(x>12&&x<20&&z>24))continue
    const h=.18+random(i+7000)*.3
    blades.push(...Matrix.Compose(new Vector3(1,h,1),Quaternion.RotationAxis(Vector3.Forward(),(random(i+12)-.5)*.8),new Vector3(x,h/2,z)).toArray())
  }
  grass.thinInstanceSetBuffer('matrix',new Float32Array(blades),16,true)
  const moon=MeshBuilder.CreateSphere('pale-moon',{diameter:15,segments:32},scene);moon.parent=root;moon.position.set(-38,34,58)
  const moonMat=new StandardMaterial('moon-surface',scene);moonMat.diffuseColor=new Color3(.52,.58,.56);moonMat.emissiveColor=new Color3(.12,.15,.16);moon.material=moonMat;moon.isPickable=false
  return root
}
