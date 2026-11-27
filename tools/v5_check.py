#!/usr/bin/env python3
"""v5 추가 요청 검증: 배지·히어로카드·GM 엿보기/보드미리보기·프리액션·30초·딜러 크기/호흡·딜링 애니메이션"""
import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8902
SHOTS = os.path.join(ROOT, "screenshots")
os.makedirs(SHOTS, exist_ok=True)

RECTS_JS = """() => {
  const rr = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return {x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1), r:+b.right.toFixed(1), b:+b.bottom.toFixed(1)}; };
  const seats = [...document.querySelectorAll('.seat')].map(n => ({
    idx: n.dataset.idx,
    cards: rr(n.querySelector('.seat-cards')),
    av: rr(n.querySelector('.avatar')),
    badge: rr(n.querySelector('.badge')),
    box: rr(n)
  }));
  const normBadge = [...document.querySelectorAll('.badge')].find(b => !b.classList.contains('a-blind') && b.classList.contains('on'));
  return {
    vw: innerWidth, vh: innerHeight,
    table: rr(document.querySelector('#table-area')),
    dealerPic: rr(document.querySelector('#dealer-pic')),
    dealerTag: rr(document.querySelector('#dealer .dl-tag')),
    pot: rr(document.querySelector('#pot')),
    board: rr(document.querySelector('#board')),
    heroCards: rr(document.querySelector('#hero-cards')),
    heroPanel: rr(document.querySelector('#hero-panel')),
    bar: rr(document.querySelector('#action-bar')),
    seats: seats,
    badgeFont: normBadge ? getComputedStyle(normBadge).fontSize : getComputedStyle(document.querySelector('.badge')).fontSize,
    badgeH: normBadge ? +normBadge.getBoundingClientRect().height.toFixed(1) : 0,
    heroW: rr(document.querySelector('#hero-cards .card')).w,
    seatCardW: rr(document.querySelector('.seat .seat-cards .card')).w,
    avatarW: rr(document.querySelector('.seat .avatar')).w,
    dealerW: rr(document.querySelector('#dealer-pic')).w,
    preRowOn: document.querySelector('#pre-row').classList.contains('on'),
    preRowH: rr(document.querySelector('#pre-row')).h
  };
}"""

PRE_JS = """() => ({
  pre: App.preAction,
  rowOn: document.querySelector('#pre-row').classList.contains('on'),
  checkOn: document.querySelector('#pre-check').classList.contains('on'),
  callOn: document.querySelector('#pre-call').classList.contains('on'),
  checkTxt: document.querySelector('#pre-check').textContent,
  callTxt: document.querySelector('#pre-call').textContent,
  tt: document.querySelector('#tt-num').textContent,
  timerOn: document.querySelector('#turn-timer').classList.contains('on'),
  turnSec: App.runner ? App.runner.turnSeconds : null,
  acting: App.snap && App.snap.acting,
  toCall: App.options ? App.options.toCall : null,
  heroLast: App.snap && App.snap.seats[0] ? App.snap.seats[0].lastAction : null,
  waiting: document.querySelector('#action-bar').classList.contains('waiting'),
  waitText: document.querySelector('#wait-text').textContent,
  street: App.snap && App.snap.street
})"""


def ov(a, b):
    if not a or not b:
        return 0.0
    dx = min(a["r"], b["r"]) - max(a["x"], b["x"])
    dy = min(a["b"], b["b"]) - max(a["y"], b["y"])
    if dx <= 0 or dy <= 0:
        return 0.0
    return round(dx * dy, 1)


def overlap_report(m):
    out = {"dealer_vs_pot": ov(m["dealerPic"], m["pot"]),
           "dealer_vs_board": ov(m["dealerPic"], m["board"]),
           "dealerTag_vs_pot": ov(m["dealerTag"], m["pot"]),
           "dealer_vs_heroCards": ov(m["dealerPic"], m["heroCards"]),
           "board_vs_bar": ov(m["board"], m["bar"]),
           "hero_vs_bar": ov(m["heroCards"], m["bar"]),
           "bar_bottom_overflow": max(0.0, round(m["bar"]["b"] - m["vh"], 1))}
    worst, detail = 0.0, []
    for s in m["seats"]:
        for k in ("cards", "av", "badge"):
            o1, o2 = ov(m["dealerPic"], s[k]), ov(m["board"], s[k])
            if o1 or o2:
                detail.append({"seat": s["idx"], "part": k, "dealer": o1, "board": o2})
            worst = max(worst, o1, o2)
    out["seat_content_overlap_max"] = round(worst, 1)
    out["seat_content_overlap_detail"] = detail
    out["dealer_avatar_ratio"] = round((m["dealerW"] / m["avatarW"]) if m["avatarW"] else 0, 2)
    return out


async def my_turn(page):
    try:
        return await page.evaluate("() => !!(App.snap && App.snap.acting === 0 && App.options && !App.snap.result)")
    except Exception:
        return False


async def pump(page, ms=12000, cond_js=None, act=True):
    """cond_js 만족할 때까지 대기. 내 턴이면 체크/콜로 진행시켜 교착을 막는다."""
    t0 = time.time()
    while (time.time() - t0) * 1000 < ms:
        try:
            if cond_js and await page.evaluate(cond_js):
                return True
            if act and await my_turn(page):
                await page.click("#btn-call", timeout=1500)
        except Exception:
            pass
        await page.wait_for_timeout(110)
    return False


async def pre_action_when_waiting(page, kind, timeout=32000):
    """상대 턴(대기)일 때 실제 버튼을 눌러 프리액션을 예약한다. 내 턴이면 체크/콜로 진행."""
    t0 = time.time()
    while (time.time() - t0) * 1000 < timeout:
        if await my_turn(page):
            try:
                await page.click("#btn-call", timeout=1200)
            except Exception:
                pass
            await page.wait_for_timeout(120)
            continue
        r = await page.evaluate("""(k) => {
            const row = document.querySelector('#pre-row');
            const btn = document.querySelector(k === 'call' ? '#pre-call' : '#pre-check');
            const vis = row.classList.contains('on') && getComputedStyle(row).display !== 'none' && btn.getBoundingClientRect().height > 0;
            if (vis) btn.click();
            return {vis: vis, pre: App.preAction, acting: App.snap && App.snap.acting, waiting: document.querySelector('#action-bar').classList.contains('waiting')};
        }""", kind)
        if r["vis"] and r["pre"] == kind:
            await page.wait_for_timeout(160)
            return r
        await page.wait_for_timeout(130)
    return None


async def shot_when(page, sel, path, timeout_ms=45000, min_count=1):
    t0 = time.time()
    while (time.time() - t0) * 1000 < timeout_ms:
        n = await page.evaluate("(s) => document.querySelectorAll(s).length", sel)
        if n >= min_count:
            await page.screenshot(path=path)
            return n
        await page.wait_for_timeout(35)
    return 0


async def open_gm(page):
    await page.evaluate("""() => { const el = document.querySelector('#g-room'); for (let i = 0; i < 5; i++) el.click(); }""")
    await page.wait_for_selector("#modal-gm-pin.on", timeout=4000)
    await page.fill("#gm-pin", "7073")
    await page.click("#gm-pin-ok")
    await page.wait_for_selector("#modal-gm.on", timeout=4000)


async def badge_demo(page, name):
    """실제 엔진 좌석에 액션 배지를 세팅해 배지 크기/가독성을 촬영 (렌더링 검증용)"""
    await page.evaluate("""() => {
      const e = App.engine; if (!e) return;
      const acts = ['CHECK', 'CALL', 'RAISE', 'FOLD', 'ALL-IN'];
      for (let i = 1; i < e.seats.length; i++) e.seats[i].lastAction = acts[(i - 1) % acts.length];
      App.onSnapshot({});
    }""")
    await page.wait_for_timeout(350)
    await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-badges.png"))
    return await page.evaluate("""() => [...document.querySelectorAll('.seat .badge')].filter(b => b.classList.contains('on')).map(b => ({t: b.textContent, w: +b.getBoundingClientRect().width.toFixed(1), h: +b.getBoundingClientRect().height.toFixed(1), fs: getComputedStyle(b).fontSize}))""")


async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "www")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    report = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for (w, h, name) in [(760, 780, "fold7"), (390, 844, "phone")]:
                page = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
                errs = []
                page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
                page.on("console", lambda m: errs.append("CONSOLE: " + m.text) if m.type == "error" else None)
                await page.goto(f"http://127.0.0.1:{PORT}/index.html")
                await page.wait_for_timeout(900)
                await page.evaluate("() => { Progress.data.tutorialDone = true; Progress.save(); }")
                r = {"viewport": name, "size": f"{w}x{h}", "steps": {}}
                # --- 딜링 연출 캐치 (방 입장 직후 홀카드 딜)
                await page.click("#room-list .room-card")
                await page.evaluate("""() => {
                  window.__acts = []; window.__preLog = [];
                  const origAct = App.heroAction.bind(App);
                  App.heroAction = function (a, amt) { window.__acts.push({a: a, pre: this.preAction, opts: this.options ? this.options.toCall : null}); return origAct(a, amt); };
                  const origPre = App.runPreAction.bind(App);
                  App.runPreAction = function (opts) { const rep = origPre(opts); window.__preLog.push({toCall: opts ? opts.toCall : null, ran: rep}); return rep; };
                }""")
                nfly = await shot_when(page, ".deal-fly", os.path.join(SHOTS, f"v5-{name}-dealing-holes.png"), 6000)
                r["steps"]["deal_fly_nodes"] = nfly
                await page.wait_for_timeout(1400)
                await page.evaluate("() => View.revealHeroCards()")
                await page.wait_for_timeout(300)
                await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-table.png"))
                m = await page.evaluate(RECTS_JS)
                r["steps"]["turnSeconds_const"] = await page.evaluate("() => App.runner.turnSeconds")
                r["steps"]["deal_sleep_ms"] = "900/460 (game.js)"
                # --- 30초 타이머 (내 턴)
                got = await pump(page, 25000, "() => !!(App.snap && App.snap.acting === 0 && document.querySelector('#turn-timer').classList.contains('on'))", act=False)
                if got:
                    pre = await page.evaluate(PRE_JS)
                    r["steps"]["timer"] = {"text": pre["tt"], "turnSec": pre["turnSec"], "barOn": pre["timerOn"]}
                    await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-timer.png"))
                    await page.click("#btn-call")   # 진행
                else:
                    r["steps"]["timer"] = "no turn"
                await page.wait_for_timeout(600)

                # --- 프리액션 1: 상대 턴에 '미리 콜' 예약 → 내 턴 자동 콜
                hit = await pre_action_when_waiting(page, "call")
                if hit:
                    sel = await page.evaluate(PRE_JS)
                    r["steps"]["pre_row"] = {"rowOn": sel["rowOn"], "callOn": sel["callOn"], "label": sel["callTxt"], "pre": sel["pre"], "waitText": sel["waitText"]}
                    await page.evaluate("() => { window.__acts = []; window.__preLog = []; }")
                    await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-preaction-call.png"))
                    # 내 턴까지 기다리되 액션은 하지 않는다 (자동 실행 확인)
                    await pump(page, 30000, "() => !!(App.snap && App.snap.acting === 0)", act=False)
                    await page.wait_for_timeout(1200)
                    after = await page.evaluate(PRE_JS)
                    acts = await page.evaluate("() => window.__acts")
                    r["steps"]["pre_call_auto"] = {"heroLast": after["heroLast"], "pre": after["pre"], "toCall": after["toCall"], "acts": acts}
                    r["steps"]["pre_call_ok"] = any(str(a.get("a")).lower() in ("call", "check") and a.get("pre") is None for a in acts)
                else:
                    r["steps"]["pre_row"] = "no chance"

                # --- 프리액션 2: '미리 체크' 예약 → 내 턴에 자동 체크 또는 (레이즈 시) 안전 해제
                hit = await pre_action_when_waiting(page, "check")
                if hit:
                    sel = await page.evaluate(PRE_JS)
                    r["steps"]["pre_check_sel"] = {"on": sel["checkOn"], "label": sel["checkTxt"], "pre": sel["pre"]}
                    await page.evaluate("() => { window.__acts = []; window.__preLog = []; }")
                    await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-preaction-check.png"))
                    await pump(page, 30000, "() => !!(App.snap && App.snap.acting === 0)", act=False)
                    await page.wait_for_timeout(1200)
                    after = await page.evaluate(PRE_JS)
                    log = await page.evaluate("() => ({acts: window.__acts, pre: window.__preLog})")
                    r["steps"]["pre_check_auto"] = {"heroLast": after["heroLast"], "pre": after["pre"], "toCall": after["toCall"], "timerOn": after["timerOn"], "log": log}
                    # toCall>0 → 해제(ran=false) / toCall==0 → 자동 체크(ran=true + act check)
                    ok = False
                    for e in log["pre"]:
                        if (e["toCall"] or 0) > 0 and e["ran"] is False:
                            ok = True
                        elif (e["toCall"] or 0) == 0 and e["ran"] is True and any(str(a.get("a")).lower() == "check" and a.get("pre") is None for a in log["acts"]):
                            ok = True
                    r["steps"]["pre_check_ok"] = ok
                    if await my_turn(page):
                        try:
                            await page.click("#btn-call", timeout=3000)
                        except Exception:
                            pass
                else:
                    r["steps"]["pre_check_auto"] = "no chance"

                # --- GM: 엿보기 + 보드 미리보기
                await pump(page, 20000, "() => !!(App.snap && App.snap.acting != null && App.snap.acting !== 0)")
                try:
                    before = await page.evaluate("() => ({w: document.querySelector('.seat[data-idx=\"1\"] .seat-cards .card').getBoundingClientRect().width, h: document.querySelector('.seat[data-idx=\"1\"] .seat-cards').getBoundingClientRect().height})")
                    await open_gm(page)
                    r["steps"]["gm_panel"] = True
                    await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-gm-panel.png"))
                    await page.click("#gm-peek")
                    try:
                        await page.wait_for_function("() => !!(App.snap && App.snap.seats[1] && App.snap.seats[1].peek)", timeout=9000)
                    except Exception:
                        pass
                    await page.wait_for_timeout(450)
                    after = await page.evaluate("() => ({w: document.querySelector('.seat[data-idx=\"1\"] .seat-cards .card').getBoundingClientRect().width, h: document.querySelector('.seat[data-idx=\"1\"] .seat-cards').getBoundingClientRect().height, peek: App.gmPeek, cls: document.querySelector('.seat[data-idx=\"1\"] .seat-cards').className, peekHand: document.querySelector('.seat[data-idx=\"1\"] .peek-hand').textContent})")
                    r["steps"]["gm_peek"] = {"before": before, "after": after, "ratio": round(after["w"] / before["w"], 2) if before["w"] else 0}
                    await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-gm-panel-on.png"))
                    await page.click("#gm-board")
                    await page.wait_for_timeout(400)
                    bstate = await page.evaluate("""() => {
                      const e = App.engine; const n = 5 - e.board.length;
                      return { board: e.board.length, want: n, on: App.gmBoard,
                               deck: e.deck.slice(e.dealPtr, e.dealPtr+n).map(c => c.r + 's' + c.s),
                               ghosts: [...document.querySelectorAll('.board-slot .ghost-card')].map(c => (c.dataset.rank||'') + c.dataset.suit),
                               ghostSlots: document.querySelectorAll('.board-slot.has-ghost').length,
                               panelBtn: document.querySelector('#gm-board b').textContent };
                    }""")
                    r["steps"]["gm_board_preflop"] = bstate
                    await page.click("#modal-gm .close-modal")
                    await page.wait_for_timeout(350)
                    await page.evaluate("() => View.revealHeroCards()")
                    await page.wait_for_timeout(250)
                    await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-gm-peek-board.png"))
                    m2 = await page.evaluate(RECTS_JS)
                    r["overlap_gm"] = overlap_report(m2)

                    # 플랍 이후: 미리보기 2장 + 보드 딜링 연출
                    await pump(page, 30000, "() => !!(App.snap && App.snap.board.length >= 3)")
                    await page.wait_for_timeout(700)
                    b2 = await page.evaluate("""() => {
                      const e = App.engine; const n = 5 - e.board.length;
                      return { board: e.board.length, want: n, ghosts: [...document.querySelectorAll('.board-slot .ghost-card')].map(c => (c.dataset.rank||'') + c.dataset.suit), ghostSlots: document.querySelectorAll('.board-slot.has-ghost').length };
                    }""")
                    r["steps"]["gm_board_flop"] = b2
                    await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-gm-flop-preview.png"))
                    d_board = await shot_when(page, ".deal-fly", os.path.join(SHOTS, f"v5-{name}-dealing-board.png"), 40000)
                    r["steps"]["board_fly_nodes"] = d_board
                except Exception as e:
                    r["steps"]["gm"] = "FAIL:" + str(e)[:200]

                # --- 배지 렌더링 데모
                try:
                    r["steps"]["badge_demo"] = await badge_demo(page, name)
                except Exception as e:
                    r["steps"]["badge_demo"] = "FAIL:" + str(e)[:150]

                r["metrics"] = {"heroW": m["heroW"], "seatCardW": m["seatCardW"], "avatarW": m["avatarW"],
                                "dealerW": m["dealerW"], "badgeFont": m["badgeFont"], "badgeH": m["badgeH"],
                                "tableH": m["table"]["h"], "preRowH": m["preRowH"]}
                r["overlap"] = overlap_report(m)
                r["errors"] = errs[:20]
                r["error_count"] = len(errs)
                report.append(r)
                await page.close()

            # --- 9인 + GM 최악 케이스
            page = await b.new_page(viewport={"width": 412, "height": 915}, device_scale_factor=2)
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            await page.goto(f"http://127.0.0.1:{PORT}/index.html")
            await page.wait_for_timeout(900)
            await page.evaluate("() => { Progress.data.tutorialDone = true; Progress.save(); }")
            await page.click('#pane-single .size-btn[data-size="9"]')
            await page.wait_for_timeout(150)
            await page.click("#room-list .room-card")
            await page.wait_for_timeout(2400)
            await page.evaluate("() => View.revealHeroCards()")
            await open_gm(page)
            await page.click("#gm-peek")
            await page.click("#gm-board")
            await page.click("#modal-gm .close-modal")
            await page.wait_for_timeout(700)
            await page.evaluate("() => View.revealHeroCards()")
            m9 = await page.evaluate(RECTS_JS)
            r9 = {"viewport": "9max-412x915", "error_count": len(errs),
                  "metrics": {"heroW": m9["heroW"], "seatCardW": m9["seatCardW"], "dealerW": m9["dealerW"], "badgeFont": m9["badgeFont"]},
                  "overlap": overlap_report(m9),
                  "board_preview": await page.evaluate("""() => ({board: App.snap.board.length, ghosts: document.querySelectorAll('.board-slot .ghost-card').length, want: 5 - App.snap.board.length})"""),
                  "errors": errs[:10]}
            await page.screenshot(path=os.path.join(SHOTS, "v5-9max-gm.png"))
            await pump(page, 25000, "() => !!(App.snap && App.snap.board.length >= 3)")
            await page.wait_for_timeout(600)
            r9["board_after_flop"] = await page.evaluate("""() => ({board: App.snap.board.length, ghosts: document.querySelectorAll('.board-slot .ghost-card').length, want: 5 - App.snap.board.length, hasGhost: document.querySelectorAll('.board-slot.has-ghost').length})""")
            await page.screenshot(path=os.path.join(SHOTS, "v5-9max-gm-flop.png"))
            report.append(r9)
            await page.close()
            await b.close()
    finally:
        srv.terminate()
    print(json.dumps(report, ensure_ascii=False, indent=1))


asyncio.run(main())
