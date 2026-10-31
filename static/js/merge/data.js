/* 머지관 · 「소라섬 등불 이야기」 데이터 (기획: docs/handoff/specs/merge_seaside.md)
   - 체인·발생기·마을 사람·주문 난이도·밸런스 숫자를 여기 한 곳에 모아요 (규칙 코드는 core.js)
   - 1단계(지금): 체인 A·B·D · 발생기 3 · 에너지 · 합치기 · 일반 주문(동전·별) · 기기 저장
   - 나중 단계가 들어갈 자리: CHAINS 에 C·E·F·G·H 를 같은 모양으로 추가 · AREAS 에 복원 작업 · VILLAGERS 에 얼굴 그림
   - 브라우저(window.MergeData)와 node 시험(require) 둘 다에서 읽어요 */
(function (root) {
  'use strict';

  // 체인: id 한 글자 · 단계 이름(1단계부터) · 테두리 색 · 발생기
  // 그림 id 는 체인 글자 + 단계 (a1, b9 ...) → art.js 가 경로를 만들어요
  const CHAINS = {
    a: { name: '바다 보물', color: '#3fb6b0', soft: '#d9f4f1', gen: 'gen_a',
      tiers: ['모래알', '작은 조개', '소라', '전복 껍데기', '진주조개', '진주 한 알', '진주 비녀', '자개 보석함'] },
    b: { name: '떡·과자', color: '#f08a5d', soft: '#ffe8dc', gen: 'gen_b',
      tiers: ['쌀 한 줌', '쌀자루', '떡 반죽', '송편', '꿀떡 꼬치', '색동 경단', '약과 접시', '꽃 백설기', '잔칫상 떡 탑'] },
    d: { name: '꽃', color: '#e2679a', soft: '#ffe3ee', gen: 'gen_d',
      tiers: ['꽃씨 주머니', '새싹 화분', '동백꽃', '국화 화분', '연꽃', '매화 분재', '꽃바구니', '벚나무 화분'] }
    // 3단계 이후: c 찻집(충전식) · e 바다 식탁 · f 도자기 · g 바느질·부채 · h 불빛(충전식)
  };

  // 발생기: 톡 하면 그 체인 1단계(가끔 2단계) · charge 는 충전식(나중 단계: {taps:12, restMs:600000})
  const GENS = {
    gen_a: { chain: 'a', name: '모래 바구니', charge: null },
    gen_b: { chain: 'b', name: '떡방아 절구', charge: null },
    gen_d: { chain: 'd', name: '씨앗 항아리', charge: null }
  };

  // 마을 사람 (주문 카드 얼굴) · art: 그림 id (그림이 없으면 색 동그라미 + 첫 글자)
  const VILLAGERS = {
    juni: { name: '준이', art: 'char_juni', color: '#6aa9e9', chains: ['a'], lines: ['바닷가에서 이거 찾아 줄 수 있어?', '편지 배달 가는 길에 필요해!', '우와, 진짜 반짝반짝하다!'] },
    mina: { name: '미나', art: 'char_mina', color: '#f39a7a', chains: ['b'], lines: ['떡집 다시 열려면 이게 있어야 해!', '하윤아, 이거 하나만 부탁해~', '역시 내 친구!'] },
    kkotnim: { name: '꽃님 할머니', art: 'char_kkotnim', color: '#d77fb0', chains: ['d'], lines: ['아이고, 우리 하윤이 왔구나.', '정원에 이게 하나 있으면 좋겠구먼.', '윤해가 보면 참 좋아하겠다.'] },
    hayun: { name: '하윤', art: 'hayun', color: '#7cc29a', chains: [], lines: [] }
  };

  // 복원 지역 (2단계부터 작업·이야기가 들어와요) · 지금은 주문 난이도와 쓰이는 체인만 씀
  // orders: items = 물건 수 [최소, 최대] · tiers = 단계 [최소, 최대] · starsToNext = 이만큼 별을 모으면 다음 난이도
  const AREAS = [
    { id: 'r1', name: '바다별채', bg: 'r1_before', chains: ['a', 'b', 'd'], orders: { items: [1, 1], tiers: [2, 4] }, starsToNext: 15 },
    { id: 'r2', name: '몽돌 선착장', bg: 'r1_before', chains: ['a', 'b', 'd'], orders: { items: [1, 2], tiers: [3, 5] }, starsToNext: 43 },
    { id: 'r3', name: '바람골목', bg: 'r1_before', chains: ['a', 'b', 'd'], orders: { items: [1, 2], tiers: [4, 6] }, starsToNext: Infinity }
  ];

  const BOARD = { cols: 7, rows: 9 };

  const BAL = {
    energyMax: 100,
    energyMs: 120000,          // 2분에 1
    spawnCost: 1,
    spawnTier2: 0.10,          // 발생기에서 2단계가 나올 확률
    refillPrices: [15, 30, 60], // 동전으로 기운 채우기 (하루 3번 · 가격 오름)
    refillAmount: 100,
    ordersShown: 3,
    orderCoinMult: 1.5,        // 동전 = 판매값 합 × 1.5 (판매값 = 2^(단계-1))
    orderStuckMs: 30 * 60000,  // 30분 넘게 안 끝난 주문이 있으면 새 주문 단계를 1 낮춤
    skipCooldownMs: 10 * 60000 // [다른 부탁] 쿨타임
  };

  // 처음 판: 발생기 3개(가운데 아래) + 1단계 물건 몇 개
  const START = {
    gens: [{ id: 'gen_a', at: 58 }, { id: 'gen_b', at: 59 }, { id: 'gen_d', at: 60 }],
    items: [{ c: 'a', t: 1, at: 43 }, { c: 'a', t: 1, at: 47 }, { c: 'b', t: 1, at: 45 }, { c: 'b', t: 1, at: 52 }, { c: 'd', t: 1, at: 54 }],
    energy: 100, coins: 0, stars: 0
  };

  // 이야기 대사 (톡해서 넘김 · 한 장면 3~6줄) · 2단계부터 지역 복원 장면이 여기에 이어져요
  const STORY = {
    intro: [
      { who: 'hayun', text: '여기가… 할머니의 바다별채.\n폭풍에 많이 망가졌네.' },
      { who: 'hayun', text: '할머니 편지 끝에 이렇게 쓰여 있었지.\n"섬 곳곳에 내 편지를 숨겨 두었단다."' },
      { who: 'hayun', text: '우선 마을 사람들 부탁부터 들어 보자!' },
      { who: 'hayun', text: '같은 물건 두 개를 끌어다 겹치면\n더 좋은 물건이 돼. 바구니·절구·항아리를 톡!' }
    ]
  };

  // 하윤의 짧은 도움말 (아래 정보 칸 · 아무것도 안 골랐을 때)
  const TIPS = [
    '같은 물건 두 개를 끌어다 겹치면 더 좋은 물건이 돼요!',
    '바구니·절구·항아리를 톡 하면 물건이 나와요. 기운이 1 들어요.',
    '부탁 카드에 초록 체크가 뜨면 [건네기]를 눌러요.',
    '하나 톡, 같은 것 톡 — 끌지 않아도 합쳐져요.',
    '기운은 2분에 1씩 저절로 차요. 앱을 닫아도 차요.',
    '부탁 카드의 물건을 톡 하면 판에서 찾아 줘요.'
  ];

  const API = { CHAINS, GENS, VILLAGERS, AREAS, BOARD, BAL, START, STORY, TIPS, SAVE_KEY: 'arichae_merge_v1', VERSION: 1 };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MergeData = API;
})(typeof window !== 'undefined' ? window : globalThis);
