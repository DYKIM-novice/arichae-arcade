/* 아리채 오락실 - 앱 설치용 서비스 워커 (서버가 /sw.js 로 내보냄 · 범위 /)
   - 화면(탐색)은 항상 서버에서 최신을 받고, 받은 화면은 '경로별'로 저장해 둬요.
     인터넷이 끊기면 그 경로의 저장본 → 없으면 첫 화면('/') 저장본을 보여 줘요.
     (v3.5 전에는 모든 화면을 '/' 키 하나에 저장해서, 포트리스관(tank.html)을 열면 허브 오프라인 화면이 덮였어요)
   - 정적 js/css/그림은 가로채지 않아요(브라우저·서버 캐시 규칙 그대로 → 새 배포 때 옛 코드가 남지 않음).
   - WebSocket(/ws…)·API(/api/…)·GET 이 아닌 요청·다른 사이트 요청은 절대 가로채지 않아요.
   - 머지관 「소라섬 등불 이야기」(/static/merge.html)는 한 번 열면 그 폰에서 오프라인으로도 열리게
     화면·코드·그림을 '서버 먼저, 안 되면 저장본'으로 받아 둬요(MCACHE, 미리 받는 목록 없음 · 버전과 상관없이 유지). */
const CACHE = 'arichae-v35';
const MCACHE = 'arichae-merge-v1';
const MERGE_RE = /^\/static\/(merge\.html|css\/merge\.css|js\/merge\/|img\/merge\/)/;
const SKIP_RE = /^\/(ws|api)(\/|$)/;

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

// 화면: 서버 먼저 → 경로별 저장(?room= 같은 꼬리는 빼고) · 끊기면 그 경로 저장본 → '/' 저장본
function pageFetch(req, url) {
  const key = url.pathname || '/';
  return fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.open(CACHE)
    .then((c) => c.match(key).then((hit) => hit || c.match('/')))
    .then((hit) => hit || Response.error()));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (SKIP_RE.test(url.pathname)) return;
  if ((req.headers.get('upgrade') || '').toLowerCase() === 'websocket') return;
  if (MERGE_RE.test(url.pathname)) { event.respondWith(mergeFetch(req, url)); return; }
  if (req.mode === 'navigate') { event.respondWith(pageFetch(req, url)); }
  // 그 밖(정적 js/css/그림 등)은 가로채지 않음
});
