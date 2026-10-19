/* 아리채 오락실 · 보드게임 AI 워커 — AI 가 생각하는 동안 화면이 멈추지 않게 따로 계산해요
   받는 메시지: { id, game, scripts: [규칙 주소, AI 주소], moves, level, opts }
   보내는 메시지: { id, move, ms } */
'use strict';
const loaded = {};
self.onmessage = function (e) {
  const d = e.data || {};
  const t0 = Date.now();
  try {
    (d.scripts || []).forEach((src) => {
      if (!loaded[src]) { importScripts(src); loaded[src] = true; }
    });
    const ai = self.BoardAI && self.BoardAI[d.game];
    if (!ai) throw new Error('AI 없음: ' + d.game);
    const move = ai.choose(d.moves || [], d.level || 1, d.opts || {});
    self.postMessage({ id: d.id, move, ms: Date.now() - t0 });
  } catch (err) {
    self.postMessage({ id: d.id, error: String(err && err.message || err), ms: Date.now() - t0 });
  }
};
