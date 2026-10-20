/* 아리채 오락실 · 장기 따라하기 (좌표는 [줄, 칸], 줄 0 = 맨 위 한 쪽 · 칸 0 = 왼쪽)
   setup: 초(아래·내 말) / 한(위) 말 목록 [말, 줄, 칸]  ·  expect·reply: [[출발 줄, 칸], [도착 줄, 칸]] */
(function () {
  'use strict';
  const B = window.Boards;
  const R = window.BoardRules.janggi;
  const at = ([r, c]) => r * R.W + c;
  const mv = (x) => [at(x[0]), at(x[1])];

  B.guides.janggi = [
    {
      title: '1. 차(車) — 가장 센 말',
      setup: { cho: [['K', 8, 4], ['R', 9, 0]], han: [['K', 1, 4], ['A', 0, 3], ['H', 4, 0], ['C', 4, 8]] },
      steps: [
        { say: '차는 <b>가로·세로로 쭉</b> 갈 수 있어요. 위로 올라가서 한의 마(馬)를 잡아 보세요!', expect: [[[9, 0], [4, 0]]], show: true,
          wrong: '왼쪽 아래 차(車)를 누르고, 같은 줄 위쪽의 마(馬)를 눌러요.', reply: [[0, 3], [1, 3]],
          done: '잡았어요! 차는 13점짜리 가장 센 말이에요.' },
        { say: '이번엔 <b>옆으로!</b> 같은 줄 오른쪽 끝의 포(包)를 잡아요.', expect: [[[4, 0], [4, 8]]], show: true,
          done: '차는 가는 길만 비어 있으면 아무리 멀어도 한 번에 가요. 궁성에서는 대각선 선을 따라서도 움직여요.' }
      ]
    },
    {
      title: '2. 포(包) — 뛰어넘기',
      setup: { cho: [['K', 8, 4], ['C', 7, 1], ['P', 5, 1]], han: [['K', 1, 4], ['H', 2, 1], ['A', 2, 5], ['R', 2, 7]] },
      steps: [
        { say: '포는 <b>말 하나를 꼭 뛰어넘어야</b> 움직여요. 앞의 졸을 다리 삼아 넘어서, 한의 마(馬)를 잡아요!', expect: [[[7, 1], [2, 1]]], show: true,
          wrong: '포(包)를 누르고, 졸(卒)을 넘어 그 위의 마(馬)를 눌러요.', reply: [[1, 4], [0, 4]],
          done: '잘했어요! 다리가 없으면 포는 한 칸도 못 가요.' },
        { say: '<b>상대 말도 다리</b>가 될 수 있어요. 오른쪽의 사(士)를 넘어서 차(車)를 잡아요!', expect: [[[2, 1], [2, 7]]], show: true,
          done: '포 규칙 하나 더: 포는 <b>포를 넘을 수 없고, 포를 잡을 수도 없어요.</b>' }
      ]
    },
    {
      title: '3. 마(馬) — 날 일(日) 자',
      setup: { cho: [['K', 8, 4], ['H', 9, 1]], han: [['K', 1, 4], ['E', 7, 2], ['C', 5, 3]] },
      steps: [
        { say: '마는 <b>곧게 한 칸 + 대각선 한 칸</b> 가요. 한의 상(象)을 잡아 보세요!', expect: [[[9, 1], [7, 2]]], show: true,
          wrong: '마(馬)를 누르면 갈 수 있는 곳에 점이 보여요. 상(象)이 있는 곳을 찾아요.', reply: [[1, 4], [0, 4]],
          done: '잡았어요! 이렇게 움직이는 모양이 날 일(日) 자를 닮았어요.' },
        { say: '한 번 더! 이번엔 포(包)를 잡아요.', expect: [[[7, 2], [5, 3]]], show: true,
          done: '조심! 마가 <b>곧게 갈 첫 자리가 막혀 있으면 못 가요</b>. 이걸 "멱이 막혔다"고 해요.' }
      ]
    },
    {
      title: '4. 상(象) — 멀리 뛰기',
      setup: { cho: [['K', 8, 4], ['E', 9, 2]], han: [['K', 1, 4], ['H', 6, 0], ['C', 3, 2]] },
      steps: [
        { say: '상은 <b>곧게 한 칸 + 대각선 두 칸</b> 가요. 왼쪽 위의 마(馬)를 잡아요!', expect: [[[9, 2], [6, 0]]], show: true,
          wrong: '상(象)을 누르고 점이 보이는 곳 가운데 마(馬)가 있는 곳을 눌러요.', reply: [[1, 4], [0, 4]],
          done: '잡았어요! 상은 마보다 멀리 가요.' },
        { say: '이번엔 위로 한 칸 + 대각선 두 칸! 위쪽 포(包)를 잡아요.', expect: [[[6, 0], [3, 2]]], show: true,
          done: '상은 <b>지나가는 자리 두 곳</b> 중 하나라도 막히면 못 가요.' }
      ]
    },
    {
      title: '5. 졸(卒) — 앞으로 앞으로',
      setup: { cho: [['K', 8, 4], ['P', 3, 3]], han: [['K', 0, 5], ['A', 2, 3], ['A', 1, 4]] },
      steps: [
        { say: '졸은 <b>앞이나 옆으로 한 칸</b>씩 가요(뒤로는 못 가요). 바로 앞의 사(士)를 잡아요!', expect: [[[3, 3], [2, 3]]], show: true,
          reply: [[0, 5], [0, 4]], done: '졸이 상대 궁성에 들어왔어요!' },
        { say: '<b>상대 궁성 안에서는 대각선 선을 따라 앞으로</b>도 갈 수 있어요. 가운데 사(士)를 잡아요!', expect: [[[2, 3], [1, 4]]], show: true,
          done: '장군! 졸 하나도 궁 바로 앞에 오면 무서워요.' }
      ]
    },
    {
      title: '6. 장군! 멍군!',
      setup: { cho: [['K', 8, 4], ['A', 9, 3], ['A', 9, 5], ['R', 9, 8]], han: [['K', 1, 4], ['R', 8, 0]] },
      steps: [
        { say: '<b>장군!</b> 한의 차(車)가 내 궁을 노려요. 궁을 피하거나, 사이를 막거나, 차를 잡아야 해요. 어떻게든 막아 보세요!', expect: 'any',
          done: '<b>멍군!</b> 장군을 받으면 꼭 피해야 해요. 못 피하면 지는 거예요.' }
      ]
    },
    {
      title: '7. 외통수로 이기기',
      setup: { cho: [['K', 8, 3], ['R', 5, 4], ['P', 2, 4]], han: [['K', 0, 4]] },
      steps: [
        { say: '마지막! 졸을 궁 앞으로 올리면, 뒤에서 차가 받쳐 줘서 궁이 졸을 잡을 수 없어요. <b>외통수</b>를 둬 보세요!', expect: [[[2, 4], [1, 4]]], show: true,
          done: '<b>외통!</b> 궁이 갈 곳이 모두 막혔어요. 이렇게 상대 궁을 꼼짝 못 하게 하면 이겨요!' }
      ]
    }
  ];

  const def = B.get('janggi');
  if (def) {
    def.guideKit = {
      seat: () => 0,
      state(lesson) {
        const b = new Array(R.W * R.H).fill('');
        lesson.setup.cho.forEach(([k, r, c]) => { b[r * R.W + c] = k; });
        lesson.setup.han.forEach(([k, r, c]) => { b[r * R.W + c] = k.toLowerCase(); });
        return { b, turn: 0, phase: 'play', setups: [0, 0], n: 0, quiet: 0, last: null, cap: '', passes: 0, escaped: false };
      },
      expect: (step) => step.expect.map(mv),
      reply: (step) => mv(step.reply),
      play(st, m) {
        if (!R.legalMoves(st).some((x) => x[0] === m[0] && x[1] === m[1])) return null;
        const nx = R.play(st, m);
        // 따라하기에서는 수 제한·점수 승부가 없어요
        nx.n = 0; nx.quiet = 0;
        return nx;
      }
    };
  }
})();
