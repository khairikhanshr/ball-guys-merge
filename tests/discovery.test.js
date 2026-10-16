import test from 'node:test';
import assert from 'node:assert/strict';
import { DiscoveryIntro, DISCOVERY_DURATION } from '../discovery.js';

test('chained discoveries each receive a complete intro in order',()=>{
  const intro=new DiscoveryIntro();
  intro.enqueue(4);intro.step(900);intro.enqueue(5);
  assert.equal(intro.current.tier,4);assert.equal(intro.current.elapsed,900);
  intro.step(DISCOVERY_DURATION-900);
  assert.deepEqual(intro.current,{tier:5,elapsed:0});
  intro.step(DISCOVERY_DURATION);assert.equal(intro.current,null);
});

test('starting colours and duplicates do not interrupt an intro, and a new run can celebrate again',()=>{
  const intro=new DiscoveryIntro();
  for(const tier of [0,1,2,3,11])assert.equal(intro.enqueue(tier),false);
  assert.equal(intro.enqueue(4),true);assert.equal(intro.enqueue(4),false);
  intro.step(DISCOVERY_DURATION);assert.equal(intro.enqueue(4),false);
  intro.reset();assert.equal(intro.enqueue(4),true);
});
