// Small synthesized effects keep the download light and require no audio CDN.
export class CombatAudio {
  private context: AudioContext | null = null
  enabled = true
  play(kind: 'shot' | 'hit' | 'hurt',role='Fighter') {
    if (!this.enabled) return
    try {
      this.context ??= new AudioContext()
      const context = this.context
      void context.resume().catch(() => {})
      if(kind==='shot'){
        const now=context.currentTime,buffer=context.createBuffer(1,Math.floor(context.sampleRate*.14),context.sampleRate),samples=buffer.getChannelData(0)
        for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/samples.length*5)
        const noise=context.createBufferSource(),filter=context.createBiquadFilter(),envelope=context.createGain()
        noise.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(role==='Wizard'?1200:role==='Monk'?3400:2200,now);filter.frequency.exponentialRampToValueAtTime(180,now+.12)
        envelope.gain.setValueAtTime(.11,now);envelope.gain.exponentialRampToValueAtTime(.001,now+.14)
        noise.connect(filter);filter.connect(envelope);envelope.connect(context.destination);noise.start();noise.onended=()=>{noise.disconnect();filter.disconnect();envelope.disconnect()}
      }
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const now = context.currentTime
      oscillator.type = kind === 'shot' ? 'sawtooth' : 'sine'
      oscillator.frequency.setValueAtTime(kind === 'shot' ? (role==='Wizard'?230:role==='Monk'?175:120) : kind === 'hit' ? 920 : 95, now)
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'shot' ? 38 : kind === 'hit' ? 480 : 45, now + .09)
      gain.gain.setValueAtTime(kind === 'shot' ? .07 : .035, now)
      gain.gain.exponentialRampToValueAtTime(.001, now + .1)
      oscillator.connect(gain);gain.connect(context.destination)
      oscillator.start(now);oscillator.stop(now + .11)
      oscillator.onended = () => {oscillator.disconnect();gain.disconnect()}
    } catch { /* Audio is optional on browsers that block playback. */ }
  }
  dispose() {void this.context?.close().catch(() => {});this.context=null}
}
