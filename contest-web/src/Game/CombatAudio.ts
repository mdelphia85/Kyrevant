// Small synthesized effects keep the download light and require no audio CDN.
export class CombatAudio {
  private context: AudioContext | null = null
  enabled = true
  play(kind: 'shot' | 'hit' | 'hurt') {
    if (!this.enabled) return
    try {
      this.context ??= new AudioContext()
      const context = this.context
      void context.resume().catch(() => {})
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const now = context.currentTime
      oscillator.type = kind === 'shot' ? 'sawtooth' : 'sine'
      oscillator.frequency.setValueAtTime(kind === 'shot' ? 155 : kind === 'hit' ? 920 : 95, now)
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
