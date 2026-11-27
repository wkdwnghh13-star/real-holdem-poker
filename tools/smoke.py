import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8899

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
            page.on("console", lambda m: errors.append("CONSOLE " + m.type + ": " + m.text) if m.type in ("error","warning") else None)
            page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))
            await page.goto(f"http://127.0.0.1:{PORT}/index.html")
            await page.wait_for_timeout(1200)
            await page.screenshot(path=os.path.join(ROOT, "screenshots", "_smoke_lobby.png"))
            # enter first room
            await page.click("#room-list .room-card")
            await page.wait_for_timeout(2500)
            await page.screenshot(path=os.path.join(ROOT, "screenshots", "_smoke_table.png"))
            state = await page.evaluate("() => ({snap: !!App.snap, street: App.snap && App.snap.street, seats: App.snap && App.snap.seats.length, acting: App.snap && App.snap.acting})")
            print("STATE", json.dumps(state))
            print("ERRORS", len(errors))
            for e in errors[:30]:
                print(" ", e)
            await b.close()
    finally:
        srv.terminate()

asyncio.run(main())
