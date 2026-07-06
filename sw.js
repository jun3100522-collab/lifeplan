/* ============================================
   sw.js — Service Worker（PWA用）
   ・アプリ本体とライブラリをキャッシュして
     オフラインでも起動できるようにする
   ・Webサーバー上（https）で公開したときだけ有効
   ============================================ */
'use strict';

const CACHE_NAME = 'lifeplan-cache-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/templates.js',
  './js/model.js',
  './js/storage.js',
  './js/table.js',
  './js/charts.js',
  './js/excel.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
];

/* インストール時: 必要なファイルをまとめてキャッシュ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* 有効化時: 古いバージョンのキャッシュを削除 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* 取得時: キャッシュ優先、なければネットワークから取得してキャッシュに追加 */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
