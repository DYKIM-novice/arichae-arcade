/* 아리채 오락실 · 회귀 RPG 1장 「꽃비 항구와 울음곶」 이야기 데이터 (docs/handoff/specs/rpg_story.md 6절이 기준)
   - 화면 코드(ch1.js)와 떨어진 순수 데이터 + 고르는 함수 몇 개 → node 시험에서도 읽어요
   - 대사 한 줄 text 는 글자 하나이거나 { m: 남자 선장일 때, f: 여자 선장일 때 } 두 벌이에요
       · 부엉이 할머니는 남 선장을 '젊은이', 여 선장을 '아가씨'로 불러요 · 노을이·단추는 둘 다 '선장님'·'선장'
   - 회차마다 바뀌는 대사는 { from: 이 회차부터, text } 목록 → 지금 회차 이하에서 가장 큰 from 을 골라요
   - 장면 한 컷(beat): { bg 그림 id, who 말하는 사람(없으면 해설), text, fx 연출, ms 자동 넘김(오프닝만), focus 배경 가로 초점 0~1 }
   - 그림 id 는 art.js 의 RpgArt.src(id) 로만 경로가 돼요 */
(function (root) {
  'use strict';

  const CHAR = {
    hero: { name: '선장', art: { m: 'c_hero_m', f: 'c_hero_f' } },
    noeul: { name: '노을이', art: 'c_noeul', role: '항해사' },
    danchu: { name: '단추', art: 'c_danchu', role: '갑판장' },
    granny: { name: '부엉이 할머니', art: 'c_owl_granny', role: '늙은 항해사' },
    bori: { name: '보리', art: 'c_bori', role: '배 고양이' }
  };

  // 방 6개 (방 5개 + 보스) — 배경 · 날씨(효과) · 소리 크기 · 이름
  const ROOMS = [
    { bg: 'bg_harbor', name: '꽃비 항구 부두', weather: 'petals', focus: 0.55 },
    { bg: 'bg_calm_sea', name: '잔잔한 바다', weather: 'clear', focus: 0.5 },
    { bg: 'bg_rain_deck', name: '비 오는 바다', weather: 'rain', focus: 0.5 },
    { bg: 'bg_storm_deck', name: '폭풍 속 갑판', weather: 'storm', focus: 0.5 },
    { bg: 'bg_cape', name: '울음곶 앞', weather: 'storm', focus: 0.5 },
    { bg: 'bg_cape', name: '울음곶', weather: 'storm', focus: 0.5, boss: true }
  ];

  // 오프닝 30초 (A안 · 건너뛰기 가능) — 마지막 컷이 끝나면 바로 방 1 (첫 패링 안내)
  const OPENING = [
    { bg: 's_opening_sink', focus: 0.62, fx: 'sink', who: 'noeul', text: '선장님!!', ms: 2600 },
    { bg: 's_opening_sink', focus: 0.8, fx: 'rewind', text: '배가 가라앉는 순간, 별나침반 바늘이 거꾸로 돌기 시작했다…', ms: 2600 },
    { bg: 'bg_harbor', focus: 0.55, fx: 'petals', who: 'hero', text: '…어? 아침이네?', ms: 3600 },
    { bg: 'bg_harbor', focus: 0.55, fx: 'bori', who: 'bori', text: '(배 고양이 보리가 발밑에 몸을 비빈다) 냐아—', ms: 3400 },
    { bg: 'bg_harbor', focus: 0.3, who: 'granny', text: { m: '…쿨쿨. (실눈) 거기 젊은이, 바다는 처음이니?', f: '…쿨쿨. (실눈) 거기 아가씨, 바다는 처음이니?' }, ms: 3600 },
    { bg: 'bg_harbor', focus: 0.3, fx: 'compass', who: 'granny', text: '이 별나침반을 가져가렴. 바람이 멈추는 순간을 놓치지 마렴.', ms: 4200 },
    { bg: 'bg_harbor', focus: 0.7, who: 'noeul', text: '선장님! 짐 쪽에 게들이 몰려와요!', ms: 3000 }
  ];

  // 회귀한 뒤 꽃비 항구 (회차마다 대사가 늘어요) — 이 순서대로 한 줄씩
  const HARBOR = {
    granny: [
      { from: 1, text: { m: '…쿨쿨. (실눈) 바다는 처음이니, 젊은이?', f: '…쿨쿨. (실눈) 바다는 처음이니, 아가씨?' } },
      { from: 2, text: { m: '(실눈) …흠. 젊은이 눈빛이 아까랑 다르구나.', f: '(실눈) …흠. 아가씨 눈빛이 아까랑 다르구나.' } },
      { from: 3, text: '또 왔구나. 꽃잎이 아까랑 똑같이 떨어지지?' },
      { from: 5, text: '이번엔 문어 다리 세 번째를 조심하렴. 그 녀석은 늘 파랑이더구나.' },
      { from: 8, text: { m: '젊은이, 넘어진 횟수만큼 바람을 아는 법이란다.', f: '아가씨, 넘어진 횟수만큼 바람을 아는 법이란다.' } }
    ],
    noeul: [
      { from: 1, text: { m: '선장님, 첫 항해치곤 하늘이 너무 좋은데요? 오늘따라 늠름하시네요!', f: '선장님, 첫 항해치곤 하늘이 너무 좋은데요? 오늘따라 모자가 잘 어울리세요!' } },
      { from: 2, text: '…선장님, 왜 그렇게 하늘을 노려보세요? 무슨 일 있어요?' },
      { from: 4, text: '오늘 저녁은 생선 수프예요! …근데 선장님, 그 표정 또 나왔어요. 꼭 다 아는 사람처럼.' },
      { from: 6, text: '선장님이 그렇게 확신하면… 저도 믿을게요. 대신 다녀와서 설거지는 선장님 몫!' }
    ],
    danchu: [
      { from: 1, text: '…' },
      { from: 3, text: '…또야?' },
      { from: 5, text: '선장. 이번엔 대포 밧줄 내가 묶을게.' },
      { from: 7, text: '…선장. 이상한 꿈을 꿨어. 배가 가라앉는 꿈. 한 번이 아니야.' }
    ]
  };

  // 정산 화면(여관)에서 단추가 건네는 한마디 — 회귀를 어렴풋이 기억하는 떡밥 (2장 갈고리)
  const INN = [
    { from: 2, who: 'danchu', text: '…' },
    { from: 3, who: 'danchu', text: '…처음 보는 여관인데, 왜 의자 삐걱이는 소리까지 아는 것 같지.' },
    { from: 5, who: 'danchu', text: '선장. 너, 울음곶에서 뭘 봤어? …나도 거기서 물에 빠진 기억이 있어.' },
    { from: 7, who: 'danchu', text: '…이 나침반, 바늘이 돌 때마다 내 머리가 울려. 다음엔 안 가라앉게 하자.' }
  ];

  // 방에 들어설 때 짧은 한마디 (멈추지 않고 화면 위에 잠깐) — loop 가 있으면 그 회차부터
  const ROOM_TALK = [
    [{ who: 'noeul', text: '게들이 또 짐을 노려요! 선장님, 막아요!', from: 2 }],
    [{ who: 'noeul', text: '바람이 이상해… 갈매기들이 돛 위로 몰려와요!' }, { text: '해초 덩어리에 부딪히자 갑판으로 게가 쏟아진다!' }],
    [{ who: 'danchu', text: '비 온다. 대포 밧줄이 풀렸어. 굴러온다!' }],
    [{ text: '큰 배가 스치듯 지나간다! 항적 파도가 덮쳐 온다!' }, { who: 'noeul', text: '선체에 부딪히겠어요! 밀어내요!' }],
    [{ who: 'danchu', text: '꽉 잡아!' }],
    [{ text: '구름 속에서 거대한 눈이 떠졌다. 울음곶의 폭풍 문어!' }, { who: 'noeul', text: '저게… 문어라고요?!' }]
  ];
  // 중간 보스(적 캐럭선)가 나타날 때
  const MID_TALK = [{ text: '빗속에서 검은 돛이 다가온다. 적 캐럭선!' }, { who: 'noeul', text: '선장님, 포문이 열려요! 포탄 색을 봐요!' }];

  // 클리어 장면 (s_clear) — 누르면 넘어가요
  const CLEAR = [
    { bg: 's_clear', fx: 'stars', text: '폭풍이 걷히고, 별이 쏟아진다.' },
    { bg: 's_clear', fx: 'stars', who: 'noeul', text: '(갑판에 셋이 나란히 누워) …있잖아요. 우리 부자가 되면 뭘 살래요?' },
    { bg: 's_clear', fx: 'stars', who: 'hero', text: { m: '나는… 저 별을 살래.', f: '나? …저 별을 살 거야.' } },
    { bg: 's_clear', fx: 'stars', who: 'danchu', text: '…바람.' },
    { bg: 's_clear', fx: 'newstar', text: '그때, 별나침반 바늘이 스르륵 돌아 처음 보는 별 하나를 가리켰다.' },
    { bg: 's_clear', fx: 'smoke', who: 'noeul', text: '선장님… 저기 수평선에, 연기가 올라와요.' },
    { bg: 's_clear', fx: 'smoke', who: 'danchu', text: '…이번엔, 안 가라앉았네.' },
    { bg: 's_clear', fx: 'end', text: '다음 이야기: 2장 「안개 섬의 등대」', end: true }
  ];

  /* ---------------- 고르는 함수 ---------------- */
  const sayText = (text, g) => (text && typeof text === 'object' ? (text[g === 'f' ? 'f' : 'm'] || text.m) : String(text || ''));
  function byLoop(list, loop) {
    let best = null;
    (list || []).forEach((x) => { if ((x.from || 1) <= (loop || 1) && (!best || (x.from || 1) >= (best.from || 1))) best = x; });
    return best;
  }
  const artOf = (who, g) => {
    const c = CHAR[who];
    if (!c) return '';
    return typeof c.art === 'object' ? c.art[g === 'f' ? 'f' : 'm'] : c.art;
  };
  const nameOf = (who) => (CHAR[who] ? CHAR[who].name : '');
  // 회귀한 뒤 항구 장면 컷들 (1회차는 오프닝이 대신해요)
  function harborBeats(loop) {
    const out = [{ bg: 'bg_harbor', focus: 0.55, fx: 'petals', text: `${loop}번째 아침. 꽃잎이 아까와 똑같이 떨어진다.` }];
    ['granny', 'noeul', 'danchu'].forEach((who) => {
      const l = byLoop(HARBOR[who], loop);
      if (l) out.push({ bg: 'bg_harbor', focus: who === 'granny' ? 0.3 : 0.6, who, text: l.text });
    });
    if (loop >= 2) out.splice(1, 0, { bg: 'bg_harbor', focus: 0.55, fx: 'bori', who: 'bori', text: '(보리가 꼬리를 세우고 다가온다) 냐아—' });
    return out;
  }
  const roomTalk = (room, loop) => (ROOM_TALK[room] || []).filter((x) => !x.from || x.from <= loop);
  const innLine = (loop) => byLoop(INN, loop);

  const STORY = { CHAR, ROOMS, OPENING, HARBOR, INN, ROOM_TALK, MID_TALK, CLEAR, sayText, byLoop, artOf, nameOf, harborBeats, roomTalk, innLine };
  // 1장에 쓰는 그림 전부 (미리 불러오기 · 시험)
  STORY.ART_IDS = (function () {
    const s = new Set(['c_hero_m', 'c_hero_f', 'fx_parry_cutin_m', 'fx_parry_cutin_f', 's_inn', 's_clear', 's_opening_sink']);
    Object.keys(CHAR).forEach((k) => { s.add(artOf(k, 'm')); s.add(artOf(k, 'f')); });
    ROOMS.forEach((r) => s.add(r.bg));
    return Array.from(s);
  })();
  root.RpgStory = STORY;
  if (typeof module !== 'undefined' && module.exports) module.exports = STORY;
})(typeof window !== 'undefined' ? window : globalThis);
