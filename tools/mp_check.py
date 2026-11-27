#!/usr/bin/env python3
"""친구방(멀티) 검증: 호스트/참가자 렌더, 30초, GM 보드 미리보기 호스트 전용, 프리액션 자동 실행"""
import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8909


async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "www")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    out = {}
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctx = await b.new_context(viewport={"width": 390, "height": 844})
            A = await ctx.new_page(); errsA = []; A.on("pageerror", lambda e: errsA.append(str(e)))
            B = await ctx.new_page(); errsB = []; B.on("pageerror", lambda e: errsB.append(str(e)))
            for pg in (A, B):
                await pg.goto(f"http://127.0.0.1:{PORT}/index.html"); await pg.wait_for_timeout(900)
                await pg.evaluate("() => { Progress.data.tutorialDone = true; Progress.save(); }")
                await pg.click('#lobby-tabs .tab[data-tab="multi"]'); await pg.wait_for_timeout(150)
                await pg.click('#mp-transport button[data-t="bc"]'); await pg.wait_for_timeout(100)
            await A.fill("#mp-name", "호스트"); await B.fill("#mp-name", "친구")
            await A.click("#btn-create-room"); await A.wait_for_timeout(900)
            code = await A.evaluate("() => document.querySelector('#mpl-code').textContent")
            out["code"] = code
            await B.fill("#mp-code", code); await B.click("#btn-join-room"); await B.wait_for_timeout(1500)
            out["lobby"] = await A.evaluate("() => document.querySelector('#mpl-status').textContent")
            await A.click("#mpl-start"); await A.wait_for_timeout(3000)
            out["host"] = await A.evaluate("() => ({mode: App.mode, seats: App.snap && App.snap.seats.length, street: App.snap && App.snap.street})")
            out["client"] = await B.evaluate("() => ({mode: App.mode, seats: App.snap && App.snap.seats.length, tt: document.querySelector('#tt-num').textContent})")
            await B.evaluate("""() => { window.__acts = []; const o = App.heroAction.bind(App); App.heroAction = function (a, amt) { window.__acts.push({a: a, pre: this.preAction}); return o(a, amt); }; }""")
            # 클라이언트: 대기 중 미리 콜 예약
            hit = False
            for i in range(70):
                r = await B.evaluate("""() => { const row = document.querySelector('#pre-row'); const btn = document.querySelector('#pre-call');
                   const vis = row.classList.contains('on') && getComputedStyle(row).display !== 'none' && btn.getBoundingClientRect().height > 0;
                   if (vis) btn.click(); return {vis: vis, pre: App.preAction}; }""")
                if r["vis"] and r["pre"] == "call":
                    hit = True; out["client_pre_set"] = r; break
                await B.wait_for_timeout(120)
            out["client_pre_hit"] = hit
            # 진행: 호스트 턴이면 호스트가 직접 체크/콜
            t0 = time.time(); host_acts = 0
            while time.time() - t0 < 25000:
                st = await A.evaluate("() => ({myTurn: !!(App.snap && App.snap.acting === 0 && App.options)})")
                if st["myTurn"]:
                    try:
                        await A.click("#btn-call", timeout=1000); host_acts += 1
                    except Exception:
                        pass
                cacts = await B.evaluate("() => window.__acts")
                if cacts:
                    out["client_acts"] = cacts
                    break
                await A.wait_for_timeout(150)
            out["host_actions_clicked"] = host_acts
            out["after"] = {
                "host": await A.evaluate("() => ({street: App.snap.street, handNo: App.snap.handNo, acting: App.snap.acting})"),
                "client": await B.evaluate("() => ({street: App.snap.street, handNo: App.snap.handNo, acting: App.snap.acting, pre: App.preAction})"),
            }
            out["errsA"] = errsA; out["errsB"] = errsB
            await A.screenshot(path=os.path.join(ROOT, "screenshots", "v5-mp-host.png"))
            await B.screenshot(path=os.path.join(ROOT, "screenshots", "v5-mp-client.png"))
            await b.close()
    finally:
        srv.terminate()
    print(json.dumps(out, ensure_ascii=False, indent=1), flush=True)


asyncio.run(main())
