/* 아리채 오락실 · 화투 그림
   그림: Louie Mantia 의 전통 하나후다 그림 (CC BY-SA 4.0) — static/img/hwatu/LICENSE.txt
   요즘 우리 화투처럼 다시 칠했어요 (빨간 테두리 · 光 · 홍단/청단 글씨는 그림에 들어 있어요)
   카드 번호 = (달-1)*4 + k  ·  서버 cardgames/gostop.py 와 같은 순서 (11월 오동 · 12월 비)
   48 · 49 = 보너스 쌍피 (13번째 '달'로 셈) */
(function () {
  'use strict';

  const SPEC = {
    1: [['gwang', ''], ['tti', 'hong'], ['pi', ''], ['pi', '']],
    2: [['yeol', 'bird'], ['tti', 'hong'], ['pi', ''], ['pi', '']],
    3: [['gwang', ''], ['tti', 'hong'], ['pi', ''], ['pi', '']],
    4: [['yeol', 'bird'], ['tti', 'cho'], ['pi', ''], ['pi', '']],
    5: [['yeol', ''], ['tti', 'cho'], ['pi', ''], ['pi', '']],
    6: [['yeol', ''], ['tti', 'cheong'], ['pi', ''], ['pi', '']],
    7: [['yeol', ''], ['tti', 'cho'], ['pi', ''], ['pi', '']],
    8: [['gwang', ''], ['yeol', 'bird'], ['pi', ''], ['pi', '']],
    9: [['yeol', 'cup'], ['tti', 'cheong'], ['pi', ''], ['pi', '']],
    10: [['yeol', ''], ['tti', 'cheong'], ['pi', ''], ['pi', '']],
    11: [['gwang', ''], ['ssang', ''], ['pi', ''], ['pi', '']],
    12: [['gwang', 'rain'], ['yeol', ''], ['tti', ''], ['ssang', '']],
    13: [['bonus', ''], ['bonus', '']]
  };
  const NAME = ['', '송학', '매조', '벚꽃', '흑싸리', '난초', '모란', '홍싸리', '공산', '국진', '단풍', '오동', '비', '보너스'];
  const KIND = { gwang: '광', yeol: '열끗', tti: '띠', pi: '피', ssang: '쌍피', bonus: '쌍피' };
  const V = '2';
  const info = (id) => { const m = Math.floor(id / 4) + 1; const k = id % 4; return { m, k, kind: SPEC[m][k][0], grp: SPEC[m][k][1] }; };
  const url = (id) => `static/img/hwatu/${id == null || id < 0 ? 'back' : id}.webp?v=${V}`;
  const label = (id) => { if (id == null || id < 0) return '뒤집힌 화투'; const c = info(id); return c.m === 13 ? '보너스 쌍피' : `${c.m}월 ${NAME[c.m]} ${KIND[c.kind]}`; };

  // 카드 한 장 (img)
  function svg(id, o) {
    const cls = o && o.cls ? ' ' + o.cls : '';
    return `<img class="hw${cls}" src="${url(id)}" alt="${label(id)}" draggable="false" decoding="async">`;
  }
  // 아이콘·작은 그림용 (svg 안에 넣는 그림)
  function image(id, x, y, w, rot) {
    const h = w * 1.642;
    return `<image href="${url(id)}" x="${x}" y="${y}" width="${w}" height="${h}"${rot ? ` transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"` : ''}/>`;
  }
  // 그림을 미리 받아 두기 (처음 판에서 그림이 늦게 뜨지 않게)
  let pre = false;
  function preload() {
    if (pre) return; pre = true;
    for (let i = -1; i < 50; i++) { const im = new Image(); im.src = url(i); }
  }

  window.Hwatu = { svg, image, url, info, label, preload, NAME, SPEC };
})();
