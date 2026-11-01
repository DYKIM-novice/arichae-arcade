/* 머지관 · 그림 경로 한 곳 (static/img/merge/<묶음>/<id>.webp · tools/merge_art.py 가 만들어요)
   - 화면 코드는 MergeArt.src(id) 만 써요. 그림이 없는 id 는 '' → 화면이 둥근 색 칸 + 한글 이름 + 단계 숫자로 대신 그려요
   - 실제로 있는 그림은 art_list.js(window.MergeArtList, merge_art.py 가 씀)로 알아요 → 없는 그림은 요청조차 안 해요
     (목록 파일이 없으면 FILES 를 다 있다고 보고, 못 읽은 그림은 화면이 onerror 로 대신 그려요)
   - 새 그림: tools/merge_art.py 의 ART 에 한 줄 → 실행 (여기 FILES 는 id → 묶음만 정해요)
   - 페이지 위치와 상관없이 쓰려고 이 파일 주소에서 static/ 뿌리를 알아내요 */
(function (root) {
  'use strict';

  const FILES = {};
  const put = (group, ids) => ids.forEach((id) => { FILES[id] = group + '/' + id; });
  // 체인 물건 (체인 글자 + 단계) · 보조 물건
  const tiers = { a: 8, b: 9, c: 7, d: 8, e: 8, f: 7, g: 7, h: 7, en: 3, cn: 3, ss: 3, bj: 3 };
  Object.keys(tiers).forEach((c) => { for (let t = 1; t <= tiers[c]; t++) put('items', [c + t]); });
  put('items', ['wild', 'sand']);
  put('gens', ['gen_a', 'gen_b', 'gen_c', 'gen_d', 'gen_e', 'gen_f', 'gen_g', 'gen_h']);
  put('ui', ['coin', 'energy', 'secret_letter', 'secret_bottle', 'secret_seagull', 'bag', 'logo', 'sorastar', 'star']);
  // 인물 얼굴 (data.js 의 art id 'char_juni' → chars/juni · 기쁨 얼굴 'char_juni_joy' → chars/juni_joy)
  put('chars', ['hayun', 'hayun_joy', 'hayun_wow']);
  ['juni', 'mina', 'kkotnim', 'dochi', 'kang', 'rua', 'mongdol'].forEach((k) => { FILES['char_' + k] = 'chars/' + k; FILES['char_' + k + '_joy'] = 'chars/' + k + '_joy'; });
  // 지역 배경 1~6 (전/후) · 이야기 그림 (시작·엔딩) · 타이틀·판 배경
  for (let k = 1; k <= 6; k++) put('bg', ['r' + k + '_before', 'r' + k + '_after']);
  put('bg', ['story_start', 'story_ending', 'title', 'board']);
  // 주간 이벤트 (체인 물건 kite1~5 · 발생기 gen_kite → events/kite_gen · 장식 · 배너)
  ['kite', 'dano'].forEach((e) => {
    for (let t = 1; t <= 5; t++) put('events', [e + t]);
    FILES['gen_' + e] = 'events/' + e + '_gen';
    put('events', [e + '_deco', e + '_banner']);
  });

  // 마을 지도 그림 (tools/merge_art.py town → town/<이름>) · id = 't_' + 이름 (예: t_b_r1_gate_a · t_map_r1 · t_w_juni)
  if (root.MergeArtList) Object.keys(root.MergeArtList).forEach((k) => { if (k.indexOf('town/') === 0) FILES['t_' + k.slice(5)] = k; });

  let ROOT = 'static/';
  try {
    const me = document.currentScript && document.currentScript.src;
    if (me) ROOT = me.replace(/js\/merge\/art\.js(\?.*)?$/, '');
  } catch (e) { /* 기본값 */ }

  const LIST = root.MergeArtList || null;
  const has = (id) => !!FILES[id] && (!LIST || !!LIST[FILES[id]]);

  const API = {
    FILES,
    get root() { return ROOT; },
    has,
    src: (id) => (has(id) ? ROOT + 'img/merge/' + FILES[id] + '.webp' : ''),
    // 처음 화면에 필요한 그림을 미리 받아 둬요 (끌 때 깜빡임 방지)
    preload(ids) { (ids || Object.keys(FILES)).forEach((id) => { const s = API.src(id); if (s) { const im = new Image(); im.decoding = 'async'; im.src = s; } }); }
  };
  root.MergeArt = API;
})(window);
