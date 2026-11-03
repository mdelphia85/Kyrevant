export class WeaponMotion{
  aimed=false
  aim=0
  recoil=0
  swayX=0
  swayY=0
  phase=0
  shoot(strength=1){this.recoil=Math.min(.065,this.recoil+.032*strength)}
  look(x:number,y:number){this.swayX=Math.max(-.018,Math.min(.018,this.swayX+x*.0001));this.swayY=Math.max(-.014,Math.min(.014,this.swayY+y*.0001))}
  update(dt:number,moving:boolean,reloadProgress=0){
    const seconds=Math.min(.05,Math.max(0,dt)),smooth=1-Math.exp(-seconds*13)
    this.aim+=(Number(this.aimed)-this.aim)*smooth
    this.recoil*=Math.exp(-seconds*17);this.swayX*=Math.exp(-seconds*9);this.swayY*=Math.exp(-seconds*9)
    this.phase+=seconds*(moving?10:2)
    const bob=Math.sin(this.phase)*(moving?.006:.0015)*(1-this.aim*.8)
    const reload=Math.sin(Math.PI*Math.max(0,Math.min(1,reloadProgress)))
    return {x:.23+reload*.08-this.aim*.095-this.swayX,y:-.20-reload*.24+this.aim*.035+bob+this.recoil*.14,z:.60-this.recoil-this.aim*.06,pitch:reload*.55-this.recoil*.65+this.swayY,roll:reload*-.55-this.swayX*.6,fov:1.10-this.aim*.32}
  }
  release(){this.aimed=false}
}
