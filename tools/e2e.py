"""E2E 검증: 로비 → 튜토리얼 → 테이블 → 카드 오픈/족보 이펙트 → GM(PIN 7073) → 멀티플레이"""
import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "screenshots")
PORT = 8899
URL = f"http://127.0.0.1:{PORT}/index.html"

def C(r, s): return {"r": r, "s": s}
RIG = [C(2,0),C(3,0),C(4,0),C(6,3),C(7,2),C(14,1),
       C(5,2),C(8,0),C(9,2),C(10,0),C(11,3),C(13,1),
       C(12,1),C(11,1),C(3,3),
       C(7,1),
       C(2,2)]

AUTOCALL = """() => { window.__auto = setInterval(() => {
    const b = document.querySelector('#action-bar');
    if (b && !b.classList.contains('waiting') && document.querySelector('#btn-call') && !document.querySelector('#btn-call').disabled) {
        document.querySelector('#btn-call').click();
    }
}, 240); }"""

async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "www")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    errors = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctx = await b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2)
            page = await ctx.new_page()
            page.on("console", lambda m: errors.append("CONSOLE " + m.type + ": " + m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))

            await page.goto(URL)
            await page.wait_for_timeout(900)
            await page.screenshot(path=os.path.join(SHOTS, "01-lobby.png"))

            # ---------------- 튜토리얼 ----------------
            await page.click("#btn-tutorial")
            await page.wait_for_timeout(1500)
            await page.screenshot(path=os.path.join(SHOTS, "02-tutorial.png"))
            for _ in range(4):
                if await page.query_selector(".tut-next"):
                    await page.click(".tut-next")
                    await page.wait_for_timeout(450)
            await page.screenshot(path=os.path.join(SHOTS, "03-tutorial-cards.png"))
            await page.click(".tut-skip")
            await page.wait_for_timeout(1400)
            print("tutorial done, mode =", await page.evaluate("() => App.mode"))

            # ---------------- 게임 나가기 ----------------
            await page.click("#btn-menu")
            await page.wait_for_timeout(350)
            await page.screenshot(path=os.path.join(SHOTS, "04-menu.png"))
            await page.click("#menu-leave")
            await page.wait_for_timeout(900)
            print("after leave, lobby active =", await page.evaluate("() => document.querySelector('#screen-lobby').classList.contains('active')"))

            # ---------------- 리그 덱으로 본 플레이 ----------------
            await page.evaluate("(d) => App.rig(d)", RIG)
            await page.click("#room-list .room-card")
            await page.wait_for_timeout(1500)
            await page.screenshot(path=os.path.join(SHOTS, "05-preflop.png"))
            await page.evaluate("() => { View.revealHeroCards(); FX.bannerDuration = 9000; }")
            await page.wait_for_timeout(600)
            await page.screenshot(path=os.path.join(SHOTS, "06-hero-cards.png"))
            print("hero hole", await page.evaluate("() => App.snap.seats[0].hole.map(c=>c.r+'_'+c.s).join(',')"))

            await page.evaluate(AUTOCALL)
            # 플랍
            try:
                await page.wait_for_function("() => App.snap && App.snap.board.length >= 3", timeout=30000)
                await page.wait_for_timeout(260)
                await page.screenshot(path=os.path.join(SHOTS, "07-flop.png"))
                print("flop captured, street =", await page.evaluate("() => App.snap.street"))
            except Exception as e:
                print("flop fail", e)
            # 족보 배너 (턴에서 플러시 완성)
            try:
                await page.wait_for_function("() => { const b = document.querySelector('.hand-banner.show'); return b && parseFloat(getComputedStyle(b).opacity) > 0.55; }", timeout=30000)
                await page.wait_for_timeout(120)
                await page.screenshot(path=os.path.join(SHOTS, "08-hand-banner.png"))
                print("banner text =", await page.evaluate("() => { const e=document.querySelector('.hand-banner'); return e ? e.innerText.replace(/\\n/g,' / ') : ''; }"))
            except Exception as e:
                print("banner fail", e)
            # 쇼다운
            try:
                await page.wait_for_function("() => App.lastResult", timeout=30000)
                await page.wait_for_timeout(500)
                await page.screenshot(path=os.path.join(SHOTS, "09-showdown.png"))
                print("result =", await page.evaluate("() => JSON.stringify({type: App.lastResult.type, pot: App.lastResult.pot, res: App.lastResult.results})"))
            except Exception as e:
                print("showdown fail", e)
            await page.evaluate("() => clearInterval(window.__auto)")

            # ---------------- 액션바 + 레이즈 ----------------
            await page.wait_for_timeout(2400)
            try:
                await page.wait_for_function("() => !document.querySelector('#action-bar').classList.contains('waiting')", timeout=25000)
                await page.wait_for_timeout(300)
                await page.screenshot(path=os.path.join(SHOTS, "10-action-bar.png"))
                await page.click('.quick button[data-q="pot"]')
                await page.wait_for_timeout(200)
                await page.screenshot(path=os.path.join(SHOTS, "11-raise.png"))
                print("raise label =", await page.text_content("#btn-raise"))
            except Exception as e:
                print("actionbar fail", e)

            # ---------------- GM (PIN 7073) ----------------
            await page.evaluate(AUTOCALL)
            await page.wait_for_timeout(1500)
            await page.evaluate("() => { const el = document.querySelector('#g-room'); for (let i=0;i<5;i++) el.click(); }")
            await page.wait_for_timeout(400)
            await page.screenshot(path=os.path.join(SHOTS, "12-gm-pin.png"))
            await page.fill("#gm-pin", "7073")
            await page.click("#gm-pin-ok")
            await page.wait_for_timeout(600)
            await page.screenshot(path=os.path.join(SHOTS, "13-gm-panel.png"))
            await page.click("#gm-peek")
            await page.wait_for_timeout(300)
            await page.screenshot(path=os.path.join(SHOTS, "14-gm-peek-on.png"))
            await page.click("#modal-gm .close-modal")
            await page.wait_for_timeout(800)
            await page.screenshot(path=os.path.join(SHOTS, "15-table-peek.png"))
            print("peek holes =", await page.evaluate("() => App.snap.seats.filter(x=>x.hole && x.idx!==0).map(x=>x.hole.length).join(',')"))
            # GM 칩 지급
            await page.click("#btn-gm")
            await page.wait_for_timeout(300)
            before = await page.evaluate("() => App.snap.seats[0].stack")
            await page.click("#gm-chip-10k")
            await page.wait_for_timeout(400)
            after = await page.evaluate("() => App.snap.seats[0].stack")
            print("GM CHIP", before, "->", after)
            # GM 보드 미리보기 토글
            await page.click("#gm-board")
            await page.wait_for_timeout(300)
            print("GM BOARD", await page.evaluate("() => ({on: App.gmBoard, ghosts: document.querySelectorAll('.board-slot .ghost-card').length, board: App.snap.board.length})"))
            await page.click("#modal-gm .close-modal")
            await page.wait_for_timeout(500)
            await page.screenshot(path=os.path.join(SHOTS, "15b-gm-board-preview.png"))
            # AI 강제 폴드 (GM 패널 다시 열기)
            await page.evaluate("() => App.gmOpen()")
            await page.wait_for_timeout(350)
            await page.click("#gm-fold")
            await page.wait_for_timeout(300)
            await page.click("#modal-gm .close-modal")
            await page.evaluate("() => clearInterval(window.__auto)")

            # ---------------- 멀티플레이 ----------------
            await page.evaluate("() => App.leaveGame()")
            await page.wait_for_timeout(600)
            await page.click('.tab[data-tab="multi"]')
            await page.wait_for_timeout(400)
            await page.screenshot(path=os.path.join(SHOTS, "16-mp-lobby.png"))
            await page.click("#btn-create-room")
            await page.wait_for_timeout(1400)
            await page.screenshot(path=os.path.join(SHOTS, "17-mp-room.png"))
            code = (await page.text_content("#mpl-code")).strip()
            print("MP CODE", code)

            page2 = await ctx.new_page()
            page2.on("pageerror", lambda e: errors.append("P2 PAGEERROR: " + str(e)))
            await page2.goto(URL)
            await page2.wait_for_timeout(900)
            await page2.click('.tab[data-tab="multi"]')
            await page2.wait_for_timeout(300)
            await page2.fill("#mp-name", "친구A")
            await page2.fill("#mp-code", code)
            await page2.click("#btn-join-room")
            await page2.wait_for_timeout(1500)
            await page2.screenshot(path=os.path.join(SHOTS, "18-mp-client-wait.png"))
            await page.wait_for_timeout(800)
            await page.screenshot(path=os.path.join(SHOTS, "19-mp-host-lobby.png"))
            print("HOST SEATS:", (await page.evaluate("() => document.querySelector('#mpl-seats').innerText")).replace("\n", " | "))

            await page.click("#mpl-start")
            await page.wait_for_timeout(2800)
            await page.screenshot(path=os.path.join(SHOTS, "20-mp-game.png"))
            await page2.wait_for_timeout(1200)
            await page2.screenshot(path=os.path.join(SHOTS, "21-mp-client-game.png"))
            st2 = await page2.evaluate("() => ({you: App.snap && App.snap.you, seats: App.snap && App.snap.seats.length, holes: App.snap && App.snap.seats.map(s => s.hole ? s.hole.length : 0)})")
            print("CLIENT VIEW", json.dumps(st2))

            print("ERRORS", len(errors))
            for e in errors[:15]:
                print(" ", e)
            try:
                await asyncio.wait_for(b.close(), timeout=15)
            except Exception:
                pass
    finally:
        srv.terminate()

asyncio.run(main())
