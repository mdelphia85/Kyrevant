type Point={x:number;y:number}
export function enemyTactic(enemy:Point&{id:string;type:string;health:number;maxHealth:number},target:Point,now:number,visible:boolean){
  const dx=target.x-enemy.x,dy=target.y-enemy.y,d=Math.hypot(dx,dy)||1,fx=dx/d,fy=dy/d
  const side=[...enemy.id].reduce((sum,c)=>sum+c.charCodeAt(0),0)%2?1:-1
  const move=(mode:string,x:number,y:number,speed:number)=>{const length=Math.hypot(x,y)||1;return {mode,dx:x/length*speed,dy:y/length*speed}}
  const range=enemy.type==='Commander'?430:enemy.type==='Heavy'?320:280
  if(!visible)return move('flanking',fx-fy*side*.8,fy+fx*side*.8,enemy.type==='Heavy'?5:7)
  if(d>range)return move('advancing',fx,fy,enemy.type==='Heavy'?5:8)
  if(d<110||(enemy.health/enemy.maxHealth<.35&&d<260&&now%4000<1300))return move('withdrawing',-fx,-fy,4)
  if(enemy.type!=='Heavy'&&(now+enemy.id.length*170)%4200<1500)return move('flanking',-fy*side,fx*side,enemy.type==='Commander'?3:4)
  return {mode:'holding',dx:0,dy:0}
}
