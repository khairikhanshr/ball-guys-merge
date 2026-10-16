const CACHE = 'ball-guys-merge-v1';
const FILES = ['./','./index.html','./style.css','./game.js','./core.js','./assets/icon.svg','./manifest.webmanifest','./vendor/matter.min.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ball-guys-merge-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||new Response('Нет соединения. Открой игру один раз с интернетом.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
});
