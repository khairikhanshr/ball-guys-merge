export const BALLS = [
  { name: 'Голубой', color: '#50c8f6', radius: 13, points: 1 },
  { name: 'Зелёный', color: '#91e775', radius: 18, points: 3 },
  { name: 'Фиолетовый', color: '#df79ee', radius: 25, points: 6 },
  { name: 'Красный', color: '#ff5c68', radius: 33, points: 10 },
  { name: 'Оранжевый', color: '#ffa267', radius: 42, points: 15 },
  { name: 'Жёлтый', color: '#ffeb67', radius: 52, points: 21 },
  { name: 'Облачко', color: '#ffffff', radius: 63, points: 28 },
  { name: 'Ночь', color: '#454261', radius: 75, points: 36 },
  { name: 'Планета', color: '#51b9f4', radius: 88, points: 45 },
  { name: 'Солнце', color: '#ffc34e', radius: 101, points: 55 },
  { name: 'Космос', color: '#9b7fe9', radius: 116, points: 100 },
];
export const WIDTH = 500;
export const HEIGHT = 650;
export const STEP = 1000 / 120;
const clamp = (v, a, b) => Math.max(a, Math.min(v, b));

export class MergeGame {
  constructor(Matter, { random = Math.random, onEvent = () => {} } = {}) {
    this.M = Matter;
    this.random = random;
    this.onEvent = onEvent;
    this.engine = Matter.Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    this.engine.gravity.y = 1.35;
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
    this.lastMerge = -10000;
    this.maxTier = 0;
    this.current = this.roll();
    this.next = this.roll();
    this.aim = WIDTH / 2;
    this.cooldown = 0;
    this.danger = 0;
    this.state = 'playing';
    this.powers = { swap: 3, shake: 3, sniper: 3 };
    this.buildCup();
  }

  roll() {
    const v = this.random();
    return v < .4 ? 0 : v < .72 ? 1 : v < .92 ? 2 : 3;
  }

  get cup() {
    const growth = Math.max(0, this.maxTier - 3);
    return { left: 65 - growth * 3, right: 435 + growth * 3, top: 292 - growth * 8, bottom: 580, inset: 45 };
  }

  buildCup() {
    const { Bodies, Composite } = this.M;
    this.walls.forEach(b => Composite.remove(this.engine.world, b));
    const c = this.cup;
    const wall = (x1, y1, x2, y2) => Bodies.rectangle((x1+x2)/2, (y1+y2)/2, Math.hypot(x2-x1,y2-y1)+12, 15,
      { isStatic: true, angle: Math.atan2(y2-y1,x2-x1), friction: .35, restitution: .12, label: 'cup' });
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
      restitution: .25, friction: .3, frictionStatic: .65, frictionAir: .003,
      density: .0014, slop: .02, sleepThreshold: 70, label: 'ball',
    });
    body.circleRadius = BALLS[tier].radius;
    body.plugin = { tier, born: this.time, entered: false, dangerTime: 0, ...options };
    this.M.Composite.add(this.engine.world, body);
    this.balls.push(body);
    return body;
  }

  drop() {
    if (this.state !== 'playing' || this.cooldown > 0) return false;
    this.setAim(this.aim);
    const ball = this.addBall(this.current, this.aim, 113);
    this.M.Body.setVelocity(ball, { x: 0, y: .8 });
    this.current = this.next;
    this.next = this.roll();
    this.drops++;
    this.combo = 0;
    this.cooldown = 380;
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
    const velocity = { x: (a.velocity.x+b.velocity.x)*.4, y: Math.min(0,(a.velocity.y+b.velocity.y)*.3)-.6 };
    this.removeBall(a);
    this.removeBall(b);
    if (tier < BALLS.length) {
      const r = BALLS[tier].radius, c = this.cup;
      const newBall = this.addBall(tier, clamp(x, c.left+c.inset+r+8, c.right-c.inset-r-8), Math.min(y,c.bottom-r-8));
      this.M.Body.setVelocity(newBall, velocity);
    }
    this.combo = this.time - this.lastMerge < 1800 ? this.combo + 1 : 1;
    this.lastMerge = this.time;
    const multiplier = Math.min(this.combo, 5);
    const points = (BALLS[tier]?.points ?? 250) * multiplier;
    this.score += points;
    this.merges++;
    const discovered = Math.min(tier, BALLS.length - 1) > this.maxTier;
    if (discovered) { this.maxTier = tier; this.buildCup(); }
    this.onEvent({ type: 'merge', tier, x, y, points, combo: multiplier, discovered });
  }

  step(dt = STEP) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown-dt);
    this.M.Engine.update(this.engine, dt);
    // A body may participate in only one merge per physics step.
    const merged = new Set();
    for (const pair of this.engine.pairs.list) {
      const a = pair.bodyA, b = pair.bodyB;
      if (!pair.isActive || a.label !== 'ball' || b.label !== 'ball' || merged.has(a.id) || merged.has(b.id)) continue;
      if (a.plugin.tier !== b.plugin.tier || this.time - a.plugin.born < 100 || this.time - b.plugin.born < 100) continue;
      merged.add(a.id); merged.add(b.id);
      this.merge(a,b);
    }
    this.checkOverflow(dt);
  }

  checkOverflow(dt) {
    const c = this.cup;
    this.danger = 0;
    for (const b of this.balls) {
      const { x, y } = b.position, r = BALLS[b.plugin.tier].radius;
      if (y-r > c.top) b.plugin.entered = true;
      const outside = x+r < c.left-10 || x-r > c.right+10 || y-r > c.bottom+40;
      const above = y-r < c.top-5;
      const mature = this.time-b.plugin.born > 1900;
      if (outside || (above && mature)) b.plugin.dangerTime += dt;
      else b.plugin.dangerTime = Math.max(0,b.plugin.dangerTime-dt*3);
      this.danger = Math.max(this.danger, b.plugin.dangerTime / 2200);
    }
    if (this.danger >= 1) {
      this.state = 'lost';
      this.onEvent({ type: 'lost', score: this.score });
    }
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
    } else if (kind === 'sniper') {
      if (!this.balls.includes(target)) return false;
      this.removeBall(target);
    } else return false;
    this.powers[kind]--;
    this.setAim(this.aim);
    this.onEvent({ type: 'power', kind });
    return true;
  }

  checkout() {
    if (this.state !== 'playing' || !this.score) return null;
    this.state = 'banked';
    this.onEvent({ type: 'banked', score: this.score });
    return this.score;
  }

  snapshot() {
    return { version: 1, score: this.score, drops: this.drops, merges: this.merges,
      maxTier: this.maxTier, current: this.current, next: this.next, aim: this.aim,
      powers: { ...this.powers }, state: this.state, cooldown: this.cooldown,
      balls: this.balls.map(b => ({ tier: b.plugin.tier, x: b.position.x, y: b.position.y,
        vx: b.velocity.x, vy: b.velocity.y, angle: b.angle, angularVelocity: b.angularVelocity,
        age: this.time-b.plugin.born, dangerTime: b.plugin.dangerTime, entered: b.plugin.entered })) };
  }

  restore(s) {
    const number = (v,min,max) => Number.isFinite(v) && v >= min && v <= max;
    const tier = v => Number.isInteger(v) && number(v,0,10);
    if (!s || s.version !== 1 || s.state !== 'playing' || !Array.isArray(s.balls) || s.balls.length > 300
      || !tier(s.maxTier) || !tier(s.current) || !tier(s.next) || !number(s.score,0,1e12)
      || !number(s.drops,0,1e9) || !number(s.merges,0,1e9) || !number(s.aim,0,WIDTH)
      || !number(s.cooldown,0,380)
      || !['swap','shake','sniper'].every(k=>Number.isInteger(s.powers?.[k]) && number(s.powers[k],0,3))
      || !s.balls.every(b=>tier(b.tier) && number(b.x,-500,1000) && number(b.y,-500,1200)
        && number(b.vx,-100,100) && number(b.vy,-100,100) && number(b.angle,-1e9,1e9)
        && number(b.angularVelocity,-100,100) && number(b.age,0,1e12) && number(b.dangerTime,0,2300))) return false;
    this.reset();
    for (const key of ['score','drops','merges','maxTier','current','next','aim','cooldown']) this[key] = s[key];
    this.powers = { ...s.powers };
    this.buildCup();
    for (const b of s.balls) {
      const body = this.addBall(b.tier,b.x,b.y,{ born: -b.age, entered: !!b.entered, dangerTime: b.dangerTime });
      this.M.Body.setVelocity(body,{x:b.vx,y:b.vy});
      this.M.Body.setAngle(body,b.angle);
      this.M.Body.setAngularVelocity(body,b.angularVelocity);
    }
    return true;
  }
}
