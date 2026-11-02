import { useEffect, useState } from 'react'
import './Arrival.css'
import TransportSequence from './TransportSequence'

const scenes = [
  { label: 'UNIT TRANSPORT / DEEP SPACE', title: 'One last routine passage.', text: 'Your unit is asleep when the proximity alarm sounds. Something massive has entered the flight path.' },
  { label: 'IMPACT / HULL BREACH', title: 'Brace for impact.', text: 'An asteroid tears through the transport. Engines fail. Through the fractured viewport, an unknown planet fills the sky.' },
  { label: 'KYREVANT / SURFACE', title: 'You survived the fall.', text: 'The asteroid brought your transport down. Your unit is alive, but there is no signal and no extraction. Beyond the wreck, a warm light is still burning.' },
  { label: 'CHAPTER ONE / THE LAST LIGHT', title: 'Find the others. Find shelter.', text: 'A lantern marks a handwritten note on a rock. Read it together, then follow the low amber lights toward the Last Light Refuge.' },
]

export default function Arrival({ onComplete }: { onComplete: () => void }) {
  const [scene, setScene] = useState(0)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('kyrevant-arrival-stage',{detail:scene}))
    const timer = window.setTimeout(() => setScene(value => Math.min(value + 1, scenes.length - 1)), 6500)
    return () => window.clearTimeout(timer)
  }, [scene])
  const current = scenes[scene]
  return <section className={`arrival arrival-${scene}`} role="dialog" aria-modal="true" aria-label="The fall of your transport">
    {scene<2&&<TransportSequence stage={scene} />}
    <div className="arrival-copy" key={scene}>
      <p className="arrival-label">{current.label}</p>
      <h1>{current.title}</h1>
      <p>{current.text}</p>
      <div className="arrival-progress" aria-label={`Scene ${scene + 1} of 4`}>{scenes.map((_, index) => <i key={index} className={index <= scene ? 'active' : ''} />)}</div>
      <button onClick={() => scene === 3 ? onComplete() : setScene(scene + 1)}>{scene === 3 ? 'Regain consciousness' : 'Continue'}</button>
      {scene < 3 && <button className="arrival-skip" onClick={onComplete}>Skip introduction</button>}
    </div>
  </section>
}
