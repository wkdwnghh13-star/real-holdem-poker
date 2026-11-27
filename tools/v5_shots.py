#!/usr/bin/env python3
"""v5 발표용 스크린샷: 딜러 크기/호흡, 딜링 애니메이션, 배지, 프리액션, GM 미리보기"""
import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8905
SHOTS = os.path.join(ROOT, "screenshots")


async def clear_toasts(page):
    await page.evaluate("() => document.querySelectorAll('#toast-layer .toast').forEach(t => t.remove())")


async def my_turn(page):
    try:
        return await page.evaluate("() => !!(App.snap && App.snap.acting === 0 && App.options && !App.snap.result)")
    except Exception:
        return False


async def enter(page, size=None):
    if size:
        await page.click(f'#pane-single .size-btn[data-size="{size}"]')
        await page.wait_for_timeout(150)
    await page.click("#room-list .room-card")
    await page.wait_for_timeout(220)


async def capture_flows(page, name, total_ms=70000):
    """딜(홀/보드) 연출을 폴링으로 잡아 스크린샷"""
    got = {"deal": False, "board": False}
    t0 = time.time()
    while (time.time() - t0) * 1000 < total_ms and not (got["deal"] and got["board"]):
        st = await page.evaluate("""() => ({fly: document.querySelectorAll('.deal-fly').length,
            phase: App.snap && App.snap.meta ? App.snap.meta.phase : null,
            acting: App.snap && App.snap.acting, opts: !!App.options})""")
        if st["fly"] and st["phase"] == "board" and not got["board"]:
            await clear_toasts(page)
            for k in range(3):
                await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-dealing-board{'-' + str(k) if k else ''}.png"))
            got["board"] = True
        elif st["fly"] and st["phase"] == "deal" and not got["deal"]:
            await clear_toasts(page)
            for k in range(3):
                await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-dealing-holes{'-' + str(k) if k else ''}.png"))
            got["deal"] = True
        if st["acting"] == 0 and st["opts"]:
            try:
                await page.click("#btn-call", timeout=1200)
            except Exception:
                pass
        await page.wait_for_timeout(45)
    return got


async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "www")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    out = {}
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for (w, h, name) in [(760, 780, "fold7"), (390, 844, "phone")]:
                page = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
                await page.goto(f"http://127.0.0.1:{PORT}/index.html")
                await page.wait_for_timeout(3400)   # 첫 방문 토스트가 지나가길 기다림
                await clear_toasts(page)
                await enter(page)
                flows = await capture_flows(page, name, 60000)
                await page.wait_for_timeout(400)
                await clear_toasts(page)
                await page.evaluate("() => View.revealHeroCards()")
                await page.wait_for_timeout(500)
                # 딜러 / 아바타 크기 비교 컷
                await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-table.png"))
                dbox = await page.evaluate("() => { const b = document.querySelector('#dealer').getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height}; }")
                await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-dealer.png"), clip=dbox)
                abox = await page.evaluate("() => { const b = document.querySelector('.seat[data-idx=\"1\"]').getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height}; }")
                await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-seat.png"), clip=abox)
                out[name + "_flows"] = flows
                out[name + "_idle"] = await page.evaluate("""async () => {
                  const d = document.querySelector('#dealer');
                  const cs = getComputedStyle(d);
                  const a = cs.transform;
                  await new Promise(r => setTimeout(r, 900));
                  const b = getComputedStyle(d).transform;
                  return {name: cs.animationName, dur: cs.animationDuration, changed: a !== b, a: a, b: b, picAnim: getComputedStyle(document.querySelector('#dealer .dl-pic')).animationName};
                }""")
                out[name + "_sizes"] = await page.evaluate("""() => ({
                  dealer: +document.querySelector('#dealer-pic').getBoundingClientRect().width.toFixed(1),
                  avatar: +document.querySelector('.seat .avatar').getBoundingClientRect().width.toFixed(1),
                  hero: +document.querySelector('#hero-cards .card').getBoundingClientRect().width.toFixed(1)
                })""")
                await page.close()

            # GM 패널 + 보드 미리보기 (프리플랍부터 관찰)
            for (w, h, name) in [(760, 780, "fold7"), (390, 844, "phone")]:
                page = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
                await page.goto(f"http://127.0.0.1:{PORT}/index.html")
                await page.wait_for_timeout(3400)
                await clear_toasts(page)
                await enter(page)
                await page.wait_for_timeout(1400)
                await page.evaluate("() => { const el = document.querySelector('#g-room'); for (let i=0;i<5;i++) el.click(); }")
                await page.wait_for_selector("#modal-gm-pin.on", timeout=4000)
                await page.fill("#gm-pin", "7073")
                await page.click("#gm-pin-ok")
                await page.wait_for_selector("#modal-gm.on", timeout=4000)
                await clear_toasts(page)
                await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-gm-panel.png"))
                await page.click("#gm-peek")
                await page.click("#gm-board")
                await page.wait_for_timeout(300)
                await page.click("#modal-gm .close-modal")
                await page.wait_for_timeout(300)
                await clear_toasts(page)
                await page.evaluate("() => View.revealHeroCards()")
                await page.wait_for_timeout(300)
                await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-gm-live.png"))
                info = await page.evaluate("""() => ({
                  peek: App.gmPeek, board: App.gmBoard, boardLen: App.snap.board.length,
                  ghosts: [...document.querySelectorAll('.board-slot .ghost-card')].map(c => (c.dataset.rank||'')+(c.dataset.suit||'')),
                  seatCardW: +document.querySelector('.seat .seat-cards .card').getBoundingClientRect().width.toFixed(1),
                  cards: [...document.querySelectorAll('.seat')].map(s => s.querySelector('.seat-cards').className)
                })""")
                out[name + "_gm"] = info
                # 다음 핸드 프리플랍에서 미리보기 5장 확인
                for _ in range(80):
                    bl = await page.evaluate("() => App.snap ? App.snap.board.length : -1")
                    if bl == 0:
                        break
                    if await my_turn(page):
                        try:
                            await page.click("#btn-call", timeout=1200)
                        except Exception:
                            pass
                    await page.wait_for_timeout(120)
                await page.wait_for_timeout(900)
                await clear_toasts(page)
                await page.evaluate("() => View.revealHeroCards()")
                await page.wait_for_timeout(250)
                await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-gm-preflop-preview.png"))
                out[name + "_preflop_preview"] = await page.evaluate("""() => ({board: App.snap.board.length, ghosts: document.querySelectorAll('.board-slot .ghost-card').length})""")
                await page.close()

            # 배지 데모 (Fold7, 상대 액션 5종)
            page = await b.new_page(viewport={"width": 760, "height": 780}, device_scale_factor=2)
            await page.goto(f"http://127.0.0.1:{PORT}/index.html")
            await page.wait_for_timeout(3400)
            await clear_toasts(page)
            await enter(page)
            await page.wait_for_timeout(1200)
            await page.evaluate("""() => {
              const e = App.engine;
              const acts = ['CHECK','CALL','RAISE','FOLD','ALL-IN'];
              for (let i = 1; i < e.seats.length; i++) e.seats[i].lastAction = acts[(i-1) % acts.length];
              App.onSnapshot({});
              View.revealHeroCards();
            }""")
            await clear_toasts(page)
            await page.wait_for_timeout(400)
            await page.screenshot(path=os.path.join(SHOTS, "v5-badges-fold7.png"))
            await page.close()

            # 9인 GM
            page = await b.new_page(viewport={"width": 412, "height": 915}, device_scale_factor=2)
            await page.goto(f"http://127.0.0.1:{PORT}/index.html")
            await page.wait_for_timeout(3400)
            await clear_toasts(page)
            await enter(page, 9)
            await page.wait_for_timeout(1800)
            await page.evaluate("() => { const el = document.querySelector('#g-room'); for (let i=0;i<5;i++) el.click(); }")
            await page.wait_for_selector("#modal-gm-pin.on", timeout=4000)
            await page.fill("#gm-pin", "7073")
            await page.click("#gm-pin-ok")
            await page.wait_for_selector("#modal-gm.on", timeout=4000)
            await page.click("#gm-peek")
            await page.click("#gm-board")
            await page.click("#modal-gm .close-modal")
            await page.wait_for_timeout(500)
            await clear_toasts(page)
            await page.evaluate("() => View.revealHeroCards()")
            await page.wait_for_timeout(300)
            await page.screenshot(path=os.path.join(SHOTS, "v5-9max-gm.png"))
            await page.close()
            await b.close()
    finally:
        srv.terminate()
    print(json.dumps(out, ensure_ascii=False, indent=1))


asyncio.run(main())
