/* 포트리스관 · 홈 화면 바로가기(PWA 설치) + 카카오로 초대
   설치
   - Android/Chrome: beforeinstallprompt 를 저장해 두었다가 「홈 화면에 추가」를 누르면 prompt() → 결과 처리, appinstalled 면 버튼 숨김
   - iOS(Safari 등): 설치 창을 띄울 수 없어 「공유 → 홈 화면에 추가」 안내 시트
   - 카카오톡 안 브라우저: 설치가 안 되니 「다른 브라우저로 열기」 안내
   - 이미 앱으로 열었으면(display-mode standalone/fullscreen · navigator.standalone) 버튼 숨김, 창을 띄울 수 없는 브라우저도 숨김
   - 서비스 워커는 따로 만들지 않음: 최근 크롬은 설치 조건에 fetch 핸들러를 요구하지 않고, 허브가 등록한 /sw.js(범위 /)가 이미 이 페이지도 맡음
   초대
   - (a) KAKAO_JS_KEY 가 있고 SDK 로드·init 이 되면 Kakao.Share.sendDefault 피드 카드
   - (b) 아니면 navigator.share (폰 공유 시트에 카카오톡이 뜸) · 사용자가 취소(AbortError)하면 조용히
   - (c) 둘 다 안 되면 「문구 + 링크」를 클립보드에 복사(안 되면 임시 textarea 방식) + 안내 토스트
   QA: window.__tankDbg.install = {standalone, canPrompt, ios} · window.__tankDbg.lastInvite = {url, text, via} (읽기 전용 스냅숏) */
(function () {
  'use strict';
  // Kakao Developers 앱의 JavaScript 키를 넣으면 카카오 피드 카드로 공유해요.
  // 쓰려면 Kakao Developers → 내 애플리케이션 → 앱 키(JavaScript 키) + 플랫폼 → Web 사이트 도메인에
  // https://arichae-arcade.onrender.com 등록이 필요해요. 비워 두면 카카오 서버로 아무 요청도 하지 않아요.
  const KAKAO_JS_KEY = '';
  // 키를 넣을 때 Kakao 문서(developers.kakao.com/docs/latest/ko/javascript/getting-started)의 최신 버전 주소·integrity 값으로 맞춰 주세요.
  const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
  const KAKAO_SDK_INTEGRITY = '';
  const OG_PATH = '/static/img/tank/og_v33.png';

  const ua = navigator.userAgent || '';
  const IOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const KAKAO_INAPP = /KAKAOTALK/i.test(ua);
  const mq = (q) => { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } };
  // 페이지를 연 순간에 판단 (입장 버튼이 requestFullscreen 을 부르면 display-mode: fullscreen 이 맞아질 수 있어 나중엔 다시 재지 않음)
  let standalone = mq('(display-mode: standalone)') || mq('(display-mode: minimal-ui)') || navigator.standalone === true ||
    (mq('(display-mode: fullscreen)') && !document.fullscreenElement) || /[?&]source=pwa\b/.test(location.search);
  let deferred = null;   // beforeinstallprompt 이벤트
  let toastFn = (m) => { try { console.log(m); } catch (e) { /* 무시 */ } };
  const listeners = [];

  function dbg() {
    if (!window.__tankDbg) window.__tankDbg = {};
    return window.__tankDbg;
  }
  function publish() {
    dbg().install = Object.freeze({ standalone, canPrompt: !!deferred, ios: IOS });
    listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  }
  // 버튼을 보일지: 앱으로 연 게 아니고, 설치 창을 띄울 수 있거나(iOS·카카오톡 안은 안내 시트)
  function canInstall() { return !standalone && (!!deferred || IOS || KAKAO_INAPP); }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();   // 크롬 자체 작은 띠 대신 우리 버튼으로
    deferred = e;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null; standalone = true;
    closeSheet();
    publish();
    toastFn('홈 화면에 포트리스관을 추가했어요');
  });

  // ---------------------------------------------------------------- 안내 시트 (iOS · 카카오톡 안)
  const ICON_SHARE = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" stroke="#4da3ff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" stroke="#4da3ff" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';
  const ICON_ADD = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="#fff" stroke-width="2" fill="none"/><path d="M12 8v8M8 12h8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const ICON_DOTS = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="5" r="2.2" fill="#fff"/><circle cx="12" cy="12" r="2.2" fill="#fff"/><circle cx="12" cy="19" r="2.2" fill="#fff"/></svg>';
  let sheetEl = null;
  function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
  function openSheet(kind) {
    closeSheet();
    const el = document.createElement('div');
    el.className = 'inst-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '홈 화면에 추가하는 방법');
    let steps, extra = '';
    if (kind === 'kakao') {
      steps = [
        [ICON_DOTS, '카카오톡 안에서는 바로 설치가 안 돼요'],
        [ICON_SHARE, IOS ? '아래 「다른 브라우저로 열기」 → Safari 에서 공유 버튼' : '아래 「다른 브라우저로 열기」 → 크롬에서 다시 「홈 화면에 추가」'],
        [ICON_ADD, IOS ? '「홈 화면에 추가」 → 「추가」' : '설치를 누르면 끝!'],
      ];
      extra = '<button type="button" class="btn btn-green" data-act="ext">다른 브라우저로 열기</button>';
    } else {
      steps = [
        [ICON_SHARE, (/iPad/.test(ua) || (navigator.platform === 'MacIntel')) ? '주소창 옆 <b>공유</b> 버튼을 눌러요' : '화면 아래(또는 주소창 옆) <b>공유</b> 버튼을 눌러요'],
        [ICON_ADD, '목록을 내려 <b>홈 화면에 추가</b>를 골라요'],
        ['<span class="inst-n">✓</span>', '오른쪽 위 <b>추가</b>를 누르면 끝!'],
      ];
    }
    el.innerHTML = `<div class="inst-card">
      <div class="inst-head"><img src="img/tank/apple_touch_180_v33.png" width="56" height="56" alt=""><div><b>홈 화면에 추가</b><small>포트리스관을 앱처럼 바로 열어요</small></div></div>
      <ol class="inst-steps">${steps.map(([ic, t]) => `<li><span class="inst-ic">${ic}</span><span>${t}</span></li>`).join('')}</ol>
      <div class="inst-btns">${extra}<button type="button" class="btn btn-yellow" data-act="close">알겠어요</button></div>
    </div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && b.dataset.act === 'ext') {
        // 카카오톡 인앱 브라우저 → 기본 브라우저로 열기 (카카오톡이 지원하는 주소 형식)
        location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
        return;
      }
      if ((b && b.dataset.act === 'close') || e.target === el) closeSheet();
    });
    document.getElementById('app').appendChild(el);
    sheetEl = el;
    const btn = el.querySelector('[data-act="close"]');
    if (btn) try { btn.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetEl) closeSheet(); });

  async function install() {
    if (standalone) return;
    if (deferred) {
      const ev = deferred;
      deferred = null;   // prompt() 는 한 번만 쓸 수 있음
      publish();
      try {
        ev.prompt();
        const ch = await ev.userChoice;
        if (ch && ch.outcome === 'accepted') toastFn('홈 화면에 포트리스관을 추가하는 중이에요');
        else toastFn('나중에 메뉴의 「홈 화면에 추가」로 다시 할 수 있어요');
      } catch (e) {
        // prompt 실패: 크롬 메뉴로 안내
        toastFn('브라우저 메뉴(⋮)의 「홈 화면에 추가」로 설치해 주세요');
      }
      return;
    }
    if (KAKAO_INAPP) { openSheet('kakao'); return; }
    if (IOS) { openSheet('ios'); return; }
    toastFn('브라우저 메뉴(⋮)의 「홈 화면에 추가」로 설치해 주세요');
  }

  // ---------------------------------------------------------------- 초대
  let kakaoState = KAKAO_JS_KEY ? 'idle' : 'off';   // off | idle | loading | ready | fail
  function kakaoPreload() {
    if (kakaoState !== 'idle') return;
    kakaoState = 'loading';
    const s = document.createElement('script');
    s.src = KAKAO_SDK_URL;
    s.async = true;
    s.crossOrigin = 'anonymous';
    if (KAKAO_SDK_INTEGRITY) s.integrity = KAKAO_SDK_INTEGRITY;
    s.onload = () => {
      try {
        const K = window.Kakao;
        if (K && !K.isInitialized()) K.init(KAKAO_JS_KEY);
        kakaoState = (K && K.isInitialized() && K.Share && K.Share.sendDefault) ? 'ready' : 'fail';
      } catch (e) { kakaoState = 'fail'; }
    };
    s.onerror = () => { kakaoState = 'fail'; };
    document.head.appendChild(s);
  }
  function inviteData(code) {
    const url = location.origin + '/static/tank.html?room=' + encodeURIComponent(code);
    const text = '포트리스관 같이 해요! 방 코드 ' + code;
    return { url, text };
  }
  function record(d, via) { dbg().lastInvite = Object.freeze({ url: d.url, text: d.text, via }); }

  function copyText(str) {
    const legacy = () => {
      let ok = false;
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;font-size:16px';
      document.body.appendChild(ta);
      try {
        ta.select(); ta.setSelectionRange(0, str.length);
        ok = document.execCommand('copy');
      } catch (e) { ok = false; }
      ta.remove();
      return ok;
    };
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(str).then(() => true, () => legacy());
    }
    return Promise.resolve(legacy());
  }
  function viaClipboard(d, code) {
    record(d, 'clipboard');
    return copyText(d.text + '\n' + d.url).then((ok) => {
      toastFn(ok ? '초대 링크를 복사했어요. 카카오톡에 붙여 넣어 주세요' : '복사가 안 돼요 · 친구에게 알려 줄 방 코드: ' + code);
    });
  }
  function invite(code) {
    if (!/^\d{4}$/.test(String(code || ''))) { toastFn('방에 들어간 뒤 초대할 수 있어요'); return Promise.resolve(); }
    const d = inviteData(code);
    // (a) 카카오 피드 카드
    if (kakaoState === 'ready') {
      try {
        const img = location.origin + OG_PATH;
        const link = { mobileWebUrl: d.url, webUrl: d.url };
        window.Kakao.Share.sendDefault({
          objectType: 'feed',
          content: { title: '포트리스관 같이 해요!', description: '방 코드 ' + code + ' · 각도와 파워로 쏘는 실시간 팀 포격전', imageUrl: img, imageWidth: 800, imageHeight: 400, link },
          buttons: [{ title: '같이 하기', link }],
        });
        record(d, 'kakao');
        return Promise.resolve();
      } catch (e) { /* 아래 공유 시트로 */ }
    }
    // (b) 기기 공유 시트
    if (navigator.share) {
      const data = { title: '포트리스관', text: d.text, url: d.url };
      let okShape = true;
      try { if (navigator.canShare) okShape = navigator.canShare(data); } catch (e) { okShape = true; }
      if (okShape) {
        record(d, 'share');
        return navigator.share(data).catch((e) => {
          if (e && e.name === 'AbortError') return;   // 사용자가 닫음 → 조용히
          return viaClipboard(d, code);
        });
      }
    }
    // (c) 클립보드
    return viaClipboard(d, code);
  }

  function init(opts) {
    if (opts && typeof opts.toast === 'function') toastFn = opts.toast;
    publish();
  }

  publish();
  window.TankShare = {
    init, install, invite, kakaoPreload, canInstall,
    onChange: (f) => listeners.push(f),
    isStandalone: () => standalone,
  };
})();
