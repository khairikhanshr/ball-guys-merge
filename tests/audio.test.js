import test from 'node:test';
import assert from 'node:assert/strict';
import { composeMusic, GameAudio, MUSIC_DURATION } from '../audio.js';

function mockContext(state='running') {
  const param=()=>({setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
  return {
    state,currentTime:0,destination:{},sources:[],oscillators:[],buffers:0,
    resume(){this.state='running';return Promise.resolve();},
    createBuffer(channels,length,sampleRate){this.buffers++;return {duration:length/sampleRate,copyToChannel(){}};},
    createGain(){return {gain:param(),connect(){},disconnect(){}};},
    createBufferSource(){const source={starts:[],stops:[],connect(){},disconnect(){},start(...args){this.starts.push(args);},stop(...args){this.stops.push(args);}};this.sources.push(source);return source;},
    createOscillator(){const osc={frequency:param(),connect(){},disconnect(){},start(){},stop(){}};this.oscillators.push(osc);return osc;},
  };
}

test('the original stereo music loop contains audible, finite audio without clipping or a boundary click',()=>{
  const {channels,sampleRate}=composeMusic();
  assert.equal(channels.length,2);
  for(const channel of channels){
    assert.equal(channel.length,Math.round(MUSIC_DURATION*sampleRate));
    let power=0,peak=0;
    for(const sample of channel){assert.ok(Number.isFinite(sample));power+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
    assert.ok(Math.sqrt(power/channel.length)>.025,'melody must be audible');
    assert.ok(peak<.7,'the mix must retain headroom');
    assert.ok(Math.abs(channel[0]-channel.at(-1))<.025,'loop boundary must stay smooth');
  }
});

test('music needs a gesture, resumes a suspended audio context, and repeated gestures do not create duplicate loops',async()=>{
  const c=mockContext('suspended');let contexts=0;
  const a=new GameAudio({createContext:()=>{contexts++;return c;}});
  a.setActive(true);assert.equal(contexts,0);
  a.unlock();a.unlock();await Promise.resolve();
  assert.equal(contexts,1);assert.equal(c.sources.length,1);assert.equal(c.sources[0].loop,true);
});

test('music pauses, resumes from its position, and reuses the generated buffer',()=>{
  const c=mockContext(),a=new GameAudio({createContext:()=>c});
  a.unlock();c.currentTime=8;a.setActive(false);
  assert.equal(a.voice,null);assert.equal(c.sources[0].stops.length,1);
  c.currentTime=20;a.setActive(true);
  assert.equal(c.sources[1].starts[0][1],8);assert.equal(c.buffers,1);
  a.setActive(true);assert.equal(c.sources.length,2);
});

test('music and effects can be muted independently, including while the game is paused',()=>{
  const c=mockContext(),a=new GameAudio({createContext:()=>c});a.unlock();
  a.effect('drop');assert.equal(c.oscillators.length,0);
  a.setPreferences({music:false,effects:true});a.effect('merge');
  assert.equal(a.voice,null);assert.equal(c.oscillators.length,1);
  a.setActive(false);a.setPreferences({music:true});assert.equal(c.sources.length,1);
  a.setActive(true);assert.equal(c.sources.length,2);
});

test('muting during an asynchronous unlock cannot restart the music',async()=>{
  const c=mockContext('suspended');let resume;
  c.resume=()=>new Promise(resolve=>{resume=()=>{c.state='running';resolve();};});
  const a=new GameAudio({createContext:()=>c});a.unlock();a.setPreferences({music:false});
  resume();await Promise.resolve();assert.equal(c.sources.length,0);
});

test('audio unavailable or all audio disabled does not interrupt gameplay',()=>{
  const a=new GameAudio({createContext:()=>{throw new Error('Audio unavailable');}});
  assert.doesNotThrow(()=>{a.unlock();a.effect('drop');a.setActive(false);});
  let created=false;const muted=new GameAudio({music:false,effects:false,createContext:()=>{created=true;}});
  muted.unlock();assert.equal(created,false);
});
