const CACHE = 'ball-guys-merge-v8';
const FILES = ['./','./index.html','./style.css','./game.js','./core.js','./gel.js','./discovery.js','./audio.js','./leaderboard.js','./assets/balsamiq-bold.ttf','./assets/icon.svg','./assets/apple-touch-icon.png','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable-512.png','./manifest.webmanifest','./vendor/matter.min.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ball-guys-merge-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||new Response('Нет соединения. Открой игру один раз с интернетом.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
});
