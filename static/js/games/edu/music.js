/* 아리채 오락실 · 오르골 연주회 (음악관) — 초·중 (오락실의 오르골 리듬과 같은 게임)
   과학관·음악관 게임 — 방장이 고른 난이도로, 서버가 준 같은 시드로 가족 모두 같은 문제를 풀어요. */
(function () {
  'use strict';

  const G = window.Games;

  const music = {
    id: 'music', edu: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="16" width="30" height="19" rx="3" fill="#C98B4F"/><rect x="5" y="16" width="30" height="5" fill="#A86B35"/><path d="M7 16 L11 6 L33 6 L33 16" fill="#E0A868"/><circle cx="20" cy="27" r="3.4" fill="#FFE27A"/><path d="M35 24 h3 v5 h-3" fill="none" stroke="#FFE27A" stroke-width="2"/><path d="M14 4 v-2 M20 4 v-3 M26 4 v-2" stroke="#FFE7B0" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    hall: '음악관', title: '오르골 연주회', cat: '클래식 리듬', catColor: 'y', levels: ['e', 'm', 'h', 'x', 'z'],
    levelNames: { e: '하', m: '중', h: '상', x: '특상', z: '헬' },
    buttons: ['r', 'g', 'b'], music: false, pressSound: false,
    rules(lv) {
      if (lv === 'e') return ['음표가 선에 닿을 때 같은 줄 버튼!', '주제 → 변주(음표 두 배), 약 1분 30초', '낮은 음은 왼쪽, 높은 음은 오른쪽'];
      if (lv === 'h') return ['처음부터 음표가 두 배로 빨라요', '화음 음표는 두 줄을 동시에!', '"콤보!" 반박 음표가 왼·가운데·오른쪽으로 — 다 치면 보너스'];
      if (lv === 'x') return ['특상: 더 빠르고, 음표가 더 빨리 떨어져요', '화음이 마디마다 두 번! 두 줄을 동시에', '"콤보!" 지그재그·트릴이 자주 나와요 — 다 치면 보너스'];
      if (lv === 'z') return ['헬: 가장 빠르고, 음표가 가장 빨리 떨어져요', '박마다 화음 + 길고 촘촘한 "콤보!" 연타', '판정이 엄격해요 — 정확히 선에서!'];
      return ['음표가 선에 닿을 때 같은 줄 버튼!', '조금 빠르게, 변주는 높은 소리로 두 배', '가끔 "콤보!" 반박 음표 — 줄을 옮겨 가며 다 치면 보너스'];
    },
    illus() {
      return `<div class="il-row" style="gap:16px"><div style="width:84px;height:84px">${music.icon}</div>
        <div class="il-cap" style="text-align:left">♪ 환희의 송가 · 베토벤<br>♪ 작은 별 변주곡 · 모차르트<br>♪ 사계 · 비발디 …</div></div>`;
    },
    learn(lv, songId) {
      const song = (G.MUSIC_SONGS || []).find((x) => x.id === songId);
      if (song && song.fact) return song.fact;
      return lv === 'e'
        ? '오르골은 작은 쇠빗을 핀이 하나씩 튕겨서 소리를 내요. 낮은 음은 긴 빗살, 높은 음은 짧은 빗살! 오늘 연주한 곡들은 200~300년 전에 만들어진 클래식이에요.'
        : '베토벤은 귀가 거의 들리지 않게 된 뒤에 "환희의 송가"가 나오는 교향곡 9번을 완성했어요. 바흐는 "음악의 아버지", 모차르트는 다섯 살 때부터 작곡을 한 천재로 불려요.';
    },
    create(ctx) {
      const base = G.ALL.rhythm;
      const lv = ['e', 'm', 'h', 'x', 'z'].includes(ctx.level) ? ctx.level : 'm';
      return base.createWith(ctx, { speed: { e: 1, m: 1.1, h: 1.15, x: 1.2, z: 1.35 }[lv], long: true, songId: ctx.song, level: lv });
    }
  };

  G.register(music);
})();
