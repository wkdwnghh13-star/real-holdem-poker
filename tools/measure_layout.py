import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8891

SIZES = [(760, 780, "fold7"), (390, 844, "phone")]

JS = """() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {x:+b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1),b:+b.bottom.toFixed(1),r:+b.right.toFixed(1)}; };
  const out = {vw: innerWidth, vh: innerHeight,
    table: r('#table-area'), dealer: r('#dealer'), dealerPic: r('#dealer-pic'), pot: r('#pot'), board: r('#board'),
    hero: r('#hero-panel'), heroCards: r('#hero-cards'), bar: r('#action-bar'), avatar: r('.seat .avatar'), seat: r('.seat'),
    cardHero: getComputedStyle(document.documentElement).getPropertyValue('--card-hero'),
    cardMini: getComputedStyle(document.documentElement).getPropertyValue('--card-mini'),
    cardBoard: getComputedStyle(document.documentElement).getPropertyValue('--card-board'),
    dealerSize: getComputedStyle(document.getElementById('table-area')).getPropertyValue('--dealer-size'),
    badgeFs: getComputedStyle(document.querySelector('.badge')).fontSize,
    seats: [...document.querySelectorAll('.seat')].map(e => { const b = e.getBoundingClientRect(); return {idx:e.dataset.idx, x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1), b:+b.bottom.toFixed(1), r:+b.right.toFixed(1)}; })
  };
  return out;
}"""


async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "www")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for w, h, name in SIZES:
                page = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
                errs = []
                page.on("pageerror", lambda e: errs.append(str(e)))
                await page.goto(f"http://127.0.0.1:{PORT}/index.html")
                await page.wait_for_timeout(700)
                await page.click("#room-list .room-card")
                await page.wait_for_timeout(2000)
                await page.evaluate("() => View.revealHeroCards()")
                await page.wait_for_timeout(600)
                m = await page.evaluate(JS)
                print("==", name, w, h, "errors", errs)
                print(json.dumps(m, ensure_ascii=False, indent=1))
                await page.screenshot(path=os.path.join(ROOT, "screenshots", "_measure_" + name + ".png"))
                await page.close()
            await b.close()
    finally:
        srv.terminate()

asyncio.run(main())
