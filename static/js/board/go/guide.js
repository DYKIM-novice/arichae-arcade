/* 아리채 오락실 · 바둑 따라하기 (9줄 판, 좌표는 [줄, 칸], 줄 0 = 맨 위)
   setup: black / white 돌 목록 · expect·reply: [줄, 칸] */
(function () {
  'use strict';
  const B = window.Boards;
  const R = window.BoardRules.go9;
  const N = R.N;
  const at = ([r, c]) => r * N + c;

  B.guides.go9 = [
    {
      title: '1. 돌 따내기',
      setup: { black: [[3, 4], [4, 3], [4, 5]], white: [[4, 4]] },
      steps: [
        { say: '돌 옆의 빈 점을 <b>숨(활로)</b>이라고 해요. 백 돌의 숨이 하나만 남았어요! 마지막 숨을 막아서 따내 보세요.', expect: [[5, 4]], show: true,
          wrong: '백 돌 바로 옆, 아직 비어 있는 곳을 찾아요.',
          done: '따냈어요! 숨이 모두 막힌 돌은 판에서 들어내요.' }
      ]
    },
    {
      title: '2. 단수! 도망가기',
      setup: { black: [[4, 4]], white: [[3, 4], [4, 3], [4, 5], [2, 2]] },
      steps: [
        { say: '이번엔 내 흑 돌이 숨 하나만 남았어요(<b>단수</b>). 그대로 두면 잡혀요. 남은 숨 쪽으로 늘어서 도망가요!', expect: [[5, 4]], show: true,
          wrong: '흑 돌의 숨이 남아 있는 쪽으로 이어서 둬요.',
          done: '살았어요! 돌을 이으면 숨이 늘어나요. 두 돌의 숨이 이제 3개예요.' }
      ]
    },
    {
      title: '3. 여러 돌 한꺼번에',
      setup: { black: [[3, 3], [3, 4], [4, 2], [4, 5], [5, 3]], white: [[4, 3], [4, 4]] },
      steps: [
        { say: '이어진 돌은 숨을 같이 써요. 백 두 점의 숨이 딱 하나! 한 번에 두 점을 따내요.', expect: [[5, 4]], show: true,
          wrong: '백 두 점을 둘러싼 빈 곳 가운데 하나만 남았어요. 찾아보세요!',
          done: '두 점을 따냈어요! 이어진 돌은 함께 살고 함께 잡혀요.' }
      ]
    },
    {
      title: '4. 두 눈이면 산다',
      setup: {
        black: [[7, 0], [7, 1], [7, 2], [7, 3], [8, 3]],
        white: [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 4], [8, 4], [3, 3]]
      },
      steps: [
        { say: '아래 귀의 흑이 백에게 둘러싸였어요. 안쪽 빈 곳 세 칸의 <b>가운데</b>에 두면 집이 두 개(두 눈)로 나뉘어요!', expect: [[8, 1]], show: true,
          wrong: '빈 곳 세 칸 가운데 정가운데를 눌러요.',
          done: '<b>두 눈</b>이 생겼어요! 백은 두 눈에 동시에 둘 수 없어서, 이 흑은 절대 잡히지 않아요.' }
      ]
    },
    {
      title: '5. 패 — 바로 되따내기 금지',
      setup: { black: [[3, 4], [4, 3], [5, 4], [1, 1]], white: [[3, 5], [4, 6], [5, 5], [4, 4], [7, 7]] },
      steps: [
        { say: '백 한 점이 단수예요. 따내 보세요!', expect: [[4, 5]], show: true, reply: [2, 7],
          done: '따냈어요! 그런데 이 모양에서 백이 <b>바로</b> 되따내면 끝없이 반복되겠죠? 그래서 바로 되따내기는 금지(<b>패</b>)예요. 백은 다른 곳에 한 수 뒀어요.' },
        { say: '이제 흑이 패를 끝낼 차례! 방금 백 돌을 따낸 자리를 메워서 이어요.', expect: [[4, 4]], show: true,
          done: '패를 이었어요. 패가 나면 "다른 곳의 큰 자리(팻감)"를 쓰는 머리싸움이 벌어져요.' }
      ]
    },
    {
      title: '6. 집 짓고 끝내기',
      setup: {
        black: [[0, 4], [1, 4], [2, 4], [3, 4], [5, 4], [6, 4], [7, 4], [8, 4]],
        white: [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5]]
      },
      steps: [
        { say: '흑은 왼쪽, 백은 오른쪽에 집을 지었어요. 흑 울타리에 <b>한 곳</b>이 비어 있어요. 막아서 집을 완성해요!', expect: [[4, 4]], show: true,
          done: '집 완성! 이제 둘 곳이 없으면 <b>패스</b>를 눌러요. 둘 다 패스하면 끝나고, <b>돌 + 둘러싼 빈 곳</b>이 많은 쪽이 이겨요. 나중에 두는 백에게는 덤 6.5집을 줘요.' }
      ]
    }
  ];

  const def = B.get('go9');
  if (def) {
    def.guideKit = {
      seat: () => 0,
      state(lesson) {
        const st = R.init();
        (lesson.setup.black || []).forEach((p) => { st.b[at(p)] = 1; });
        (lesson.setup.white || []).forEach((p) => { st.b[at(p)] = 2; });
        st.turn = 0;
        return st;
      },
      expect: (step) => step.expect.map(at),
      reply: (step) => at(step.reply),
      play(st, m) { return R.tryPlay(st, m) ? R.play(st, m) : null; }
    };
  }
})();
