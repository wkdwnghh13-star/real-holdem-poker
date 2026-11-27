#!/usr/bin/env python3
"""v7 — 시안(holdem_arcade_1_neon.png) 구도 검증: POT/카드 겹침 0, 큰 카드, 번개는 카드 뒤, 콘솔 0"""
import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8936
SHOTS = os.path.join(ROOT, "screenshots")
os.makedirs(SHOTS, exist_ok=True)

RIG = [
    {"r": 14, "s": 0}, {"r": 2, "s": 1}, {"r": 3, "s": 2}, {"r": 4, "s": 3}, {"r": 5, "s": 0}, {"r": 6, "s": 2},
    {"r": 13, "s": 0}, {"r": 7, "s": 1}, {"r": 8, "s": 2}, {"r": 9, "s": 3}, {"r": 10, "s": 0}, {"r": 11, "s": 2},
    {"r": 12, "s": 0}, {"r": 7, "s": 3}, {"r": 2, "s": 2}, {"r": 11, "s": 1}, {"r": 9, "s": 0}
]

MEASURE = """() => {
  const R = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return {x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1), r:+b.right.toFixed(1), b:+b.bottom.toFixed(1)}; };
  const ov = (a, b) => { if (!a || !b) return 0; const dx = Math.min(a.r, b.r) - Math.max(a.x, b.x); const dy = Math.min(a.b, b.b) - Math.max(a.y, b.y); return (dx > 0 && dy > 0) ? +(dx * dy).toFixed(1) : 0; };
  const pot = R(document.querySelector('#pot'));
  const board = R(document.querySelector('#board'));
  const cards = [...document.querySelectorAll('#board .card')].map(R);
  const hero = R(document.querySelector('#hero-cards'));
  const heroCards = [...document.querySelectorAll('#hero-cards .card')].map(R);
  return {
    pot: pot, board: board, boardCard: cards[0] || null, hero: hero, heroCard: heroCards[0] || null,
    potVsBoard: ov(pot, board), potVsCards: Math.max(0, ...cards.map(c => ov(pot, c))),
    potVsHero: ov(pot, hero), heroVsBar: ov(hero, R(document.querySelector('#action-bar'))),
    gap: pot && board ? +(board.y - pot.b).toFixed(1) : null,
    z: { bolt: getComputedStyle(document.querySelector('#bolt-canvas')).zIndex, board: getComputedStyle(document.querySelector('#board')).zIndex, pot: getComputedStyle(document.querySelector('#pot')).zIndex },
    scrollW: document.documentElement.scrollWidth, vw: innerWidth,
    cards: cards.length, boardCardW: cards[0] ? cards[0].w : 0,
    heroCardW: heroCards[0] ? heroCards[0].w : 0,
    buttons: [...document.querySelectorAll('.btn-row .act')].map(b => ({t: b.textContent.trim(), w: +b.getBoundingClientRect().width.toFixed(1), d: b.disabled})),
    hud: { challenge: !!document.querySelector('#hud-challenge'), highroller: !!document.querySelector('#hud-highroller'), combo: !!document.querySelector('#hud-combo') },
    dealerW: R(document.querySelector('#dealer')).w, dealerH: R(document.querySelector('#dealer')).h,
    railZ: getComputedStyle(document.querySelector('#table-rail')).zIndex
  };
}"""


async def my_turn(pg):
    return await pg.evaluate("() => !!(App.snap && App.snap.acting === 0 && App.options && !App.snap.result)")


async def play(pg, until_board, timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        n = await pg.evaluate("() => (App.snap && App.snap.board.length) || 0")
        if n >= until_board:
            return n
        if await my_turn(pg):
            try:
                await pg.click("#btn-call", timeout=700)
            except Exception:
                pass
        await pg.wait_for_timeout(80)
    return await pg.evaluate("() => (App.snap && App.snap.board.length) || 0")


async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "www")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    rep = {}
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for name, (w, h) in (("fold7", (760, 780)), ("phone", (390, 844))):
                errs = []
                pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
                pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
                pg.on("console", lambda m: errs.append("CONSOLE " + m.text) if m.type == "error" else None)
                await pg.goto(f"http://127.0.0.1:{PORT}/index.html")
                await pg.wait_for_timeout(900)
                await pg.click("#auth-guest")
                await pg.wait_for_timeout(700)
                await pg.evaluate("(r) => App.rig(r)", RIG)
                await pg.click("#room-list .room-card")
                await pg.wait_for_timeout(2300)
                await pg.evaluate("() => View.revealHeroCards()")
                await play(pg, 3)
                await pg.wait_for_timeout(1100)
                # 플랍이 깔린 뒤 히어로 턴(버튼 활성)까지 대기
                t0 = time.time()
                while time.time() - t0 < 6 and not await pg.evaluate("() => !document.querySelector('#btn-call').disabled && App.snap && App.snap.street === 'flop'"):
                    await pg.wait_for_timeout(80)
                m = await pg.evaluate(MEASURE)
                shot = os.path.join(SHOTS, "v7-neon-table.png" if name == "fold7" else "v7-neon-table-phone.png")
                await pg.screenshot(path=shot)
                await play(pg, 5)
                await pg.wait_for_timeout(220)
                m2 = await pg.evaluate(MEASURE)
                shot2 = os.path.join(SHOTS, "v7-river-bolt.png" if name == "fold7" else "v7-river-bolt-phone.png")
                await pg.screenshot(path=shot2)
                rep[name] = {
                    "shot": shot, "shot_river": shot2,
                    "flop": m, "river": m2,
                    "assert": {
                        "pot_gap_ge_8": (m["gap"] is not None and m["gap"] >= 8),
                        "pot_overlap_board_0": m["potVsBoard"] == 0,
                        "pot_overlap_cards_0": m["potVsCards"] == 0,
                        "pot_overlap_hero_0": m["potVsHero"] == 0,
                        "bolt_behind_board": int(m["z"]["bolt"]) < int(m["z"]["board"]),
                        "bolt_behind_pot": int(m["z"]["bolt"]) < int(m["z"]["pot"]),
                        "big_board_cards": m["boardCardW"] >= (66 if name == "fold7" else 48),
                        "big_hero_cards": m["heroCardW"] >= (90 if name == "fold7" else 70),
                        "four_buttons": len([x for x in m["buttons"] if x["w"] > 20]) == 4,
                        "no_hscroll": m["scrollW"] <= m["vw"] + 1,
                        "hud_widgets": m["hud"]["challenge"] and m["hud"]["highroller"] and m["hud"]["combo"],
                    },
                    "errors": errs[:10], "error_count": len(errs),
                }
                await pg.close()
            await b.close()
    finally:
        srv.terminate()
    print(json.dumps(rep, ensure_ascii=False, indent=1))


asyncio.run(main())
