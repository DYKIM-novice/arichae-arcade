/* 머지관 · 그림 경로 한 곳 (static/img/merge/<묶음>/<id>.webp · tools/merge_art.py 가 만들어요)
   - 화면 코드는 MergeArt.src(id) 만 써요. 그림이 없는 id 는 '' → 화면이 둥근 색 칸 + 한글 이름 + 단계 숫자로 대신 그려요
   - 새 그림을 넣으면: tools/merge_art.py 의 ART 에 한 줄 + 아래 FILES 에 한 줄
   - 페이지 위치와 상관없이 쓰려고 이 파일 주소에서 static/ 뿌리를 알아내요 */
(function (root) {
  'use strict';

  const FILES = {
    // 체인 물건 (체인 글자 + 단계)
    a1: 'items/a1', a2: 'items/a2', a3: 'items/a3', a4: 'items/a4', a5: 'items/a5', a6: 'items/a6', a7: 'items/a7', a8: 'items/a8',
    b1: 'items/b1', b2: 'items/b2', b3: 'items/b3', b4: 'items/b4', b5: 'items/b5', b6: 'items/b6', b7: 'items/b7', b8: 'items/b8', b9: 'items/b9',
    d1: 'items/d1', d2: 'items/d2', d3: 'items/d3', d4: 'items/d4', d5: 'items/d5', d6: 'items/d6', d7: 'items/d7', d8: 'items/d8',
    // 발생기
    gen_a: 'gens/gen_a', gen_b: 'gens/gen_b', gen_d: 'gens/gen_d',
    // UI 아이콘
    coin: 'ui/coin', energy: 'ui/energy',
    // 인물 얼굴 (마을 사람 그림이 생기면 char_juni: 'chars/juni' 처럼 추가)
    hayun: 'chars/hayun',
    // 지역 배경 (2단계: r1_after 등)
    r1_before: 'bg/r1_before'
  };

  let ROOT = 'static/';
  try {
    const me = document.currentScript && document.currentScript.src;
    if (me) ROOT = me.replace(/js\/merge\/art\.js(\?.*)?$/, '');
  } catch (e) { /* 기본값 */ }

  const API = {
    FILES,
    get root() { return ROOT; },
    has: (id) => !!FILES[id],
    src: (id) => (FILES[id] ? ROOT + 'img/merge/' + FILES[id] + '.webp' : ''),
    // 처음 화면에 필요한 그림을 미리 받아 둬요 (끌 때 깜빡임 방지)
    preload(ids) { (ids || Object.keys(FILES)).forEach((id) => { const s = API.src(id); if (s) { const im = new Image(); im.decoding = 'async'; im.src = s; } }); }
  };
  root.MergeArt = API;
})(window);
