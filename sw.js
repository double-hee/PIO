const CACHE = 'pio-v4'; // 버전 올려서 구버전 캐시 강제 삭제
const ASSETS = ['./'];

// 공유받은 파일 임시 보관용 IndexedDB
const SHARE_DB = 'pio-share-inbox';
const SHARE_STORE = 'inbox';

function openShareDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(SHARE_STORE))
        db.createObjectStore(SHARE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSharedFiles(files){
  const db = await openShareDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE, 'readwrite');
    tx.objectStore(SHARE_STORE).put(files, 'pending');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => {
        console.log('[SW] 구버전 캐시 삭제:', k);
        return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 갤러리 등에서 공유하기로 이 앱을 선택했을 때 (Web Share Target)
  if(e.request.method === 'POST' && url.pathname.endsWith('/share-target')){
    e.respondWith((async () => {
      try{
        const formData = await e.request.formData();
        const files = formData.getAll('media').filter(f => f && f.size > 0);
        if(files.length) await saveSharedFiles(files);
      }catch(err){
        console.error('[SW] 공유 파일 처리 실패:', err);
      }
      // 앱 메인으로 리다이렉트 (앱이 열리면서 대기중인 파일을 집어감)
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }

  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if(res && res.status === 200)
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
