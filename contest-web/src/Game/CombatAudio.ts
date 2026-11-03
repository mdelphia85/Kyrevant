// Local Web Audio effects: layered mechanical transients, propellant and energy tails.
export class CombatAudio {
  private context:AudioContext|null=null
  private noise:AudioBuffer|null=null
  enabled=true
  play(kind:'shot'|'hit'|'hurt'|'reload',role='Fighter'){
    if(!this.enabled)return
    try{
      this.context??=new AudioContext();const c=this.context;void c.resume().catch(()=>{})
      if(!this.noise){this.noise=c.createBuffer(1,c.sampleRate,c.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1}
      const now=c.currentTime
      const tone=(start:number,duration:number,from:number,to:number,volume:number,type:OscillatorType='sine')=>{
        const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(from,start);o.frequency.exponentialRampToValueAtTime(to,start+duration);g.gain.setValueAtTime(.001,start);g.gain.exponentialRampToValueAtTime(volume,start+.003);g.gain.exponentialRampToValueAtTime(.001,start+duration);o.connect(g);g.connect(c.destination);o.start(start);o.stop(start+duration);o.onended=()=>{o.disconnect();g.disconnect()}
      }
      const noise=(start:number,duration:number,frequency:number,volume:number)=>{
        const n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();n.buffer=this.noise;f.type='lowpass';f.frequency.setValueAtTime(frequency,start);f.frequency.exponentialRampToValueAtTime(160,start+duration);g.gain.setValueAtTime(volume,start);g.gain.exponentialRampToValueAtTime(.001,start+duration);n.connect(f);f.connect(g);g.connect(c.destination);n.start(start);n.stop(start+duration);n.onended=()=>{n.disconnect();f.disconnect();g.disconnect()}
      }
      if(kind==='shot'){
        const energy=role==='Wizard',light=role==='Monk'
        noise(now,energy?.24:light?.105:.18,energy?1700:light?4600:3200,energy?.10:.20)
        tone(now,.12,energy?300:light?140:100,energy?65:35,.10,energy?'sawtooth':'triangle')
        tone(now,.025,1800,340,.035,'square')
        noise(now+.045,.24,800,.025)
      }else if(kind==='reload'){
        noise(now,.10,2100,.07);tone(now,.04,420,120,.04,'triangle')
        noise(now+.65,.07,3100,.07);noise(now+1.1,.10,1700,.09)
      }else if(kind==='hit'){
        noise(now,.055,4300,.065);tone(now,.07,1000,580,.025)
      }else{noise(now,.18,550,.10);tone(now,.16,80,35,.06)}
    }catch{/* Sound remains optional when a browser blocks audio. */}
  }
  dispose(){void this.context?.close().catch(()=>{});this.context=null;this.noise=null}
}
