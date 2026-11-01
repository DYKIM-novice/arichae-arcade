/* 아리채 오락실 - 앱 설치용 서비스 워커
   항상 서버에서 최신 화면을 받아오고, 인터넷이 끊겼을 때만 저장해 둔 첫 화면을 보여줘요.
   머지관 「소라섬 등불 이야기」(/static/merge.html)는 한 번 열면 그 폰에서 오프라인으로도 열리게
   화면·코드는 '서버 먼저, 안 되면 저장본', 그림도 '서버 먼저, 안 되면 저장본'으로 받아 둬요 (미리 받는 목록은 없음). */
const CACHE = 'arichae-v1';
const MCACHE = 'arichae-merge-v1';
const MERGE_RE = /^\/static\/(merge\.html|css\/merge\.css|js\/merge\/|img\/merge\/)/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/')).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== MCACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function mergeFetch(req, url) {
  const key = url.pathname;   // ?v= 같은 꼬리는 빼고 저장
  const fromNet = () => fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(MCACHE).then((c) => c.put(key, copy)).catch(() => {}); }
    return res;
  });
  // 그림도 서버 먼저: 같은 파일 이름으로 그림을 바꿔도 폰에 옛 그림이 남지 않게
  return fromNet().catch(() => caches.match(key));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (MERGE_RE.test(url.pathname)) { event.respondWith(mergeFetch(req, url)); return; }
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('/'))
    );
  }
});
