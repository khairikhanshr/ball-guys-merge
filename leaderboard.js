export const RANKING_API=['localhost','127.0.0.1'].includes(globalThis.location?.hostname)
  ? 'http://127.0.0.1:5173/api'
  : 'https://ball-guys-shared-ranking.copperoak2048.chatgpt.site/api';
const PROFILE_KEY='ball-guys-player-v1',CACHE_KEY='ball-guys-ranking-v1';
const validScore=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
export function normalizeName(value){
  if(typeof value!=='string')return '';
  const name=value.normalize('NFKC').trim().replace(/\s+/g,' ');
  return [...name].length>=1&&[...name].length<=20&&/^[\p{L}\p{M}\p{N} ._-]+$/u.test(name)?name:'';
}
export class Leaderboard {
  constructor({storage=(()=>{try{return globalThis.localStorage;}catch{return null;}})(),fetcher=(...args)=>fetch(...args),cryptoSource=crypto,onChange=()=>{},onBest=()=>{}}={}){
    this.storage=storage;this.fetcher=fetcher;this.crypto=cryptoSource;this.onChange=onChange;this.onBest=onBest;
    this.profile=null;this.players=[];this.status='loading';this.registeredName=null;this.syncing=null;
    try{
      const p=JSON.parse(storage.getItem(PROFILE_KEY));
      if(p&&/^[a-f0-9-]{36}$/.test(p.id)&&/^[a-f0-9]{64}$/.test(p.token)&&normalizeName(p.name))
        this.profile={id:p.id,token:p.token,name:normalizeName(p.name),best:validScore(p.best)?p.best:null,pending:validScore(p.pending)?p.pending:null};
      this.players=this.cleanPlayers(JSON.parse(storage.getItem(CACHE_KEY)));
    }catch{/* A fresh profile still works if storage is unavailable. */}
  }
  cleanPlayers(rows){
    return Array.isArray(rows)?rows.filter(p=>p&&typeof p.id==='string'&&normalizeName(p.name)&&validScore(p.score)).slice(0,10).map((p,i)=>({id:p.id,name:normalizeName(p.name),score:p.score,rank:i+1})):[];
  }
  changed(){
    try{if(this.profile)this.storage.setItem(PROFILE_KEY,JSON.stringify(this.profile));this.storage.setItem(CACHE_KEY,JSON.stringify(this.players));}catch{}
    this.onChange();
  }
  setName(value,existingBest=null){
    const name=normalizeName(value);if(!name)return false;
    if(!this.profile){
      const token=Array.from(this.crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
      const best=validScore(existingBest)?existingBest:null;
      this.profile={id:this.crypto.randomUUID(),token,name,best,pending:best};
    }else this.profile.name=name;
    this.changed();void this.refresh();return true;
  }
  record(score){
    if(!this.profile||!validScore(score))return;
    this.profile.best=Math.max(this.profile.best??0,score);
    this.profile.pending=Math.max(this.profile.pending??0,this.profile.best);
    this.changed();void this.refresh();
  }
  async request(path,body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await this.fetcher(RANKING_API+path,{method:body?'POST':'GET',cache:'no-store',credentials:'omit',signal:controller.signal,
        headers:body?{'Content-Type':'application/json',Authorization:'Bearer '+this.profile.token}:{},...(body?{body:JSON.stringify(body)}:{})});
      if(!response.ok)throw new Error('Ranking unavailable');
      return await response.json();
    }finally{clearTimeout(timer);}
  }
  refresh(){
    if(this.syncing)return this.syncing;
    this.syncing=this.sync().finally(()=>{this.syncing=null;if(this.status==='online'&&this.profile&&(this.registeredName!==this.profile.name||this.profile.pending!==null))queueMicrotask(()=>void this.refresh());});return this.syncing;
  }
  async sync(){
    try{
      const p=this.profile;
      if(p){
        if(this.registeredName!==p.name){
          const name=p.name;const result=await this.request('/players',{id:p.id,name});
          if(validScore(result.player?.score)){
            p.best=Math.max(p.best??0,result.player.score);this.onBest(p.best);
          }
          this.registeredName=name;
        }
        // Retain any new result recorded while the previous request was in flight.
        while(p.pending!==null){
          const pending=p.pending;
          const result=await this.request('/scores',{id:p.id,score:pending});
          if(!validScore(result.player?.score)||result.player.score<pending)throw new Error('Result not saved');
          p.best=Math.max(p.best??0,result.player.score);this.onBest(p.best);
          if(p.pending<=pending)p.pending=null;
          this.changed();
        }
      }
      const result=await this.request('/leaderboard');
      if(!Array.isArray(result.players))throw new Error('Invalid ranking');
      this.players=this.cleanPlayers(result.players);this.status='online';
    }catch{this.status='offline';}
    this.changed();
  }
}
