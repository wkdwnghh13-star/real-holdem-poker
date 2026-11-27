#!/usr/bin/env python3
"""v4 검증 (시나리오 선택: fold7 | phone | sizes | all)
   - 콘솔/페이지 에러 0
   - 좌석/딜러/보드/POT/히어로 잘림 0, 좌석-보드-딜러 겹침 0
   - 딜러 이미지 로드(10종) + 방마다 랜덤
   - GM(7073)+gmPeek ON → 상대 졸보 배지
   - 20초 타이머 + 자동 진행
"""
import asyncio, os, json, sys
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file://" + os.path.abspath(os.path.join(ROOT, "..", "..", "downloads", "holdem_poker_play.html"))
TMP = os.path.abspath(os.path.join(ROOT, "..", "..", "tmp"))

MEASURE = """() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1),
             r: +b.right.toFixed(1), b: +b.bottom.toFixed(1) }; };
  const q = (s) => document.querySelector(s);
  const seats = [...document.querySelectorAll('.seat')].map(el => ({
    idx: el.dataset.idx, seat: r(el), cards: r(el.querySelector('.seat-cards')),
    meta: r(el.querySelector('.seat-meta')),
    name: (el.querySelector('.nm') || {}).textContent,
    peek: (el.querySelector('.peek-hand.on') || {}).textContent || ''
  }));
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    area: r(q('#table-area')), board: r(q('#board')), pot: r(q('#pot')),
    dealer: r(q('#dealer')), dealerName: (q('#dealer-name') || {}).textContent,
    dealerImg: q('#dealer-pic') ? getComputedStyle(q('#dealer-pic')).backgroundImage.length : 0,
    dealerList: window.Dealers ? window.Dealers.list.length : 0,
    hero: r(q('#hero-panel')), bar: r(q('#action-bar')), topbar: r(q('.topbar')),
    seats, boardCards: q('#board') ? q('#board').querySelectorAll('.board-slot:not(.empty)').length : 0,
    timerOn: q('#turn-timer') ? q('#turn-timer').classList.contains('on') : false,
    timerNum: (q('#tt-num') || {}).textContent,
    timerW: q('#tt-fill') ? q('#tt-fill').style.width : '',
    street: window.App && App.snap ? App.snap.street : null,
    acting: window.App && App.snap ? App.snap.acting : null,
    turnSeconds: window.App && App.runner ? App.runner.turnSeconds : null,
    gmPeek: window.App ? App.gmPeek : null,
    heroFolded: window.App && App.snap ? App.snap.seats[0].folded : null,
    auto: window.App ? App.auto : null,
    running: window.App ? App.running : null,
    modals: [...document.querySelectorAll('.modal.on')].map(m => m.id)
  };
}"""


def clip_report(m):
    vw, vh = m["vw"], m["vh"]
    issues = []
    def chk(name, rect):
        if not rect:
            return
        if rect["x"] < -0.5 or rect["y"] < -0.5 or rect["r"] > vw + 0.5 or rect["b"] > vh + 0.5:
            issues.append("%s 화면 밖: %s (vw=%s vh=%s)" % (name, rect, vw, vh))
    for k in ("dealer", "hero", "bar", "topbar", "board", "pot"):
        chk(k, m[k])
    for s in m["seats"]:
        chk("seat#%s" % s["idx"], s["seat"])
        chk("seat#%s.cards" % s["idx"], s["cards"])
        chk("seat#%s.meta" % s["idx"], s["meta"])
    area = m["area"]
    for name in ("board", "pot"):
        r = m[name]
        if r and area and (r["x"] < area["x"] - 0.5 or r["r"] > area["r"] + 0.5 or r["y"] < area["y"] - 0.5 or r["b"] > area["b"] + 0.5):
            issues.append("%s 테이블 영역 밖: %s" % (name, r))
    # 좌석은 테이블 영역(#table-area, overflow:hidden) 안에 완전히 들어와야 한다
    if area:
        for s in m["seats"]:
            for key in ("seat", "cards", "meta"):
                r = s[key]
                if not r:
                    continue
                if r["y"] < area["y"] - 1.5 or r["x"] < area["x"] - 1.5 or r["r"] > area["r"] + 1.5 or r["b"] > area["b"] + 1.5:
                    issues.append("좌석#%s.%s 테이블 영역 밖: %s vs area %s" % (s["idx"], key, r, area))
    b = m["board"]
    if b:
        for s in m["seats"]:
            for key in ("cards", "seat"):
                r = s[key]
                if not r:
                    continue
                ox = min(r["r"], b["r"]) - max(r["x"], b["x"])
                oy = min(r["b"], b["b"]) - max(r["y"], b["y"])
                if ox > 2 and oy > 2:
                    issues.append("좌석#%s.%s ↔ 보드 겹침 %.0fx%.0fpx" % (s["idx"], key, ox, oy))
    d = m["dealer"]
    if d:
        for s in m["seats"]:
            r = s["seat"]
            if not r:
                continue
            ox = min(r["r"], d["r"]) - max(r["x"], d["x"])
            oy = min(r["b"], d["b"]) - max(r["y"], d["y"])
            if ox > 2 and oy > 2:
                issues.append("좌석#%s ↔ 딜러 겹침 %.0fx%.0fpx" % (s["idx"], ox, oy))
    return issues


async def scen_fold7(b, out):
    ctx = await b.new_context(viewport={"width": 760, "height": 780}, device_scale_factor=2)
    page = await ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append("CONSOLE " + m.type + ": " + m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
    await page.goto(URL)
    await page.wait_for_timeout(700)
    await page.click("#room-list .room-card")
    await page.wait_for_timeout(1400)
    m0 = await page.evaluate(MEASURE)
    out["fold7_initial"] = {"issues": clip_report(m0), "dealer": m0["dealerName"], "dealerImg": m0["dealerImg"],
                            "dealerList": m0["dealerList"], "turnSeconds": m0["turnSeconds"]}

    await page.evaluate("() => App.gmOpen()")
    await page.wait_for_timeout(300)
    await page.fill("#gm-pin", "7073")
    await page.click("#gm-pin-ok")
    await page.wait_for_timeout(400)
    await page.click("#gm-peek")
    await page.wait_for_timeout(200)
    out["gm_unlock"] = await page.evaluate("() => ({unlocked: App.gmUnlocked, peek: App.gmPeek, modal: document.querySelector('#modal-gm').classList.contains('on')})")
    await page.evaluate("() => document.querySelector('#modal-gm').classList.remove('on')")

    # 내 턴마다 콜/체크를 눌러 리버까지 진행
    ready = False
    m = m0
    for i in range(140):
        m = await page.evaluate(MEASURE)
        labels = [s["peek"] for s in m["seats"] if s["peek"]]
        if m["boardCards"] >= 5 and len(labels) >= 2 and not m["heroFolded"]:
            ready = True
            break
        await page.evaluate("""() => {
            const bar = document.querySelector('#action-bar');
            if (bar && !bar.classList.contains('waiting')) {
                const c = document.querySelector('#btn-call');
                if (c && !c.disabled) c.click();
            }
        }""")
        await page.wait_for_timeout(250)
    m = await page.evaluate(MEASURE)
    out["gm_hand"] = {"ready": ready, "street": m["street"], "boardCards": m["boardCards"], "peek": m["gmPeek"],
                      "labels": {s["idx"]: s["peek"] for s in m["seats"]}, "issues": clip_report(m),
                      "running": m["running"], "modals": m["modals"]}
    await page.wait_for_timeout(250)
    await page.screenshot(path=os.path.join(TMP, "holdem_v4_gm_hand.png"))

    # 내 턴 대기 → 타이머 (아무것도 누르지 않음)
    got = False
    for _ in range(80):
        m = await page.evaluate(MEASURE)
        if m["timerOn"]:
            got = True
            break
        await page.wait_for_timeout(300)
    t1 = await page.evaluate(MEASURE)
    await page.wait_for_timeout(2200)
    t2 = await page.evaluate(MEASURE)
    out["timer"] = {"turnSeen": got, "first": t1["timerNum"], "second": t2["timerNum"],
                    "width1": t1["timerW"], "width2": t2["timerW"], "on": t2["timerOn"],
                    "acting2": t2["acting"], "issues": clip_report(t2)}
    await page.screenshot(path=os.path.join(TMP, "holdem_v4_fold7.png"))
    out["fold7_errors"] = errs
    await ctx.close()


async def scen_phone(b, out):
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = await ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append("CONSOLE " + m.type + ": " + m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
    await page.goto(URL)
    await page.wait_for_timeout(700)
    await page.click("#room-list .room-card")
    await page.wait_for_timeout(1400)
    m = await page.evaluate(MEASURE)
    i0 = clip_report(m)
    m2 = m
    for _ in range(90):
        m2 = await page.evaluate(MEASURE)
        if m2["boardCards"] >= 5:
            break
        await page.evaluate("""() => {
            const bar = document.querySelector('#action-bar');
            if (bar && !bar.classList.contains('waiting')) {
                const c = document.querySelector('#btn-call');
                if (c && !c.disabled) c.click();
            }
        }""")
        await page.wait_for_timeout(250)
    await page.screenshot(path=os.path.join(TMP, "holdem_v4_phone.png"))
    out["phone"] = {"issues_initial": i0, "issues_river": clip_report(m2), "dealer": m["dealerName"],
                    "dealerImg": m["dealerImg"], "boardCards": m2["boardCards"], "errors": errs}
    await ctx.close()


async def scen_sizes(b, out):
    for size in (9, 2):
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        page = await ctx.new_page()
        e2 = []
        page.on("pageerror", lambda e: e2.append(str(e)))
        await page.goto(URL)
        await page.wait_for_timeout(600)
        await page.click('#pane-single .size-btn[data-size="%d"]' % size)
        await page.wait_for_timeout(200)
        await page.click("#room-list .room-card")
        await page.wait_for_timeout(1400)
        m = await page.evaluate(MEASURE)
        out["size%d" % size] = {"seats": len(m["seats"]), "issues": clip_report(m), "errors": e2}
        if size == 9:
            await page.screenshot(path=os.path.join(TMP, "holdem_v4_9max.png"))
        await ctx.close()


async def main():
    scen = sys.argv[1] if len(sys.argv) > 1 else "all"
    os.makedirs(TMP, exist_ok=True)
    out = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        if scen in ("all", "fold7"):
            await scen_fold7(b, out)
        if scen in ("all", "phone"):
            await scen_phone(b, out)
        if scen in ("all", "sizes"):
            await scen_sizes(b, out)
        await b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
    with open(os.path.join(TMP, "v4_report_%s.json" % scen), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


asyncio.run(main())
