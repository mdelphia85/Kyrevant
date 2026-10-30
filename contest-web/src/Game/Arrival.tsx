import { useEffect, useState } from 'react'
import './Arrival.css'

const scenes = [
  { label: 'UNIT TRANSPORT / DEEP SPACE', title: 'One last routine passage.', text: 'Your unit is asleep when the proximity alarm sounds. Something massive has entered the flight path.' },
  { label: 'IMPACT / HULL BREACH', title: 'Brace for impact.', text: 'An asteroid tears through the transport. Engines fail. Through the fractured viewport, an unknown planet fills the sky.' },
  { label: 'KYREVANT / SURFACE', title: 'You survived the fall.', text: 'The wreck is burning. Your unit is alive. No signal. No extraction. Beyond the smoke, there are signs of habitation.' },
  { label: 'CHAPTER ONE / THE LAST LIGHT', title: 'Find the others. Find shelter.', text: 'Explore the crash site together. Someone has left a note on a rock beside the wreck. It may be your first way home.' },
]

export default function Arrival({ onComplete }: { onComplete: () => void }) {
  const [scene, setScene] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => setScene(value => Math.min(value + 1, scenes.length - 1)), 6500)
    return () => window.clearTimeout(timer)
  }, [scene])
  const current = scenes[scene]
  return <section className={`arrival arrival-${scene}`} role="dialog" aria-modal="true" aria-label="The fall of your transport">
    <div className="arrival-stars" aria-hidden="true" />
    <div className="arrival-planet" aria-hidden="true" />
    <div className="arrival-ship" aria-hidden="true" />
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
