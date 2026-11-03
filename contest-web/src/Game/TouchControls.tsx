import {useEffect,useRef,useState} from 'react'
import './TouchControls.css'
const send=(detail:Record<string,unknown>)=>window.dispatchEvent(new CustomEvent('kyrevant-touch',{detail}))
export default function TouchControls({aiming=false}:{aiming?:boolean}){
  const look=useRef<{id:number;x:number;y:number}|null>(null),stick=useRef<{id:number;x:number;y:number}|null>(null)
  const [offset,setOffset]=useState({x:0,y:0})
  useEffect(()=>()=>{send({moveX:0,moveZ:0});send({key:'fire',down:false})},[])
  const releaseStick=()=>{stick.current=null;setOffset({x:0,y:0});send({moveX:0,moveZ:0})}
  const hold=(key:string,label:string)=><button aria-label={label} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);send({key,down:true})}} onPointerUp={()=>send({key,down:false})} onPointerCancel={()=>send({key,down:false})} onLostPointerCapture={()=>send({key,down:false})}>{label}</button>
  return <div className="touch-controls">
    <div className="touch-look" aria-label="Drag to aim" onPointerDown={e=>{if(look.current)return;e.currentTarget.setPointerCapture(e.pointerId);look.current={id:e.pointerId,x:e.clientX,y:e.clientY}}} onPointerMove={e=>{const previous=look.current;if(!previous||previous.id!==e.pointerId)return;send({lookX:e.clientX-previous.x,lookY:e.clientY-previous.y});look.current={id:e.pointerId,x:e.clientX,y:e.clientY}}} onPointerUp={e=>{if(e.pointerId===look.current?.id)look.current=null}} onPointerCancel={()=>{look.current=null}} onLostPointerCapture={()=>{look.current=null}}><span>DRAG TO AIM</span></div>
    <div className="touch-stick" role="group" aria-label="Movement joystick" onPointerDown={e=>{if(stick.current)return;e.preventDefault();const bounds=e.currentTarget.getBoundingClientRect();stick.current={id:e.pointerId,x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{const origin=stick.current;if(!origin||origin.id!==e.pointerId)return;const dx=e.clientX-origin.x,dy=e.clientY-origin.y,length=Math.max(42,Math.hypot(dx,dy)),x=dx/length,y=dy/length;setOffset({x:x*36,y:y*36});send({moveX:x,moveZ:-y})}} onPointerUp={releaseStick} onPointerCancel={releaseStick} onLostPointerCapture={releaseStick}><span style={{transform:`translate(${offset.x}px,${offset.y}px)`}}/><small>MOVE</small></div>
    <div className="touch-actions">{hold('fire','FIRE')}<button aria-pressed={aiming} onClick={()=>send({action:'aim'})}>AIM</button><button onClick={()=>send({action:'interact'})}>USE</button><button onClick={()=>send({action:'reload'})}>RELOAD</button><button onClick={()=>send({action:'ability'})}>ABILITY</button><button onClick={()=>send({action:'mine'})}>MINE</button></div>
  </div>
}
