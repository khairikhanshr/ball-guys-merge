import { createGel, prepareGel, updateGel } from './gel.js';

export const BALLS = [
  { name: 'Голубой', color: '#50c8f6', radius: 27, points: 0 },
  { name: 'Зелёный', color: '#91e775', radius: 35, points: 10 },
  { name: 'Фиолетовый', color: '#df79ee', radius: 42, points: 40 },
  { name: 'Красный', color: '#ff4b59', radius: 49, points: 90 },
  { name: 'Оранжевый', color: '#ffa267', radius: 61, points: 160 },
  { name: 'Жёлтый', color: '#ffeb67', radius: 71, points: 250 },
  { name: 'Облачко', color: '#ffffff', radius: 84, points: 360 },
  { name: 'Ночь', color: '#454261', radius: 97, points: 490 },
  { name: 'Планета', color: '#51b9f4', radius: 110, points: 640 },
  { name: 'Солнце', color: '#ffc34e', radius: 124, points: 810 },
  { name: 'Космос', color: '#9b7fe9', radius: 139, points: 1000 },
];
export const WIDTH = 500;
export const HEIGHT = 1000;
export const DROP_Y = 292;
export const STEP = 1000 / 120;
const WALL_THICKNESS = 15;
const clamp = (v, a, b) => Math.max(a, Math.min(v, b));

export class MergeGame {
  constructor(Matter, { random = Math.random, onEvent = () => {} } = {}) {
    this.M = Matter;
    this.random = random;
    this.onEvent = onEvent;
    this.engine = Matter.Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    // Measured from the supplied 30 fps recording: ~1.6s from release to floor.
    this.engine.gravity.y = .43;
    this.reset();
  }

  reset() {
    this.M.Composite.clear(this.engine.world, false);
    this.M.Engine.clear(this.engine);
    this.balls = [];
    this.walls = [];
    this.time = 0;
    this.score = 0;
    this.drops = 0;
    this.merges = 0;
    this.combo = 0;
    this.comboPoints = 0;
    this.lastMerge = -10000;
    this.maxTier = 0;
    this.current = this.roll();
    this.next = this.roll();
    this.aim = WIDTH / 2;
    this.cooldown = 0;
    this.state = 'playing';
    this.powers = { swap: 3, shake: 3, lift: 3, sniper: 3 };
    this.buildCup();
  }

  roll() {
    const v = this.random();
    return v < .4 ? 0 : v < .72 ? 1 : v < .92 ? 2 : 3;
  }

  get cup() {
    const growth = Math.max(0, this.maxTier - 4);
    return { left: 84 - growth * 5, right: 416 + growth * 5, top: 582 - growth * 10, bottom: 783, inset: 38 };
  }

  buildCup() {
    const { Bodies, Composite } = this.M;
    this.walls.forEach(b => Composite.remove(this.engine.world, b));
    const c = this.cup;
    const wall = (x1, y1, x2, y2) => Bodies.rectangle((x1+x2)/2, (y1+y2)/2, Math.hypot(x2-x1,y2-y1)+12, WALL_THICKNESS,
      { isStatic: true, angle: Math.atan2(y2-y1,x2-x1), friction: .22, restitution: .08, label: 'cup' });
    this.walls = [wall(c.left,c.top,c.left+c.inset,c.bottom),
      wall(c.right,c.top,c.right-c.inset,c.bottom),
      wall(c.left+c.inset,c.bottom,c.right-c.inset,c.bottom)];
    Composite.add(this.engine.world, this.walls);
  }

  setAim(x) {
    const c = this.cup, r = BALLS[this.current].radius;
    this.aim = clamp(x, c.left+r+10, c.right-r-10);
  }

  addBall(tier, x, y, options = {}) {
    // Consistent, symmetric geometry prevents tiny balls gaining sideways spin on a flat floor.
    const body = this.M.Bodies.polygon(x, y, 32, BALLS[tier].radius, {
      restitution: .13-tier*.006, friction: .12, frictionStatic: .38, frictionAir: .003,
      density: .0014, slop: .025, sleepThreshold: 100, label: 'ball',
    });
    body.circleRadius = BALLS[tier].radius;
    body.plugin = { tier, born: this.time, ...options };
    body.plugin.gel = createGel(body,BALLS[tier].radius);
    this.M.Composite.add(this.engine.world, body);
    this.balls.push(body);
    return body;
  }

  drop() {
    if (this.state !== 'playing' || this.cooldown > 0) return false;
    this.setAim(this.aim);
    const ball = this.addBall(this.current, this.aim, DROP_Y);
    this.M.Body.setVelocity(ball, { x: 0, y: 0 });
    this.current = this.next;
    this.next = this.roll();
    this.drops++;
    this.cooldown = 850;
    this.onEvent({ type: 'drop' });
    return true;
  }

  removeBall(ball) {
    this.M.Composite.remove(this.engine.world, ball);
    this.balls = this.balls.filter(b => b !== ball);
  }

  merge(a, b) {
    const tier = a.plugin.tier + 1;
    const x = (a.position.x + b.position.x) / 2, y = (a.position.y + b.position.y) / 2;
    const mass=a.mass+b.mass;
    const velocity = { x: (a.velocity.x*a.mass+b.velocity.x*b.mass)/mass*.85,
      y: (a.velocity.y*a.mass+b.velocity.y*b.mass)/mass*.6-.35 };
    this.removeBall(a);
    this.removeBall(b);
    if (tier < BALLS.length) {
      // Spawn at the actual contact midpoint; never teleport a merge to the cup centre.
      const newBall = this.addBall(tier, x, y);
      this.M.Body.setVelocity(newBall, velocity);
    }
    this.combo = this.time - this.lastMerge < 1800 ? this.combo + 1 : 1;
    if(this.combo===1)this.comboPoints=0;
    this.lastMerge = this.time;
    // The recording shows +10, +40, +90, +160: 10 × resulting tier².
    const points = BALLS[tier]?.points ?? 1210;
    this.comboPoints+=points;
    this.score += points;
    this.merges++;
    const discovered = Math.min(tier, BALLS.length - 1) > this.maxTier;
    if (discovered) { this.maxTier = tier; this.buildCup(); }
    this.onEvent({ type: 'merge', tier, x, y, points, combo: this.combo, comboPoints:this.comboPoints, discovered });
  }

  step(dt = STEP) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown-dt);
    prepareGel(this.balls);
    this.M.Engine.update(this.engine, dt);
    // A spill ends this step before any further merge can consume the fallen ball.
    if (this.checkSpill()) return;
    // A body may participate in only one merge per physics step.
    const merged = new Set();
    for (const pair of this.engine.pairs.list) {
      const a = pair.bodyA, b = pair.bodyB;
      if (!pair.isActive || a.label !== 'ball' || b.label !== 'ball' || merged.has(a.id) || merged.has(b.id)) continue;
      if (a.plugin.tier !== b.plugin.tier || this.time - a.plugin.born < 100 || this.time - b.plugin.born < 100) continue;
      merged.add(a.id); merged.add(b.id);
      this.merge(a,b);
    }
    updateGel(this.M,this.balls,this.engine.pairs.list,dt);
  }

  checkSpill() {
    if (this.state !== 'playing') return false;
    const c = this.cup;
    const fallen = this.balls.some(b => {
      const { x, y } = b.position;
      // Height alone never ends a run: stacks and airborne balls may be above the rim.
      if (y < c.top) return false;
      const inset = c.inset * clamp((y-c.top)/(c.bottom-c.top),0,1);
      const outerWall = WALL_THICKNESS/2;
      return x < c.left+inset-outerWall || x > c.right-inset+outerWall || y > c.bottom+outerWall;
    });
    if (!fallen) return false;
    this.state = 'finished';
    this.onEvent({ type: 'finished', score: this.score });
    return true;
  }

  usePower(kind, target) {
    if (this.state !== 'playing' || !this.powers[kind]) return false;
    if (kind === 'swap') [this.current, this.next] = [this.next, this.current];
    else if (kind === 'shake') {
      if (!this.balls.length) return false;
      this.balls.forEach(b => {
        this.M.Sleeping.set(b,false);
        this.M.Body.setVelocity(b,{ x: (250-b.position.x)*.015+(this.random()-.5)*3.5, y: -3-this.random()*2.5 });
      });
    } else if (kind === 'lift') {
      if(!this.balls.length)return false;
      this.balls.forEach(b=>{this.M.Sleeping.set(b,false);this.M.Body.setVelocity(b,{x:(250-b.position.x)*.006,y:-5.5});});
    } else if (kind === 'sniper') {
      if (!this.balls.includes(target)) return false;
      this.removeBall(target);
    } else return false;
    this.powers[kind]--;
    this.setAim(this.aim);
    this.onEvent({ type: 'power', kind });
    return true;
  }

  snapshot() {
    return { version: 3, score: this.score, drops: this.drops, merges: this.merges,
      maxTier: this.maxTier, current: this.current, next: this.next, aim: this.aim,
      powers: { ...this.powers }, state: this.state, cooldown: this.cooldown,
      balls: this.balls.map(b => ({ tier: b.plugin.tier, x: b.position.x, y: b.position.y,
        vx: b.velocity.x, vy: b.velocity.y, angle: b.angle, angularVelocity: b.angularVelocity,
        age: this.time-b.plugin.born })) };
  }

  restore(s) {
    const number = (v,min,max) => Number.isFinite(v) && v >= min && v <= max;
    const tier = v => Number.isInteger(v) && number(v,0,10);
    if (!s || ![1,2,3].includes(s.version) || s.state !== 'playing' || !Array.isArray(s.balls) || s.balls.length > 300
      || !tier(s.maxTier) || !tier(s.current) || !tier(s.next) || !number(s.score,0,1e12)
      || !number(s.drops,0,1e9) || !number(s.merges,0,1e9) || !number(s.aim,0,WIDTH)
      || !number(s.cooldown,0,1500)
      || !['swap','shake','sniper'].every(k=>Number.isInteger(s.powers?.[k]) && number(s.powers[k],0,3))
      || !s.balls.every(b=>tier(b.tier) && number(b.x,-500,1000) && number(b.y,-500,1200)
        && number(b.vx,-100,100) && number(b.vy,-100,100) && number(b.angle,-1e9,1e9)
        && number(b.angularVelocity,-100,100) && number(b.age,0,1e12))) return false;
    this.reset();
    for (const key of ['score','drops','merges','maxTier','current','next','aim','cooldown']) this[key] = s[key];
    this.powers = { ...s.powers, lift:number(s.powers.lift,0,3)?s.powers.lift:3 };
    this.buildCup();
    for (const b of s.balls) {
      const y=s.version===1?this.cup.bottom-(580-b.y)*.8:b.y;
      const body = this.addBall(b.tier,b.x,y,{ born: -b.age });
      this.M.Body.setVelocity(body,{x:b.vx,y:b.vy});
      this.M.Body.setAngle(body,b.angle);
      this.M.Body.setAngularVelocity(body,b.angularVelocity);
    }
    return true;
  }
}
