/* 아리채 오락실 · 라이어 게임 (바보 모드) 화면
   - 위: 지금 할 일 + 남은 시간 막대
   - 내 제시어 (눌러서 숨기기/보이기)
   - 사람들 (말하는 차례 · 확인/투표 했나)
   - 설명·토론 말풍선 (글로 할 때)
   - 아래: 지금 할 수 있는 버튼 (다 말했어요 · 글쓰기 · 투표 · 라이어 정답 고르기)
   서버(partygames/liar.py)가 차례·투표·점수를 정해요. 라이어가 누구인지는 결과 때까지 아무 화면에도 안 와요 */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SEC = { look: 25, discuss: 60, vote: 30, guess: 25, result: 9 };

  function mount(el, api) {
    el.innerHTML = `<div class="lr">
      <div class="lr-top"><div class="lr-title"></div><div class="lr-bar"><i></i></div></div>
      <button type="button" class="lr-word"></button>
      <div class="lr-people"></div>
      <div class="lr-feed"></div>
      <div class="lr-act"></div>
      <div class="lr-over"></div>
    </div>`;
    const $ = (s) => el.querySelector(s);
    let v = null; let actKey = ''; let hideWord = false; let flipped = false; let lastFeed = 0; let lastSpeaker = -2; let overKey = '';
    let myVote = null;

    const nm = (i) => esc(api.seat(i).name);
    const av = (i) => api.seat(i).av;
    const isMe = (i) => v && v.me === i;

    function title() {
      const ph = v.phase;
      if (ph === 'look') return `${v.round}/${v.rounds}판 · 내 제시어를 몰래 확인해요`;
      if (ph === 'talk') {
        const lap = Math.floor(v.turn / v.order.length) + 1;
        return isMe(v.speaker) ? `<b class="lr-hot">내 차례!</b> 제시어를 한 마디로 설명해요 · ${lap}/${v.laps}바퀴`
          : `<span class="av">${av(v.speaker)}</span> <b>${nm(v.speaker)}</b> 차례 · ${lap}/${v.laps}바퀴`;
      }
      if (ph === 'discuss') return v.talk === 'text' ? '토론 시간! 누가 이상했나 이야기해요' : '토론 시간! 누가 이상했는지 말로 이야기해요';
      if (ph === 'vote') return v.revote ? '동점! 동점인 사람 가운데에서 다시 투표해요' : '라이어라고 생각하는 사람을 골라요';
      if (ph === 'guess') return v.liar === v.me ? '<b class="lr-hot">들켰어요!</b> 사실 내가 라이어였어요' : `라이어 <b>${nm(v.liar)}</b>, 마지막 기회!`;
      if (ph === 'result') return '결과';
      return '';
    }

    function drawWord() {
      const w = $('.lr-word');
      if (v.me == null) { w.innerHTML = `<span>주제 <b>${esc(v.topic)}</b></span><span class="lr-wv">구경 중</span>`; return; }
      w.innerHTML = `<span>주제 <b>${esc(v.topic)}</b></span><span class="lr-wv${hideWord ? ' hid' : ''}">${hideWord ? '눌러서 보기 👀' : `내 제시어 <b>${esc(v.word)}</b>`}</span>`;
    }

    function drawPeople() {
      const out = [];
      for (const i of v.order) {
        const s = api.seat(i);
        let st = '';
        if (v.phase === 'look' || v.phase === 'discuss') st = v.ready[i] ? '✓' : '';
        if (v.phase === 'vote') st = v.voted[i] ? '✓' : '…';
        const speaking = v.phase === 'talk' && v.speaker === i;
        const caught = v.caught === i && (v.phase === 'guess' || v.phase === 'result');
        out.push(`<div class="lr-p${speaking ? ' talk' : ''}${s.me ? ' me' : ''}${caught ? ' caught' : ''}${s.off ? ' off' : ''}"><span class="av">${s.av}</span>
          <span class="lr-pn">${esc(s.name)}</span><span class="lr-ps">${st}</span><b class="lr-sc">${v.score[i]}</b></div>`);
      }
      $('.lr-people').innerHTML = out.join('');
    }

    function drawFeed() {
      const f = v.feed || [];
      const box = $('.lr-feed');
      if (!f.length) {
        box.innerHTML = `<div class="lr-empty">${v.talk === 'text' ? '설명이 여기에 차례대로 쌓여요' : '모여서 말로 설명해요. 말한 사람은 [다 말했어요]를 눌러요'}</div>`;
        lastFeed = 0; return;
      }
      box.innerHTML = f.map((m) => {
        if (m.s < 0) return `<div class="lr-sys">${esc(m.t)}</div>`;
        const mine = isMe(m.s);
        const txt = m.k === 'skip' ? '<i>(시간이 지났어요)</i>' : m.t ? esc(m.t) : '<i>말로 설명했어요 🗣</i>';
        return `<div class="lr-msg${mine ? ' mine' : ''}${m.k === 'chat' ? ' chat' : ''}"><span class="av">${av(m.s)}</span><div><small>${nm(m.s)}</small><p>${txt}</p></div></div>`;
      }).join('');
      if (f.length !== lastFeed) { box.scrollTop = box.scrollHeight; lastFeed = f.length; }
    }

    // 아래 버튼: 바뀔 때만 다시 그려요 (쓰던 글이 지워지지 않게)
    function drawAct() {
      const me = v.me;
      const ph = v.phase;
      let key = ph; let html = '';
      if (me == null) { key = 'watch'; html = '<div class="lr-hint">구경하는 중이에요</div>'; }
      else if (ph === 'look') {
        key += v.ready[me];
        html = v.ready[me] ? `<div class="lr-hint">다른 사람을 기다려요 (${v.ready.filter(Boolean).length}/${v.ready.length})</div>`
          : '<button type="button" class="btn btn-yellow lr-big" data-lr="ready">제시어 확인했어요</button>';
      } else if (ph === 'talk') {
        key += `${v.speaker}:${v.turn}`;
        if (v.speaker === me) {
          html = v.talk === 'text'
            ? '<form class="lr-form" data-lr-form="talk"><input class="lr-in" maxlength="30" placeholder="제시어를 한 줄로 설명해요 (제시어는 쓰면 안 돼요)" autocomplete="off" enterkeyhint="send"><button type="submit" class="btn btn-yellow">보내기</button></form>'
            : '<button type="button" class="btn btn-yellow lr-big" data-lr="talk">다 말했어요 🗣</button>';
        } else html = `<div class="lr-hint">${v.talk === 'text' ? `${nm(v.speaker)}님이 쓰는 중…` : `${nm(v.speaker)}님 말을 잘 들어요 👂`}</div>`;
      } else if (ph === 'discuss') {
        key += v.ready[me];
        const n = v.ready.filter(Boolean).length;
        html = (v.talk === 'text' ? '<form class="lr-form" data-lr-form="chat"><input class="lr-in" maxlength="40" placeholder="토론: 누가 이상했나요?" autocomplete="off" enterkeyhint="send"><button type="submit" class="btn btn-ghost">쓰기</button></form>' : '')
          + (v.ready[me] ? `<div class="lr-hint">투표 기다리는 중 (${n}/${v.ready.length})</div>` : `<button type="button" class="btn btn-yellow" data-lr="ready">투표하러 가기 (${n}/${v.ready.length})</button>`);
        key += n;
      } else if (ph === 'vote') {
        key += `${v.pool.join(',')}:${v.revote}:${myVote}`;
        html = `<div class="lr-votes">${v.pool.filter((i) => i !== me).map((i) => `<button type="button" class="lr-vb${myVote === i ? ' on' : ''}" data-vote="${i}"><span class="av">${av(i)}</span>${nm(i)}</button>`).join('')}</div>`
          + `<div class="lr-hint">${myVote != null ? '다시 누르면 바꿀 수 있어요' : '한 명을 눌러요'}</div>`;
        if (!v.pool.filter((i) => i !== me).length) html = '<div class="lr-hint">이번 투표는 다른 사람들이 해요</div>';
      } else if (ph === 'guess') {
        key += v.liar === me;
        html = v.liar === me
          ? `<div class="lr-hint">내 제시어 '<b>${esc(v.word)}</b>'는 가짜였어요. 진짜 제시어는?</div><div class="lr-opts">${(v.options || []).map((w) => `<button type="button" class="lr-ob" data-guess="${esc(w)}">${esc(w)}</button>`).join('')}</div>`
          : `<div class="lr-hint"><b>${nm(v.liar)}</b>님이 진짜 제시어를 맞히는 중… 맞히면 라이어가 이겨요!</div>`;
      } else { key = 'none'; html = ''; }
      if (key !== actKey) {
        actKey = key;
        $('.lr-act').innerHTML = html;
        const inp = $('.lr-in');
        if (inp && ph === 'talk') setTimeout(() => inp.focus(), 50);
      }
    }

    function drawOver() {
      const box = $('.lr-over');
      if (v.phase === 'look' && v.me != null && !v.ready[v.me]) {
        if (overKey !== 'look' + v.round) { overKey = 'look' + v.round; flipped = false; }
        box.innerHTML = `<div class="lr-card${flipped ? ' flip' : ''}" data-lr="flip">
            <div class="lr-face lr-back"><b class="disp">?</b><span>눌러서 몰래 보기</span><small>옆 사람이 못 보게!</small></div>
            <div class="lr-face lr-front"><span>주제: ${esc(v.topic)}</span><b class="disp">${esc(v.word)}</b><small>라이어는 비슷한 다른 단어를 받았어요.<br>내가 라이어일 수도 있어요!</small></div></div>
          <button type="button" class="btn btn-yellow lr-big" data-lr="ready" ${flipped ? '' : 'disabled'}>확인했어요</button>`;
        box.className = 'lr-over show';
        return;
      }
      if (v.phase === 'result' && v.outcome) {
        const o = v.outcome;
        const k = `res${v.round}`;
        if (overKey !== k) {
          overKey = k;
          const meLiar = v.me === o.liar;
          const won = v.me != null && (meLiar ? o.liarWin : !o.liarWin);
          api.sfx(won ? 'fanfare' : 'end'); if (won) api.vibrate([40, 30, 80]);
        }
        const tally = (o.tally || []).map((n, i) => n ? `<span class="lr-t"><span class="av">${av(i)}</span>${nm(i)} ${n}표</span>` : '').join('');
        box.innerHTML = `<div class="lr-res">
          <div class="lr-res-t disp">${o.liarWin ? '라이어 승리!' : '모두 승리!'}</div>
          <div class="lr-res-who"><span class="av">${av(o.liar)}</span><span><b>${nm(o.liar)}</b>님이 라이어였어요</span></div>
          <div class="lr-res-w"><span>모두의 제시어 <b>${esc(o.word)}</b></span><span>라이어의 제시어 <b>${esc(o.fake)}</b></span></div>
          <div class="lr-res-why">${esc(o.why)}${o.guess ? ` (고른 답: ${esc(o.guess)})` : ''}</div>
          ${tally ? `<div class="lr-tally">${tally}</div>` : ''}
          <div class="lr-gain">${o.gain.map((g, i) => g ? `<span>${nm(i)} +${g}</span>` : '').join('')}</div>
          <div class="hint-sm">${v.round < v.rounds ? '곧 다음 판' : '마지막 판이었어요!'}</div></div>`;
        box.className = 'lr-over show';
        return;
      }
      box.className = 'lr-over';
      overKey = overKey.startsWith('res') && v.phase !== 'result' ? '' : overKey;
    }

    function tick() {
      if (!v) return;
      const bar = $('.lr-bar i');
      const left = v.deadline ? Math.max(0, v.deadline - api.now()) : 0;
      const total = (v.phase === 'talk' ? (v.talk === 'text' ? 45 : 30) : SEC[v.phase] || 30) * 1000;
      bar.style.width = v.deadline ? `${Math.min(100, (left / total) * 100)}%` : '0%';
      bar.classList.toggle('low', left < 8000);
    }

    function render(view) {
      const prev = v;
      v = view;
      if (!prev || prev.round !== v.round) { myVote = null; hideWord = false; }
      if (v.phase !== 'vote') myVote = null;
      $('.lr-title').innerHTML = title();
      drawWord(); drawPeople(); drawFeed(); drawAct(); drawOver(); tick();
      if (v.phase === 'talk' && v.speaker !== lastSpeaker) {
        if (v.speaker === v.me) { api.sfx('soft'); api.vibrate([30, 40, 30]); }
        lastSpeaker = v.speaker;
      }
      if (prev && prev.phase !== v.phase && v.phase === 'vote') { api.sfx('whoosh'); api.vibrate(30); }
    }

    el.addEventListener('click', (e) => {
      const t = e.target;
      if (!v) return;
      if (t.closest('.lr-word')) { hideWord = !hideWord; drawWord(); return; }
      let b;
      if ((b = t.closest('[data-lr]'))) {
        const k = b.dataset.lr;
        if (k === 'flip') { flipped = !flipped; api.tick(); drawOver(); return; }
        if (b.disabled) return;
        if (k === 'ready') { api.act({ k: 'ready' }); api.sfx('pop'); return; }
        if (k === 'talk') { api.act({ k: 'talk' }); api.sfx('pop'); return; }
      }
      if ((b = t.closest('[data-vote]'))) { myVote = Number(b.dataset.vote); api.act({ k: 'vote', v: myVote }); api.tick(); drawAct(); return; }
      if ((b = t.closest('[data-guess]'))) { api.act({ k: 'guess', w: b.dataset.guess }); api.sfx('pop'); el.querySelectorAll('[data-guess]').forEach((x) => { x.disabled = true; }); b.classList.add('on'); }
    });
    el.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-lr-form]');
      if (!f) return;
      e.preventDefault();
      const inp = f.querySelector('.lr-in');
      const txt = inp.value.trim();
      if (!txt) return;
      api.act({ k: f.dataset.lrForm, t: txt });
      if (f.dataset.lrForm === 'chat') inp.value = '';
      api.sfx('pop');
    });

    return { render, tick, destroy() { el.innerHTML = ''; } };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#E8557A"/><circle cx="20" cy="17" r="9" fill="#FFE3EC"/><path d="M14 14 q3 -3 6 0 M20 14 q3 -3 6 0" stroke="#5B1A2E" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M16 21 q4 3 8 0" stroke="#5B1A2E" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M20 26 l0 6" stroke="#FFE3EC" stroke-width="2"/><text x="31" y="12" font-size="10" font-weight="900" fill="#FFD23F">?</text></svg>';

  C.register({
    id: 'liar',
    kind: 'table',
    icon: ICON,
    rulesText: '한 명만 비슷한 다른 제시어를 받아요 (자기가 라이어인 줄 몰라요!) · 돌아가며 한 마디씩 설명 · 투표로 라이어 찾기 · 잡힌 라이어가 진짜 제시어를 맞히면 역전',
    learn: '라이어 게임은 "말로 하는 추리 게임"이에요. 너무 자세히 말하면 라이어가 눈치채고, 너무 흐리게 말하면 내가 의심받아요. 그 줄타기가 재미예요!',
    optionsUI: [
      { key: 'talk', label: '설명 방식', names: { voice: '🗣 모여서 말로', text: '✍ 떨어져서 글로' } },
      { key: 'topic', label: '주제', names: { any: '아무거나', animal: '동물', food: '음식', fruit: '과일·채소', job: '직업', place: '장소', vehicle: '탈것', sport: '운동', thing: '물건' } },
      { key: 'rounds', label: '몇 판', names: { 1: '1판', 3: '3판', 5: '5판' } }
    ],
    bar(v) { return v.round ? `<span class="cd-info">${v.round}/${v.rounds}판</span><span class="cd-info">주제 <b>${esc(v.topic)}</b></span><span class="cd-info">${v.talk === 'text' ? '✍ 글로' : '🗣 말로'}</span>` : ''; },
    rankLabel(v, i) { return v && v.score ? `${v.score[i]}점` : ''; },
    mount
  });
})();
