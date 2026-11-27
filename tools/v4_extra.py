#!/usr/bin/env python3
"""v4 부가 검증: BGM 상태 · 20초 자동 진행 · 딜러 로테이션 · 햅틱 지원 여부"""
import asyncio, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file://" + os.path.abspath(os.path.join(ROOT, "..", "..", "downloads", "holdem_poker_play.html"))


async def main():
    out = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 760, "height": 780}, device_scale_factor=2)
        page = await ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append("CONSOLE " + m.type + ": " + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))
        await page.goto(URL)
        await page.wait_for_timeout(700)
        out["hapticSupported"] = await page.evaluate("() => Haptic.supported")
        out["dealerPool"] = await page.evaluate("() => { const a = Dealers.list.map(d=>d.id); let bad=0; for (const id of a) { for (let i=0;i<40;i++){ if (Dealers.random(id).id === id) bad++; } } return {count:a.length, sameAsExcluded: bad}; }")
        out["dealerSrcOk"] = await page.evaluate("() => Dealers.list.every(d => d.src.startsWith('data:image/jpeg;base64,') && d.src.length > 3000)")

        # 1) 방 입장 → 딜러 1명
        await page.click("#room-list .room-card")
        await page.wait_for_timeout(1400)
        d1 = await page.evaluate("() => (View.dealer||{}).name")
        # 2) 나갔다 다시 입장 → 딜러 교체 규칙
        await page.evaluate("() => App.leaveGame()")
        await page.wait_for_timeout(500)
        await page.click("#room-list .room-card")
        await page.wait_for_timeout(1200)
        d2 = await page.evaluate("() => (View.dealer||{}).name")
        out["dealer"] = {"first": d1, "second": d2, "changed": d1 != d2}

        # 3) BGM
        await page.wait_for_timeout(600)
        bgm1 = await page.evaluate("() => ({state: Sound.ctx ? Sound.ctx.state : null, timer: !!Sound._bgmTimer, step: Sound._bgm ? Sound._bgm.step : null, style: Sound.bgmStyle})")
        await page.wait_for_timeout(1600)
        bgm2 = await page.evaluate("() => ({timer: !!Sound._bgmTimer, step: Sound._bgm ? Sound._bgm.step : null, bus: !!Sound._bus, vinyl: !!Sound._vinyl})")
        out["bgm"] = {"first": bgm1, "second": bgm2, "advancing": (bgm2["step"] or 0) > (bgm1["step"] or 0)}
        out["bgmStyleSwitch"] = await page.evaluate("() => { const a = Sound.setBgmStyle('bossa'); const b = Sound.setBgmStyle('lofi'); return [a, b, Sound.bgmStyle]; }")

        # 4) 20초 자동 진행: 내 턴이 오면 아무것도 누르지 않고 기다린다
        wait_turn = await page.evaluate("""() => new Promise(res => {
            let n = 0;
            const iv = setInterval(() => {
              if (App.runner && App.runner.pending) { clearInterval(iv); res(true); }
              if (n++ > 120) { clearInterval(iv); res(false); }
            }, 250);
        })""")
        out["turnReached"] = wait_turn
        if wait_turn:
            t0 = await page.evaluate("() => ({num: document.querySelector('#tt-num').textContent, on: document.querySelector('#turn-timer').classList.contains('on'), secs: App.runner.turnSeconds})")
            acted = await page.evaluate("""() => new Promise(res => {
                const start = Date.now();
                const iv = setInterval(() => {
                  if (!App.runner || !App.runner.pending) { clearInterval(iv); res({acted: true, ms: Date.now() - start}); }
                  else if (Date.now() - start > 26000) { clearInterval(iv); res({acted: false, ms: Date.now() - start}); }
                }, 200);
            })""")
            after = await page.evaluate("() => ({num: document.querySelector('#tt-num').textContent, on: document.querySelector('#turn-timer').classList.contains('on'), street: App.snap ? App.snap.street : null, folded: App.snap ? App.snap.seats[0].folded : null, acting: App.snap ? App.snap.acting : null})")
            out["timeout"] = {"before": t0, "result": acted, "after": after}
        out["errors"] = errors
        await ctx.close()
        await b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))


asyncio.run(main())
