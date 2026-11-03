export class CombatInput {
  readonly keys={w:false,a:false,s:false,d:false,space:false}
  touchX=0
  touchZ=0
  heading:number
  pitch:number
  constructor(heading=0,pitch=0){this.heading=heading;this.pitch=pitch}
  look(dx:number,dy:number){
    this.heading+=Math.max(-180,Math.min(180,dx))*.0028
    this.pitch=Math.max(-Math.PI*.43,Math.min(Math.PI*.43,this.pitch+Math.max(-180,Math.min(180,dy))*.0028))
  }
  movement(){
    const forward=Number(this.keys.w)-Number(this.keys.s)+this.touchZ
    const side=Number(this.keys.d)-Number(this.keys.a)+this.touchX
    let x=Math.sin(this.heading)*forward+Math.cos(this.heading)*side
    let z=Math.cos(this.heading)*forward-Math.sin(this.heading)*side
    const magnitude=Math.hypot(x,z)
    if(magnitude>1){x/=magnitude;z/=magnitude}
    return {x,z}
  }
  clear(){this.touchX=0;this.touchZ=0;this.keys.w=false;this.keys.a=false;this.keys.s=false;this.keys.d=false;this.keys.space=false}
}
