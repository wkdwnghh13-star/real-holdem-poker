import asyncio, subprocess, sys, time, os
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8880


async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "www")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for size, name in [(9, "28-table-9max"), (2, "29-table-headsup")]:
                page = await b.new_page(viewport={"width": 412, "height": 915}, device_scale_factor=2)
                errs = []
                page.on("pageerror", lambda e: errs.append(str(e)))
                await page.goto(f"http://127.0.0.1:{PORT}/index.html")
                await page.wait_for_timeout(700)
                await page.click(f'#pane-single .size-btn[data-size="{size}"]')
                await page.wait_for_timeout(200)
                await page.click("#room-list .room-card")
                await page.wait_for_timeout(1600)
                await page.evaluate("() => View.revealHeroCards()")
                await page.wait_for_timeout(800)
                await page.screenshot(path=os.path.join(ROOT, "screenshots", name + ".png"))
                print(size, "seats", await page.evaluate("() => App.snap.seats.length"), "errors", errs)
                await page.close()
            await b.close()
    finally:
        srv.terminate()

asyncio.run(main())
