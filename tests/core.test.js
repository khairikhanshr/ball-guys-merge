import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MergeGame, BALLS, STEP } from '../core.js';

const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(fs.readFileSync(new URL('../vendor/matter.min.js',import.meta.url),'utf8'),sandbox);
const Matter = sandbox.module.exports;
const make = random => new MergeGame(Matter,{random:random||(()=>.1)});
const advance = (game,ms) => {for(let i=0;i<ms/STEP;i++)game.step();};

test('two matching drops collide, merge, and award points',()=>{
  const g=make();g.drop();advance(g,1800);g.drop();advance(g,2200);
  assert.equal(g.balls.length,1);assert.equal(g.balls[0].plugin.tier,1);
  assert.equal(g.score,BALLS[1].points);assert.equal(g.merges,1);assert.equal(g.state,'playing');
});

test('three simultaneous matching balls cannot consume a body twice',()=>{
  const g=make();g.addBall(0,235,540,{born:-1000});g.addBall(0,250,540,{born:-1000});g.addBall(0,265,540,{born:-1000});
  advance(g,40);
  assert.equal(g.balls.length,2);assert.equal(g.merges,1);
  assert.deepEqual(g.balls.map(b=>b.plugin.tier).sort(),[0,1]);
});

test('different tiers remain separate',()=>{
  const g=make();g.addBall(1,250,540);g.addBall(2,250,490);advance(g,2500);
  assert.equal(g.balls.length,2);assert.equal(g.score,0);
});

test('larger discoveries expand the cup and chain merges multiply scores',()=>{
  const g=make();const before=g.cup;
  const a=g.addBall(4,205,500),b=g.addBall(4,290,500);g.merge(a,b);
  assert.ok(g.cup.left<before.left);assert.ok(g.cup.top<before.top);
  assert.equal(g.maxTier,5);
  const score=g.score;
  g.merge(g.addBall(0,200,400),g.addBall(0,220,400));
  assert.equal(g.score-score,BALLS[1].points*2);
});

test('highest tier merge clears space without creating an invalid tier',()=>{
  const g=make();g.maxTier=10;g.buildCup();
  g.merge(g.addBall(10,150,450),g.addBall(10,350,450));
  assert.equal(g.balls.length,0);assert.equal(g.maxTier,10);assert.equal(g.score,250);
});

test('drop cooldown prevents duplicate touch drops',()=>{
  const g=make();assert.equal(g.drop(),true);assert.equal(g.drop(),false);
  advance(g,400);assert.equal(g.drop(),true);assert.equal(g.drops,2);
});

test('newly dropped balls above the rim get time to fall',()=>{
  const g=make();g.drop();advance(g,1200);assert.equal(g.state,'playing');
  assert.equal(g.danger,0);assert.ok(g.balls[0].position.y>g.cup.top);
});

test('persistent overflow ends the run and prevents cashout',()=>{
  const g=make();const ball=g.addBall(0,250,g.cup.top-20,{born:-3000});
  Matter.Body.setStatic(ball,true);g.score=20;advance(g,2400);
  assert.equal(g.state,'lost');assert.equal(g.checkout(),null);assert.equal(g.drop(),false);
});

test('recovering below the rim clears the danger countdown',()=>{
  const g=make();const ball=g.addBall(0,250,g.cup.top-20,{born:-3000});
  Matter.Body.setStatic(ball,true);advance(g,1000);assert.ok(g.danger>0);
  Matter.Body.setPosition(ball,{x:250,y:450});advance(g,500);
  assert.equal(g.danger,0);assert.equal(g.state,'playing');
});

test('abilities have finite uses and invalid targets do not spend them',()=>{
  const g=make();g.current=0;g.next=2;
  assert.equal(g.usePower('swap'),true);assert.equal(g.current,2);assert.equal(g.next,0);
  assert.equal(g.usePower('shake'),false);assert.equal(g.powers.shake,3);
  assert.equal(g.usePower('sniper',{}),false);assert.equal(g.powers.sniper,3);
  const b=g.addBall(0,250,500);assert.equal(g.usePower('sniper',b),true);
  assert.equal(g.balls.length,0);assert.equal(g.powers.sniper,2);
  g.usePower('swap');g.usePower('swap');assert.equal(g.usePower('swap'),false);
});

test('cashout freezes the run and is awarded only once',()=>{
  const g=make();assert.equal(g.checkout(),null);g.score=87;
  assert.equal(g.checkout(),87);assert.equal(g.checkout(),null);assert.equal(g.state,'banked');
  const time=g.time;advance(g,1000);assert.equal(g.time,time);assert.equal(g.usePower('swap'),false);
});

test('saved physics, score, powers and danger survive reload',()=>{
  const g=make();g.drop();advance(g,2100);g.score=42;g.usePower('swap');
  g.balls[0].plugin.dangerTime=600;
  const saved=JSON.parse(JSON.stringify(g.snapshot()));const restored=make();
  assert.equal(restored.restore(saved),true);
  assert.deepEqual(restored.snapshot(),saved);
  advance(restored,1000);assert.equal(restored.state,'playing');
});

test('malformed saved games are rejected without crashing',()=>{
  const g=make();for(const bad of [null,{},[],{version:1}, {...g.snapshot(),balls:[{tier:900}]}, {...g.snapshot(),powers:{swap:-2}}])assert.equal(g.restore(bad),false);
  assert.equal(g.state,'playing');assert.ok(g.drop());
});

test('long seeded games keep finite physics and all bodies inside sane bounds',()=>{
  let seed=2026;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const g=make(random);
  for(let i=0;i<160&&g.state==='playing';i++){
    g.setAim(90+random()*320);g.drop();advance(g,1100);
    for(const b of g.balls){assert.ok(Number.isFinite(b.position.x)&&Number.isFinite(b.position.y));assert.ok(b.position.y<1000);}
  }
  assert.ok(g.merges>0);assert.ok(g.balls.length<160);
});
