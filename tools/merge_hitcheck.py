"""머지관 판 칸 톡 점검 (배포 전 체크리스트 · 화면 크기별)

  python tools/merge_hitcheck.py                 # http://localhost:9432/static/merge.html (python -m http.server 9432)
  python tools/merge_hitcheck.py <주소>

- 폰처럼(터치 · is_mobile · 주소창 있는 높이) 340×600, 360×640, 378×660, 390×740, 412×915 와 '글씨 크게' 로 열어서
  판의 모든 칸 가운데(+ 아래쪽 네 귀퉁이 근처)를 elementFromPoint 로 찍어 그 칸이 맞는지 봐요 (다른 것이 덮으면 실패)
- 맨 아랫줄 발생기를 진짜 터치로 톡 → 기운이 줄어드는지도 봐요
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
            page.evaluate("() => { const b = document.querySelector('#sheet [data-close]') || document.querySelector('#sheet .btn'); if (b) b.click(); else document.getElementById('sheet').click(); }")
            page.wait_for_timeout(400)
            continue
        if page.evaluate("() => { const t = document.getElementById('talk'); return t && !t.classList.contains('hide'); }"):
            page.evaluate("() => { const s = document.querySelector('.talk-skip'); if (s) s.click(); else document.getElementById('talk').click(); }")
            page.wait_for_timeout(400)
            continue
        break


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
                    e0 = page.evaluate("() => document.querySelector('#hud').textContent")
                    page.touchscreen.tap(tap["x"], tap["y"])
                    page.wait_for_timeout(500)
                    tapped = page.evaluate("() => document.querySelector('#hud').textContent") != e0
                ok = r["n"] == 63 and not r["bad"] and tapped is not False
                fails += not ok
                tag = f"{w}x{h}{' 글씨크게' if big else ''}"
                print(f"{'OK ' if ok else 'BAD'} {tag:16s} 칸 {r['n']} · 가려진 칸 {len(r['bad'])} · 판 아래 {r['boardBottom']} / 판 칸 아래 {r['wrapBottom']} / 아래 칸 위 {r['footTop']} · 아랫줄 발생기 톡 {tapped}")
                for b in r["bad"][:5]:
                    print("     ", b)
                ctx.close()
        br.close()
    print("모두 통과" if not fails else f"실패 {fails}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
