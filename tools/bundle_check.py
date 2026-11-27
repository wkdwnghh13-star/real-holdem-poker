#!/usr/bin/env python3
"""번들(downloads/holdem_poker_play.html) 단일 파일 검증: 로드 무오류 + 신규 기능 동작"""
import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE = os.path.join(ROOT, "..", "..", "downloads", "holdem_poker_play.html")
SHOTS = os.path.join(ROOT, "screenshots")


async def main():
    errs = []
    out = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, h, name in [(760, 780, "fold7"), (390, 844, "phone")]:
            page = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
            page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
            page.on("console", lambda m: errs.append("CONSOLE: " + m.text) if m.type == "error" else None)
            await page.goto("file://" + os.path.abspath(BUNDLE))
            await page.wait_for_timeout(3400)
            await page.evaluate("() => { Progress.data.tutorialDone = true; Progress.save(); }")
            await page.click("#room-list .room-card")
            await page.wait_for_timeout(1800)
            await page.evaluate("() => View.revealHeroCards()")
            await page.wait_for_timeout(400)
            st = await page.evaluate("""() => ({
              single: !!App.engine, turn: App.runner && App.runner.turnSeconds,
              dealer: +document.querySelector('#dealer-pic').getBoundingClientRect().width.toFixed(1),
              avatar: +document.querySelector('.seat .avatar').getBoundingClientRect().width.toFixed(1),
              hero: +document.querySelector('#hero-cards .card').getBoundingClientRect().width.toFixed(1),
              badgeFs: getComputedStyle(document.querySelector('.badge')).fontSize,
              preRow: !!document.querySelector('#pre-row'),
              boardRows: !!document.querySelector('#gm-board'),
              flyCapable: typeof View.flyCard === 'function'
            })""")
            # GM 토글
            await page.evaluate("() => { const el = document.querySelector('#g-room'); for (let i=0;i<5;i++) el.click(); }")
            await page.wait_for_selector("#modal-gm-pin.on", timeout=4000)
            await page.fill("#gm-pin", "7073")
            await page.click("#gm-pin-ok")
            await page.wait_for_selector("#modal-gm.on", timeout=4000)
            await page.click("#gm-peek")
            await page.click("#gm-board")
            await page.wait_for_timeout(400)
            st["gm"] = await page.evaluate("""() => ({peek: App.gmPeek, board: App.gmBoard,
               ghosts: document.querySelectorAll('.board-slot .ghost-card').length,
               want: 5 - (App.snap ? App.snap.board.length : 0),
               seatCard: +document.querySelector('.seat .seat-cards .card').getBoundingClientRect().width.toFixed(1)})""")
            await page.click("#modal-gm .close-modal")
            await page.wait_for_timeout(400)
            await page.evaluate("() => View.revealHeroCards()")
            await page.screenshot(path=os.path.join(SHOTS, f"v5-bundle-{name}.png"))
            out[name] = st
            await page.close()
        await b.close()
    out["errors"] = errs[:10]
    out["error_count"] = len(errs)
    print(json.dumps(out, ensure_ascii=False, indent=1))


asyncio.run(main())
