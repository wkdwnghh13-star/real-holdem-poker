#!/usr/bin/env python3
"""딜링 연출 정지 컷: CDP Animation.setPlaybackRate 로 애니메이션만 느리게 해서 비행 카드를 잡는다."""
import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8911
SHOTS = os.path.join(ROOT, "screenshots")


async def my_turn(page):
    try:
        return await page.evaluate("() => !!(App.snap && App.snap.acting === 0 && App.options && !App.snap.result)")
    except Exception:
        return False


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
                cdp = await page.context.new_cdp_session(page)
                await cdp.send("Animation.enable")
                await page.goto(f"http://127.0.0.1:{PORT}/index.html")
                await page.wait_for_timeout(3400)
                await page.evaluate("() => { Progress.data.tutorialDone = true; Progress.save(); document.querySelectorAll('#toast-layer .toast').forEach(t => t.remove()); }")
                await page.click("#room-list .room-card")
                got = {"deal": False, "board": False}
                t0 = time.time()
                while (time.time() - t0) < 75 and not (got["deal"] and got["board"]):
                    st = await page.evaluate("""() => ({fly: document.querySelectorAll('.deal-fly').length,
                        phase: App.snap && App.snap.meta ? App.snap.meta.phase : null,
                        acting: App.snap && App.snap.acting, opts: !!App.options})""")
                    if st["fly"] and st["phase"] in ("deal", "board") and not got[st["phase"]]:
                        await cdp.send("Animation.setPlaybackRate", {"playbackRate": 0.22})
                        await page.wait_for_timeout(260)
                        await page.evaluate("() => document.querySelectorAll('#toast-layer .toast').forEach(t => t.remove())")
                        await page.screenshot(path=os.path.join(SHOTS, f"v5-{name}-dealing-{st['phase']}-slow.png"))
                        await cdp.send("Animation.setPlaybackRate", {"playbackRate": 1})
                        got[st["phase"]] = True
                    if st["acting"] == 0 and st["opts"]:
                        try:
                            await page.click("#btn-call", timeout=1000)
                        except Exception:
                            pass
                    await page.wait_for_timeout(40)
                out[name] = got
                await page.close()
            await b.close()
    finally:
        srv.terminate()
    print(json.dumps(out, ensure_ascii=False, indent=1))


asyncio.run(main())
