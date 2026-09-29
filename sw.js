/* ===========================================================
   sw.js — Service Worker ทำให้เว็บติดตั้งเป็นแอปบนมือถือได้ + เปิดตอนออฟไลน์ได้

   - ไฟล์ของเว็บเอง: ลองโหลดจากเน็ตก่อน (ได้โค้ดใหม่ทันทีหลัง push) ถ้าเน็ตหลุดค่อยใช้ของในแคช
   - ฟอนต์ Google: ใช้ของในแคชก่อน แล้วอัปเดตเบื้องหลัง
   - API ของ Worker (POST ไป workers.dev): ไม่แตะเลย ปล่อยวิ่งตรงไปที่เซิร์ฟเวอร์

   แก้ไฟล์ในรายการ ASSETS แล้วให้เลื่อน VERSION ขึ้นด้วย เพื่อล้างแคชชุดเก่า
   =========================================================== */

const VERSION = 'hrb-v3';
const FONT_CACHE = 'hrb-fonts-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/config.js',
  './js/bahttext.js',
  './js/seed-data.js',
  './js/api.js',
  './js/invoice.js',
  './js/pwa.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/qr-app.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ASSETS.map(u => new Request(u, {cache: 'reload'}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k !== VERSION && k !== FONT_CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }

  if (url.origin === self.location.origin){
    event.respondWith(networkFirst(req));
  }
});

async function networkFirst(req){
  const cache = await caches.open(VERSION);
  try{
    // ถามเซิร์ฟเวอร์ทุกครั้ง (ไฟล์ไม่เปลี่ยนได้ 304 เร็วมาก)
    // หน้าเว็บ (navigate) ต้องยิงด้วย URL เพราะ Chrome ไม่ยอมให้สร้าง Request ใหม่จาก request แบบ navigate
    const res = req.mode === 'navigate'
      ? await fetch(req.url, {cache: 'no-cache', credentials: 'same-origin'})
      : await fetch(req, {cache: 'no-cache'});
    if (res && res.ok) cache.put(stripQuery(req), res.clone());
    return res;
  }catch(err){
    const hit = await cache.match(stripQuery(req));
    if (hit) return hit;
    if (req.mode === 'navigate'){
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName){
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; })
    .catch(() => hit);
  return hit || refresh;
}

/** start_url มี ?source=pwa — เก็บแคชโดยไม่สน query จะได้ตรงกับ './' */
function stripQuery(req){
  const url = new URL(req.url);
  if (!url.search) return req;
  url.search = '';
  return new Request(url.toString());
}
