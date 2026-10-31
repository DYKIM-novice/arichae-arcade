/* 머지관 · 「소라섬 등불 이야기」 데이터 (기획: docs/handoff/specs/merge_seaside.md)
   - 체인·발생기·마을 사람·지역(복원 작업)·이야기·밸런스 숫자를 여기 한 곳에 모아요 (규칙 코드는 core.js)
   - 1단계: 체인 A·B·D · 발생기 3 · 기운 · 합치기 · 일반 주문 · 기기 저장
   - 2단계: 별로 복원 작업 · 지역 전/후 배경 · 이야기 장면 · 서버 저장 · 덮인 칸(모래더미)
   - 3단계(일부): 체인 C·E·F(+G·H 자리) · 충전식 발생기 · 2~3지역 · 가방·선물함 · 팔기·되돌리기 · 보조 물건 · 주문 덤
   - 새 지역은 AREAS 에 한 덩어리 + STORY 에 장면만 더하면 돼요 (코드 수정 없음)
   - 브라우저(window.MergeData)와 node 시험(require) 둘 다에서 읽어요 */
(function (root) {
  'use strict';

  // 체인: id · 단계 이름(1단계부터) · 테두리 색 · 발생기
  // 그림 id 는 체인 id + 단계 (a1, b9, en2 ...) → art.js 가 경로를 만들어요
  // aux: 보조 물건 (주문에 안 나옴 · 판에서 [쓰기]/[열기]) · kind = energy | coins | gems | gift
  const CHAINS = {
    a: { name: '바다 보물', color: '#3fb6b0', soft: '#d9f4f1', gen: 'gen_a',
      tiers: ['모래알', '작은 조개', '소라', '전복 껍데기', '진주조개', '진주 한 알', '진주 비녀', '자개 보석함'] },
    b: { name: '떡·과자', color: '#f08a5d', soft: '#ffe8dc', gen: 'gen_b',
      tiers: ['쌀 한 줌', '쌀자루', '떡 반죽', '송편', '꿀떡 꼬치', '색동 경단', '약과 접시', '꽃 백설기', '잔칫상 떡 탑'] },
    c: { name: '찻집', color: '#7aa84f', soft: '#e9f4dc', gen: 'gen_c',
      tiers: ['찻잎', '찻잔', '유자차', '녹차 한 잔', '다기 세트', '다과 쟁반', '다과상'] },
    d: { name: '꽃', color: '#e2679a', soft: '#ffe3ee', gen: 'gen_d',
      tiers: ['꽃씨 주머니', '새싹 화분', '동백꽃', '국화 화분', '연꽃', '매화 분재', '꽃바구니', '벚나무 화분'] },
    e: { name: '바다 식탁', color: '#4f8fd6', soft: '#dfeefe', gen: 'gen_e',
      tiers: ['새우', '멸치 한 줌', '고등어', '조기', '문어', '굴비 엮음', '해물 뚝배기', '바닷마을 한상'] },
    f: { name: '도자기', color: '#a77b5a', soft: '#f3e6da', gen: 'gen_f',
      tiers: ['흙덩이', '작은 종지', '찻사발', '청자 꽃병', '달항아리', '장독', '장독대'] },
    g: { name: '바느질·부채', color: '#9b6fd0', soft: '#efe5fb', gen: 'gen_g',
      tiers: ['실타래', '색실 뭉치', '복주머니', '둥근 부채', '색동 방석', '조각보', '돛'] },
    h: { name: '불빛', color: '#e8a325', soft: '#fff1d2', gen: 'gen_h',
      tiers: ['성냥', '초', '촛대', '청사초롱', '연꽃 등', '등불 줄', '등대 렌즈'] },
    // 보조 물건 (합치기 가능 · 판에서 써요)
    en: { name: '식혜', color: '#d9a35c', soft: '#fbefd9', aux: { kind: 'energy', amount: [5, 15, 40], verb: '마시기' },
      tiers: ['식혜 한 잔', '식혜 사발', '식혜 항아리'] },
    cn: { name: '엽전', color: '#c99a2e', soft: '#fbf0cf', aux: { kind: 'coins', amount: [5, 20, 80], verb: '쓰기' },
      tiers: ['엽전 몇 닢', '엽전 꾸러미', '엽전 궤짝'] },
    ss: { name: '소라별', color: '#5fb0e6', soft: '#e1f2fd', aux: { kind: 'gems', amount: [1, 5, 20], verb: '모으기' },
      tiers: ['소라별', '소라별 주머니', '소라별 상자'] },
    bj: { name: '선물 보자기', color: '#e46f8c', soft: '#fde4ea', aux: { kind: 'gift', amount: [3, 5, 8], verb: '열기' },
      tiers: ['작은 보자기', '중간 보자기', '큰 보자기'] }
  };

  // 발생기: 톡 하면 그 체인 1단계(가끔 2단계) · charge = 충전식 (taps 번 뽑으면 restMs 동안 쉼)
  const GENS = {
    gen_a: { chain: 'a', name: '모래 바구니', charge: null },
    gen_b: { chain: 'b', name: '떡방아 절구', charge: null },
    gen_c: { chain: 'c', name: '찻잎 선반', charge: { taps: 12, restMs: 10 * 60000 } },
    gen_d: { chain: 'd', name: '씨앗 항아리', charge: null },
    gen_e: { chain: 'e', name: '통발', charge: null },
    gen_f: { chain: 'f', name: '물레', charge: null },
    gen_g: { chain: 'g', name: '반짇고리', charge: null },
    gen_h: { chain: 'h', name: '등 공방 상자', charge: { taps: 12, restMs: 10 * 60000 } }
  };

  // 마을 사람 (주문 카드·대사 얼굴) · art: 그림 id (그림이 없으면 색 동그라미 + 첫 글자)
  // faces: 표정 그림 id ({ who:'hayun', face:'joy' } → hayun_joy)
  const VILLAGERS = {
    juni: { name: '준이', art: 'char_juni', color: '#6aa9e9', chains: ['a'], lines: ['바닷가에서 이거 찾아 줄 수 있어?', '편지 배달 가는 길에 필요해!', '우와, 진짜 반짝반짝하다!'] },
    mina: { name: '미나', art: 'char_mina', color: '#f39a7a', chains: ['b', 'c'], lines: ['떡집 다시 열려면 이게 있어야 해!', '하윤아, 이거 하나만 부탁해~', '역시 내 친구!'] },
    kkotnim: { name: '꽃님 할머니', art: 'char_kkotnim', color: '#d77fb0', chains: ['d'], lines: ['아이고, 우리 하윤이 왔구나.', '정원에 이게 하나 있으면 좋겠구먼.', '윤해가 보면 참 좋아하겠다.'] },
    dochi: { name: '도치 아저씨', art: 'char_dochi', color: '#5b7fa6', chains: ['e', 'f'], lines: ['…이거 있으면 좀 주시오.', '배 손질하는 데 필요하오.', '…그래. 고맙소.'] },
    hayun: { name: '하윤', art: 'hayun', faces: { joy: 'hayun_joy', wow: 'hayun_wow' }, color: '#7cc29a', chains: [], lines: [] },
    mongdol: { name: '몽돌', art: 'char_mongdol', faces: { joy: 'char_mongdol_joy' }, color: '#9fb4c8', chains: [], lines: [] },
    letter: { name: '할머니의 편지', art: 'secret_letter', color: '#c9a46a', chains: [], lines: [], letter: true },
    who: { name: '???', art: '', color: '#b9aaa0', chains: [], lines: [] }
  };

  // 복원 지역 · 순서대로 열려요 (st.area = 지금 지역 번호)
  //  bg: 전/후 배경 그림 id (없으면 '전' 그림에 색 바꾸기, 그것도 없으면 그림 대신 색 풍경)
  //  view: 배경 그림 중 마을 화면에 보여 줄 세로 구간 (0~1) · 작업 위치 x,y 는 그림 전체 기준 %
  //  chains: 이 지역 주문에 나오는 체인 · orders: 물건 수/단계 범위
  //  tasks: 순서대로 하나씩 (cost = 별) · scene = 끝낸 뒤 볼 이야기 · r = 드러나는 동그라미 반지름(그림 폭 %)
  //  open: 이 지역이 열릴 때 (장면 · 새 발생기 · 새 체인) · done: 다 고쳤을 때 (장면 · 모래더미 걷기)
  const AREAS = [
    { id: 'r1', name: '바다별채', sub: '할머니의 한옥 민박', bg: { before: 'r1_before', after: 'r1_after' }, view: [0.36, 0.98],
      sky: ['#ffe2cf', '#ffd2bd'], sea: '#8fd3c8',
      chains: ['a', 'b', 'd'], orders: { items: [1, 1], tiers: [2, 4] },
      tasks: [
        { id: 'r1_gate', name: '대문 잔해 치우기', cost: 1, x: 16, y: 74, r: 20, scene: 'r1_gate' },
        { id: 'r1_paper', name: '찢어진 창호지 바르기', cost: 2, x: 44, y: 61, r: 19, scene: 'r1_paper' },
        { id: 'r1_sign', name: '현판 다시 달기', cost: 2, x: 52, y: 52, r: 20, scene: 'r1_sign' },
        { id: 'r1_maru', name: '대청마루 닦기', cost: 3, x: 36, y: 68, r: 21, scene: 'r1_maru' },
        { id: 'r1_lamp', name: '마당 석등 켜기', cost: 3, x: 9, y: 68, r: 18, scene: 'r1_lamp' },
        { id: 'r1_room', name: '첫 손님방(온돌방) 꾸미기', cost: 4, x: 76, y: 62, r: 22 }
      ],
      open: { scene: null, gens: [], chains: [] },
      done: { scene: 'r1_done', uncover: true } },
    { id: 'r2', name: '몽돌 선착장', sub: '물빛포구 장터', bg: { before: 'r2_before', after: 'r2_after' }, view: [0.25, 0.98],
      sky: ['#ffe6d0', '#cfe7f0'], sea: '#7fc6d8',
      chains: ['a', 'b', 'd', 'e'], orders: { items: [1, 2], tiers: [3, 5] },
      tasks: [
        { id: 'r2_pier', name: '부서진 나무 선착장 고치기', cost: 2, x: 30, y: 82, r: 22 },
        { id: 'r2_net', name: '그물 널기', cost: 3, x: 16, y: 68, r: 18, scene: 'r2_net' },
        { id: 'r2_awning', name: '장터 차양 치기', cost: 3, x: 42, y: 51, r: 20 },
        { id: 'r2_ice', name: '얼음 창고 문 고치기', cost: 4, x: 90, y: 54, r: 17 },
        { id: 'r2_boat', name: '나룻배 칠하기', cost: 4, x: 88, y: 68, r: 19, scene: 'r2_boat' },
        { id: 'r2_stall', name: '생선 좌판 차리기', cost: 5, x: 63, y: 57, r: 19 },
        { id: 'r2_sotdae', name: '갈매기 솟대 세우기', cost: 7, x: 78, y: 32, r: 18 }
      ],
      open: { scene: 'r2_open', gens: ['gen_e'], chains: ['e'] },
      done: { scene: 'r2_done', uncover: true } },
    { id: 'r3', name: '바람골목', sub: '떡집 · 찻집 골목', bg: { before: 'r3_before', after: 'r3_after' }, view: [0.16, 1.0],
      sky: ['#ffe9d6', '#f6dce8'], sea: '#a9d8c4',
      chains: ['a', 'b', 'c', 'd', 'e', 'f'], orders: { items: [1, 2], tiers: [4, 6] },
      tasks: [
        { id: 'r3_road', name: '골목 돌길 깔기', cost: 3, x: 50, y: 86, r: 22 },
        { id: 'r3_mill', name: '떡방앗간 절구 고치기', cost: 4, x: 13, y: 82, r: 19, scene: 'r3_mill' },
        { id: 'r3_eave', name: '처마 차양 달기', cost: 5, x: 22, y: 42, r: 20 },
        { id: 'r3_pyeong', name: '찻집 평상 놓기', cost: 6, x: 72, y: 70, r: 19 },
        { id: 'r3_pots', name: '돌담 화분 줄 세우기', cost: 6, x: 34, y: 60, r: 17 },
        { id: 'r3_mural', name: '골목 벽화 그리기', cost: 7, x: 88, y: 62, r: 20, scene: 'r3_mural' },
        { id: 'r3_bell', name: '풍경(바람종) 달기', cost: 9, x: 86, y: 32, r: 18 }
      ],
      open: { scene: 'r3_open', gens: ['gen_c', 'gen_f'], chains: ['c', 'f'] },
      done: { scene: 'r3_done', uncover: true } }
    // 4 매화언덕 정원 (+G) · 5 반짝 해변 (+H) · 6 등대곶 은 같은 모양으로 추가
  ];

  const BOARD = { cols: 7, rows: 9 };

  const BAL = {
    energyMax: 100,
    energyMs: 120000,          // 2분에 1
    energyCap: 999,            // 식혜로는 최대를 넘겨 채울 수 있어요
    spawnCost: 1,
    spawnTier2: 0.10,          // 발생기에서 2단계가 나올 확률
    refillPrices: [15, 30, 60], // 동전으로 기운 채우기 (하루 3번 · 가격 오름)
    refillAmount: 100,
    ordersShown: 3,
    orderCoinMult: 1.5,        // 동전 = 판매값 합 × 1.5 (판매값 = 2^(단계-1))
    orderStuckMs: 30 * 60000,  // 30분 넘게 안 끝난 주문이 있으면 새 주문 단계를 1 낮춤
    skipCooldownMs: 10 * 60000, // [다른 부탁] 쿨타임
    orderBonus: 0.15,          // 주문 덤 확률
    bonusPool: [{ k: 'item', c: 'en', t: 1 }, { k: 'item', c: 'bj', t: 1 }, { k: 'wild' }, { k: 'item', c: 'cn', t: 1 }],
    bagStart: 6, bagMax: 20, bagPrice: 50, bagGrow: 1.4,   // 가방: 6칸 → 동전으로 한 칸씩 (50 → 1.4배씩)
    giftTier2: 0.3,            // 보자기에서 2단계가 나올 확률 (큰 보자기는 3단계도 조금)
    firstFindGems: 1,          // 처음 발견하면 소라별 1
    shop: [                    // 소라별 가게 (가방 화면)
      { id: 'wild', cell: { k: 'wild' }, gems: 6 },
      { id: 'bj1', cell: { k: 'item', c: 'bj', t: 1 }, gems: 3 },
      { id: 'en2', cell: { k: 'item', c: 'en', t: 2 }, gems: 4 }
    ]
  };

  // 처음 판: 발생기 3개(가운데 아래) + 1단계 물건 몇 개 · 위쪽은 모래더미(옆에서 합치면 한 겹씩 벗겨짐)
  const START = {
    gens: [{ id: 'gen_a', at: 58 }, { id: 'gen_b', at: 59 }, { id: 'gen_d', at: 60 }],
    items: [{ c: 'a', t: 1, at: 43 }, { c: 'a', t: 1, at: 47 }, { c: 'b', t: 1, at: 45 }, { c: 'b', t: 1, at: 52 }, { c: 'd', t: 1, at: 54 }],
    cover: [{ rows: [0, 1], n: 2 }, { rows: [2], n: 1 }],
    chains: ['a', 'b', 'd'],
    energy: 100, coins: 0, stars: 0, gems: 0
  };

  // 이야기 장면 (톡해서 넘김 · 한 장면 3~6줄) · who = VILLAGERS id · face = 표정
  const STORY = {
    intro: [
      { who: 'hayun', text: '여기가… 할머니의 바다별채.\n폭풍에 많이 망가졌네.' },
      { who: 'hayun', text: '할머니 편지 끝에 이렇게 쓰여 있었지.\n"섬 곳곳에 내 편지를 숨겨 두었단다."' },
      { who: 'hayun', face: 'joy', text: '마을 사람들 부탁을 들어주면 별을 받아.\n별로 바다별채를 하나씩 고치자!' },
      { who: 'hayun', text: '같은 물건 두 개를 끌어다 겹치면\n더 좋은 물건이 돼. 바구니·절구·항아리를 톡!' }
    ],
    r1_gate: [
      { who: 'hayun', text: '영차, 영차…\n대문 앞이 좀 훤해졌다!' },
      { who: 'hayun', face: 'wow', text: '어? 우편함 안에 뭔가 있어.\n할머니 글씨다!' },
      { who: 'letter', text: '하윤아, 첫 편지를 찾았구나.\n문을 연 사람이 이 집의 새 주인이란다.' },
      { who: 'letter', text: '무너진 건 천천히, 하나씩 세우면 돼.\n섬 사람들이 널 도와줄 거야.' },
      { who: 'hayun', text: '…할머니.\n응, 천천히 해 볼게.' }
    ],
    r1_paper: [
      { who: 'hayun', face: 'joy', text: '창호지를 새로 바르니까\n방이 환해졌어.' },
      { who: 'who', text: '뀨… 뀨우…' },
      { who: 'hayun', face: 'wow', text: '바닷가에서 나는 소린데…\n아기 물범이 그물에 걸렸잖아!' },
      { who: 'hayun', text: '가만있어, 금방 풀어 줄게.\n…됐다!' },
      { who: 'mongdol', face: 'joy', text: '뀨! 뀨뀨!' },
      { who: 'hayun', face: 'joy', text: '동글동글 몽돌 같네.\n너 이름은 몽돌이야. 같이 살래?' }
    ],
    r1_sign: [
      { who: 'hayun', text: '「바다별채」 현판,\n다시 반듯하게!' },
      { who: 'juni', text: '우와, 간판 달렸다!\n누나가 새 주인이에요?' },
      { who: 'juni', text: '저는 준이예요. 섬에 하나뿐인 우체부!\n자전거로 어디든 가요.' },
      { who: 'juni', text: '윤해 할머니 앞으로 온 편지가\n우체국에 잔뜩 쌓여 있어요. 가져올게요!' },
      { who: 'mongdol', text: '뀨!' }
    ],
    r1_maru: [
      { who: 'mina', text: '하윤아! 진짜 너야?\n나 미나! 떡집 미나!' },
      { who: 'hayun', face: 'joy', text: '미나야!\n어릴 때 여름마다 같이 놀았잖아!' },
      { who: 'mina', text: '이사 떡이야. 우리 떡집은\n아직 문을 못 열었지만…' },
      { who: 'mina', text: '할머니가 늘 그러셨어.\n바다별채 마루엔 손님이 끊이지 않았다고.' }
    ],
    r1_lamp: [
      { who: 'kkotnim', text: '아이고, 석등에 불이 들어왔구먼.' },
      { who: 'hayun', face: 'wow', text: '꽃님 할머니!\n저 기억하세요?' },
      { who: 'kkotnim', text: '그럼, 윤해 손녀를 내가 모를까.\n눈매가 꼭 닮았네.' },
      { who: 'kkotnim', text: '윤해는 밤마다 이 석등을 켰제.\n바다에 나간 사람들 길 잃지 말라고.' },
      { who: 'mongdol', text: '뀨우…\n(석등 아래에서 꼬리를 살랑살랑)' }
    ],
    r1_done: [
      { who: 'juni', text: '누나! 첫 손님 왔어요…\n사실 저예요! 하룻밤 자 보고 싶었거든요.' },
      { who: 'hayun', face: 'joy', text: '어서 오세요,\n바다별채 첫 손님!' },
      { who: 'juni', text: '아 참, 우체국 구석에서 찾았어요.\n받는 사람이 \'하윤\'이에요.' },
      { who: 'letter', text: '바다별채가 다시 따뜻해졌구나.\n다음은 선착장이란다.' },
      { who: 'letter', text: '무뚝뚝한 도치가 지키고 있을 거야.\n그 사람 마음을 열 열쇠는 배란다. —윤해' },
      { who: 'mongdol', face: 'joy', text: '뀨!\n(선착장 쪽으로 꼬리를 흔든다)' }
    ],
    r2_open: [
      { who: 'hayun', text: '여기가 물빛포구 선착장…\n배가 한 척도 없네.' },
      { who: 'dochi', text: '…누구요.\n여긴 볼 거 없소.' },
      { who: 'hayun', text: '윤해 할머니 손녀 하윤이에요.\n선착장을 고치고 싶어서요!' },
      { who: 'dochi', text: '…그래.\n생선이 필요하면 이 통발이나 쓰시오.' },
      { who: 'mongdol', text: '뀨?\n(통발 냄새를 킁킁)' }
    ],
    r2_net: [
      { who: 'dochi', text: '…그물은 그렇게 너는 게 아니오.\n이리 줘 보시오.' },
      { who: 'hayun', face: 'joy', text: '와, 아저씨 손이 엄청 빨라요!' },
      { who: 'dochi', text: '…삼십 년을 했으니.' }
    ],
    r2_boat: [
      { who: 'dochi', text: '…그 배, 우리 아들 배였소.' },
      { who: 'dochi', text: '폭풍 날 윤해 할매가\n아들을 별채에 숨겨 줬지. 그 덕에 살았소.' },
      { who: 'hayun', face: 'wow', text: '할머니가요…?' },
      { who: 'dochi', text: '고맙단 말을 끝내 못 했소.\n…이제라도 해야지. 고맙소.' }
    ],
    r2_done: [
      { who: 'dochi', text: '갈매기 솟대까지 세웠구먼.\n포구가 살아났소.' },
      { who: 'dochi', text: '이거, 윤해 할매가 맡겨 둔 거요.\n손녀가 오면 주라고.' },
      { who: 'letter', text: '도치는 말은 적어도 약속은 꼭 지키는 사람이야.\n이제 골목에 웃음소리를 찾아 주렴.' },
      { who: 'hayun', face: 'joy', text: '골목이면… 미나네 떡집!\n미나가 기다리고 있겠다.' }
    ],
    r3_open: [
      { who: 'mina', text: '하윤아! 우리 골목도 고쳐 줄 거지?\n떡집 다시 열고 싶어!' },
      { who: 'mina', text: '엄마가 쓰던 찻잎 선반이랑\n옆집 할아버지 물레를 빌려 왔어.' },
      { who: 'hayun', face: 'joy', text: '좋아! 떡 냄새 나는 골목,\n다시 만들자.' },
      { who: 'mongdol', face: 'joy', text: '뀨뀨!' }
    ],
    r3_mill: [
      { who: 'mina', text: '절구가 다시 쿵덕쿵덕!\n…어? 밑에 쪽지가 붙어 있어.' },
      { who: 'letter', text: '미나야, 꽃 백설기엔 꿀 한 숟가락과\n유자 껍질 조금. 그게 내 비밀이란다.' },
      { who: 'mina', text: '할머니…\n나한테도 편지를 남기셨구나.' }
    ],
    r3_mural: [
      { who: 'juni', text: '벽화 멋지다!\n바다랑 등대랑… 몽돌이도 있어요!' },
      { who: 'mongdol', face: 'joy', text: '뀨~!' },
      { who: 'hayun', text: '등대…\n그러고 보니 등대 불은 계속 꺼져 있네.' }
    ],
    r3_done: [
      { who: 'mina', face: 'joy', text: '떡집 재개업!\n골목에 사람들이 모였어!' },
      { who: 'dochi', text: '…떡 하나 주시오.\n아들 몫까지.' },
      { who: 'kkotnim', text: '아이고, 이렇게 다 같이 모인 게\n얼마 만이고.' },
      { who: 'juni', text: '누나! 꽃언덕에서 누가 그림을 그려요.\n처음 보는 사람이에요!' },
      { who: 'hayun', text: '꽃언덕…\n다음 이야기는 거기서 시작되겠구나.' }
    ]
  };

  // 하윤의 짧은 도움말 (아래 정보 칸 · 아무것도 안 골랐을 때)
  const TIPS = [
    '같은 물건 두 개를 끌어다 겹치면 더 좋은 물건이 돼요!',
    '바구니·절구·항아리를 톡 하면 물건이 나와요. 기운이 1 들어요.',
    '부탁 카드에 초록 체크가 뜨면 [건네기]를 눌러요.',
    '하나 톡, 같은 것 톡 — 끌지 않아도 합쳐져요.',
    '기운은 2분에 1씩 저절로 차요. 앱을 닫아도 차요.',
    '별이 모이면 [마을]에서 바다별채를 고칠 수 있어요.',
    '모래더미 옆에서 합치면 모래가 한 겹씩 벗겨져요.',
    '물건을 [가방] 버튼으로 끌어다 놓으면 가방에 들어가요.'
  ];

  const API = { CHAINS, GENS, VILLAGERS, AREAS, BOARD, BAL, START, STORY, TIPS, SAVE_KEY: 'arichae_merge_v1', SYNC_KEY: 'arichae_merge_sync', VERSION: 2 };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MergeData = API;
})(typeof window !== 'undefined' ? window : globalThis);
