import { MergeGame, BALLS, WIDTH, HEIGHT, STEP } from './core.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SAVE_KEY = 'ball-guys-merge-v1';
const number = n => Math.round(n).toLocaleString('ru-RU');
let storageAvailable = true, saved = null;
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { storageAvailable = false; }
const stats = {
  best: Number.isFinite(saved?.best) && saved.best >= 0 ? saved.best : 0,
  bank: Number.isFinite(saved?.bank) && saved.bank >= 0 ? saved.bank : 0,
  discovered: Number.isInteger(saved?.discovered) ? Math.max(0,Math.min(10,saved.discovered)) : 0,
  sound: saved?.sound === true,
};
let paused = false, targeting = false, pointer = null, audioContext, lastToast = 0;
let particles = [], labels = [], lastFrame = performance.now(), accumulator = 0, lastSave = 0, uiDirty = true;
const game = new MergeGame(window.Matter, { onEvent });
const restored = game.restore(saved?.run);

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...stats, run: game.snapshot() }));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
    const note = document.querySelector('.save-note');
    note.textContent = 'Браузер запретил сохранение прогресса';
    note.classList.add('storage-error');
  }
}

function unlockAudio() {
  if (!stats.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(()=>{});
  } catch { /* Sound is optional on browsers without Web Audio. */ }
}

function sound(kind, tier=0) {
  if (!stats.sound || !audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.connect(gain); gain.connect(audioContext.destination);
  osc.type = 'sine';
  const frequency = kind === 'drop' ? 220 : kind === 'lost' ? 120 : 370 + tier * 54;
  osc.frequency.setValueAtTime(frequency, now);
  osc.frequency.exponentialRampToValueAtTime(frequency*(kind==='lost'?.45:1.6),now+.12);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(.075,now+.01);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.2);
  osc.start(now); osc.stop(now+.22);
}

function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  lastToast = performance.now();
}

function onEvent(event) {
  uiDirty = true;
  if (event.type === 'merge') {
    sound('merge',event.tier);
    const color = BALLS[Math.min(event.tier,10)].color;
    if (!reducedMotion) for (let i=0;i<12;i++) {
      const angle = Math.random()*Math.PI*2, speed = 1+Math.random()*3;
      particles.push({x:event.x,y:event.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-1,life:1,color,size:2+Math.random()*3});
    }
    labels.push({x:event.x,y:event.y-20,text:`+${event.points}${event.combo>1?` ×${event.combo}`:''}`,life:1});
    if (event.tier > stats.discovered && event.tier <= 10) {
      stats.discovered = event.tier;
      updateCollection();
      if(event.tier>=4) toast(`${BALLS[event.tier].name}! ${event.tier>=4?'Стакан стал больше':''}`);
    }
    if(event.tier===11) toast('Космическое слияние!');
  } else if (event.type === 'drop') {
    $('first-hint').hidden = true;
    sound('drop');
  } else if (event.type === 'lost') {
    sound('lost');
    setTarget(false);
    save();
    showResult(false);
  } else if (event.type === 'banked') {
    stats.best = Math.max(stats.best,event.score);
    stats.bank += event.score;
    setTarget(false);
    save();
    sound('merge',8);
    showResult(true);
  } else if (event.type === 'power') sound('merge',2);
}

function ballArt(context,x,y,r,tier,angle=0,stretch=0,alpha=1) {
  const b = BALLS[tier];
  context.save(); context.globalAlpha=alpha; context.translate(x,y);
  context.rotate(angle*.35); context.scale(1+stretch,1-stretch*.65);
  context.lineWidth = Math.max(2,r*.075); context.strokeStyle='#171b20';
  context.beginPath(); context.arc(0,0,r,0,Math.PI*2); context.fillStyle=b.color; context.fill(); context.stroke();
  context.save();context.beginPath();context.arc(0,0,r-1,0,Math.PI*2);context.clip();
  context.fillStyle = 'rgba(0,0,0,.07)';context.beginPath();context.ellipse(r*.7,r*.3,r*.38,r*.9,.4,0,Math.PI*2);context.fill();
  if(tier===8){
    context.fillStyle='#83d775';
    context.beginPath();context.moveTo(-r*.9,-r*.35);context.lineTo(-r*.45,-r*.7);context.lineTo(-r*.12,-r*.45);context.lineTo(-r*.29,-r*.12);context.lineTo(-r*.6,r*.05);context.lineTo(-r*.45,r*.42);context.lineTo(-r*.7,r*.65);context.closePath();context.fill();
    context.beginPath();context.ellipse(r*.65,r*.4,r*.45,r*.25,-.8,0,7);context.fill();
  }
  if(tier===7||tier===10){
    context.fillStyle=tier===7?'#e5d5ff':'#d4c2ff';
    for(let i=0;i<9;i++){const a=i*2.399;context.beginPath();context.arc(Math.cos(a)*r*.79,Math.sin(a)*r*.79,r*.025,0,7);context.fill();}
    if(tier===10){context.strokeStyle='#d5bcff';context.lineWidth=r*.12;context.beginPath();context.ellipse(0,0,r*.9,r*.32,-.6,0,7);context.stroke();}
  }
  context.fillStyle='rgba(255,255,255,.65)';context.beginPath();context.ellipse(-r*.43,-r*.64,r*.16,r*.08,-.55,0,7);context.fill();
  context.beginPath();context.arc(-r*.65,-r*.42,r*.055,0,7);context.fill();
  context.restore();
  const eyeY = -r*.1;
  if(tier===5||tier===9){
    context.strokeStyle='#181c20';context.lineWidth=Math.max(1.8,r*.05);context.lineCap='round';
    for(const side of [-1,1]){context.beginPath();context.ellipse(side*r*.31,eyeY+r*.09,r*.18,r*.12,0,Math.PI,Math.PI*2);context.stroke();}
  }else{
    for(const side of [-1,1]){
      const ex = side*r*.3;
      context.fillStyle='#fff';context.strokeStyle='#171b20';context.lineWidth=Math.max(1,r*.04);
      context.beginPath();context.ellipse(ex,eyeY,r*.245,r*.33,0,0,7);context.fill();context.stroke();
      context.fillStyle='#14181d';context.beginPath();context.ellipse(ex+r*.035,eyeY+r*.07,r*.115,r*.195,0,0,7);context.fill();
      context.fillStyle='#fff';context.beginPath();context.ellipse(ex+r*.005,eyeY-r*.03,r*.043,r*.07,.3,0,7);context.fill();
    }
  }
  context.lineWidth=Math.max(1.3,r*.045);context.strokeStyle=tier===7?'#fff':'#171b20';context.lineCap='round';
  context.beginPath();context.moveTo(-r*.12,r*.47);context.quadraticCurveTo(r*.03,r*.57,r*.17,r*.44);context.stroke();
  if(tier>=3){
    for(const s of [-1,1]){context.beginPath();context.moveTo(s*r*.29-r*.08,-r*.56);context.quadraticCurveTo(s*r*.29,-r*.64,s*r*.29+r*.08,-r*.57);context.stroke();}
  }
  context.restore();
}

function drawCup(c) {
  const path = () => {ctx.beginPath();ctx.moveTo(c.left,c.top);ctx.lineTo(c.left+c.inset,c.bottom);ctx.quadraticCurveTo(c.left+c.inset+2,c.bottom+2,c.left+c.inset+10,c.bottom+2);ctx.lineTo(c.right-c.inset-10,c.bottom+2);ctx.quadraticCurveTo(c.right-c.inset-2,c.bottom+2,c.right-c.inset,c.bottom);ctx.lineTo(c.right,c.top);};
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  path();ctx.lineWidth=24;ctx.strokeStyle='#fffefa';ctx.stroke();
  path();ctx.lineWidth=18;ctx.strokeStyle='#22262b';ctx.stroke();
  ctx.strokeStyle='#f7f5ec';ctx.lineWidth=2.6;
  for(let y=c.top+12;y<c.bottom-5;y+=10){
    const slope=(y-c.top)/(c.bottom-c.top)*c.inset;
    ctx.beginPath();ctx.moveTo(c.left+slope-4,y+3);ctx.lineTo(c.left+slope+4,y-2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(c.right-slope-4,y+3);ctx.lineTo(c.right-slope+4,y-2);ctx.stroke();
  }
  for(let x=c.left+c.inset+8;x<c.right-c.inset-5;x+=10){ctx.beginPath();ctx.moveTo(x-3,c.bottom+6);ctx.lineTo(x+3,c.bottom-3);ctx.stroke();}
  ctx.restore();
}

function draw(time,delta) {
  const ratio=canvas.width/WIDTH;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  // Squared paper, matching the hand-drawn cup and characters.
  ctx.strokeStyle='#e0e4d9';ctx.lineWidth=.8;
  ctx.beginPath();
  for(let x=10;x<WIDTH;x+=28){ctx.moveTo(x,0);ctx.lineTo(x,HEIGHT);}
  for(let y=10;y<HEIGHT;y+=28){ctx.moveTo(0,y);ctx.lineTo(WIDTH,y);}
  ctx.stroke();
  const c=game.cup;
  ctx.fillStyle='rgba(255,255,255,.3)';ctx.beginPath();ctx.moveTo(c.left,c.top);ctx.lineTo(c.left+c.inset,c.bottom);ctx.lineTo(c.right-c.inset,c.bottom);ctx.lineTo(c.right,c.top);ctx.closePath();ctx.fill();
  const radius=BALLS[game.current].radius;
  if(game.state==='playing'&&!targeting){
    const readiness=1-game.cooldown/380;
    ctx.save();ctx.strokeStyle='#adb8a2';ctx.lineWidth=1.4;ctx.setLineDash([3,7]);
    ctx.beginPath();ctx.moveTo(game.aim,113+radius+12);ctx.lineTo(game.aim,c.bottom-15);ctx.stroke();ctx.restore();
    ballArt(ctx,game.aim,113,radius,game.current,0,0,.35+.65*readiness);
    ctx.fillStyle='#a6af98';ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.fillText('БРОСАЙ СЮДА',game.aim,65);
  }
  if(game.danger>0){
    ctx.save();ctx.setLineDash([8,7]);ctx.strokeStyle=`rgba(223,93,75,${.35+game.danger*.65})`;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(c.left+13,c.top);ctx.lineTo(c.right-13,c.top);ctx.stroke();ctx.restore();
    ctx.font='bold 12px Arial';ctx.textAlign='center';ctx.fillStyle='#c65b4c';ctx.fillText(`Осторожно! ${Math.max(1,Math.ceil((1-game.danger)*2.2))}`,250,c.top-17);
  }
  for(const b of game.balls){
    const stretch=reducedMotion?0:Math.min(.065,Math.abs(b.velocity.y)*.006);
    ballArt(ctx,b.position.x,b.position.y,BALLS[b.plugin.tier].radius,b.plugin.tier,b.angle,stretch);
    if(targeting){ctx.strokeStyle='#ef6b5c';ctx.lineWidth=2;ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(b.position.x,b.position.y,BALLS[b.plugin.tier].radius+4,0,7);ctx.stroke();ctx.setLineDash([]);}
  }
  drawCup(c);
  for(const p of particles){
    if(!paused){p.x+=p.vx*delta/16.67;p.y+=p.vy*delta/16.67;p.vy+=.04*delta/16.67;p.life-=delta/550;}
    ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,7);ctx.fill();
  }
  ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
  for(const p of labels){
    if(!paused){p.y-=.6*delta/16.67;p.life-=delta/950;}
    ctx.globalAlpha=Math.max(0,p.life);ctx.font='bold 18px Arial';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#f9f7ef';ctx.strokeText(p.text,p.x,p.y);ctx.fillStyle='#3f7447';ctx.fillText(p.text,p.x,p.y);
  }
  ctx.globalAlpha=1;labels=labels.filter(p=>p.life>0);
  if(time-lastToast>2100)$('toast').classList.remove('show');
}

function updateUI() {
  $('score').textContent=number(game.score);
  $('best').textContent=$('best-mobile').textContent=number(stats.best);
  $('checkout').disabled=!game.score||game.state!=='playing';
  for(const kind of ['swap','shake','sniper']){
    $(kind).querySelector('b').textContent=game.powers[kind];
    $(kind).disabled=!game.powers[kind]||game.state!=='playing'||(kind!=='swap'&&!game.balls.length);
  }
  const nc=$('next-ball').getContext('2d');nc.clearRect(0,0,108,108);
  ballArt(nc,54,54,27+game.next*3,game.next);
  $('next-ball').setAttribute('aria-label',`Следующий шарик: ${BALLS[game.next].name}`);
  $('cup-label').textContent=`СТАКАН · УРОВЕНЬ ${Math.max(1,game.maxTier-2)}`;
  $('first-hint').hidden=game.drops>0;
  $('sound').setAttribute('aria-pressed',String(stats.sound));
  $('sound').setAttribute('aria-label',stats.sound?'Выключить звук':'Включить звук');
  $('sound').querySelector('.mute-slash').hidden=stats.sound;
  uiDirty=false;
}

function updateCollection() {
  $('evolution').replaceChildren();
  BALLS.forEach((ball,tier)=>{
    const row=document.createElement('div');row.className=`evolution-item ${tier>stats.discovered?'locked':tier===stats.discovered?'current':''}`;
    const icon=document.createElement('canvas');icon.width=icon.height=90;icon.setAttribute('aria-hidden','true');
    ballArt(icon.getContext('2d'),45,45,26+tier*.9,tier);
    const n=document.createElement('span');n.className='tier-number';n.textContent=String(tier+1).padStart(2,'0');
    const name=document.createElement('span');name.className='evolution-name';name.textContent=ball.name;
    const check=document.createElement('span');check.className='check';check.textContent=tier<=stats.discovered?'✓':'';
    row.append(n,icon,name,check);$('evolution').append(row);
  });
  $('discovered').textContent=`${stats.discovered+1} из 11`;
  $('collection-progress').style.width=`${(stats.discovered+1)/11*100}%`;
}

function setTarget(value) {
  targeting=value;$('target-hint').hidden=!value;$('sniper').classList.toggle('active',value);
  $('sniper').setAttribute('aria-pressed',String(value));
}

function showModal(title,body,actions,icon='✦') {
  paused=true;pointer=null;save();
  $('modal-title').textContent=title;$('modal-body').innerHTML=body;$('modal-icon').textContent=icon;
  $('modal-actions').replaceChildren();
  for(const action of actions){
    const button=document.createElement('button');button.textContent=action.label;
    if(action.secondary)button.className='secondary';
    button.addEventListener('click',()=>{$('modal').close();action.run?.();});
    $('modal-actions').append(button);
  }
  if(!$('modal').open)$('modal').showModal();
}

function newGame() {
  game.reset();setTarget(false);particles=[];labels=[];paused=false;accumulator=0;
  uiDirty=true;save();canvas.focus({preventScroll:true});
}

function showResult(banked) {
  const text=banked?'Очки в копилке!':'Стакан переполнен';
  const body=`<div class="result-score">${number(game.score)}</div>${banked?'Отличный момент, чтобы остановиться.':'Шарики вышли за край. В этот раз очки не сохранены.'}<br><small>Слияний: ${game.merges} · Лучший шарик: ${game.maxTier+1}</small><br><strong>Твой рекорд: ${number(stats.best)}</strong>`;
  showModal(text,body,[{label:'Ещё один стакан',run:newGame}],banked?'★':'◌');
}

function showHelp() {
  showModal('Наполни стакан',`<ul><li><strong>Наведи и отпусти.</strong> На телефоне веди пальцем и отпусти его. На компьютере двигай мышь и щёлкай.</li><li><strong>Одинаковые шарики сливаются.</strong> Цепочка слияний даёт до ×5 очков. Всего 11 ступеней!</li><li><strong>Стакан растёт</strong> при открытии крупных шариков. Не держи шарики выше края дольше 2 секунд.</li><li><strong>«Забрать очки»</strong> завершает партию и сохраняет результат. При переполнении очки этой партии сгорают.</li><li><strong>Три помощи каждого вида:</strong> смена текущего шарика, встряска и удаление одного шарика. Запасы обновляются в новой партии — бесплатно.</li></ul><small>Клавиши: ← → — прицел, пробел — бросок, P — пауза.<br>Рекорд и партия сохраняются только в этом браузере.</small>`,[{label:'Всё понятно!'}],'☺');
}

function showPause() {
  if(game.state!=='playing')return;
  showModal('Перерыв на выдох', 'Твой стакан подождёт.<br>Партия уже сохранена.',[{label:'Продолжить игру'}],'Ⅱ');
}

$('modal').addEventListener('close',()=>{paused=$('modal').open;lastFrame=performance.now();accumulator=0;if(!paused)canvas.focus({preventScroll:true});});
$('modal-close').addEventListener('click',()=>{if(game.state!=='playing')newGame();$('modal').close();});
$('modal').addEventListener('cancel',()=>{if(game.state!=='playing')newGame();});
$('help').addEventListener('click',showHelp);$('footer-help').addEventListener('click',showHelp);
$('pause').addEventListener('click',showPause);
$('restart').addEventListener('click',()=>{
  if(!game.drops){newGame();return;}
  showModal('Начать с чистого стакана?','Текущие очки будут потеряны.<br>Твой рекорд останется.',[{label:'Начать заново',run:newGame},{label:'Продолжить эту партию',secondary:true}],'↻');
});
$('sound').addEventListener('click',()=>{stats.sound=!stats.sound;unlockAudio();sound('merge',3);uiDirty=true;save();});
$('checkout').addEventListener('click',()=>{if(!game.score)return;unlockAudio();showModal('Забрать очки?',`<div class="result-score">${number(game.score)}</div>Сохрани результат и начни новую партию.`,[{label:'Да, забрать!',run:()=>game.checkout()},{label:'Продолжить игру',secondary:true}],'★');});
for(const kind of ['swap','shake'])$(kind).addEventListener('click',()=>{if(paused)return;unlockAudio();setTarget(false);if(game.usePower(kind)){uiDirty=true;save();toast(kind==='swap'?'Шарики поменялись!':'Встряхнули!');}});
$('sniper').addEventListener('click',()=>{if(!paused&&game.powers.sniper&&game.balls.length)setTarget(!targeting);});
$('cancel-target').addEventListener('click',()=>setTarget(false));

function point(event) {const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*WIDTH,y:(event.clientY-rect.top)/rect.height*HEIGHT};}
canvas.addEventListener('pointerdown',event=>{
  if(paused||game.state!=='playing'||event.button!==0||pointer!==null)return;
  event.preventDefault();unlockAudio();canvas.focus({preventScroll:true});pointer=event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  if(!targeting)game.setAim(point(event).x);
});
canvas.addEventListener('pointermove',event=>{
  if(paused||targeting||game.state!=='playing')return;
  if(event.pointerType==='mouse'||event.pointerId===pointer)game.setAim(point(event).x);
});
canvas.addEventListener('pointerup',event=>{
  if(event.pointerId!==pointer)return;pointer=null;
  if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  if(paused||game.state!=='playing')return;
  const p=point(event);
  if(p.x<0||p.x>WIDTH||p.y<0||p.y>HEIGHT)return;
  if(targeting){
    const target=[...game.balls].reverse().find(b=>Math.hypot(b.position.x-p.x,b.position.y-p.y)<=BALLS[b.plugin.tier].radius+8);
    if(target&&game.usePower('sniper',target)){setTarget(false);uiDirty=true;save();toast('Теперь чуть просторнее');}
  }else{game.setAim(p.x);if(game.drop()){uiDirty=true;save();}}
});
canvas.addEventListener('pointercancel',()=>{pointer=null;});
canvas.addEventListener('lostpointercapture',()=>{pointer=null;});
document.addEventListener('keydown',event=>{
  if($('modal').open)return;
  if(event.key==='Escape'){setTarget(false);return;}
  if(event.code==='KeyP'){showPause();return;}
  if(paused||game.state!=='playing'||event.target.closest?.('button,a'))return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();game.setAim(game.aim+(event.key==='ArrowLeft'?-12:12));}
  if(event.code==='Space'&&!event.repeat){event.preventDefault();unlockAudio();if(!targeting&&game.drop()){uiDirty=true;save();}}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){save();pointer=null;if(game.state==='playing'&&game.drops&&!$('modal').open)showPause();}
  else{lastFrame=performance.now();accumulator=0;}
});
window.addEventListener('pagehide',save);

function resize() {
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(canvas.width*HEIGHT/WIDTH);
}
new ResizeObserver(resize).observe(canvas);

function frame(time) {
  const delta=Math.min(time-lastFrame,50);lastFrame=time;
  if(!paused&&!document.hidden){
    accumulator+=delta;
    while(accumulator>=STEP){game.step(STEP);accumulator-=STEP;}
  } else accumulator=0;
  draw(time,delta);
  if(uiDirty)updateUI();
  const comboVisible=game.combo>1&&game.time-game.lastMerge<1600;
  $('combo').hidden=!comboVisible;
  if(comboVisible)$('combo').textContent=`КОМБО ×${Math.min(game.combo,5)}`;
  $('status').textContent=game.danger>.2?'Выше края! Встряхни или забери очки':targeting?'Выбери шарик на поле':game.drops?'Лови момент для следующего слияния':'Объедини два одинаковых шарика';
  if(time-lastSave>1500){if(game.state==='playing'&&!paused)save();lastSave=time;}
  requestAnimationFrame(frame);
}

updateCollection();updateUI();resize();save();
if(restored&&game.drops)toast('Твой стакан на месте. Продолжаем!');
if(!storageAvailable)toast('Сохранение недоступно в этом браузере');
requestAnimationFrame(frame);
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
