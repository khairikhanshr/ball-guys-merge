export const DISCOVERY_DURATION = 1700;

// Keep chained discoveries in order instead of replacing an intro mid-animation.
export class DiscoveryIntro {
  constructor() { this.reset(); }
  reset() { this.current=null; this.queue=[]; this.seen=new Set(); }
  enqueue(tier) {
    if(!Number.isInteger(tier)||tier<4||tier>10||this.seen.has(tier))return false;
    this.seen.add(tier);
    this.queue.push({tier,elapsed:0});
    this.current ||= this.queue.shift();
    return true;
  }
  step(dt) {
    if(!this.current)return;
    this.current.elapsed+=dt;
    if(this.current.elapsed>=DISCOVERY_DURATION)this.current=this.queue.shift()||null;
  }
}

export function drawDiscovery(ctx, current, drawBall, reducedMotion=false) {
  const t=current.elapsed;
  const fade=Math.min(1,t/130,(DISCOVERY_DURATION-t)/230);
  ctx.save();
  ctx.globalAlpha=Math.max(0,fade);
  ctx.fillStyle='#000a';ctx.fillRect(0,0,500,1000);
  const pop=reducedMotion?1:1-Math.exp(-t/120)*Math.cos(t/75);
  ctx.translate(250,470);
  ctx.scale(Math.max(.05,pop),Math.max(.05,pop));
  ctx.textAlign='center';ctx.font='700 38px Ball';ctx.lineJoin='round';
  ctx.strokeStyle='#030303';ctx.lineWidth=9;ctx.fillStyle='#ffe845';
  ctx.strokeText('Новый шарик открыт!',0,-105);ctx.fillText('Новый шарик открыт!',0,-105);
  const wobble=reducedMotion?0:Math.sin(t/105)*Math.exp(-t/600)*.12;
  const float=reducedMotion?0:Math.sin(t/260)*5;
  drawBall(ctx,0,45+float,77,current.tier,wobble*3,wobble,fade);
  for(const star of [{x:-165,y:153,r:26,phase:0},{x:167,y:-8,r:27,phase:1.7}]){
    ctx.save();ctx.translate(star.x,star.y+(reducedMotion?0:Math.sin(t/210+star.phase)*9));
    ctx.rotate(reducedMotion?0:Math.sin(t/290+star.phase)*.3);
    ctx.beginPath();
    for(let i=0;i<10;i++){
      const a=-Math.PI/2+i*Math.PI/5,r=star.r*(i%2?.48:1);
      const x=Math.cos(a)*r,y=Math.sin(a)*r;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.closePath();ctx.lineWidth=5;ctx.strokeStyle='#050505';ctx.fillStyle='#ffdc27';ctx.stroke();ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
