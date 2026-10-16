const SAMPLE_RATE = 22050;
const BEAT = 60 / 104;
export const MUSIC_DURATION = BEAT * 64;
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

// An original, seamless 16-bar tune. All instruments are generated locally.
export function composeMusic(sampleRate = SAMPLE_RATE) {
  const length = Math.round(MUSIC_DURATION * sampleRate);
  const channels = [new Float32Array(length), new Float32Array(length)];
  const addNote = (midi, beat, duration, volume, pan, instrument='bell') => {
    const hz=frequency(midi), start=Math.round(beat*BEAT*sampleRate);
    const seconds=duration*BEAT;
    const left=Math.sqrt((1-pan)/2),right=Math.sqrt((1+pan)/2);
    for(let i=0;i<seconds*sampleRate;i++){
      const t=i/sampleRate,phase=2*Math.PI*hz*t;
      const attack=Math.min(1,t/.012),release=Math.min(1,(seconds-t)/.09);
      const wave=instrument==='bass'
        ? Math.sin(phase)+.13*Math.sin(phase*2)
        : Math.sin(phase)+.32*Math.sin(phase*2)*Math.exp(-t*7)+.11*Math.sin(phase*3)*Math.exp(-t*12);
      const envelope=attack*release*Math.exp(-t*(instrument==='bass'?2:4));
      const sample=wave*envelope*volume, index=(start+i)%length;
      channels[0][index]+=sample*left;channels[1][index]+=sample*right;
      if(instrument==='bell'){
        // A quiet, cross-channel echo wraps around the loop boundary.
        const echo=(index+Math.round(BEAT*.75*sampleRate))%length;
        channels[0][echo]+=sample*right*.12;channels[1][echo]+=sample*left*.12;
      }
    }
  };
  const chords=[[48,55,60,64,67],[45,52,57,60,64],[41,48,53,57,60],[43,50,55,59,62]];
  const melody=[
    [76,null,79,81,null,79,76,null], [72,null,76,null,79,76,72,null],
    [69,null,72,76,null,72,69,null], [74,null,76,79,74,null,71,null],
    [79,null,76,74,76,null,79,null], [76,null,72,69,null,72,76,null],
    [72,null,69,67,69,null,72,null], [71,null,74,null,79,74,72,null],
  ];
  for(let bar=0;bar<16;bar++){
    const chord=chords[bar%4],beat=bar*4;
    addNote(chord[0],beat,2,.24,0,'bass');addNote(chord[1],beat+2,1.8,.17,0,'bass');
    for(let step=0;step<4;step++)addNote(chord[2+step%3],beat+step+.25,1,.09,step%2?.35:-.35);
    melody[bar%8].forEach((note,step)=>{
      if(note!==null)addNote(note,beat+step*.5,1.4,bar<8?.14:.12,Math.sin(bar)*.18);
    });
  }
  let peak=0;
  for(const channel of channels)for(const sample of channel)peak=Math.max(peak,Math.abs(sample));
  const gain=.65/Math.max(.65,peak);
  for(const channel of channels)for(let i=0;i<length;i++)channel[i]*=gain;
  return {channels,sampleRate};
}

export class GameAudio {
  constructor({music=true,effects=false,createContext=()=>new (window.AudioContext||window.webkitAudioContext)()}={}) {
    this.music=music;this.effects=effects;this.createContext=createContext;
    this.active=true;this.context=null;this.buffer=null;this.voice=null;this.offset=0;
  }

  // Call only from a real pointer/key gesture, including when returning on iOS.
  unlock() {
    if(!this.music&&!this.effects)return;
    try{
      if(!this.context){
        this.context=this.createContext();
        this.context.onstatechange=()=>this.syncMusic();
      }
      if(this.context.state!=='running'){
        this.context.resume().then(()=>this.syncMusic()).catch(()=>{});
      }
      this.syncMusic();
    }catch{/* Audio is optional; gameplay must still work without it. */}
  }

  setPreferences({music=this.music,effects=this.effects}={}) {
    this.music=music;this.effects=effects;this.syncMusic();
  }

  setActive(active) {
    this.active=active;this.syncMusic();
  }

  syncMusic() {
    const c=this.context;
    if(!c)return;
    if(!this.music||!this.active||c.state!=='running'){this.stopMusic();return;}
    if(this.voice)return;
    if(!this.buffer){
      const {channels,sampleRate}=composeMusic();
      this.buffer=c.createBuffer(2,channels[0].length,sampleRate);
      channels.forEach((channel,index)=>this.buffer.copyToChannel(channel,index));
    }
    const source=c.createBufferSource(),gain=c.createGain(),now=c.currentTime;
    source.buffer=this.buffer;source.loop=true;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.55,now+.12);
    source.connect(gain);gain.connect(c.destination);
    source.onended=()=>{source.disconnect();gain.disconnect();};
    source.start(now,this.offset%this.buffer.duration);
    this.voice={source,gain,started:now};
  }

  stopMusic() {
    if(!this.voice)return;
    const {source,gain,started}=this.voice,c=this.context,now=c.currentTime;
    this.offset=(this.offset+Math.max(0,now-started))%this.buffer.duration;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0,now,.008);
    source.stop(now+.04);
    this.voice=null;
  }

  effect(kind,tier=0) {
    const c=this.context;
    if(!this.effects||!c||c.state!=='running')return;
    const now=c.currentTime,osc=c.createOscillator(),gain=c.createGain();
    const hz=kind==='drop'?220:kind==='finished'?120:370+tier*54;
    osc.connect(gain);gain.connect(c.destination);osc.type='sine';
    osc.frequency.setValueAtTime(hz,now);
    osc.frequency.exponentialRampToValueAtTime(hz*(kind==='finished'?.45:1.6),now+.12);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.075,now+.01);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.2);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(now);osc.stop(now+.22);
  }
}
