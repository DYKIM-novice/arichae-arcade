/* 머지관 · 「소라섬 등불 이야기」 데이터 (기획: docs/handoff/specs/merge_seaside.md)
   - 체인·발생기·마을 사람·지역(복원 작업)·이야기·밸런스 숫자를 여기 한 곳에 모아요 (규칙 코드는 core.js)
   - 1단계: 체인 A·B·D · 발생기 3 · 기운 · 합치기 · 일반 주문 · 기기 저장
   - 2단계: 별로 복원 작업 · 지역 전/후 배경 · 이야기 장면 · 서버 저장 · 덮인 칸(모래더미)
   - 3단계: 체인 C·E·F·G·H · 충전식 발생기 · 가방·선물함 · 팔기·되돌리기 · 보조 물건 · 주문 덤 · 발생기 강화(BAL.genUp) · 이야기 부탁(STORY_ORDERS)
   - 4단계: 4~6지역 + 엔딩 · 마을 사람 얼굴(기본·기쁨) · 고맙다는 말(thanks) · 숨은 비밀(편지 조각 12·갈매기 18·병 속 편지) · 할머니의 앨범
   - 5단계: 7일 출석 · 오늘의 부탁(DAILY) · 주간 이벤트(EVENTS: 연날리기 · 단오 · 주마다 차례로) · 장식
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
      tiers: ['작은 보자기', '중간 보자기', '큰 보자기'] },
    // 주간 이벤트 체인 (EVENTS · 일반 부탁에는 안 나와요 · 이벤트가 끝나면 동전으로)
    kite: { name: '연날리기', color: '#e0574b', soft: '#ffe1dc', event: 'kite', gen: 'gen_kite',
      tiers: ['연 종이', '연 꼬리', '가오리연', '방패연', '용 연'] },
    dano: { name: '단오', color: '#3fa37a', soft: '#dcf3e8', event: 'dano', gen: 'gen_dano',
      tiers: ['창포 잎', '창포물', '수리취떡', '단오 부채', '꽃 그네'] }
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
    gen_h: { chain: 'h', name: '등 공방 상자', charge: { taps: 12, restMs: 10 * 60000 } },
    gen_kite: { chain: 'kite', name: '연 바구니', charge: null, event: 'kite' },
    gen_dano: { chain: 'dano', name: '단오 바구니', charge: null, event: 'dano' }
  };

  // 마을 사람 (주문 카드·대사 얼굴) · art: 그림 id (그림이 없으면 색 동그라미 + 첫 글자)
  // faces: 표정 그림 id ({ who:'hayun', face:'joy' } → hayun_joy) · joy 는 건네기 반응에도 써요
  // lines: 부탁할 때 말 (0·1) · thanks: 건네받을 때 고맙다는 말 (돌려 가며 하나씩 · 짧게)
  const VILLAGERS = {
    juni: { name: '준이', art: 'char_juni', faces: { joy: 'char_juni_joy' }, color: '#6aa9e9', chains: ['a'],
      lines: ['바닷가에서 이거 찾아 줄 수 있어요?', '편지 배달 가는 길에 필요해요!', '우와, 진짜 반짝반짝하다!'],
      thanks: ['우와, 최고예요!', '누나 짱이에요!', '이거 진짜 반짝반짝해요!', '헤헤, 자랑하러 가야지!', '고마워요, 누나!'] },
    mina: { name: '미나', art: 'char_mina', faces: { joy: 'char_mina_joy' }, color: '#f39a7a', chains: ['b', 'c'],
      lines: ['떡집 다시 열려면 이게 있어야 해!', '하윤아, 이거 하나만 부탁해~', '역시 내 친구!'],
      thanks: ['역시 내 친구!', '고마워, 하윤아~!', '와, 딱 이거였어!', '오늘 떡 맛있게 나오겠다!', '너 없었으면 어쩔 뻔했어!'] },
    kkotnim: { name: '꽃님 할머니', art: 'char_kkotnim', faces: { joy: 'char_kkotnim_joy' }, color: '#d77fb0', chains: ['d'],
      lines: ['아이고, 우리 하윤이 왔구나.', '정원에 이게 하나 있으면 좋겠구먼.', '윤해가 보면 참 좋아하겠다.'],
      thanks: ['아이고, 고맙구나!', '참 곱기도 하제.', '우리 하윤이 손이 야무지구먼.', '윤해가 보면 웃겠다.', '복 받을 거여.'] },
    dochi: { name: '도치 아저씨', art: 'char_dochi', faces: { joy: 'char_dochi_joy' }, color: '#5b7fa6', chains: ['e', 'f'],
      lines: ['…이거 있으면 좀 주시오.', '배 손질하는 데 필요하오.', '…그래. 고맙소.'],
      thanks: ['…고맙소.', '…그래. 잘 쓰겠소.', '…허, 솜씨 좋구먼.', '…이거면 됐소.', '…다음에 생선 한 마리 주겠소.'] },
    kang: { name: '강 선생', art: 'char_kang', faces: { joy: 'char_kang_joy' }, color: '#c9a04a', chains: ['h'],
      lines: ['불빛이 필요하네. 부탁해도 되겠나.', '등대 일을 하려면 이게 있어야 하네.', '고맙네.'],
      thanks: ['고맙네, 정말로.', '허허, 반가운 불빛이로군.', '자네 덕분이야.', '좋구먼. 아주 좋아.'] },
    rua: { name: '루아', art: 'char_rua', faces: { joy: 'char_rua_joy' }, color: '#9b6fd0', chains: ['g'],
      lines: ['이 색이 꼭 필요해.', '그림에 넣고 싶은 게 있어.', '고마워.'],
      thanks: ['와… 그림에 담고 싶어.', '고마워, 색이 참 예쁘다.', '이 빛, 오래 기억할게.', '딱 내가 그리던 거야!'] },
    hayun: { name: '하윤', art: 'hayun', faces: { joy: 'hayun_joy', wow: 'hayun_wow' }, color: '#7cc29a', chains: [], lines: [], thanks: ['좋아, 하나 끝!'] },
    mongdol: { name: '몽돌', art: 'char_mongdol', faces: { joy: 'char_mongdol_joy' }, color: '#9fb4c8', chains: [], lines: [], thanks: ['뀨!', '뀨뀨~!'] },
    letter: { name: '할머니의 편지', art: 'secret_letter', color: '#c9a46a', chains: [], lines: [], letter: true },
    who: { name: '???', art: '', color: '#b9aaa0', chains: [], lines: [] }
  };

  // 복원 지역 · 순서대로 열려요 (st.area = 지금 지역 번호)
  //  bg: 전/후 배경 그림 id (없으면 '전' 그림에 색 바꾸기, 그것도 없으면 그림 대신 색 풍경)
  //  view·x·y·r: 옛 전/후 그림 화면용 (지금 마을 지도는 TOWN.build 의 자리를 써요 · 판 배경은 bg 를 그대로 써요)
  //  chains: 이 지역 주문에 나오는 체인 · orders: 물건 수/단계 범위
  //  tasks: 순서대로 하나씩 (cost = 별) · scene = 끝낸 뒤 볼 이야기 · r = 드러나는 동그라미 반지름(그림 폭 %)
  //         req = 먼저 끝내야 하는 이야기 부탁 (STORY_ORDERS id)
  //  open: 이 지역이 열릴 때 (장면 · 새 발생기 · 새 체인) · done: 다 고쳤을 때 (장면 · 모래더미 걷기 · ending = 엔딩 장면)
  //  secrets: 숨은 비밀 (마을 지도 px · TOWN) · letters: 할머니 편지 조각(after = 그 작업 뒤에 나타남) · gulls: 갈매기 · bottle: 병 속 편지가 떠오를 수 있는 곳
  const AREAS = [
    { id: 'r1', name: '바다별채', sub: '할머니의 한옥 민박', bg: { before: 'r1_before', after: 'r1_after' }, view: [0.36, 0.98],
      sky: ['#ffe2cf', '#ffd2bd'], sea: '#8fd3c8',
      chains: ['a', 'b', 'd'], orders: { items: [1, 1], tiers: [2, 4] },
      tasks: [
        { id: 'r1_gate', name: '대문 잔해 치우기', cost: 1, x: 16, y: 74, r: 20, scene: 'r1_gate' },
        { id: 'r1_paper', name: '찢어진 창호지 바르기', cost: 1, x: 44, y: 61, r: 19, scene: 'r1_paper' },
        { id: 'r1_sign', name: '현판 다시 달기', cost: 2, x: 52, y: 52, r: 20, scene: 'r1_sign' },
        { id: 'r1_maru', name: '대청마루 닦기', cost: 3, x: 36, y: 68, r: 21, scene: 'r1_maru', req: 'so_r1' },
        { id: 'r1_lamp', name: '마당 석등 켜기', cost: 3, x: 9, y: 68, r: 18, scene: 'r1_lamp' },
        { id: 'r1_room', name: '첫 손님방(온돌방) 꾸미기', cost: 5, x: 76, y: 62, r: 22 }
      ],
      open: { scene: null, gens: [], chains: [] },
      done: { scene: 'r1_done', uncover: true },
      secrets: { letters: [{ id: 'l1', x: 663, y: 1984 }, { id: 'l2', x: 869, y: 2295, after: 'r1_maru' }],
        gulls: [[639, 1815], [1161, 2403], [944, 1788]], bottle: [[420, 2700], [900, 2900]] } },
    { id: 'r2', name: '몽돌 선착장', sub: '물빛포구 장터', bg: { before: 'r2_before', after: 'r2_after' }, view: [0.25, 0.98],
      sky: ['#ffe6d0', '#cfe7f0'], sea: '#7fc6d8',
      chains: ['a', 'b', 'd', 'e'], orders: { items: [1, 2], tiers: [3, 5] },
      tasks: [
        { id: 'r2_pier', name: '부서진 나무 선착장 고치기', cost: 2, x: 30, y: 82, r: 22 },
        { id: 'r2_net', name: '그물 널기', cost: 3, x: 16, y: 68, r: 18, scene: 'r2_net' },
        { id: 'r2_awning', name: '장터 차양 치기', cost: 3, x: 42, y: 51, r: 20 },
        { id: 'r2_ice', name: '얼음 창고 문 고치기', cost: 4, x: 90, y: 54, r: 17 },
        { id: 'r2_boat', name: '나룻배 칠하기', cost: 4, x: 88, y: 68, r: 19, scene: 'r2_boat', req: 'so_r2' },
        { id: 'r2_stall', name: '생선 좌판 차리기', cost: 5, x: 63, y: 57, r: 19 },
        { id: 'r2_sotdae', name: '갈매기 솟대 세우기', cost: 7, x: 78, y: 32, r: 18 }
      ],
      open: { scene: 'r2_open', gens: ['gen_e'], chains: ['e'] },
      done: { scene: 'r2_done', uncover: true },
      secrets: { letters: [{ id: 'l3', x: 1458, y: 2451 }, { id: 'l4', x: 2016, y: 2595, after: 'r2_stall' }],
        gulls: [[1648, 2137], [2437, 2286], [2152, 2130]], bottle: [[1560, 2800], [2490, 2595]] } },
    { id: 'r3', name: '바람골목', sub: '떡집 · 찻집 골목', bg: { before: 'r3_before', after: 'r3_after' }, view: [0.16, 1.0],
      sky: ['#ffe9d6', '#f6dce8'], sea: '#a9d8c4',
      chains: ['a', 'b', 'c', 'd', 'e', 'f'], orders: { items: [1, 2], tiers: [4, 6] },
      tasks: [
        { id: 'r3_road', name: '골목 돌길 깔기', cost: 3, x: 50, y: 86, r: 22 },
        { id: 'r3_mill', name: '떡방앗간 절구 고치기', cost: 4, x: 13, y: 82, r: 19, scene: 'r3_mill' },
        { id: 'r3_eave', name: '처마 차양 달기', cost: 5, x: 22, y: 42, r: 20 },
        { id: 'r3_pyeong', name: '찻집 평상 놓기', cost: 6, x: 72, y: 70, r: 19, req: 'so_r3' },
        { id: 'r3_pots', name: '돌담 화분 줄 세우기', cost: 6, x: 34, y: 60, r: 17 },
        { id: 'r3_mural', name: '골목 벽화 그리기', cost: 7, x: 88, y: 62, r: 20, scene: 'r3_mural' },
        { id: 'r3_bell', name: '풍경(바람종) 달기', cost: 9, x: 86, y: 32, r: 18 }
      ],
      open: { scene: 'r3_open', gens: ['gen_c', 'gen_f'], chains: ['c', 'f'] },
      done: { scene: 'r3_done', uncover: true },
      secrets: { letters: [{ id: 'l5', x: 1934, y: 1518 }, { id: 'l6', x: 2570, y: 1812, after: 'r3_mural' }],
        gulls: [[2155, 1333], [1740, 1485], [2694, 1523]], bottle: [] } },
    { id: 'r4', name: '매화언덕 정원', sub: '꽃님 할머니의 정원', bg: { before: 'r4_before', after: 'r4_after' }, view: [0.28, 1.0],
      sky: ['#ffe6d6', '#fbd9cf'], sea: '#9fd6cf',
      chains: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], orders: { items: [2, 2], tiers: [4, 7] },
      tasks: [
        { id: 'r4_weed', name: '잡초밭 정리하기', cost: 5, x: 14, y: 84, r: 20, scene: 'r4_weed' },
        { id: 'r4_steps', name: '돌계단 쌓기', cost: 7, x: 23, y: 66, r: 17 },
        { id: 'r4_pond', name: '연못 맑게 하기', cost: 8, x: 54, y: 73, r: 20, scene: 'r4_pond' },
        { id: 'r4_bridge', name: '돌다리 고치기', cost: 8, x: 42, y: 63, r: 17 },
        { id: 'r4_pavilion', name: '정자 세우기', cost: 8, x: 76, y: 54, r: 19, scene: 'r4_pavilion', req: 'so_r4a' },
        { id: 'r4_path', name: '매화·동백길 가꾸기', cost: 9, x: 50, y: 91, r: 22, req: 'so_r4b' }
      ],
      open: { scene: 'r4_open', gens: ['gen_g'], chains: ['g'] },
      done: { scene: 'r4_done', uncover: true },
      secrets: { letters: [{ id: 'l7', x: 791, y: 1188 }, { id: 'l8', x: 1446, y: 1421, after: 'r4_pond' }],
        gulls: [[980, 1290], [1507, 1178], [1525, 1330]], bottle: [[380, 1330]] } },
    { id: 'r5', name: '반짝 해변', sub: '등불 축제 마당', bg: { before: 'r5_before', after: 'r5_after' }, view: [0.28, 0.98],
      sky: ['#ffe2d2', '#ffd9c2'], sea: '#7fd0c4',
      chains: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], orders: { items: [2, 3], tiers: [5, 8] },
      tasks: [
        { id: 'r5_clean', name: '모래사장 청소하기', cost: 6, x: 40, y: 90, r: 22 },
        { id: 'r5_hut', name: '초가 쉼터 고치기', cost: 7, x: 28, y: 72, r: 19, scene: 'r5_hut' },
        { id: 'r5_stage', name: '놀이마당 무대 놓기', cost: 9, x: 70, y: 58, r: 18 },
        { id: 'r5_cloth', name: '오색 천 줄 걸기', cost: 9, x: 74, y: 46, r: 17, scene: 'r5_cloth' },
        { id: 'r5_swing', name: '그네·널뛰기터 만들기', cost: 10, x: 26, y: 48, r: 18 },
        { id: 'r5_cart', name: '장터 수레 꾸미기', cost: 10, x: 80, y: 79, r: 17 },
        { id: 'r5_arch', name: '등불 아치 세우기', cost: 12, x: 12, y: 52, r: 18, req: 'so_r5' }
      ],
      open: { scene: 'r5_open', gens: ['gen_h'], chains: ['h'] },
      done: { scene: 'r5_done', uncover: true },
      secrets: { letters: [{ id: 'l9', x: 1832, y: 537 }, { id: 'l10', x: 1704, y: 1132, after: 'r5_swing' }],
        gulls: [[2642, 718], [1760, 760], [2244, 437]], bottle: [[2900, 1150], [2827, 818]] } },
    { id: 'r6', name: '등대곶', sub: '꺼진 등대가 있는 곶', bg: { before: 'r6_before', after: 'r6_after' }, view: [0.14, 1.0],
      sky: ['#ffe4d6', '#f9dccb'], sea: '#7fcfc6',
      chains: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], orders: { items: [2, 3], tiers: [6, 9] },
      tasks: [
        { id: 'r6_path', name: '오솔길 다시 내기', cost: 8, x: 44, y: 88, r: 22 },
        { id: 'r6_fence', name: '울타리 세우기', cost: 9, x: 20, y: 90, r: 18 },
        { id: 'r6_hut', name: '등대지기 오두막 고치기', cost: 10, x: 74, y: 55, r: 16, scene: 'r6_hut' },
        { id: 'r6_stairs', name: '나선 계단 고치기', cost: 12, x: 55, y: 44, r: 14 },
        { id: 'r6_wall', name: '등대 외벽 칠하기', cost: 12, x: 63, y: 35, r: 15 },
        { id: 'r6_bell', name: '종 다시 달기', cost: 14, x: 80, y: 40, r: 13, scene: 'r6_bell' },
        { id: 'r6_lens', name: '등대 렌즈 끼우기', cost: 15, x: 60, y: 28, r: 14, req: 'so_r6' },
        { id: 'r6_light', name: '첫 불 켜기', cost: 20, x: 60, y: 21, r: 30 }
      ],
      open: { scene: 'r6_open', gens: [], chains: [] },
      done: { scene: 'r6_done', uncover: true, ending: 'ending' },
      secrets: { letters: [{ id: 'l11', x: 665, y: 541 }, { id: 'l12', x: 1223, y: 848, after: 'r6_light' }],
        gulls: [[1431, 689], [438, 689], [1150, 950]], bottle: [[300, 500]] } }
  ];

  // 이야기 부탁 (금색 카드 · [다른 부탁] 없음): area 지역에서 after 작업을 끝내면 나타나고, 건네야 다음 작업(req)을 할 수 있어요
  const STORY_ORDERS = {
    so_r1: { area: 0, after: 'r1_sign', who: 'mina', need: [{ c: 'b', t: 4 }], stars: 2, scene: 'so_r1', title: '마루 손님 대접할 송편' },
    so_r2: { area: 1, after: 'r2_net', who: 'dochi', need: [{ c: 'e', t: 4 }], stars: 3, scene: 'so_r2', title: '아들 배에 실을 조기' },
    so_r3: { area: 2, after: 'r3_mill', who: 'mina', need: [{ c: 'b', t: 6 }], stars: 3, scene: 'so_r3', title: '재개업 첫 떡, 색동 경단' },
    so_r4a: { area: 3, after: 'r4_bridge', who: 'kkotnim', need: [{ c: 'd', t: 6 }], stars: 4, scene: 'so_r4a', title: '윤해와 심던 매화 분재' },
    so_r4b: { area: 3, after: 'r4_pavilion', who: 'rua', need: [{ c: 'g', t: 5 }], stars: 4, scene: 'so_r4b', title: '그림 그릴 때 깔 색동 방석' },
    so_r5: { area: 4, after: 'r5_cart', who: 'kang', need: [{ c: 'h', t: 4 }, { c: 'h', t: 4 }], stars: 5, scene: 'so_r5', title: '아치에 달 청사초롱 두 개' },
    so_r6: { area: 5, after: 'r6_bell', who: 'kang', need: [{ c: 'h', t: 7 }], stars: 6, scene: 'so_r6', title: '다시 빛날 등대 렌즈' }
  };

  // 할머니의 편지 조각 12장 (지역마다 2장 · 순서대로 이으면 한 통) · 다 모으고 엔딩을 보면 '할머니의 앨범'
  const LETTERS = {
    l1: '사랑하는 하윤아.\n이 조각들을 다 모으면 편지 한 통이 된단다.',
    l2: '내가 이 섬에 처음 온 건 열아홉 살 봄이었어.',
    l3: '작은 나룻배에서 내렸을 때, 등대 불빛이 나를 반겨 주었지.',
    l4: '아무도 모르는 섬이었는데, 꽃님이가 먼저 손을 내밀었단다.',
    l5: '도치네 아버지는 생선을, 미나네 할머니는 떡을 나눠 주었고.',
    l6: '그때 알았지. 집은 지붕이 아니라 사람이라는 걸.',
    l7: '폭풍이 지나간 뒤, 사람들은 서로 미안해서 멀어졌어.',
    l8: '그래서 편지를 숨겼단다. 네가 찾으러 다니면 사람들이 다시 모일 테니까.',
    l9: '네가 바른 창호지, 네가 켠 석등, 할머니는 다 보고 있단다.',
    l10: '혹시 지치면 몽돌이랑 바닷가에 앉아 쉬어 가렴.',
    l11: '등대에 불이 다시 켜지면, 떠난 사람들도 그 빛을 보고 돌아올 거야.',
    l12: '이제 이곳은 네 집이야.\n사랑한다, 우리 하윤이. —할머니 윤해'
  };
  const SECRETS = {
    gullCoins: 20,                 // 갈매기 한 마리 = 동전 20
    gullTitle: '섬 탐정',           // 18마리 다 찾으면 칭호 + 동전
    gullAllCoins: 200,
    letterGems: 1,                 // 편지 조각 = 소라별 1
    bottleGems: 2,                 // 병 속 편지 = 소라별 2 + 작은 보자기 (하루 한 번)
    bottleGift: { k: 'item', c: 'bj', t: 1 },
    bottleNotes: ['물빛포구 바람이 오늘은 순하대요.', '누군가 바다 건너에서 이 섬을 그리워하고 있어요.', '등불 하나가 배 한 척을 집으로 데려온대요.',
      '오늘도 수고했어요. 따뜻한 차 한 잔 어때요?', '몽돌이가 좋아하는 건 반짝이는 조개래요.', '바다는 기다리는 사람을 잊지 않는대요.']
  };

  // 매일: 7일 출석 (이어서 안 와도 하루씩 쌓여요 · 7일 다음엔 다시 1일) · 오늘의 부탁 3개
  const DAILY = {
    attend: [
      { label: '식혜 사발', give: [{ k: 'item', c: 'en', t: 2 }] },
      { label: '동전 50', coins: 50 },
      { label: '작은 보자기', give: [{ k: 'item', c: 'bj', t: 1 }] },
      { label: '소라별 3', gems: 3 },
      { label: '무지개 소라', give: [{ k: 'wild' }] },
      { label: '동전 150', coins: 150 },
      { label: '큰 보자기 + 몽돌 모자', give: [{ k: 'item', c: 'bj', t: 3 }], deco: 'mongdol_hat' }
    ],
    questReward: { k: 'item', c: 'bj', t: 2 }   // 오늘의 부탁 3개를 다 하면 중간 보자기
  };

  // 주간 이벤트 (월요일 0시 ~ 일요일 밤 · 주마다 차례로 돌아가요)
  //  체인은 CHAINS 에(event: id), 발생기는 GENS 에 있어요 · 이벤트 부탁은 일반 부탁과 따로 한 장 (점수 → 10칸 보상 길)
  //  끝나면 판·가방의 이벤트 물건은 동전으로 바뀌고, 이벤트 발생기는 돌려줘요 · 마지막 칸 장식은 영원히 (마을에 놓기)
  const EVENTS = [
    { id: 'kite', name: '연날리기 주간', chain: 'kite', gen: 'gen_kite', banner: 'kite_banner', deco: 'kite_deco', decoName: '연 탑',
      who: 'juni', orders: { tiers: [2, 5], points: { 2: 3, 3: 8, 4: 15, 5: 30 } },
      track: [10, 25, 45, 70, 100, 140, 190, 250, 320, 400],
      rewards: [{ k: 'item', c: 'en', t: 1 }, { k: 'item', c: 'cn', t: 1 }, { k: 'item', c: 'bj', t: 1 }, { k: 'item', c: 'ss', t: 1 }, { k: 'item', c: 'en', t: 2 },
        { k: 'item', c: 'cn', t: 2 }, { k: 'wild' }, { k: 'item', c: 'ss', t: 2 }, { k: 'item', c: 'bj', t: 2 }, { k: 'deco', id: 'kite_deco' }] },
    { id: 'dano', name: '단오 그네 주간', chain: 'dano', gen: 'gen_dano', banner: 'dano_banner', deco: 'dano_deco', decoName: '꽃 그네',
      who: 'kkotnim', orders: { tiers: [2, 5], points: { 2: 3, 3: 8, 4: 15, 5: 30 } },
      track: [10, 25, 45, 70, 100, 140, 190, 250, 320, 400],
      rewards: [{ k: 'item', c: 'en', t: 1 }, { k: 'item', c: 'cn', t: 1 }, { k: 'item', c: 'bj', t: 1 }, { k: 'item', c: 'ss', t: 1 }, { k: 'item', c: 'en', t: 2 },
        { k: 'item', c: 'cn', t: 2 }, { k: 'wild' }, { k: 'item', c: 'ss', t: 2 }, { k: 'item', c: 'bj', t: 2 }, { k: 'deco', id: 'dano_deco' }] }
  ];
  const EVENT_REF_MONDAY = [2026, 0, 5];   // 이 월요일부터 주를 세요 (EVENTS 차례)
  const EVENT_FROM_AREA = 1;               // 1지역을 다 고친 뒤부터 이벤트가 열려요

  const BOARD = { cols: 7, rows: 9 };

  const BAL = {
    energyMax: 100,
    energyMs: 120000,          // 2분에 1
    energyCap: 999,            // 식혜로는 최대를 넘겨 채울 수 있어요
    spawnCost: 1,
    spawnTier2: 0.10,          // 발생기에서 2단계가 나올 확률
    refillPrices: [15, 30, 60], // 동전으로 기운 채우기 (하루 3번 · 가격 오름 · × 지역 배수 SHOP.mult)
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
    // 발생기 강화 (동전 · 3번): 2단계 확률 10 → 20 → 30% · 마지막 강화는 가끔(8%) 3단계
    // 발생기 강화 5단계 (단계 0~5 · 값은 [단계] 기준) · 4·5단계는 중반 이후 목표 (중반 부탁 한 번 ≈ 동전 30~60 · 4단계 ≈ 부탁 25번 · 5단계 ≈ 40번)
    //  tier2/tier3 = 2·3단계가 나올 확률 · bonus = 덤으로 1단계 하나 더 (기운 그대로 · 빈칸이 있을 때) · 충전식: taps 더하기 · rest 쉬는 시간 배율
    genUp: { prices: [80, 240, 600, 1200, 2000], tier2: [0.10, 0.20, 0.30, 0.30, 0.32, 0.34], tier3: [0, 0, 0, 0.08, 0.12, 0.16],
      bonus: [0, 0, 0, 0, 0.06, 0.12], taps: [0, 0, 0, 0, 2, 4], rest: [1, 1, 1, 1, 0.85, 0.7] },
    firstEasyOrders: 2,        // 새 판 첫 부탁 2장은 1단계 물건 (첫 '고치기'까지 1~2분)
    // 자동 합치기 (merge_town.md §G · 2026-11 값 내림): 값 = 합치는 횟수 × 1 (최소 3) × 지역 배수(최대 ×2), 최대 20 · 하루 2번은 무료
    autoMerge: { perMerge: 1, min: 3, multMax: 2, cap: 20, freeDay: 2 },
    // 판 재미 요소 (merge_town.md §B 7·8·9·10·14 '개편 직후')
    //  bubble: 3단계 이상 합치기에서 가끔 같은 물건이 거품 속에 하나 더 → 하루 3번 무료 · 소라별 · 동전으로 터뜨려 갖거나, 시간이 지나면 엽전으로
    //          동전 값 = 그 물건 판매값 × 2 (팔기보다 조금 비싸게 · 3단계 8 · 4단계 16) · 소라별 1~3
    //  net: 부탁을 건네면 가끔 판 위쪽에 '그물에 걸린 물건' (지금 지역 부탁 단계) → 바로 옆 칸에서 합치거나 같은 물건을 겹치면 풀려요 (한 번에 2개까지)
    //  box: 선물 상자(5분) · 할머니의 보물 궤짝(20분) → 시간이 되면 무료로 · 열쇠 1개나 소라별로 바로 열어요
    //  orders: 묶음 부탁(MIXES · 두 체인 섞기 · 가장 높은 단계는 하나 낮게) · 반짝 손님(30분 · 동전 2배 + 열쇠 1 · 시간이 지나면 벌칙 없이 다른 부탁으로) · 선물 상자 부탁
    fun: {
      bubble: { chance: 0.08, minTier: 3, ms: 90000, freeDay: 3, coinMul: 2, gems: [1, 1, 1, 1, 2, 2, 3, 3, 3] },
      net: { chance: 0.25, max: 2, after: 2, rows: 3 },
      box: {
        gift: { name: '선물 상자', ms: 5 * 60000, items: [2, 3], tiers: [1, 3], coin: 0.5, gems: 2 },
        chest: { name: '할머니의 보물 궤짝', ms: 20 * 60000, items: [3, 4], tiers: [2, 4], wild: 0.35, ss: 0.5, gems: 4 }
      },
      orders: { mix: 0.22, rush: 0.12, rushMs: 30 * 60000, rushMult: 2, rushKeys: 1, gift: 0.12, after: 3 },
      questKeys: 1                 // 오늘의 부탁을 다 하면 열쇠 1개 (보자기와 함께)
    }
  };

  // 묶음 부탁 (두 체인을 섞은 부탁 · 부탁하는 사람의 이야기에 맞게) · 그 체인이 다 열려 있고 지금 지역 부탁 체인이면 나와요
  const MIXES = [
    { who: 'juni', title: '할머니께 드릴 선물', chains: ['a', 'd'] },
    { who: 'juni', title: '바닷가 소풍 도시락', chains: ['a', 'b'] },
    { who: 'juni', title: '보물 상자 꾸미기', chains: ['a', 'g'] },
    { who: 'mina', title: '떡집 다과 한 상', chains: ['b', 'c'] },
    { who: 'mina', title: '꽃떡 잔칫상', chains: ['b', 'd'] },
    { who: 'kkotnim', title: '정원 화분 손질', chains: ['d', 'f'] },
    { who: 'kkotnim', title: '꽃 백설기 차례', chains: ['d', 'b'] },
    { who: 'dochi', title: '바닷마을 밥상', chains: ['e', 'f'] },
    { who: 'dochi', title: '고깃배 돛 손질', chains: ['e', 'g'] },
    { who: 'kang', title: '등대 밤샘 준비', chains: ['h', 'c'] },
    { who: 'kang', title: '등불 받침 고르기', chains: ['h', 'f'] },
    { who: 'rua', title: '그림 재료 모으기', chains: ['g', 'd'] },
    { who: 'rua', title: '색실 등 만들기', chains: ['g', 'h'] }
  ];

  // 상점 (merge_town.md §F · 판 화면 [상점] · 가방 속 소라별 가게는 없앴어요 → 소라별은 여기서 무지개 소라·보자기·자동 합치기 1분에)
  //  mult: 지금 지역(1~6)의 가격 배수 m · mult:true 인 것만 × m · 체인 물건 낱개·가방 칸은 고정값
  //  items: 탭별 물건 (coins = 동전 값, gems = 소라별로도 살 때 값, day = 하루 몇 번까지)
  //  deals: 오늘의 특가 3칸 (매일 0시 · 날짜로 고정 무작위 · 한 칸은 늘 지금 지역 체인 3~4단계) + 무료 1칸
  const SHOP = {
    tabs: [
      { id: 'deal', name: '오늘의 특가', ic: '🎁' },
      { id: 'item', name: '물건', ic: '🧺' },
      { id: 'energy', name: '기운', ic: '⚡' },
      { id: 'help', name: '도우미', ic: '🔨' },
      { id: 'deco', name: '꾸미기', ic: '🎀' }
    ],
    mult: [1, 2, 4, 7, 11, 16],
    tierPrice: { 1: 6, 2: 14, 3: 32, 4: 70 },   // 열린 체인 물건 낱개 (4단계는 특가에만)
    tierDay: { 3: 5 },                           // 3단계는 하루 5개까지
    items: {
      wild: { tab: 'item', name: '무지개 소라', give: { k: 'wild' }, coins: 40, mult: true, day: 1, gems: 6, sub: '아무 물건이나 한 단계 위로' },
      bj1: { tab: 'item', name: '작은 보자기', give: { k: 'item', c: 'bj', t: 1 }, coins: 25, mult: true, gems: 3, sub: '열면 물건 3개' },
      bj2: { tab: 'item', name: '중간 보자기', give: { k: 'item', c: 'bj', t: 2 }, coins: 70, mult: true, gems: 7, sub: '열면 물건 5개' },
      bj3: { tab: 'item', name: '큰 보자기', give: { k: 'item', c: 'bj', t: 3 }, coins: 200, mult: true, gems: 15, sub: '열면 물건 8개' },
      en1: { tab: 'energy', name: '식혜 한 잔', give: { k: 'item', c: 'en', t: 1 }, coins: 6, mult: true, sub: '기운 +5' },
      en2: { tab: 'energy', name: '식혜 사발', give: { k: 'item', c: 'en', t: 2 }, coins: 15, mult: true, sub: '기운 +15' },
      en3: { tab: 'energy', name: '식혜 항아리', give: { k: 'item', c: 'en', t: 3 }, coins: 35, mult: true, sub: '기운 +40' },
      refill: { tab: 'energy', name: '기운 가득 채우기', kind: 'refill', sub: '+100 · 하루 3번' },
      auto: { tab: 'help', name: '자동 합치기', kind: 'auto', sub: '판 전체를 한 번에' },
      auto1m: { tab: 'help', name: '자동 합치기 1분', kind: 'auto1m', coins: 8, mult: true, multMax: 2, gems: 1, sub: '1분 동안 새 물건이 짝을 만나면 저절로' },
      recharge: { tab: 'help', name: '발생기 바로 충전', kind: 'recharge', coins: 10, mult: true, sub: '쉬고 있는 발생기 하나' },
      hands: { tab: 'help', name: '바쁜 손 10분', kind: 'hands', coins: 40, mult: true, sub: '10분 동안 발생기 톡에 기운 0' },
      skipnow: { tab: 'help', name: '다른 부탁 바로', kind: 'skip', coins: 5, mult: true, sub: '[다른 부탁] 기다림 없애기' },
      bag: { tab: 'help', name: '가방 한 칸', kind: 'bag', sub: '최대 20칸' },
      key: { tab: 'help', name: '상자 열쇠', kind: 'key', coins: 25, mult: true, multMax: 3, gems: 3, sub: '선물 상자·보물 궤짝을 바로 열어요' }
    },
    // 꾸미기 탭: 그림이 들어오면 열려요 (지금은 '곧 나와요')
    deco: [
      { name: '건물 다른 모양', ic: '🏠', note: '각 30×m' },
      { name: '마을 장식', ic: '🌲', note: '20×m' },
      { name: '하윤 옷', ic: '👘', note: '80~300' },
      { name: '몽돌 소품', ic: '🕶️', note: '90~120' }
    ],
    dealPool: ['wild', 'bj1', 'bj2', 'en2', 'en3', 'auto1m', 'hands'],
    dealOff: [0.3, 0.4, 0.5],
    free: [
      { label: '식혜 한 잔', give: { k: 'item', c: 'en', t: 1 } },
      { label: '엽전 몇 닢', give: { k: 'item', c: 'cn', t: 1 } },
      { label: '작은 보자기', give: { k: 'item', c: 'bj', t: 1 } },
      { label: '자동 합치기 1번', token: 'auto' }
    ],
    rerollCoins: 10,           // [다시 섞기] 하루 1번 · × m
    handsMs: 10 * 60000,
    auto1mMs: 60000
  };

  // 배경음악 악보 (merge_town.md ★BGM · 재생기는 js/merge/music.js · 파일·내려받기 없음, 직접 작곡)
  //  한 칸 = 8분음 · '.' 쉼 · '-' 앞 음 늘임 · '|' 는 마디 표시(읽을 때 무시) · 음 이름은 C4 = 가운데 도
  //  spb = 마디 칸 수 (8 = 4/4 · 6 = 6/8 뱃노래) · bpm = 4분음 기준 (6/8 은 8분음 하나 = 60/bpm/2 초)
  //  form: 구간 차례 (반복할 때마다 '변주': 가끔 이웃 음 · 꾸밈음 · 북 무늬 A/B 교대 · 씨앗 고정)
  //  inst: 구간마다 선율 악기 (flute 피리 · pluck 가야금 · haegeum 해금) · counter: 가야금 펼친화음 켜기
  //  drums: 마디 무늬들 (k 장구 쿵 · t 딱 · m 목탁 · c 작은 꽹과리 · b 작은 종) · arp: 펼친화음 무늬 (화음 음 번호 0~7)
  //  모두 오음 음계 (궁조 도레미솔라 · 우조/계면조 느낌의 라도레미솔)
  const MUSIC = {
    chords: {
      C: ['C3', 'G3', 'C4', 'E4'], Am: ['A2', 'E3', 'A3', 'C4'], Dm: ['D3', 'A3', 'C4', 'D4'], Gs: ['G2', 'D3', 'G3', 'A3'],
      G: ['G2', 'D3', 'G3', 'B3'], Em: ['E2', 'B2', 'E3', 'G3'], Es: ['E2', 'D3', 'E3', 'G3'], D: ['D2', 'A2', 'D3', 'E3'],
      As: ['A2', 'E3', 'A3', 'B3'], Bm: ['B2', 'F#3', 'B3', 'D4'], F: ['F2', 'C3', 'F3', 'A3'], Cs: ['C3', 'G3', 'C4', 'D4'], Dmf: ['D2', 'A2', 'D3', 'F3'],
      // 피아노 곡 화음 (왼손: [베이스, 위 3음])
      Cma7: ['C3', 'G3', 'B3', 'E4'], GB: ['B2', 'G3', 'B3', 'D4'], Am7: ['A2', 'E3', 'G3', 'C4'], Em7: ['E2', 'B2', 'D3', 'G3'],
      Fma7: ['F2', 'C3', 'E3', 'A3'], CE: ['E2', 'G3', 'C4', 'E4'], Dm7: ['D3', 'A3', 'C4', 'F4'], G7: ['G2', 'D3', 'F3', 'B3'],
      Gsu: ['G2', 'D3', 'G3', 'C4'], E7: ['E2', 'B2', 'D3', 'G#3'], Bb: ['Bb2', 'F3', 'Bb3', 'D4']
    },
    // 피아노 배경음악 (기본 · 설정 '배경음악 종류'에서 동양풍으로 바꿀 수 있어요)
    //  곡 4개(아침 바다 → 오후 장터 → 노을 → 고요한 밤)를 차례로 · 한 곡 약 5분 · 끝나면 첫 곡으로 · 곡 사이는 살며시 줄었다가 다음 곡 머리
    //  form: 구간 차례 (공백으로) · 'A1' = 변주 1 · 'A2+2' = 변주 2 를 온음 위로 · 변주: 0 기본 · 1 왼손 흐르게+아래 옥타브 겹침 · 2 선율 한 옥타브 위+왼손 성기게 · 3 아래 화음 겹침
    //  I = 머리(왼손만) · Z = 끝맺음 · lh = 왼손 무늬(0~3 화음 음 · 4~7 한 옥타브 위 · . 쉼) · 화면·지역·낮밤과 상관없이 이어서 흘러요
    lists: { piano: ['p_morning', 'p_market', 'p_sunset', 'p_night'], piano_quiet: ['p_night'] },
    songs: {
      // 피아노 1 · 아침 바다 (다장조 · 잔잔하게 내려오는 베이스)
      p_morning: { piano: true, title: '아침 바다', bpm: 72, spb: 8, tr: 0, vel: 0.9,
        form: 'I A B A1 C D2 B1 A3 C1 D B2 A2+2 Z+2',
        lh: ['0 . 1 . 2 . 3 .', '0 1 2 3 4 3 2 1', '0 . . . 2 3 . .', '0 . 2 . 4 . 2 .'],
        I: { chords: 'Cma7 Fma7', mel: '. . . . . . . . | . . . . . . . .' },
        A: { chords: 'Cma7 GB Am7 Em7 Fma7 CE Dm7 G7',
          mel: 'E5 - - - D5 - C5 - | D5 - - - G4 - - - | C5 - - - B4 - A4 - | B4 - - - G4 - - - | A4 - - - C5 - F5 - | E5 - - - D5 - C5 - | D5 - - - E5 - F5 - | D5 - - - - - . .' },
        B: { chords: 'Fma7 G7 Em7 Am7 Dm7 Em7 F G7',
          mel: 'A4 - C5 - E5 - - - | D5 - - C5 B4 - G4 - | G4 - B4 - E5 - - - | E5 - D5 - C5 - - - | F5 - E5 - D5 - A4 - | G5 - E5 - D5 - B4 - | C5 - D5 - E5 - F5 - | G5 - - - F5 - D5 -' },
        C: { chords: 'Am Am Fma7 Fma7 Dm7 G7 Cma7 E7',
          mel: 'A4 - - B4 C5 - E5 - | A5 - - - G5 - E5 - | F5 - - - E5 - C5 - | A4 - - - - - . . | D5 - F5 - A5 - G5 - | F5 - - - D5 - B4 - | C5 - E5 - G5 - E5 - | G#4 - - - B4 - D5 -' },
        D: { chords: 'Fma7 Em7 Dm7 Cma7 Bb Fma7 Dm7 Gsu',
          mel: 'A4 - C5 - E5 - G5 - | G5 - - - E5 - D5 - | F5 - - - D5 - A4 - | B4 - C5 - E5 - - - | D5 - - - F5 - - - | E5 - - - C5 - A4 - | C5 - D5 - F5 - E5 - | D5 - - - - - . .' },
        Z: { chords: 'Fma7 G7 Cma7 Cma7', mel: 'A4 - - - C5 - - - | D5 - - - B4 - - - | C5 - - - - - - - | . . . . . . . .' } },
      // 피아노 2 · 오후 장터 (라장조 · 조금 걸음이 빠르게)
      p_market: { piano: true, title: '오후 장터', bpm: 84, spb: 8, tr: 2, vel: 0.85,
        form: 'I A B A1 C D A2 B1 C3 D1 A3 B2 A1 Z',
        lh: ['0 . 2 1 3 . 2 1', '0 2 1 3 4 3 2 1', '0 . 2 . 0 . 3 .', '0 . 1 2 3 . 2 .'],
        I: { chords: 'C Fma7', mel: '. . . . . . . . | . . . . . . . .' },
        A: { chords: 'C Fma7 Am7 G F CE Dm7 Gsu',
          mel: 'G4 - C5 - E5 - D5 C5 | A4 - - - - - G4 A4 | C5 - E5 - G5 - E5 D5 | D5 - - - - - . . | C5 - A4 - F5 - E5 D5 | E5 - - - C5 - - - | D5 - C5 - A4 - C5 D5 | C5 - - - B4 - . .' },
        B: { chords: 'Am Em F C Dm Am Bb G7',
          mel: 'E5 - - D5 C5 - E5 - | B4 - - - G4 - - - | A4 - C5 - F5 - E5 - | E5 - - - G5 - - - | F5 - E5 D5 - - A4 - | C5 - - - E5 - - - | D5 - F5 - Bb4 - - - | B4 - - - D5 - F5 -' },
        C: { chords: 'Fma7 Em7 Dm7 Cma7 Fma7 Em7 Dm7 G',
          mel: 'A5 - - - G5 - F5 - | G5 - - - E5 - - - | F5 - E5 - D5 - C5 - | B4 - - - G4 - - - | A4 - C5 - F5 - A5 - | G5 - - - E5 - B4 - | D5 - C5 - A4 - - - | B4 - - - - - . .' },
        D: { chords: 'Am7 Dm7 G7 Cma7 Fma7 Bb Dm7 G7',
          mel: 'E5 - C5 - A4 - C5 E5 | F5 - - - D5 - A4 - | B4 - D5 - G5 - F5 - | E5 - - - . . G4 - | A4 - C5 - E5 - D5 C5 | D5 - - - F5 - D5 - | C5 - A4 - D5 - F5 - | G5 - F5 - D5 - B4 -' },
        Z: { chords: 'Fma7 G7 C C', mel: 'A4 - - - C5 - - - | B4 - - - D5 - - - | C5 - - - - - - - | . . . . . . . .' } },
      // 피아노 3 · 노을 (가장조 · 따뜻하고 느리게)
      p_sunset: { piano: true, title: '노을', bpm: 64, spb: 8, tr: -3, vel: 0.9,
        form: 'I A B A1 C D B1 A2 C3 A3 Z',
        lh: ['0 . 1 . 2 . 3 .', '0 1 2 3 4 3 2 1', '0 . . . 2 . 3 .', '0 . 2 . 4 . 2 .'],
        I: { chords: 'Cma7 Fma7', mel: '. . . . . . . . | . . . . . . . .' },
        A: { chords: 'Cma7 Em7 Fma7 G Cma7 Em7 Dm7 G',
          mel: 'G4 - C5 - E5 - - - | D5 - - - B4 - - - | A4 - C5 - E5 - - - | D5 - - - - - . . | G4 - C5 - G5 - - - | E5 - - - D5 - B4 - | C5 - D5 - F5 - E5 - | D5 - - - - - . .' },
        B: { chords: 'Am7 Am7 Dm7 G Cma7 Fma7 Dm7 E7',
          mel: 'E5 - - - A5 - - - | G5 - E5 - C5 - - - | D5 - - - F5 - - - | E5 - D5 - B4 - - - | C5 - - - E5 - G5 - | A5 - - - G5 - F5 - | F5 - E5 - D5 - C5 - | B4 - - - G#4 - - -' },
        C: { chords: 'Fma7 G Em7 Am7 Fma7 G Cma7 Cma7',
          mel: 'C5 - - - A4 - - - | B4 - - - D5 - - - | G5 - - - E5 - - - | C5 - - - - - E5 - | F5 - - - A5 - C6 - | B5 - - - G5 - D5 - | E5 - - - - - - - | C5 - - - - - . .' },
        D: { chords: 'Dm7 Em7 Fma7 G Em7 Am7 Fma7 Gsu',
          mel: 'F5 - - - A5 - - - | G5 - - - E5 - - - | E5 - - - C5 - A4 - | B4 - - - D5 - - - | G4 - B4 - E5 - - - | C5 - - - E5 - A5 - | G5 - - - F5 - E5 - | D5 - - - - - . .' },
        Z: { chords: 'Fma7 G Cma7 Cma7', mel: 'C5 - - - A4 - - - | B4 - - - D5 - - - | C5 - - - - - - - | . . . . . . . .' } },
      // 피아노 4 · 고요한 밤 (가단조 ↔ 다장조 · 가장 느리게 · 조용한 밤 모드는 이 곡만)
      p_night: { piano: true, title: '고요한 밤', bpm: 58, spb: 8, tr: 0, vel: 0.8,
        form: 'I A B A1 C D B1 A2 D3 Z',
        lh: ['0 . . . 2 . 3 .', '0 . 1 . 2 . 3 .', '0 . . . . . 2 .', '0 . 2 . 3 . 2 .'],
        I: { chords: 'Am7 Fma7', mel: '. . . . . . . . | . . . . . . . .' },
        A: { chords: 'Am7 Fma7 Cma7 G Am7 Fma7 Dm7 E7',
          mel: 'C5 - - - E5 - - - | A5 - - - G5 - - - | E5 - - - D5 - C5 - | D5 - - - - - . . | C5 - - - B4 - A4 - | A4 - - - C5 - E5 - | F5 - - - E5 - D5 - | B4 - - - G#4 - - -' },
        B: { chords: 'Fma7 G7 Em7 Am7 Dm7 G7 Cma7 Cma7',
          mel: 'A4 - C5 - F5 - - - | D5 - - - B4 - - - | G4 - B4 - E5 - - - | C5 - - - A4 - - - | D5 - F5 - A5 - - - | G5 - F5 - D5 - B4 - | C5 - - - - - - - | E5 - D5 - C5 - . .' },
        C: { chords: 'Dm7 Dm7 Cma7 Cma7 Bb Bb E7 E7',
          mel: 'A4 - - - D5 - F5 - | E5 - - - D5 - - - | C5 - - - E5 - G5 - | G5 - - - - - . . | F5 - - - D5 - Bb4 - | C5 - - - D5 - - - | E5 - - - D5 - B4 - | G#4 - - - - - . .' },
        D: { chords: 'Fma7 Em7 Am7 Am7 Dm7 G7 Cma7 E7',
          mel: 'C5 - - - - - A4 - | B4 - - - G4 - - - | C5 - - - E5 - - - | A4 - - - - - . . | F4 - A4 - D5 - - - | D5 - - - B4 - - - | G4 - - - E5 - - - | D5 - - - B4 - G#4 -' },
        Z: { chords: 'Dm7 E7 Am7 Am7', mel: 'F5 - - - D5 - - - | B4 - - - G#4 - - - | A4 - - - - - - - | . . . . . . . .' } },
      // 판 화면 낮: 피리 선율 + 가야금 반주 + 작은 북 · 음역 좁게 (집중 방해 안 되게)
      board_day: { bpm: 88, spb: 8, tr: -12, form: 'AABA', inst: { A: 'flute', B: 'flute' }, counter: true, vel: 0.9,
        drums: ['k . . t . . t .', 'k . t . k . t .', 'k . . t k . t t'],
        arp: ['. 2 3 . 4 . 3 .', '. . 2 . 3 . 2 .', '. 2 . 3 . 4 . 3'],
        A: { chords: 'C C Am Am Dm Gs C C',
          mel: 'E5 - G5 - A5 G5 E5 - | D5 - C5 - D5 E5 - - | G5 - A5 - C6 - A5 G5 | E5 - - - . . D5 E5 | G5 - E5 D5 C5 - D5 - | E5 - G5 - D5 - - - | C5 - D5 E5 G5 - E5 D5 | C5 - - - . . . .' },
        B: { chords: 'Am Am C C C Dm Gs Gs',
          mel: 'A5 - - G5 E5 - G5 A5 | C6 - A5 - G5 - - - | G5 - E5 G5 D5 - E5 - | D5 - - - . . E5 G5 | A5 - G5 - E5 - D5 C5 | D5 - E5 - G5 - - - | A5 G5 E5 D5 E5 - D5 - | D5 - - - . . . .' } },
      // 판 화면 밤: 같은 화성 · 북 없이 해금 긴 음 · 느리게
      board_night: { bpm: 72, spb: 8, tr: 0, form: 'AB', inst: { A: 'haegeum', B: 'flute' }, counter: true, vel: 0.85,
        drums: [], arp: ['. . 2 . 3 . . .', '. . . 2 . . 3 .', '. 2 . . 3 . . .'],
        A: { chords: 'C C Am Am Dm Gs C C',
          mel: 'E4 - - - G4 - - - | D4 - - - C4 - - - | G4 - - - A4 - G4 - | E4 - - - - - - - | G4 - - - E4 - D4 - | E4 - - - D4 - - - | C4 - - - D4 - E4 - | C4 - - - - - - -' },
        B: { chords: 'Am Am C C C Dm Gs Gs',
          mel: 'A4 - - - G4 - E4 - | C5 - - - A4 - - - | G4 - - - E4 - D4 - | D4 - - - - - - - | A4 - - - G4 - E4 - | D4 - - - E4 - - - | G4 - - - E4 - D4 - | D4 - - - - - - -' } },
      // 첫 화면(시작 이야기): 가야금 독주 · 펼친화음
      title: { bpm: 76, spb: 8, tr: 0, form: 'AA', inst: { A: 'pluck' }, counter: true, vel: 0.9, drums: [],
        arp: ['0 . 1 . 2 . 1 .', '0 . 2 . 1 . 3 .'],
        A: { chords: 'C Am Gs C C Am Dm Gs',
          mel: 'C5 . E5 . G5 . E5 . | A5 . G5 . E5 . C5 . | D5 . G5 . A5 G5 D5 . | E5 - - - . . . . | C5 . E5 G5 A5 . C6 . | A5 . G5 . E5 . . . | D5 . E5 . G5 . D5 . | C5 - - - . . . .' } },
      // 이야기 장면: 가야금 + 피리 느린 곡 (계면조 느낌)
      story: { bpm: 66, spb: 8, tr: 0, form: 'AB', inst: { A: 'flute', B: 'pluck' }, counter: true, vel: 0.8, drums: [],
        arp: ['0 . 2 . 3 . 2 .', '. . 2 . 3 . . .'],
        A: { chords: 'Am Am C Es Dm Dm C Am',
          mel: 'A4 - - C5 E5 - - - | D5 - C5 - A4 - - - | G4 - A4 - C5 - D5 - | E5 - - - - - . . | G5 - E5 - D5 - C5 - | D5 - - - A4 - - - | C5 - D5 - C5 - A4 G4 | A4 - - - - - . .' },
        B: { chords: 'C Es Am Gs C Gs Es Am',
          mel: 'E5 - G5 - A5 - - - | G5 - E5 - D5 - - - | C5 - D5 - E5 - G5 E5 | D5 - - - - - . . | E5 - - G5 A5 - G5 - | E5 - D5 - C5 - - - | D5 - C5 - A4 - G4 - | A4 - - - - - . .' } },
      // 마을 1 바다별채 (한옥 · 가야금 중심)
      town_r1: { bpm: 84, spb: 8, tr: 0, form: 'AABA', inst: { A: 'pluck', B: 'flute' }, counter: true, vel: 0.9,
        drums: ['k . . . t . . .', 'k . . m t . . .'], arp: ['. 2 . 3 . 2 . .', '. . 2 3 . . 2 .'],
        A: { chords: 'G G Em Em D D D G',
          mel: 'D5 . B4 . D5 E5 D5 . | B4 - A4 . G4 . . . | E5 . D5 . E5 G5 E5 . | D5 - - - . . B4 A4 | A4 . B4 . D5 . E5 . | D5 - B4 . A4 . . . | B4 . A4 . G4 . A4 B4 | G4 - - - . . . .' },
        B: { chords: 'Em Em G G As As D D',
          mel: 'E5 - - D5 E5 - G5 - | A5 - G5 - E5 - - - | D5 - E5 - G5 - B4 - | D5 - - - - - . . | A4 - B4 - D5 - E5 D5 | B4 - A4 - B4 - - - | D5 - - - E5 - D5 B4 | A4 - - - - - . .' } },
      // 마을 2 몽돌 선착장 (뱃노래 같은 6/8)
      town_r2: { bpm: 100, spb: 6, tr: 0, form: 'AABA', inst: { A: 'flute', B: 'flute' }, counter: true, vel: 0.85,
        drums: ['k . t k . t', 'k . . k . t'], arp: ['0 . 2 . 3 .', '. 2 . 3 . 2'],
        A: { chords: 'D As D D Bm Bm As D',
          mel: 'A4 - B4 A4 - F#4 | E4 - - D4 . . | F#4 - A4 B4 - A4 | A4 - - - . . | B4 - D5 B4 - A4 | F#4 - E4 D4 - E4 | F#4 - A4 E4 - F#4 | D4 - - - . .' },
        B: { chords: 'Bm Bm D D As Bm D As',
          mel: 'D5 - - B4 - A4 | B4 - A4 F#4 - . | A4 - B4 D5 - E5 | D5 - - - . . | E5 - D5 B4 - A4 | B4 - A4 F#4 - E4 | D4 - E4 F#4 - A4 | A4 - - - . .' } },
      // 마을 3 바람골목 (통통 튀는 목탁)
      town_r3: { bpm: 104, spb: 8, tr: 0, form: 'AABA', inst: { A: 'pluck', B: 'flute' }, counter: true, vel: 0.85,
        drums: ['m . m t m . m t', 'm . . t m m . t'], arp: ['0 . 2 . 1 . 2 .', '. 2 . 3 . 2 . 1'],
        A: { chords: 'C Am Dm Gs C Am Gs C',
          mel: 'C5 . E5 . G5 . E5 G5 | A5 . G5 . E5 . . . | D5 . E5 . D5 . C5 A4 | G4 . A4 . C5 . D5 . | E5 . G5 E5 D5 . C5 . | A4 . C5 . E5 . . . | D5 E5 D5 C5 A4 . G4 . | C5 . . . C5 . . .' },
        B: { chords: 'Am Am C C Dm Dm Gs Gs',
          mel: 'A5 . . G5 A5 . C6 . | A5 . G5 . E5 . . . | G5 . E5 . G5 . A5 . | G5 - - - . . . . | D5 . E5 . G5 . E5 . | D5 . C5 . A4 . . . | G4 . A4 . C5 . D5 . | E5 - D5 - . . . .' } },
      // 마을 4 매화언덕 정원 (피리 길게)
      town_r4: { bpm: 76, spb: 8, tr: 0, form: 'AB', inst: { A: 'flute', B: 'flute' }, counter: true, vel: 0.85,
        drums: ['k . . . . . m .', '. . . . k . . .'], arp: ['0 . 2 . 3 . . .', '. . 1 . 2 . 3 .'],
        A: { chords: 'F F Dmf Dmf Gs Cs F F',
          mel: 'C5 - - - D5 - F5 - | A4 - - - - - G4 - | G4 - A4 - C5 - D5 - | C5 - - - - - . . | F5 - - - D5 - C5 - | D5 - - - A4 - - - | G4 - A4 - C5 - A4 G4 | F4 - - - - - . .' },
        B: { chords: 'Dmf Dmf F F Gs Gs Cs Cs',
          mel: 'D5 - - - F5 - G5 - | F5 - D5 - C5 - - - | A4 - C5 - D5 - F5 - | G5 - - - - - . . | F5 - D5 - C5 - A4 - | C5 - - - D5 - - - | A4 - G4 - F4 - G4 - | G4 - - - - - . .' } },
      // 마을 5 반짝 해변 축제 (북·작은 꽹과리 · 빠르게)
      town_r5: { bpm: 116, spb: 8, tr: 0, form: 'AABA', inst: { A: 'flute', B: 'pluck' }, counter: true, vel: 0.85,
        drums: ['k c t c k k t c', 'k c t k t k t c', 'k . t c k c t t'], arp: ['0 2 . 2 1 2 . 2', '0 . 2 3 . 2 . 3'],
        A: { chords: 'G G Em Em G G D G',
          mel: 'G4 . B4 D5 E5 . D5 . | B4 . D5 . B4 A4 G4 . | E5 . G5 . E5 D5 B4 . | D5 . . . D5 E5 D5 B4 | G4 . B4 D5 E5 . G5 . | E5 . D5 . B4 . A4 . | B4 . A4 . G4 . A4 B4 | G4 . . . G4 . . .' },
        B: { chords: 'Em Em D D G G As D',
          mel: 'E5 . E5 G5 A5 . G5 E5 | D5 . B4 . D5 . . . | A4 . A4 B4 D5 . B4 A4 | G4 . A4 . B4 . . . | D5 . E5 . G5 . A5 . | G5 . E5 . D5 . . . | E5 . D5 B4 A4 . B4 . | A4 . . . . . . .' } },
      // 마을 6 등대곶 (해금 · 잔잔)
      town_r6: { bpm: 66, spb: 8, tr: 0, form: 'AB', inst: { A: 'haegeum', B: 'flute' }, counter: true, vel: 0.8,
        drums: ['. . . . . . . .', 'b . . . . . . .'], arp: ['0 . . 2 . 3 . .', '. . 2 . . 3 . .'],
        A: { chords: 'Am Am C C Gs Gs Am Am',
          mel: 'E4 - - - A4 - - - | G4 - - - E4 - - - | C5 - - - D5 - E5 - | D5 - - - - - - - | C5 - - - A4 - G4 - | A4 - - - E4 - - - | G4 - - - A4 - C5 - | A4 - - - - - - -' },
        B: { chords: 'Dm Dm Am Am C C Gs Gs',
          mel: 'D5 - - - E5 - G5 - | E5 - - - D5 - - - | C5 - - - E5 - A5 - | G5 - - - - - - - | E5 - - - D5 - C5 - | A4 - - - C5 - - - | D5 - - - C5 - A4 - | G4 - - - - - - -' } },
      // 주간 이벤트 (밝은 축제 변주)
      event: { bpm: 112, spb: 8, tr: 0, form: 'AABA', inst: { A: 'flute', B: 'pluck' }, counter: true, vel: 0.85,
        drums: ['k c t c k . t c', 'k c t k t c t .'], arp: ['0 2 . 2 1 2 . 2', '. 2 . 3 . 2 . 3'],
        A: { chords: 'C C Am Am Dm Gs C C',
          mel: 'G4 . C5 . E5 . G5 . | E5 . D5 . C5 . . . | A4 . C5 . E5 . A5 . | G5 . E5 . . . . . | D5 . E5 . D5 . C5 . | A4 . G4 . A4 . C5 . | D5 . . . E5 . D5 . | C5 . . . . . . .' },
        B: { chords: 'Am Am C C Dm Dm Gs Gs',
          mel: 'C6 . A5 . G5 . E5 . | G5 . A5 . . . . . | E5 . G5 . E5 . D5 . | C5 . D5 . . . . . | D5 . E5 . G5 . A5 . | G5 . E5 . D5 . . . | E5 . D5 . C5 . A4 . | D5 . . . . . . .' } }
    },
    // 짧은 징글 (2~4초 · 효과음 쪽 · 그동안 배경음은 낮아져요): [음, 박(8분음 칸), 악기]
    jingles: {
      build: { bpm: 120, notes: [['C5', 0, 'pluck'], ['E5', 1, 'pluck'], ['G5', 2, 'pluck'], ['C6', 3, 'pluck'], ['G5', 3, 'flute', 3]], bell: 3 },
      area: { bpm: 104, notes: [['G4', 0, 'pluck'], ['C5', 1, 'pluck'], ['E5', 2, 'pluck'], ['G5', 3, 'pluck'], ['A5', 4, 'flute', 2], ['G5', 6, 'flute', 1], ['E5', 7, 'flute', 1], ['G5', 8, 'flute', 2], ['C6', 10, 'flute', 4], ['C4', 10, 'pluck'], ['G4', 10, 'pluck']], gong: 0, bell: 10 },
      ending: { bpm: 80, notes: [['A4', 0, 'pluck'], ['C5', 1, 'pluck'], ['E5', 2, 'pluck'], ['A5', 3, 'flute', 3], ['G5', 6, 'flute', 2], ['E5', 8, 'flute', 2], ['D5', 10, 'flute', 2], ['C5', 12, 'flute', 2], ['E5', 14, 'flute', 4], ['A4', 14, 'pluck'], ['C4', 14, 'pluck']], gong: 0, bell: 14 },
      attend: { bpm: 132, notes: [['E5', 0, 'pluck'], ['G5', 1, 'pluck'], ['C6', 2, 'pluck'], ['D6', 3, 'pluck']], bell: 3 }
    }
  };

  // 마을 지도 (merge_town.md §A · 화면은 js/merge/town.js) — 하나로 이어진 섬 지도 1장 (3072×3072 · art_tests/merge/town2/town_map_v3.jpg)
  //   왼쪽 위 r6 등대곶 · 오른쪽 위 r5 축제 광장 · 왼쪽 가운데 r4 매화언덕 · 오른쪽 가운데 r3 떡방앗간 거리 · 왼쪽 아래 r1 바다별채(시작) · 가운데 아래 r2 몽돌 선착장
  //  좌표는 모두 '지도 px' (= 세계 px) · 그림은 발밑(아래 가운데)을 그 자리에 놓아요 · 화면은 조각 그림(town/map_<열>_<행>)으로 보이는 곳만 받아요
  //  areas: 지역 · who = 그 지역에 사는 사람(걸어 다님) · paths = 걷는 길(꺾은선 · [0] 마을 사람 · [1] 하윤)
  //  build: 작업 → 짓기 · kind B3 = 건물(모양 3가지 · 하나는 무료로 고르고 나머지는 동전) · D1 = 장식 · G = 땅 고치기(잔해만 치움)
  //         art: 그림 id (B3 는 뒤에 _a/_b/_c) · at = 발밑 · w = 지도 위 폭 · clears = 짓기 전 잔해 [그림, x, y, 폭]
  //         rep = 같은 그림을 더 놓을 자리 · z = 겹침 순서용 발밑 y (현판처럼 건물 앞에 얹을 때) · lights = 밤 불빛 (그림 안 비율)
  //         looks = 모양 이름 3개 · fx = 코드 연출 (pond 탁한 물 → 맑은 연못 · ruin 무너진 등대 → 비계 · lens 렌즈 반짝 · beam 빛줄기)
  //  ?edit=1 로 열면 지도에서 끌어서 옮기고 [복사] 로 이 좌표를 꺼낼 수 있어요
  const TOWN = {
    map: { w: 3072, h: 3072, tile: 512, lo: 1024 }, sea: '#5fa095',       // sea = 지도 밖 바다색 (merge_art.py TOWN_MAP_SEA)
    island: [168, 132, 2872, 2912],                       // 섬(땅) 테두리 · 카메라 끌기 한계
    // 지역: box = 안개·카메라용 사각 [x0, y0, x1, y1] (이웃과 조금 겹침 · 지도 칸 주인은 town.js zoneAt) · center = 카메라·안개 걷힘 가운데
    areas: {
      r1: { box: [560, 1660, 1300, 2700], center: [930, 2180], who: 'juni', paths: [[[700, 2380], [850, 2420], [1000, 2380]], [[720, 2280], [880, 2300], [1060, 2262]]] },
      r2: { box: [1280, 2080, 2520, 2780], center: [1900, 2430], who: 'dochi', paths: [[[1500, 2450], [1700, 2500], [1880, 2560]], [[2030, 2340], [2200, 2362], [2390, 2330]]] },
      r3: { box: [1540, 1300, 2770, 2090], center: [2155, 1695], who: 'mina', paths: [[[1700, 1450], [1950, 1500], [2250, 1480]], [[2000, 2082], [2250, 2085], [2450, 2050]]] },
      r4: { box: [560, 1000, 1640, 1700], center: [1100, 1350], who: 'kkotnim', paths: [[[700, 1450], [680, 1600], [760, 1700]], [[880, 1180], [1100, 1150], [1300, 1180]]] },
      r5: { box: [1540, 330, 2770, 1330], center: [2155, 830], who: 'rua', paths: [[[1950, 900], [2150, 950], [2400, 900]], [[2050, 1150], [2270, 1200], [2450, 1120]]] },
      r6: { box: [380, 170, 1470, 1150], center: [925, 660], who: 'kang', paths: [[[700, 620], [900, 560], [1100, 600]], [[1020, 1000], [1110, 1040], [1200, 1030]]] }
    },
    build: {
      r1_gate: {kind: 'B3', art: 'b_r1_gate', at: [1168, 2088], w: 215, clears: [['c_rubble_wood', 1160, 2080, 160]], lights: [[0.3, 0.6], [0.72, 0.6]], looks: ['쪽빛 기와 솟을대문', '나무 사립문', '단청 꽃 대문']},
      r1_paper: {kind: 'B3', art: 'b_r1_paper', at: [900, 2230], w: 320, clears: [['c_rubble_stone', 900, 2230, 190]], lights: [[0.4, 0.62], [0.68, 0.6]], looks: ['기와 본채', '초가 본채', '분홍 담장 본채']},
      r1_sign: {kind: 'D1', art: 'd_r1_sign', at: [780, 2250], w: 62, mount: {on: 'r1_paper', w: 46, label: '바다별채', looks: [[0.315, 0.532, 0.53], [0.25, 0.585, 0.55], [0.3, 0.535, 0.45]]}},
      r1_maru: {kind: 'D1', art: 'd_r1_maru', at: [1085, 2138], w: 122, clears: [['c_weeds', 1085, 2138, 85]]},
      r1_lamp: {kind: 'D1', art: 'd_r1_lamp', at: [1000, 1985], w: 74, lights: [[0.5, 0.36]]},
      r1_room: {kind: 'B3', art: 'b_r1_room', at: [845, 1866], w: 205, clears: [['c_rubble_wood', 845, 1860, 150]], lights: [[0.5, 0.62]], looks: ['기와 별채', '초가 별채', '꽃 창살 별채']},
      r2_pier: {kind: 'B3', art: 'b_r2_pier', at: [2000, 2462], w: 240, clears: [['c_rubble_wood', 1985, 2470, 150]], lights: [[0.2, 0.3], [0.85, 0.3]], looks: ['원목 선착장', '하늘색 칠 선착장', '등불 단 선착장']},
      r2_net: {kind: 'D1', art: 'd_r2_net', at: [1500, 2600], w: 150, clears: [['c_beach_trash', 1500, 2600, 110]]},
      r2_awning: {kind: 'B3', art: 'b_r2_awning', at: [1585, 2300], w: 200, clears: [['c_rubble_wood', 1585, 2300, 140]], lights: [[0.5, 0.5]], looks: ['줄무늬 천 가게', '짚 지붕 가게', '색동 천 가게']},
      r2_ice: {kind: 'B3', art: 'b_r2_ice', at: [2180, 2270], w: 240, clears: [['c_rubble_stone', 2180, 2270, 160]], lights: [[0.32, 0.72]], looks: ['돌 얼음 창고', '나무 얼음 창고', '하늘 기와 얼음 창고']},
      r2_boat: {kind: 'D1', art: 'd_r2_boat', at: [2250, 2610], w: 190, fx: 'bob'},
      r2_stall: {kind: 'D1', art: 'd_r2_stall', at: [1760, 2250], w: 160, clears: [['c_rubble_wood', 1760, 2250, 110]]},
      r2_sotdae: {kind: 'D1', art: 'd_r2_sotdae', at: [2010, 2190], w: 62},
      r3_road: {kind: 'G', clears: [['c_rubble_stone', 1900, 1450, 150], ['c_weeds', 2150, 1500, 100], ['c_weeds', 1750, 1600, 100]]},
      r3_mill: {kind: 'B3', art: 'b_r3_mill', at: [2150, 2060], w: 240, clears: [['c_rubble_wood', 2150, 2060, 160]], lights: [[0.42, 0.62]], looks: ['기와 물레방아 방앗간', '초가 방앗간', '분홍 간판 방앗간']},
      r3_eave: {kind: 'B3', art: 'b_r3_eave', at: [2410, 1970], w: 235, clears: [['c_rubble_stone', 2410, 1970, 150]], lights: [[0.38, 0.62], [0.7, 0.62]], looks: ['대나무 처마 찻집', '기와 찻집', '꽃 처마 찻집']},
      r3_pyeong: {kind: 'D1', art: 'd_r3_pyeong', at: [1800, 1480], w: 135},
      r3_pots: {kind: 'D1', art: 'd_r3_pots', at: [2050, 1480], w: 140, clears: [['c_weeds', 2050, 1480, 90]]},
      r3_mural: {kind: 'D1', art: 'd_r3_mural', at: [1700, 1570], w: 140},
      r3_bell: {kind: 'D1', art: 'd_r3_bell', at: [2250, 1470], w: 56},
      r4_weed: {kind: 'G', clears: [['c_weeds', 1400, 1500, 130], ['c_weeds', 900, 1150, 120], ['c_weeds', 1450, 1680, 100]]},
      r4_steps: {kind: 'D1', art: 'd_r4_steps', at: [880, 1650], w: 130},
      r4_pond: {kind: 'D1', art: 'd_r4_pond', at: [1090, 1450], w: 250, fx: 'pond'},
      r4_bridge: {kind: 'B3', art: 'b_r4_bridge', at: [1090, 1500], w: 210, lights: [[0.5, 0.45]], looks: ['무지개 돌다리', '나무 다리', '붉은 난간 다리']},
      r4_pavilion: {kind: 'B3', art: 'b_r4_pavilion', at: [1350, 1140], w: 245, clears: [['c_rubble_wood', 1350, 1140, 160]], lights: [[0.5, 0.42]], looks: ['육각 기와 정자', '초가 정자', '단청 정자']},
      r4_path: {kind: 'D1', art: 'd_r4_path', at: [760, 1660], w: 115, rep: [[700, 1570], [665, 1480], [640, 1390]]},
      r5_clean: {kind: 'G', clears: [['c_beach_trash', 2500, 470, 140], ['c_beach_trash', 1680, 450, 130], ['c_beach_trash', 2620, 1250, 110]]},
      r5_hut: {kind: 'B3', art: 'b_r5_hut', at: [2440, 1010], w: 200, clears: [['c_rubble_wood', 2440, 1010, 145]], lights: [[0.5, 0.55]], looks: ['초가 쉼터', '천막 쉼터', '꽃 지붕 쉼터']},
      r5_stage: {kind: 'B3', art: 'b_r5_stage', at: [2180, 800], w: 220, clears: [['c_rubble_wood', 2180, 800, 150]], lights: [[0.3, 0.4], [0.7, 0.4]], looks: ['나무 무대', '색동 휘장 무대', '등불 무대']},
      r5_cloth: {kind: 'D1', art: 'd_r5_cloth', at: [1960, 760], w: 165, fx: 'sway'},
      r5_swing: {kind: 'D1', art: 'd_r5_swing', at: [1990, 1060], w: 140},
      r5_cart: {kind: 'D1', art: 'd_r5_cart', at: [2380, 1150], w: 150},
      r5_arch: {kind: 'B3', art: 'b_r5_arch', at: [2270, 1270], w: 175, lights: [[0.28, 0.42], [0.72, 0.42]], looks: ['청사초롱 아치', '연꽃 등 아치', '별 모양 등 아치']},
      r6_path: {kind: 'G', clears: [['c_weeds', 1180, 1000, 120], ['c_rubble_stone', 1300, 950, 130], ['c_weeds', 1100, 1010, 100]]},
      r6_fence: {kind: 'D1', art: 'd_r6_fence', at: [640, 600], w: 120, rep: [[760, 640], [1080, 600]]},
      r6_hut: {kind: 'B3', art: 'b_r6_hut', at: [725, 520], w: 195, clears: [['c_rubble_stone', 725, 520, 135]], lights: [[0.45, 0.62]], looks: ['돌 오두막', '나무 오두막', '파란 지붕 오두막']},
      r6_stairs: {kind: 'G', fx: 'ruin'},
      r6_wall: {kind: 'B3', art: 'b_r6_wall', at: [920, 430], w: 150, lights: [[0.5, 0.12]], looks: ['흰·빨강 띠 등대', '흰·쪽빛 띠 등대', '크림·분홍 띠 등대']},
      r6_bell: {kind: 'D1', art: 'd_r6_bell', at: [1120, 450], w: 120},
      r6_lens: {kind: 'G', fx: 'lens'},
      r6_light: {kind: 'G', fx: 'beam'}
    },
    ruin: { art: 'c_ruin_lighthouse', at: [920, 420], w: 135, scaffold: 'c_scaffold', sw: 165 },
    pond: { at: [1090, 1385], rx: 92, ry: 68 },            // 4지역 탁한 물 덮개 (연못 맑게 하기 전)
    // 바다 위 작은 고깃배 [그림, x, y, 폭, 오가는 폭] (출렁 + 천천히 오감)
    boats: [['c_boat_a', 2700, 2520, 120, 50], ['c_boat_b', 300, 1500, 110, 50], ['c_boat_a', 2900, 900, 110, 50], ['c_boat_b', 1900, 2960, 120, 50]],
    // 상점 [꾸미기] 마을 장식 (몇 개든 · 20×m) · 꾸미기에서 지도 아무 곳에 놓아요
    fillers: {
      pine: { name: '소나무', art: 'c_pine', w: 140 }, blossom: { name: '벚나무', art: 'c_blossom_tree', w: 140 }, bamboo: { name: '대나무', art: 'c_bamboo', w: 70 },
      rocks: { name: '바위', art: 'c_rocks', w: 100 }, flower: { name: '꽃덤불', art: 'c_flower_bush', w: 110 }, jang: { name: '장독대', art: 'c_jangdokdae', w: 130 },
      wall: { name: '돌담 조각', art: 'c_wall', w: 130 }, boat: { name: '작은 고깃배', art: 'c_boat_a', w: 110 }
    },
    eventDecos: { kite_deco: { w: 90 }, dano_deco: { w: 110 } },
    lookCoins: 30, fillerCoins: 20,                        // × 그 지역(장식은 지금 지역) 가격 배수 m
    tapCoins: [1, 3]                                       // 지은 건물 처음 톡 (하루 한 번씩) 엽전
  };

  // 하윤 옷장 (merge_town.md §H · art_tests/merge/outfits → tools/merge_art.py outfits)
  //  art = 걷는 하윤 전신 (22벌 모두 같은 자르기 → 갈아입어도 몸 크기·발밑 그대로) · face = 대사창·말하는 칸·카드 얼굴 (가슴 위 초상)
  //  cat = 상점 꾸미기 탭 묶음 (OUTFIT_CATS 차례) · 철과 상관없이 일 년 내내 (season 을 주면 그 달에만 · 지금은 쓰지 않아요)
  //  값 (2026-11-02): 동전은 1지역 부탁 10~20번 ~ 중반 부탁 5~8번 · 소라별(처음 발견마다 1개)로도 살 수 있게 (동전이 적은 초반에도 한 벌)
  const OUTFIT_CATS = [
    { id: 'base', name: '기본 옷' },
    { id: 'hanbok', name: '한복', note: '명절·단오·꽃놀이' },
    { id: 'daily', name: '요즘 옷', note: '편한 옷·잠옷·비 오는 날' },
    { id: 'chic', name: '세련된 옷', note: '도시 나들이·저녁 모임' },
    { id: 'vacance', name: '바캉스', note: '바닷가 휴가 차림' },
    { id: 'swim', name: '수영복', note: '반짝 해변에서' }
  ];
  const OUTFITS = {
    base: { name: '연두 저고리 + 앞치마', art: 'h_outfit_base', face: null, cat: 'base' },
    hanbok_flower: { name: '꽃 화관 분홍 한복', art: 'h_outfit_hanbok_flower', face: 'h_hanbok_flower_bust', cat: 'hanbok', coins: 220, gems: 11 },
    hanbok_dano: { name: '단오 쪽빛 한복 + 댕기', art: 'h_outfit_hanbok_dano', face: 'h_hanbok_dano_bust', cat: 'hanbok', coins: 220, gems: 11 },
    hanbok_seolbim: { name: '색동 설빔 + 털 댕기', art: 'h_outfit_hanbok_seolbim', face: 'h_hanbok_seolbim_bust', cat: 'hanbok', coins: 240, gems: 12 },
    pajamas: { name: '별무늬 잠옷 + 안대 머리띠', art: 'h_outfit_pajamas', face: 'h_pajamas_bust', cat: 'daily', coins: 80, gems: 4 },
    hoodie: { name: '후드티 + 청바지', art: 'h_outfit_hoodie', face: 'h_hoodie_bust', cat: 'daily', coins: 110, gems: 6 },
    raincoat: { name: '노란 비옷 + 장화', art: 'h_outfit_raincoat', face: 'h_raincoat_bust', cat: 'daily', coins: 110, gems: 6 },
    summer_dress: { name: '하늘 꽃무늬 여름 원피스', art: 'h_outfit_summer_dress', face: 'h_summer_dress_bust', cat: 'daily', coins: 130, gems: 7 },
    knit: { name: '포근한 니트 + 목도리', art: 'h_outfit_knit', face: 'h_knit_bust', cat: 'daily', coins: 130, gems: 7 },
    cafe: { name: '카페 앞치마 + 셔츠', art: 'h_outfit_cafe', face: 'h_cafe_bust', cat: 'daily', coins: 130, gems: 7 },
    sailor: { name: '세일러 옷 + 모자', art: 'h_outfit_sailor', face: 'h_sailor_bust', cat: 'daily', coins: 150, gems: 8 },
    party: { name: '파스텔 튤 파티 드레스', art: 'h_outfit_party', face: 'h_party_bust', cat: 'daily', coins: 180, gems: 9 },
    linen: { name: '미니멀 리넨 휴양 세트', art: 'h_outfit_linen', face: 'h_linen_bust', cat: 'chic', coins: 240, gems: 12 },
    city: { name: '블라우스 + 롱스커트', art: 'h_outfit_city', face: 'h_city_bust', cat: 'chic', coins: 240, gems: 12 },
    trench: { name: '트렌치코트 + 베레모', art: 'h_outfit_trench', face: 'h_trench_bust', cat: 'chic', coins: 260, gems: 13 },
    evening: { name: '진주 장식 저녁 드레스', art: 'h_outfit_evening', face: 'h_evening_bust', cat: 'chic', coins: 300, gems: 15 },
    vacation: { name: '밀짚모자 + 꽃무늬 휴양 원피스', art: 'h_outfit_vacation', face: 'h_vacation_bust', cat: 'vacance', coins: 160, gems: 8 },
    beach: { name: '튜브 + 선캡 해변 차림', art: 'h_outfit_beach', face: 'h_beach_bust', cat: 'vacance', coins: 160, gems: 8 },
    rashguard: { name: '래시가드 + 수영 반바지', art: 'h_outfit_rashguard', face: 'h_rashguard_bust', cat: 'swim', coins: 150, gems: 8 },
    swim_frill: { name: '프릴 원피스 수영복', art: 'h_outfit_swim_frill', face: 'h_swim_frill_bust', cat: 'swim', coins: 160, gems: 8 },
    swim_polka: { name: '물방울 수영복 + 챙 넓은 모자', art: 'h_outfit_swim_polka', face: 'h_swim_polka_bust', cat: 'swim', coins: 160, gems: 8 },
    swim_chic: { name: '단정한 수영복 + 비치는 덧옷', art: 'h_outfit_swim_chic', face: 'h_swim_chic_bust', cat: 'swim', coins: 200, gems: 10 }
  };
  // 몽돌 소품: 걷는 몽돌 그림(w_mongdol) 위에 겹쳐요 · at = [가운데 x, 가운데 y, 폭] (몽돌 그림 비율 · 왼쪽 보는 그림 기준 · 머리 꼭대기 ≈ y 0.02, 두 눈 가운데 ≈ x 0.39)
  const MONG_ACC = {
    sunglasses: { name: '작은 선글라스', art: 'm_sunglasses', coins: 120, at: [0.385, 0.35, 0.42] },
    tube: { name: '수영 튜브', art: 'm_tube', coins: 120, at: [0.55, 0.8, 0.62] },
    sailor_hat: { name: '세일러 모자', art: 'm_sailor_hat', coins: 90, at: [0.4, 0.0, 0.36] },
    flower_crown: { name: '꽃 화관', art: 'm_flower_crown', coins: 90, at: [0.4, 0.02, 0.42] },
    knit_hat: { name: '니트 모자', art: 'm_knit_hat', coins: 90, at: [0.4, 0.04, 0.38] },
    rain_hat: { name: '비옷 모자', art: 'm_rain_hat', coins: 90, at: [0.4, 0.05, 0.44] },
    party_hat: { name: '파티 고깔', art: 'm_party_hat', coins: 90, at: [0.42, -0.1, 0.22] },
    scarf: { name: '분홍 목도리', art: 'm_scarf', coins: 90, at: [0.4, 0.62, 0.3] },
    hat: { name: '몽돌 모자', deco: 'mongdol_hat', at: [0.4, 0.04, 0.26] }     // 출석 7일 선물 (그림 없이 코드로 그려요)
  };

  // 마을 사람 선물·우정 (merge_town.md §I) · loves = 최애 물건 2개 · 선물 하루 한 사람당 3번
  //  점수: 최애 = 단계×3+10 · 그 사람 체인 = 단계×2 · 그 밖 = 단계 · 부탁 건네기 +2
  //  단계 보상: 1 동전 30×m · 2 소라별 3 + 편지 · 3 장식(그림 오기 전엔 소라별 5) · 4 이야기 장면 + 큰 보자기 · 5 칭호 + 하윤 옷(그림 오기 전엔 소라별 10)
  const FRIEND = {
    lv: [10, 35, 80, 150, 250], perDay: 3, deliverPts: 2, coins1: 30, gems2: 3, gems3: 5, gems5: 10, allWild: 3, allTitle: '소라섬 모두의 친구',
    loves: { juni: ['a7', 'a8'], mina: ['b8', 'c7'], kkotnim: ['d8', 'd6'], dochi: ['e6', 'g7'], kang: ['f4', 'h7'], rua: ['h5', 'g6'] },
    // 받았을 때 말 (최애 · 좋아함 · 보통)
    react: {
      juni: ['우와아! 이거 제가 제일 좋아하는 거예요!', '헤헤, 고마워요 누나!', '이것도 좋아요!'],
      mina: ['꺄, 이거 어떻게 알았어?!', '고마워, 하윤아~', '마음만으로도 고마워!'],
      kkotnim: ['아이고, 이걸 다…! 윤해 생각이 나는구나.', '참 곱다, 고맙구나.', '마음 씀씀이가 예쁘구먼.'],
      dochi: ['…! 이건… 정말 좋소.', '…고맙소.', '…허, 잘 받겠소.'],
      kang: ['허허! 이건 내 보물로 삼겠네.', '고맙네, 아주 좋아.', '마음이 고맙구먼.'],
      rua: ['…이 색, 꼭 그리고 싶었어.', '고마워. 예쁘다.', '고마워, 잘 둘게.']
    },
    letters: {
      juni: '하윤 누나에게. 누나가 오고부터 편지 배달이 재밌어졌어요! 이 편지는 제가 직접 배달해요. —준이',
      mina: '하윤아, 떡집 다시 연 거 다 네 덕분이야. 우리 할머니도 하늘에서 웃고 계실걸? —미나',
      kkotnim: '하윤아, 너를 보면 꼭 윤해 젊을 적 같단다. 밥 꼭 챙겨 먹어라. —꽃님',
      dochi: '…하윤 씨. 배가 다시 바다에 나갈 수 있게 됐소. 고맙소. —도치',
      kang: '하윤 군, 등대 일지를 다시 쓰기 시작했네. 첫 줄에 자네 이름을 적었지. —강',
      rua: '하윤에게. 이 섬 그림에 너를 그려 넣었어. 보여 줄게, 언젠가. —루아'
    },
    scenes: {
      juni: [{ who: 'juni', face: 'joy', text: '누나, 비밀 하나 알려 줄까요?' }, { who: 'juni', text: '윤해 할머니가 저한테 처음 편지 배달을 맡기셨어요.\n"이 섬에서 제일 빠른 발"이라고요!' }, { who: 'hayun', face: 'joy', text: '정말? 할머니다운 말씀이네.' }, { who: 'juni', face: 'joy', text: '이제 누나 편지도 제가 다 배달할게요!' }],
      mina: [{ who: 'mina', text: '하윤아, 이 떡 틀 보여?\n우리 할머니랑 윤해 할머니가 같이 쓰던 거래.' }, { who: 'mina', text: '두 분이 잔칫날마다 밤새 떡을 빚으셨대.' }, { who: 'hayun', face: 'joy', text: '우리도 그렇게 하자. 잔칫날마다!' }, { who: 'mina', face: 'joy', text: '약속이다! 새끼손가락~' }],
      kkotnim: [{ who: 'kkotnim', text: '이 매화나무는 윤해랑 내가 처음 만난 해에 심었단다.' }, { who: 'kkotnim', text: '폭풍에 다 쓰러질 줄 알았는데…\n네가 오니 다시 꽃을 피우는구나.' }, { who: 'hayun', text: '할머니, 내년 봄엔 같이 꽃구경 가요.' }, { who: 'kkotnim', face: 'joy', text: '아이고, 그래야지. 그래야지.' }],
      dochi: [{ who: 'dochi', text: '…아들 배가 돌아왔소.' }, { who: 'dochi', text: '…등불을 보고 왔다더군.\n하윤 씨가 켠 불 말이오.' }, { who: 'hayun', face: 'wow', text: '정말요? 다행이에요!' }, { who: 'dochi', face: 'joy', text: '…오늘 저녁엔 굴비 한 두름 가져가시오.' }],
      kang: [{ who: 'kang', text: '젊을 때 윤해 씨와 등대 불을 같이 지켰지.' }, { who: 'kang', text: '그 사람은 늘 말했네.\n"불은 혼자 켜는 게 아니라, 기다리는 사람이 같이 켜는 거"라고.' }, { who: 'hayun', text: '저도 같이 지킬게요, 선생님.' }, { who: 'kang', face: 'joy', text: '허허, 든든하구먼.' }],
      rua: [{ who: 'rua', text: '나, 사실 이 섬에 그림 그리러 잠깐 왔던 거야.' }, { who: 'rua', text: '그런데 너랑 섬이 바뀌는 걸 보니까…\n떠날 수가 없더라.' }, { who: 'hayun', face: 'joy', text: '그럼 계속 있어! 바다별채 손님방 비워 둘게.' }, { who: 'rua', face: 'joy', text: '…고마워. 진짜로.' }]
    }
  };

  // 처음 판: 발생기 3개(가운데 아래) + 1단계 물건 몇 개 · 위쪽은 모래더미(옆에서 합치면 한 겹씩 벗겨짐)
  const START = {
    gens: [{ id: 'gen_a', at: 58 }, { id: 'gen_b', at: 59 }, { id: 'gen_d', at: 60 }],
    items: [{ c: 'a', t: 1, at: 43 }, { c: 'a', t: 1, at: 47 }, { c: 'b', t: 1, at: 45 }, { c: 'b', t: 1, at: 52 }, { c: 'd', t: 1, at: 54 }],
    cover: [{ rows: [0, 1], n: 2 }, { rows: [2], n: 1 }],
    chains: ['a', 'b', 'd'],
    energy: 100, coins: 0, stars: 1, gems: 0
  };

  // 이야기 장면 (톡해서 넘김 · 한 장면 3~6줄) · who = VILLAGERS id · face = 표정
  const STORY = {
    intro: [
      { who: 'hayun', pic: 'story_start', text: '여기가… 할머니의 바다별채.\n폭풍에 많이 망가졌네.' },
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
    ],
    // ---- 이야기 부탁을 건넸을 때 ----
    so_r1: [
      { who: 'mina', face: 'joy', text: '와, 송편 예쁘게도 빚었다!\n마루에 손님 오면 이거 내자.' },
      { who: 'hayun', face: 'joy', text: '그럼 이제 마루만 반짝반짝 닦으면 되겠다!' }
    ],
    so_r2: [
      { who: 'dochi', text: '…좋은 조기요.\n아들 배에 실어 두겠소.' },
      { who: 'dochi', face: 'joy', text: '…배 칠은 같이 합시다.' }
    ],
    so_r3: [
      { who: 'mina', face: 'joy', text: '색동 경단!\n재개업 첫 떡은 이걸로 정했어.' },
      { who: 'mina', text: '평상 놓으면 다 같이 앉아서 먹자.\n할머니 자리도 하나 비워 두고.' }
    ],
    so_r4a: [
      { who: 'kkotnim', face: 'joy', text: '아이고, 매화 분재가 꼭 그때 그 모양이구먼.' },
      { who: 'kkotnim', text: '윤해랑 둘이 정자에 앉아\n이 나무를 보며 차를 마셨제.' }
    ],
    so_r4b: [
      { who: 'rua', face: 'joy', text: '고마워. 이 방석에 앉으면\n정원이 더 잘 보여.' },
      { who: 'rua', text: '…이 섬, 처음 온 것 같지 않아.\n오래전부터 편지로 알던 곳 같아.' }
    ],
    so_r5: [
      { who: 'kang', face: 'joy', text: '청사초롱 두 개라… 잘 만들었네.' },
      { who: 'kang', text: '아치 양쪽에 걸면\n바다에서도 잘 보일 걸세.' }
    ],
    so_r6: [
      { who: 'kang', text: '…이 렌즈다.\n그날 밤 깨진 렌즈가 다시 빛나는구먼.' },
      { who: 'kang', face: 'joy', text: '자네 덕분에 다시 등대에 오를 용기가 나네.' },
      { who: 'mongdol', face: 'joy', text: '뀨!' }
    ],
    // ---- 4 매화언덕 정원 ----
    r4_open: [
      { who: 'kkotnim', text: '어서 오너라, 하윤아.\n여기가 내 정원… 이었제.' },
      { who: 'kkotnim', text: '폭풍에 잡초만 무성해졌구먼.\n윤해랑 같이 가꾸던 곳인데.' },
      { who: 'rua', text: '…안녕. 나는 루아.\n이 언덕을 그리러 왔어.' },
      { who: 'rua', text: '바느질 상자 하나 빌려줄게.\n색실로 정원에 색을 입혀 줘.' },
      { who: 'hayun', face: 'joy', text: '좋아요! 꽃언덕, 다시 피워 봐요.' }
    ],
    r4_weed: [
      { who: 'kkotnim', face: 'joy', text: '잡초를 걷어 내니 땅이 숨을 쉬는구먼.' },
      { who: 'mongdol', text: '뀨우~\n(풀숲에서 데굴데굴)' }
    ],
    r4_pond: [
      { who: 'hayun', face: 'wow', text: '연못 바닥에 뭔가 있어요.\n…사진첩?' },
      { who: 'kkotnim', text: '이건… 윤해랑 내가 열아홉 살 때구먼.\n둘 다 저리 웃었었제.' },
      { who: 'kkotnim', face: 'joy', text: '고맙다, 하윤아.\n잃어버린 줄 알았던 봄을 찾았어.' }
    ],
    r4_pavilion: [
      { who: 'rua', text: '정자가 서니까 그림이 완성되겠어.' },
      { who: 'rua', face: 'joy', text: '봐, 연못이랑 매화랑… 하윤이도 그렸어.' },
      { who: 'hayun', face: 'joy', text: '와, 저 정말 잘 나왔다!' }
    ],
    r4_done: [
      { who: 'kkotnim', face: 'joy', text: '매화 길에 꽃이 피었구먼.\n윤해가 늘 걷던 길이여.' },
      { who: 'rua', text: '…하윤, 사실 물어보고 싶은 게 있어.\n그런데 아직은 말을 못 하겠어.' },
      { who: 'letter', text: '꽃님이는 내 평생 친구란다.\n그 정원에 웃음이 돌아왔다면, 다음은 바닷가 축제 마당이야.' },
      { who: 'juni', text: '누나! 해변에 축제 마당 만든대요!\n강 선생님도 보신대요!' }
    ],
    // ---- 5 반짝 해변 ----
    r5_open: [
      { who: 'hayun', text: '여기가 반짝 해변…\n모래에 반짝이가 섞여 있어.' },
      { who: 'kang', text: '…자네가 윤해 씨 손녀로군.\n나는 강이라 하네. 옛 등대지기일세.' },
      { who: 'kang', text: '축제엔 불빛이 있어야지.\n이 등 공방 상자를 쓰게.' },
      { who: 'mongdol', face: 'joy', text: '뀨뀨!\n(상자 냄새를 킁킁)' }
    ],
    r5_hut: [
      { who: 'kang', text: '…폭풍 날 밤, 나는 등대에 있었네.' },
      { who: 'kang', text: '바람에 렌즈가 깨지고 불이 꺼졌지.\n그 밤 배 몇 척이 길을 잃었어.' },
      { who: 'kang', text: '그 뒤로 등대에 오르지 못했네.\n내 탓이라서.' },
      { who: 'hayun', text: '선생님 탓이 아니에요.\n…같이 다시 켜요, 등대.' }
    ],
    r5_cloth: [
      { who: 'rua', text: '하윤, 이 편지 봐 줄래?\n우리 할머니가 평생 간직하던 거야.' },
      { who: 'hayun', face: 'wow', text: '이 글씨… 우리 할머니 글씨예요!' },
      { who: 'rua', face: 'joy', text: '응. 우리 할머니랑 윤해 할머니는\n오십 년 동안 편지를 나눈 친구였대.' },
      { who: 'rua', text: '그래서 왔어. 편지 속 섬을\n내 눈으로 보고 그리고 싶어서.' }
    ],
    r5_done: [
      { who: 'mina', face: 'joy', text: '축제 마당 완성!\n떡이랑 차는 내가 맡을게!' },
      { who: 'dochi', text: '…배는 내가 띄우겠소.' },
      { who: 'kang', text: '이제 남은 건 하나뿐이로군.\n등대곶으로 가세.' },
      { who: 'letter', text: '하윤아, 강 선생은 오래 혼자 아파했단다.\n등대에 같이 올라 주렴.' }
    ],
    // ---- 6 등대곶 ----
    r6_open: [
      { who: 'hayun', text: '등대곶…\n가까이서 보니 정말 크다.' },
      { who: 'kang', text: '길도 울타리도 다 무너졌구먼.\n하나씩 하세. 천천히.' },
      { who: 'juni', text: '저도 도울게요!\n자전거로 짐 나를게요!' },
      { who: 'mongdol', face: 'joy', text: '뀨!' }
    ],
    r6_hut: [
      { who: 'kang', text: '내가 살던 오두막일세.\n…창문에 윤해 씨 쪽지가 꽂혀 있구먼.' },
      { who: 'letter', text: '강 선생님, 불은 다시 켜면 돼요.\n사람도 그래요. —윤해' },
      { who: 'kang', face: 'joy', text: '…허허. 그 사람답구먼.' }
    ],
    r6_bell: [
      { who: 'hayun', face: 'joy', text: '종이 다시 울려요!\n땡— 땡—' },
      { who: 'dochi', text: '…포구까지 들리오.\n오랜만이구먼, 이 소리.' },
      { who: 'kang', text: '이제 렌즈만 있으면 되네.\n가장 밝은 불빛이 필요하지.' }
    ],
    r6_done: [
      { who: 'kang', face: 'joy', text: '불이… 켜졌네.\n등대에 다시 불이 켜졌어!' },
      { who: 'hayun', face: 'wow', text: '바다 저 멀리…\n배들이 이쪽으로 오고 있어요!' },
      { who: 'mina', face: 'joy', text: '떠났던 사람들이야!\n등불을 보고 돌아오는 거야!' }
    ],
    ending: [
      { who: 'hayun', pic: 'story_ending', text: '그날 밤, 소라섬 바다에 등불이 가득 떠올랐다.' },
      { who: 'kkotnim', face: 'joy', pic: 'story_ending', text: '첫 등불 바다 축제구먼.\n윤해가 꼭 보고 싶어 하던 밤이여.' },
      { who: 'juni', face: 'joy', pic: 'story_ending', text: '누나! 우체국에 마지막 편지가 있었어요.\n등대에 불이 켜지면 주라고요!' },
      { who: 'letter', pic: 'story_ending', text: '하윤아, 등대 불빛이 보이니?\n이제 이곳은 네 집이야.' },
      { who: 'letter', pic: 'story_ending', text: '네가 돌아와 줘서, 섬 사람들이 다시 모였구나.\n고맙다. 사랑한다. —할머니 윤해' },
      { who: 'hayun', face: 'joy', pic: 'story_ending', text: '할머니, 저 여기 남을게요.\n바다별채 주인으로.' },
      { who: 'mongdol', face: 'joy', pic: 'story_ending', text: '뀨우~!\n(끝 · 그래도 부탁과 이벤트는 계속돼요)' }
    ]
  };

  // 하윤의 짧은 도움말 (아래 정보 칸 · 아무것도 안 골랐을 때)
  const TIPS = [
    '같은 물건 두 개를 끌어다 겹치면 더 좋은 물건이 돼요!',
    '바구니·절구·항아리를 톡 해서 고르고, 한 번 더 톡 하면 물건이 나와요. 기운이 1 들어요.',
    '부탁 카드에 초록 체크가 뜨면 [건네기]를 눌러요.',
    '하나 톡, 같은 것 톡 — 끌지 않아도 합쳐져요.',
    '기운은 2분에 1씩 저절로 차요. 앱을 닫아도 차요.',
    '별이 모이면 [마을]에서 바다별채를 고칠 수 있어요.',
    '모래더미 옆에서 합치면 모래가 한 겹씩 벗겨져요.',
    '물건을 [가방] 버튼으로 끌어다 놓으면 가방에 들어가요.',
    '[마을]에서 반짝이는 곳을 톡 하면 할머니의 편지 조각이 숨어 있어요.',
    '☰ 메뉴에서 매일 출석 선물과 오늘의 부탁을 받아요.',
    '발생기를 고르고 [강화]하면 더 좋은 물건이 나와요.',
    '[상점]에서 매일 무료 선물을 받아요. 특가는 날마다 바뀌어요.',
    '판이 복잡하면 오른쪽 아래 🔨 자동 합치기! 부탁에 쓸 물건은 남겨 둬요.'
  ];

  const API = { CHAINS, GENS, VILLAGERS, AREAS, STORY_ORDERS, LETTERS, SECRETS, DAILY, EVENTS, EVENT_REF_MONDAY, EVENT_FROM_AREA, BOARD, BAL, SHOP, MUSIC, START, STORY, TIPS, TOWN, OUTFITS, OUTFIT_CATS, MONG_ACC, FRIEND, MIXES, SAVE_KEY: 'arichae_merge_v1', SYNC_KEY: 'arichae_merge_sync', VERSION: 6 };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MergeData = API;
})(typeof window !== 'undefined' ? window : globalThis);
