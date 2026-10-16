import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('install manifest stays within the GitHub Pages project and supplies actual PNG icons',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.display,'standalone');
  for(const field of ['id','start_url','scope'])assert.equal(manifest[field],'./');
  for(const icon of manifest.icons){
    const bytes=fs.readFileSync(new URL(icon.src,root));
    assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);
  }
  assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'));
});

test('iPhone home-screen icon and standalone metadata exist',()=>{
  const html=read('index.html');
  assert.match(html,/name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html,/name="apple-mobile-web-app-title" content="Ball Guys"/);
  const icon=fs.readFileSync(new URL('assets/apple-touch-icon.png',root));
  assert.equal(icon.readUInt32BE(16),180);assert.equal(icon.readUInt32BE(20),180);
  assert.match(html,/rel="apple-touch-icon"/);
});

test('offline cache includes every local module, stylesheet, manifest and install icon',()=>{
  const worker=read('sw.js');
  const files=worker.match(/const FILES = (\[[^;]+\]);/)[1];
  const cached=JSON.parse(files.replaceAll("'",'"'));
  for(const path of cached)assert.ok(fs.existsSync(new URL(path,root)),`${path} is missing`);
  for(const file of ['game.js','core.js','gel.js','discovery.js','audio.js','style.css','manifest.webmanifest','assets/apple-touch-icon.png'])assert.ok(cached.includes(`./${file}`),`${file} is not cached`);
});
