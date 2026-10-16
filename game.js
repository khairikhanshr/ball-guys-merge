import { MergeGame, BALLS, WIDTH, HEIGHT, STEP, DROP_Y } from './core.js';

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
  lastScore: Number.isFinite(saved?.lastScore) && saved.lastScore >= 0 ? saved.lastScore : null,
  discovered: Number.isInteger(saved?.discovered) ? Math.max(0,Math.min(10,saved.discovered)) : 0,
  sound: saved?.sound === true,
};
let paused = false, targeting = false, pointer = null, audioContext, lastToast = 0;
let installPrompt = null, discovery = null;
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
  const frequency = kind === 'drop' ? 220 : kind === 'finished' ? 120 : 370 + tier * 54;
  osc.frequency.setValueAtTime(frequency, now);
  osc.frequency.exponentialRampToValueAtTime(frequency*(kind==='finished'?.45:1.6),now+.12);
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
    labels.push({x:event.x,y:event.y-20,text:`+${event.points}`,life:1});
    if (event.tier > stats.discovered && event.tier <= 10) {
      stats.discovered = event.tier;
      updateCollection();
      if(event.tier>=4){discovery={tier:event.tier,start:performance.now()};game.cooldown=Math.max(game.cooldown,1400);}
    }
    if(event.tier===11) toast('Космическое слияние!');
  } else if (event.type === 'drop') {
    $('first-hint').hidden = true;
    sound('drop');
  } else if (event.type === 'finished') {
    stats.best = Math.max(stats.best,event.score);
    stats.bank += event.score;
    stats.lastScore = event.score;
    setTarget(false);
    save();
    sound('finished');
    showResult();
  } else if (event.type === 'power') sound('merge',2);
}

function ballArt(context,x,y,r,tier,angle=0,stretch=0,alpha=1,outline=null,face=true,blink=false) {
  const b = BALLS[tier];
  context.save(); context.globalAlpha=alpha; context.translate(x,y);
  context.scale(1+stretch,1-stretch*.65);
  const shape=()=>{
    context.beginPath();
    if(!outline){context.arc(0,0,r,0,Math.PI*2);return;}
    const count=outline.length;
    for(let i=0;i<count;i++){
      const a=outline[i],b=outline[(i+1)%count];
      if(i===0){const previous=outline[count-1];context.moveTo((previous.x+a.x)/2-x,(previous.y+a.y)/2-y);}
      context.quadraticCurveTo(a.x-x,a.y-y,(a.x+b.x)/2-x,(a.y+b.y)/2-y);
    }
    context.closePath();
  };
  context.lineWidth = Math.max(2.5,r*.14); context.strokeStyle='#060708';
  shape(); context.fillStyle=b.color; context.fill(); context.stroke();
  context.save();shape();context.clip();
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
  if(!face){context.restore();return;}
  if(outline){
    const xs=outline.map(v=>v.x),ys=outline.map(v=>v.y);
    context.scale(Math.max(.65,(Math.max(...xs)-Math.min(...xs))/(2*r)),Math.max(.55,(Math.max(...ys)-Math.min(...ys))/(2*r)));
  }
  context.rotate(angle*.35);
  const eyeY = -r*.1;
  if(blink){
    context.strokeStyle='#181c20';context.lineWidth=Math.max(1.8,r*.05);context.lineCap='round';
    for(const side of [-1,1]){context.beginPath();context.ellipse(side*r*.31,eyeY+r*.09,r*.18,r*.12,0,Math.PI,Math.PI*2);context.stroke();}
  }else{
    for(const side of [-1,1]){
      const ex = side*r*.3;
      context.fillStyle='#fff';context.strokeStyle='#171b20';context.lineWidth=Math.max(1,r*.04);
      context.beginPath();context.ellipse(ex,eyeY,r*.255,r*.37,0,0,7);context.fill();context.stroke();
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
  path();ctx.lineWidth=18;ctx.strokeStyle='#080909';ctx.stroke();
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
  ctx.strokeStyle='#c4cccb';ctx.lineWidth=2;
  ctx.beginPath();
  for(let x=25;x<WIDTH;x+=35){ctx.moveTo(x,0);ctx.lineTo(x,HEIGHT);}
  for(let y=0;y<HEIGHT;y+=35){ctx.moveTo(0,y);ctx.lineTo(WIDTH,y);}
  ctx.stroke();
  const c=game.cup;
  const radius=BALLS[game.current].radius*.8;
  if(game.state==='playing'&&!targeting&&game.cooldown<120){
    ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.setLineDash([12,7]);
    ctx.beginPath();ctx.moveTo(game.aim,DROP_Y+radius+12);ctx.lineTo(game.aim,c.bottom-15);ctx.stroke();ctx.restore();
    ballArt(ctx,game.aim,DROP_Y,radius,game.current,0,0,1,null,false);
  }
  for(const b of game.balls){
    const blink=(time+b.id*827)%4300<150;
    ballArt(ctx,b.position.x,b.position.y,BALLS[b.plugin.tier].radius,b.plugin.tier,b.angle,0,1,b.vertices,true,blink);
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
    ctx.globalAlpha=Math.max(0,p.life);ctx.font='700 19px Ball';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#050505';ctx.strokeText(p.text,p.x,p.y);ctx.fillStyle='#fff';ctx.fillText(p.text,p.x,p.y);
  }
  ctx.globalAlpha=1;labels=labels.filter(p=>p.life>0);
  if(time-lastToast>2100)$('toast').classList.remove('show');
  if(discovery){
    if(time-discovery.start>1500){discovery=null;return;}
    ctx.fillStyle='#0008';ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.textAlign='center';ctx.font='700 35px Ball';ctx.lineWidth=6;ctx.strokeStyle='#000';ctx.fillStyle='#fff36b';
    ctx.strokeText('Новый шарик открыт!',250,385);ctx.fillText('Новый шарик открыт!',250,385);
    ballArt(ctx,250,535,78,discovery.tier,0,0,1);
    ctx.font='700 50px Ball';ctx.fillStyle='#ffdf20';ctx.fillText('★',110,590);ctx.fillText('✦',367,465);
  }
}

function updateUI() {
  $('score').textContent=number(game.score);
  $('best').textContent=number(stats.best);
  $('last-result').hidden=stats.lastScore===null;
  $('last-score').textContent=number(stats.lastScore??0);
  for(const kind of ['swap','shake','lift','sniper']){
    $(kind).querySelector('b').textContent=game.powers[kind];
    $(kind).disabled=!game.powers[kind]||game.state!=='playing'||(kind!=='swap'&&!game.balls.length);
  }
  const nc=$('next-ball').getContext('2d');nc.clearRect(0,0,108,108);
  ballArt(nc,54,54,35,game.next,0,0,1,null,false);
  $('next-ball').setAttribute('aria-label',`Следующий шарик: ${BALLS[game.next].name}`);
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
    ballArt(icon.getContext('2d'),45,45,28+tier*.9,tier,0,0,1,null,false);
    row.title=`${tier+1}. ${ball.name}${tier>stats.discovered?' — ещё не открыт':''}`;
    row.setAttribute('aria-label',row.title);
    row.append(icon);$('evolution').append(row);
  });
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
  game.reset();setTarget(false);particles=[];labels=[];discovery=null;paused=false;accumulator=0;
  uiDirty=true;save();canvas.focus({preventScroll:true});
}

function showResult() {
  const body=`<div class="result-score">${number(game.score)}</div>Шарик выпал за край. Очки сохранены автоматически.<br><small>Слияний: ${game.merges} · Лучший шарик: ${game.maxTier+1}</small><br><strong>Твой рекорд: ${number(stats.best)}</strong>`;
  showModal('Партия завершена',body,[{label:'Ещё один стакан',run:newGame}],'★');
}

function showHelp() {
  showModal('Наполни стакан',`<ul><li><strong>Наведи и отпусти.</strong> На телефоне веди пальцем и отпусти его. На компьютере двигай мышь и щёлкай.</li><li><strong>Одинаковые шарики сливаются.</strong> Зелёный даёт 10 очков, фиолетовый 40, красный 90, оранжевый 160. Сумма цепочки показывается как комбо.</li><li><strong>Стакан растёт</strong> при открытии крупных шариков. Шарики могут подниматься выше края — главное, чтобы они не выпали наружу.</li><li><strong>Один шарик выпал — партия окончена.</strong> Очки сохраняются автоматически, а рекорд обновляется.</li><li><strong>Четыре способности:</strong> смена, встряска, подброс и удаление выбранного шарика. По три использования каждого вида на партию, бесплатно.</li></ul><small>Клавиши: ← → — прицел, пробел — бросок, P — пауза.<br>Рекорд и партия сохраняются в этом браузере.<br>Независимая версия по мотивам Ball Guys.</small>`,[{label:'Всё понятно!'}],'☺');
}

function showPause() {
  if(game.state!=='playing')return;
  showModal('Перерыв на выдох', 'Твой стакан подождёт.<br>Партия уже сохранена.',[{label:'Продолжить игру'}],'Ⅱ');
}

function syncInstallButton() {
  $('install').hidden = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function showInstall() {
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instructions = `<div class="install-preview"><img src="./assets/apple-touch-icon.png" alt="Иконка Ball Guys" width="64" height="64"><span>Ball Guys<small>Твой стакан. В одно касание.</small></span></div><ol class="install-steps"><li><b>1</b><span>Открой эту игру в <strong>Safari</strong> на iPhone.</span></li><li><b>2</b><span>Нажми <strong>«Поделиться»</strong> <span class="share-mark">↑</span> — внизу или в меню страницы.</span></li><li><b>3</b><span>Выбери <strong>«На экран Домой»</strong>, включи <strong>«Открывать как веб-приложение»</strong>, если этот пункт есть, и нажми <strong>«Добавить»</strong>.</span></li></ol><p class="install-note">После этого игра запускается своей иконкой, без панели браузера. Открой её с интернетом один раз — дальше можно играть офлайн.</p>`;
  showModal('Игра на главном экране', instructions + (apple?'':'<p class="install-note">На Android и компьютере: меню браузера → «Установить приложение», если такой пункт доступен.</p>'),[{label:'Понятно'}],'');
}

window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;syncInstallButton();});
window.addEventListener('appinstalled',()=>{installPrompt=null;syncInstallButton();toast('Игра установлена!');});
matchMedia('(display-mode: standalone)').addEventListener('change',syncInstallButton);
$('install').addEventListener('click',async()=>{
  if(!installPrompt){showInstall();return;}
  const prompt=installPrompt;installPrompt=null;
  paused=true;pointer=null;save();
  try{await prompt.prompt();await prompt.userChoice;}
  catch{showInstall();}
  finally{paused=$('modal').open;lastFrame=performance.now();accumulator=0;syncInstallButton();}
});
syncInstallButton();

$('modal').addEventListener('close',()=>{paused=$('modal').open;lastFrame=performance.now();accumulator=0;if(!paused)canvas.focus({preventScroll:true});});
$('modal-close').addEventListener('click',()=>{if(game.state!=='playing')newGame();$('modal').close();});
$('modal').addEventListener('cancel',()=>{if(game.state!=='playing')newGame();});
$('help').addEventListener('click',showHelp);
$('pause').addEventListener('click',showPause);
$('restart').addEventListener('click',()=>{
  if(!game.drops){newGame();return;}
  showModal('Начать с чистого стакана?','Текущие очки будут потеряны.<br>Твой рекорд останется.',[{label:'Начать заново',run:newGame},{label:'Продолжить эту партию',secondary:true}],'↻');
});
$('sound').addEventListener('click',()=>{stats.sound=!stats.sound;unlockAudio();sound('merge',3);uiDirty=true;save();});
for(const kind of ['swap','shake','lift'])$(kind).addEventListener('click',()=>{if(paused)return;unlockAudio();setTarget(false);if(game.usePower(kind)){uiDirty=true;save();toast({swap:'Шарики поменялись!',shake:'Встряхнули!',lift:'Вверх!'}[kind]);}});
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
  const comboVisible=game.combo>=1&&game.time-game.lastMerge<1700;
  $('combo').hidden=!comboVisible;
  if(comboVisible)$('combo').innerHTML=`<strong>+${game.comboPoints}</strong>${game.combo}× Комбо!`;
  $('status').textContent=game.state==='finished'?'Партия завершена. Очки сохранены':targeting?'Выбери шарик на поле':game.drops?'Лови момент для следующего слияния':'Объедини два одинаковых шарика';
  if(time-lastSave>1500){if(game.state==='playing'&&!paused)save();lastSave=time;}
  requestAnimationFrame(frame);
}

updateCollection();updateUI();resize();save();
if(restored&&game.drops)toast('Твой стакан на месте. Продолжаем!');
if(!storageAvailable)toast('Сохранение недоступно в этом браузере');
requestAnimationFrame(frame);
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
