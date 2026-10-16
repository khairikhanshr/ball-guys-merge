import test from 'node:test';
import assert from 'node:assert/strict';
import { Leaderboard, normalizeName } from '../leaderboard.js';
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};};
function server(){
  const players=new Map();let online=true;
  return {set online(value){online=value;},players,async fetcher(url,options){
    if(!online)throw new Error('Offline');
    const body=options.body?JSON.parse(options.body):null;let result;
    if(url.endsWith('/players')){
      const old=players.get(body.id);result={...old,...body,score:old?.score??null};players.set(body.id,result);result={player:result};
    }else if(url.endsWith('/scores')){
      const player=players.get(body.id);player.score=Math.max(player.score??0,body.score);result={player:{...player}};
    }else result={players:[...players.values()].filter(p=>p.score!==null).sort((a,b)=>b.score-a.score).slice(0,10)};
    return {ok:true,json:async()=>result};
  }};
}
test('different players share a ranking and each contributes only their best result',async()=>{
  const shared=server(),a=new Leaderboard({storage:storage(),fetcher:shared.fetcher}),b=new Leaderboard({storage:storage(),fetcher:shared.fetcher});
  a.setName('Алия');b.setName('Бекзат');await Promise.all([a.refresh(),b.refresh()]);
  a.record(140);await a.refresh();b.record(250);await b.refresh();a.record(30);await a.refresh();
  assert.deepEqual(a.players.map(p=>[p.name,p.score]),[['Бекзат',250],['Алия',140]]);
  assert.notEqual(a.profile.id,b.profile.id);assert.notEqual(a.profile.token,b.profile.token);
});
test('an offline result survives reload and is sent automatically after reconnection',async()=>{
  const shared=server(),disk=storage(),a=new Leaderboard({storage:disk,fetcher:shared.fetcher});
  a.setName('Игрок');await a.refresh();a.record(40);await a.refresh();
  shared.online=false;a.record(290);await a.refresh();assert.equal(a.status,'offline');
  const b=new Leaderboard({storage:disk,fetcher:shared.fetcher});
  assert.equal(b.profile.name,'Игрок');assert.equal(b.profile.pending,290);assert.equal(b.players[0].score,40);
  shared.online=true;await b.refresh();assert.equal(b.profile.pending,null);assert.equal(b.players[0].score,290);
});
test('renaming preserves identity and best score, and a zero-point run is saved',async()=>{
  const shared=server(),a=new Leaderboard({storage:storage(),fetcher:shared.fetcher});
  a.setName('Первое имя');await a.refresh();a.record(0);await a.refresh();const id=a.profile.id;
  a.setName('Новое имя');await a.refresh();assert.equal(a.profile.id,id);assert.equal(shared.players.size,1);
  assert.equal(a.players[0].name,'Новое имя');assert.equal(a.players[0].score,0);
});
test('a new score arriving during upload remains pending until the better score is saved',async()=>{
  const shared=server();let release,entered;
  const waiting=new Promise(resolve=>{entered=resolve;});let delay=true;
  const a=new Leaderboard({storage:storage(),fetcher:async(url,options)=>{
    if(url.endsWith('/scores')&&delay){delay=false;entered();await new Promise(resolve=>{release=resolve;});}
    return shared.fetcher(url,options);
  }});
  a.setName('Игрок');await a.refresh();a.record(40);await waiting;a.record(250);release();await a.refresh();
  assert.equal(a.profile.pending,null);assert.equal(a.players[0].score,250);
});
test('invalid names and scores cannot be stored, and unavailable storage does not block play',async()=>{
  assert.equal(normalizeName('  Шерзад   1 '),'Шерзад 1');
  for(const name of ['',' ','<script>','a'.repeat(21)])assert.equal(normalizeName(name),'');
  const shared=server(),a=new Leaderboard({storage:null,fetcher:shared.fetcher});
  assert.equal(a.setName('<b>'),false);a.setName('Игрок');await a.refresh();
  a.record(-10);a.record(NaN);assert.equal(a.profile.pending,null);
});
