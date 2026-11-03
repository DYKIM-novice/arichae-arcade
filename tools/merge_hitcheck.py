"""머지관 판 칸 톡 점검 (배포 전 체크리스트 · 화면 크기별)

  python tools/merge_hitcheck.py                 # http://localhost:9432/static/merge.html (python -m http.server 9432)
  python tools/merge_hitcheck.py <주소>

- 폰처럼(터치 · is_mobile · 주소창 있는 높이) 340×600, 360×640, 378×660, 390×740, 412×915 와 '글씨 크게' 로 열어서
  판의 모든 칸 가운데(+ 아래쪽 네 귀퉁이 근처)를 elementFromPoint 로 찍어 그 칸이 맞는지 봐요 (다른 것이 덮으면 실패)
- 맨 아랫줄 발생기를 진짜 터치로 톡(고르기 · 기운 그대로) → 한 번 더 톡 → 기운이 줄어드는지도 봐요
- 되돌리기 단추 알림(팔기·자동 합치기 뒤)이 떠 있을 때와 사라진 뒤에도 판을 덮지 않는지
  (2026-11-03 '아랫줄 가운데 칸이 안 눌려요'의 진짜 원인 · release_checklist 17)
- 맨 아랫줄 7칸마다 특수 칸(선물 상자 열기!/기다림 · 보물 궤짝 열기!/기다림 · 거품 · 그물)을 놓고
  배지(☰·마을·가방·상점)와 알림(단추 알림·보통 알림)을 띄운 채 elementFromPoint + 진짜 터치 톡 →
  '열기!'는 한 번에 열림 · 기다림은 고르기+남은 시간 · 거품/그물은 고르기+안내 가 맞는지
- 판이 꽉 찼을 때 '열기!' → 하나는 제자리, 남는 물건은 가방 선물함 + 알림
- 충전 발생기(찻잎 선반·등 공방 상자)의 충전 테두리·남은 횟수/쉬는 시간 표시가 칸 안에만 있는지 (옆 칸으로 안 넘침 · 글자 안 잘림)
- 발생기 꾹 누르기(CDP 진짜 터치): 1.2초는 꺼내지 않음 · 3.2초는 연속 꺼내기(하나마다 기운 1 · 떼면 멈춤)
  · 끌면 취소 · 기운 2면 2개 후 알림(창 없음) · 빈 칸 2개면 2개 후 '꽉 차서 멈췄어요'
- 실패하면 덮은 요소를 알려 주고 종료 코드 1
"""
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:9432/static/merge.html"
SIZES = [(340, 600), (360, 640), (378, 660), (390, 740), (412, 915)]

CHECK = """() => {
  const cells = [...document.querySelectorAll('#board .cell')];
  const bad = [];
  cells.forEach((c, i) => {
    const r = c.getBoundingClientRect();
    for (const [fx, fy] of [[.5, .5], [.25, .85], [.75, .85], [.5, .15]]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      const e = document.elementFromPoint(x, y);
      if (!e || e.closest('.cell') !== c) {
        bad.push({ i, fx, fy, hit: e ? `${e.tagName}#${e.id}.${e.className}` + (e.parentElement ? ` < #${e.parentElement.id}.${e.parentElement.className}` : '') : null });
        break;
      }
    }
  });
  const b = document.getElementById('board').getBoundingClientRect(), w = document.getElementById('board-wrap').getBoundingClientRect(), f = document.getElementById('foot').getBoundingClientRect();
  return { n: cells.length, bad, boardBottom: Math.round(b.bottom), wrapBottom: Math.round(w.bottom), footTop: Math.round(f.top) };
}"""


def close_popups(page):
    # 첫 화면 시트(출석 등)·이야기 창을 닫아요
    for _ in range(6):
        if page.evaluate("() => !document.getElementById('sheet').classList.contains('hide')"):
            # 닫기 단추 → 없으면 바깥(시트 배경) 톡 (매일 선물 창의 '받기' 단추는 누르지 않아요)
            page.evaluate("() => { const b = document.querySelector('#sheet [data-close]'); if (b) b.click(); else document.getElementById('sheet').click(); }")
            page.wait_for_timeout(400)
            continue
        if page.evaluate("() => { const t = document.getElementById('talk'); return t && !t.classList.contains('hide'); }"):
            page.evaluate("() => { const s = document.querySelector('.talk-skip'); if (s) s.click(); else document.getElementById('talk').click(); }")
            page.wait_for_timeout(400)
            continue
        break


BADGES = """() => { [['menu-badge', '!'], ['town-badge', '!'], ['bag-badge', '3'], ['shop-badge', '!']].forEach(([id, t]) => {
  const b = document.getElementById(id); if (b) { b.classList.remove('hide'); if (!b.textContent) b.textContent = t; } }); }"""

# 특수 칸: [이름, 칸 만들기(JS 식 · now = Date.now()), 기대 동작]
SPECIALS = [
    ("선물상자 열기!", "{k:'box',b:'gift',open:now-1000}", "open"),
    ("선물상자 기다림", "{k:'box',b:'gift',open:now+240000}", "box-wait"),
    ("보물궤짝 열기!", "{k:'box',b:'chest',open:now-1000}", "open"),
    ("보물궤짝 기다림", "{k:'box',b:'chest',open:now+900000}", "box-wait"),
    ("거품", "{k:'bubble',c:'a',t:3,until:now+80000}", "sel:거품 속"),
    ("그물", "{k:'net',c:'a',t:2}", "sel:그물에 걸린"),
]

SETUP = """([i, make, toastKind]) => { const U = MergeUI, st = U.state, now = Date.now();
  if (!window.__b0) window.__b0 = JSON.stringify(st.board);
  const b0 = JSON.parse(window.__b0); st.board.splice(0, b0.length, ...b0);
  // 고른 칸 풀기: 덮이지 않은 빈 칸을 톡 (없으면 셋째 줄 가운데를 비워요)
  let e = st.board.findIndex((x, k) => !x && !(st.cover[k] > 0) && k < 49);
  if (e < 0) { e = 24; st.cover[e] = 0; st.board[e] = null; }
  U.renderAll(); U.tap(e);
  st.board[i] = (new Function('now', 'return ' + make))(now);
  U.renderAll();
  (""" + BADGES + """)();
  if (toastKind === 'undo') U.toast('모래알 팔았어요 (+1)', '되돌리기', () => {}); else U.toast('시험 알림 · 아랫줄 가운데 위');
  const c = U.cellEl(i), q = c.getBoundingClientRect(), bad = [];
  for (const [fx, fy] of [[.5, .5], [.5, .85], [.25, .85], [.75, .85], [.5, .15]]) {
    const h = document.elementFromPoint(q.left + q.width * fx, q.top + q.height * fy);
    if (!h || h.closest('.cell') !== c) bad.push({ fx, fy, hit: h ? `${h.tagName}#${h.id}.${h.className}` : null });
  }
  return { x: q.left + q.width / 2, y: q.top + q.height * .6, bad };
}"""

RESULT = """([i, want]) => { const st = MergeUI.state, c = st.board[i], it = MergeUI.itEl(i), info = document.getElementById('info').textContent;
  if (want === 'open') return !c || c.k !== 'box' ? true : `안 열림 (${info.slice(0, 30)})`;
  if (want === 'box-wait') return c && c.k === 'box' && it && it.classList.contains('sel') && /기다림/.test(info) && document.querySelector('#info .cd') ? true : `고르기·남은 시간 없음 (${info.slice(0, 30)})`;
  const word = want.slice(4);
  return c && it && it.classList.contains('sel') && info.indexOf(word) >= 0 ? true : `고르기·안내 없음 (${info.slice(0, 30)})`;
}"""


def popups_open(page):
    return page.evaluate("() => !document.getElementById('sheet').classList.contains('hide') || !document.getElementById('talk').classList.contains('hide') || !!document.querySelector('.ask')")


def special_checks(page):
    """맨 아랫줄 7칸 × 특수 칸 6종 · 배지·알림을 띄운 채 진짜 터치 톡 → 맞는 동작인지"""
    bad = []
    n = page.evaluate("() => document.querySelectorAll('#board .cell').length")
    for si, (name, make, want) in enumerate(SPECIALS):
        for ci, i in enumerate(range(n - 7, n)):
            if popups_open(page):
                close_popups(page)
                page.evaluate("() => { const a = document.querySelector('.ask'); if (a) a.remove(); }")
            toast_kind = "undo" if (si + ci) % 2 == 0 else "plain"   # 칸마다 두 알림을 번갈아
            r = page.evaluate(SETUP, [i, make, toast_kind])
            page.wait_for_timeout(120)
            page.touchscreen.tap(r["x"], r["y"])
            page.wait_for_timeout(260)
            got = page.evaluate(RESULT, [i, want])
            if r["bad"] or got is not True:
                bad.append({"칸": i, "종류": name, "알림": toast_kind, "덮음": r["bad"][:2], "동작": got})
    page.evaluate("() => { const b0 = JSON.parse(window.__b0); MergeUI.state.board.splice(0, b0.length, ...b0); MergeUI.renderAll(); }")
    return bad


def full_board_open(page):
    """판이 꽉 찼을 때 맨 아랫줄 가운데 '열기!' → 하나는 제자리, 나머지는 가방 선물함 + 알림"""
    page.evaluate("""() => { const U = MergeUI, st = U.state, n = st.board.length;
      window.__fb = JSON.stringify({ b: st.board, c: st.cover, g: st.gifts });
      for (let k = 0; k < n; k++) { st.cover[k] = 0; st.board[k] = { k: 'item', c: ['a', 'b', 'd'][k % 3], t: 1 + (k % 6) }; }
      st.board[n - 4] = { k: 'box', b: 'chest', open: Date.now() - 1000 }; U.renderAll(); }""")
    page.wait_for_timeout(150)
    t = page.evaluate("() => { const n = MergeUI.state.board.length, q = MergeUI.cellEl(n - 4).getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height * .6, g: MergeUI.state.gifts.length }; }")
    page.touchscreen.tap(t["x"], t["y"])
    page.wait_for_timeout(400)
    return page.evaluate("""(g0) => { const st = MergeUI.state, n = st.board.length, c = st.board[n - 4];
      const ok = !!c && c.k !== 'box' && st.gifts.length > g0 && /선물함/.test(document.getElementById('toast').textContent);
      const fb = JSON.parse(window.__fb); st.board.splice(0, n, ...fb.b); fb.c.forEach((v, k) => { st.cover[k] = v; }); st.gifts.splice(0, st.gifts.length, ...fb.g); MergeUI.renderAll();
      return ok; }""", t["g"])


HOLD_SETUP = """([gid, energy, free]) => { const U = MergeUI, st = U.state, n = st.board.length, g = n - 4;
  if (!window.__hb) window.__hb = JSON.stringify({ b: st.board, c: st.cover, e: st.energy });
  const hb = JSON.parse(window.__hb); st.board.splice(0, n, ...hb.b); hb.c.forEach((v, k) => { st.cover[k] = v; });
  // 고른 칸 풀기 (덮이지 않은 빈 칸 톡)
  let e = st.board.findIndex((x, k) => !x && !(st.cover[k] > 0) && k < n - 7);
  if (e < 0) { e = 24; st.cover[e] = 0; st.board[e] = null; }
  U.renderAll(); U.tap(e);
  st.board[g] = { k: 'gen', g: gid }; st.energy = energy; if (st.charge[gid]) st.charge[gid] = { n: 0, until: 0 };
  if (free != null) {   // 빈 칸을 free 개만 남기고 다 채워요 (판이 차면 멈추는지)
    let left = 0; for (let k = 0; k < n; k++) { st.cover[k] = 0; if (!st.board[k]) { if (left < free && k !== e) { left++; continue; } st.board[k] = { k: 'item', c: ['a', 'b', 'd'][k % 3], t: 1 + (k % 6) }; } }
  }
  U.renderAll();
  const q = U.cellEl(g).getBoundingClientRect();
  return { x: q.left + q.width / 2, y: q.top + q.height * .55, g, items: st.board.filter((x) => x && x.k === 'item').length };
}"""
HOLD_STATE = """() => { const st = MergeUI.state; return { e: st.energy, items: st.board.filter((x) => x && x.k === 'item').length, ring: !!document.querySelector('.hold-ring'),
  toast: document.getElementById('toast').classList.contains('on') ? document.getElementById('toast').textContent : '', sheet: !document.getElementById('sheet').classList.contains('hide') }; }"""


def touch(cdp, kind, x=0, y=0):
    cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [] if kind == "touchEnd" else [{"x": x, "y": y, "id": 1}]})


def hold_checks(page, cdp):
    """발생기 꾹 누르기: 짧게(1.2초)는 아무것도 · 3.2초는 연속 꺼내기(하나마다 기운 1, 손 떼면 멈춤) · 끌면 취소 · 기운/판이 다하면 부드럽게 멈춤"""
    bad = []
    gid = page.evaluate("() => Object.keys(MergeData.GENS).find((g) => !MergeData.GENS[g].charge && !MergeData.GENS[g].event)")
    close_popups(page)
    # 1) 1.2초만 누르면: 차오르는 테두리는 보이지만 꺼내지 않음 (뗄 때는 짧은 톡 = 고르기)
    s = page.evaluate(HOLD_SETUP, [gid, 50, None])
    touch(cdp, "touchStart", s["x"], s["y"]); page.wait_for_timeout(900)
    mid = page.evaluate(HOLD_STATE); page.wait_for_timeout(300); touch(cdp, "touchEnd"); page.wait_for_timeout(300)
    a = page.evaluate(HOLD_STATE)
    if not mid["ring"] or a["e"] != 50 or a["items"] != s["items"] or a["ring"]:
        bad.append({"꾹": "1.2초", "테두리": mid["ring"], "기운": a["e"], "물건": [s["items"], a["items"]]})
    # 2) 3.2초 누르면 연속 꺼내기 · 하나마다 기운 1 · 떼면 멈춤
    s = page.evaluate(HOLD_SETUP, [gid, 50, None])
    touch(cdp, "touchStart", s["x"], s["y"]); page.wait_for_timeout(3200)
    touch(cdp, "touchEnd"); page.wait_for_timeout(150)
    a = page.evaluate(HOLD_STATE); page.wait_for_timeout(900)
    b = page.evaluate(HOLD_STATE)
    made = a["items"] - s["items"]
    if made < 3 or 50 - a["e"] < 3 or b["e"] != a["e"] or b["ring"]:
        bad.append({"꾹": "3.2초", "꺼냄": made, "기운 씀": 50 - a["e"], "뗀 뒤 더": a["e"] - b["e"], "테두리 남음": b["ring"]})
    # 3) 누른 채 끌기 거리만큼 움직이면 꾹 누르기 취소 (기운 그대로)
    s = page.evaluate(HOLD_SETUP, [gid, 50, None])
    touch(cdp, "touchStart", s["x"], s["y"]); page.wait_for_timeout(300)
    touch(cdp, "touchMove", s["x"], s["y"] - 30); page.wait_for_timeout(2500)
    touch(cdp, "touchEnd"); page.wait_for_timeout(400)
    a = page.evaluate(HOLD_STATE)
    if a["e"] != 50 or a["ring"]:
        bad.append({"꾹": "끌기", "기운": a["e"], "테두리": a["ring"]})
    # 4) 기운이 2 뿐이면 2개 꺼내고 멈춤 · 창 대신 알림
    s = page.evaluate(HOLD_SETUP, [gid, 2, None])
    touch(cdp, "touchStart", s["x"], s["y"]); page.wait_for_timeout(3600)
    a = page.evaluate(HOLD_STATE); touch(cdp, "touchEnd"); page.wait_for_timeout(300)
    if a["items"] - s["items"] != 2 or a["e"] != 0 or a["sheet"] or "기운" not in a["toast"]:
        bad.append({"꾹": "기운 2", "꺼냄": a["items"] - s["items"], "기운": a["e"], "창": a["sheet"], "알림": a["toast"]})
    # 5) 빈 칸이 2개뿐이면 2개 꺼내고 '꽉 차서 멈췄어요'
    s = page.evaluate(HOLD_SETUP, [gid, 50, 2])
    touch(cdp, "touchStart", s["x"], s["y"]); page.wait_for_timeout(3600)
    a = page.evaluate(HOLD_STATE); touch(cdp, "touchEnd"); page.wait_for_timeout(300)
    if a["items"] - s["items"] != 2 or "꽉" not in a["toast"]:
        bad.append({"꾹": "판 꽉", "꺼냄": a["items"] - s["items"], "알림": a["toast"]})
    page.evaluate("() => { const hb = JSON.parse(window.__hb), st = MergeUI.state; st.board.splice(0, st.board.length, ...hb.b); hb.c.forEach((v, k) => { st.cover[k] = v; }); st.energy = hb.e; MergeUI.renderAll(); }")
    close_popups(page)
    return bad


CHARGE_INSIDE = """() => { const U = MergeUI, st = U.state, n = st.board.length, bad = [];
  const gs = Object.keys(MergeData.GENS).filter((g) => MergeData.GENS[g].charge);
  const keep = JSON.stringify({ b: st.board, ch: st.charge });
  gs.forEach((gid, k) => {
    for (const rest of [false, true]) {
      const i = n - 7 + (k * 2 + (rest ? 1 : 0)) % 7;
      st.board[i] = { k: 'gen', g: gid }; st.charge[gid] = rest ? { n: 99, until: Date.now() + 599000 } : { n: 5, until: 0 };
      U.renderAll();
      const c = U.cellEl(i).getBoundingClientRect();
      for (const sel of ['.gring', '.gcharge']) {
        const e = U.cellEl(i).querySelector(sel); if (!e) { bad.push({ gid, rest, sel, why: '없음' }); continue; }
        const r = e.getBoundingClientRect();
        if (r.left < c.left - .5 || r.top < c.top - .5 || r.right > c.right + .5 || r.bottom > c.bottom + .5) bad.push({ gid, rest, sel, r: [r.left, r.top, r.right, r.bottom].map(Math.round), cell: [c.left, c.top, c.right, c.bottom].map(Math.round) });
        if (sel === '.gcharge' && e.scrollWidth > e.clientWidth + 1) bad.push({ gid, rest, sel, why: '글자 잘림', t: e.textContent });
      }
    }
  });
  const o = JSON.parse(keep); st.board.splice(0, n, ...o.b); st.charge = o.ch; U.renderAll();
  return bad;
}"""


def main():
    fails = 0
    with sync_playwright() as p:
        br = p.chromium.launch()
        for big in (False, True):
            for w, h in SIZES:
                ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=True, has_touch=True)
                page = ctx.new_page()
                page.goto(URL)
                page.wait_for_timeout(1500)
                close_popups(page)
                if big:
                    page.evaluate("() => { document.body.classList.add('big-text'); dispatchEvent(new Event('resize')); }")
                page.wait_for_timeout(500)
                r = page.evaluate(CHECK)
                # 맨 아랫줄 발생기 진짜 터치 톡 → 기운이 줄어요
                tap = page.evaluate("""() => { const cells = [...document.querySelectorAll('#board .cell')].slice(-7);
                  const c = cells.find((x) => x.querySelector('.it.gen')); if (!c) return null; const q = c.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height * .7 }; }""")
                tapped = None
                if tap:
                    # 첫 톡 = 고르기만 (기운 그대로) · 같은 발생기를 다시 톡 = 꺼내기 (기운이 줄어요)
                    page.wait_for_timeout(1500)   # 처음 몇 초 뒤 저절로 뜨는 매일 선물 창도 닫고 나서
                    close_popups(page)
                    e0 = page.evaluate("() => document.querySelector('#hud').textContent")
                    page.touchscreen.tap(tap["x"], tap["y"])
                    page.wait_for_timeout(450)
                    close_popups(page)
                    first_same = page.evaluate("() => document.querySelector('#hud').textContent") == e0
                    page.touchscreen.tap(tap["x"], tap["y"])
                    page.wait_for_timeout(500)
                    tapped = first_same and page.evaluate("() => document.querySelector('#hud').textContent") != e0
                # 되돌리기 단추 알림이 떠 있을 때 · 사라진 뒤(5초+)에도 판 칸을 덮지 않는지 (배지도 띄운 채)
                close_popups(page)
                page.evaluate(BADGES)
                page.evaluate("() => MergeUI.toast('모래알 팔았어요 (+1)', '되돌리기', () => {})")
                r_on = page.evaluate(CHECK)
                page.wait_for_timeout(5600)
                r_after = page.evaluate(CHECK)
                sp = special_checks(page)
                fb = full_board_open(page)
                cin = page.evaluate(CHARGE_INSIDE)
                hd = hold_checks(page, ctx.new_cdp_session(page))
                ok = r["n"] == 63 and not r["bad"] and tapped is not False and not r_on["bad"] and not r_after["bad"] and not sp and fb and not cin and not hd
                fails += not ok
                tag = f"{w}x{h}{' 글씨크게' if big else ''}"
                print(f"{'OK ' if ok else 'BAD'} {tag:16s} 칸 {r['n']} · 가려진 칸 {len(r['bad'])} · 판 아래 {r['boardBottom']} / 판 칸 아래 {r['wrapBottom']} / 아래 칸 위 {r['footTop']} · 아랫줄 발생기 톡 {tapped}")
                print(f"     되돌리기 알림 중 가려진 칸 {len(r_on['bad'])} · 사라진 뒤 {len(r_after['bad'])} · 아랫줄 특수 칸 {len(SPECIALS) * 7 - len(sp)}/{len(SPECIALS) * 7} · 꽉 찬 판 열기 {fb}")
                print(f"     충전 표시 칸 밖 {len(cin)} · 꾹 누르기 실패 {len(hd)}")
                for b in r["bad"][:5] + r_on["bad"][:3] + r_after["bad"][:3] + sp[:6] + cin[:4] + hd:
                    print("     ", b)
                ctx.close()
        br.close()
    print("모두 통과" if not fails else f"실패 {fails}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
