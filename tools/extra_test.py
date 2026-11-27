"""추가 검증: 토너먼트 · 상점/칭호 · AUTO · 프리셋 · VIP 해금"""
import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "screenshots")
PORT = 8891


async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "www")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    errs = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctx = await b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2)
            page = await ctx.new_page()
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.on("console", lambda m: errs.append("C:" + m.text) if m.type == "error" else None)
            await page.goto(f"http://127.0.0.1:{PORT}/index.html")
            await page.wait_for_timeout(700)

            # 고등급 해금
            await page.evaluate("() => { Progress.data.peak = 600000; Progress.data.bankroll = 300000; Progress.save(); App.renderLobby(); }")
            await page.wait_for_timeout(400)
            await page.screenshot(path=os.path.join(SHOTS, "22-lobby-vip.png"))
            print("tier:", await page.evaluate("() => Progress.tier().name"))

            # 상점: 카드 스킨 구매 + 장착
            await page.click('.tab[data-tab="shop"]')
            await page.wait_for_timeout(500)
            await page.screenshot(path=os.path.join(SHOTS, "23-shop.png"))
            bought = await page.evaluate("""() => {
              const r = Progress.buy('card', 'blackgold');
              if (r.ok) Progress.equip('card', 'blackgold');
              const r2 = Progress.buy('felt', 'midnight');
              if (r2.ok) Progress.equip('felt', 'midnight');
              App.renderLobby();
              return {card: Progress.data.card, felt: Progress.data.felt, bank: Progress.data.bankroll, owns: Progress.data.ownedCards, felts: Progress.data.ownedFelts};
            }""")
            print("shop:", bought)
            await page.wait_for_timeout(400)
            await page.screenshot(path=os.path.join(SHOTS, "24-shop-owned.png"))

            # 칭호 조건(토너먼트 우승 3회) 시뮬레이션 → 장착
            ttl = await page.evaluate("""() => {
              Progress.data.tournamentsWon = 3; Progress.data.foldWins = 31; Progress.save();
              App.renderLobby();
              const ok = Progress.setTitle('emperor');
              return {ok, titles: Progress.titles().filter(t=>t.unlocked).map(t=>t.name), equipped: Progress.data.title};
            }""")
            print("titles:", ttl)

            # 프리셋 변경 + 블라인드 변경
            pre = await page.evaluate("""() => {
              Progress.data.quickPresets = ['min','third','three4','pot','double'];
              Progress.data.blindPreset = '100/200';
              Progress.data.aiLevel = 'pro';
              Progress.save(); App.renderLobby(); return {q: Progress.data.quickPresets, b: Progress.data.blindPreset, ai: Progress.data.aiLevel};
            }""")
            print("presets:", pre)

            # 토너먼트 참가
            await page.click('.tab[data-tab="single"]')
            await page.wait_for_timeout(300)
            await page.click("#btn-tournament")
            await page.wait_for_timeout(1600)
            st = await page.evaluate("() => ({mode: App.mode, level: App.tournament && App.tournament.level, sb: App.engine && App.engine.sb, players: App.engine && App.engine.seats.length, grades: App.engine && App.engine.seats.map(s=>s.grade)})")
            print("tournament:", st)
            await page.screenshot(path=os.path.join(SHOTS, "25-tournament.png"))

            # 빠른 진행
            await page.evaluate("() => { Progress.data.speed='fast'; App.runner.speed='fast'; }")
            await page.evaluate("""() => { window.__a = setInterval(() => { const b=document.querySelector('#action-bar'); if (b && !b.classList.contains('waiting') && document.querySelector('#btn-call')) document.querySelector('#btn-call').click(); }, 200); }""")
            await page.wait_for_timeout(14000)
            st2 = await page.evaluate("() => ({level: App.tournament && App.tournament.level, hands: App.tournament && App.tournament.hands, sb: App.engine && App.engine.sb, bb: App.engine && App.engine.bb, heroStack: App.snap && App.snap.seats[0].stack, handNo: App.snap && App.snap.handNo})")
            print("after 14s:", st2)
            await page.screenshot(path=os.path.join(SHOTS, "26-tournament-run.png"))

            # GM AUTO (프로) 확인
            await page.evaluate("() => clearInterval(window.__a)")
            await page.evaluate("() => { App.gmUnlocked = true; App.gmOpen(); }")
            await page.wait_for_timeout(300)
            await page.click("#gm-auto")
            await page.wait_for_timeout(200)
            await page.click('#gm-auto-grade button[data-g="pro"]')
            await page.wait_for_timeout(200)
            auto = await page.evaluate("() => ({auto: App.auto, grade: App.autoGrade})")
            print("auto:", auto)
            await page.screenshot(path=os.path.join(SHOTS, "27-gm-auto.png"))
            await page.click("#modal-gm .close-modal")
            await page.wait_for_timeout(9000)
            print("after auto:", await page.evaluate("() => ({handNo: App.snap && App.snap.handNo, auto: App.auto})"))

            print("ERRORS", len(errs))
            for e in errs[:10]:
                print(" ", e)
            try:
                await asyncio.wait_for(b.close(), timeout=12)
            except Exception:
                pass
    finally:
        srv.terminate()

asyncio.run(main())
