import { useRef } from 'react'
import './TouchControls.css'
const send = (detail: Record<string, unknown>) => window.dispatchEvent(new CustomEvent('kyrevant-touch', {detail}))
export default function TouchControls({aiming=false}:{aiming?:boolean}) {
  const look = useRef<{x:number;y:number}|null>(null)
  const hold = (key:string, label:string) => <button aria-label={label} onPointerDown={e => {e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);send({key,down:true})}} onPointerUp={() => send({key,down:false})} onPointerCancel={() => send({key,down:false})} onLostPointerCapture={() => send({key,down:false})}>{label}</button>
  return <div className="touch-controls">
    <div className="touch-look" aria-label="Drag to aim" onPointerDown={e => {e.currentTarget.setPointerCapture(e.pointerId);look.current={x:e.clientX,y:e.clientY}}} onPointerMove={e => {if(!look.current)return;send({lookX:e.clientX-look.current.x,lookY:e.clientY-look.current.y});look.current={x:e.clientX,y:e.clientY}}} onPointerUp={() => {look.current=null}} onPointerCancel={() => {look.current=null}} onLostPointerCapture={() => {look.current=null}}><span>DRAG TO AIM</span></div>
    <div className="touch-move">{hold('w','↑')}<div>{hold('a','←')}{hold('s','↓')}{hold('d','→')}</div></div>
    <div className="touch-actions">{hold('fire','FIRE')}<button aria-pressed={aiming} onClick={() => send({action:'aim'})}>AIM</button><button onClick={() => send({action:'interact'})}>USE</button><button onClick={() => send({action:'ability'})}>ABILITY</button><button onClick={() => send({action:'mine'})}>MINE</button></div>
  </div>
}
