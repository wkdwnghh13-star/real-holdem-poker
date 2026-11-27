#!/usr/bin/env python3
"""v6 E2E — 네온 아케이드 리뉴얼 + 로그인/운영자/충전 + 랭크·토너먼트·헤즈업 + 플랍/턴/리버 번개"""
import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8934
SHOTS = os.path.join(ROOT, "screenshots")
os.makedirs(SHOTS, exist_ok=True)

RIG_HU = [
    {"r": 9, "s": 1}, {"r": 14, "s": 0}, {"r": 4, "s": 1}, {"r": 14, "s": 3},
    {"r": 14, "s": 2}, {"r": 13, "s": 2}, {"r": 7, "s": 0}, {"r": 2, "s": 3}, {"r": 11, "s": 1}
]

METRICS_JS = """() => {
  const rr = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return {x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1), r:+b.right.toFixed(1), b:+b.bottom.toFixed(1)}; };
  const de = document.querySelector('#dealer-pic');
  const av = document.querySelector('.seat .avatar');
  return {
    vw: innerWidth, vh: innerHeight,
    scrollW: document.documentElement.scrollWidth,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    railPad: getComputedStyle(document.querySelector('#table-rail')).padding,
    railShadow: getComputedStyle(document.querySelector('#table-rail')).boxShadow.slice(0, 60),
    foldBg: getComputedStyle(document.querySelector('#btn-fold')).backgroundImage.slice(0, 80),
    callBg: getComputedStyle(document.querySelector('#btn-call')).backgroundImage.slice(0, 80),
    board: rr(document.querySelector('#board')),
    bar: rr(document.querySelector('#action-bar')),
    heroCards: rr(document.querySelector('#hero-cards')),
    dealer: rr(de), avatar: rr(av),
    dealerRatio: de && av ? +(de.getBoundingClientRect().width / av.getBoundingClientRect().width).toFixed(2) : 0,
    barOverflow: Math.max(0, +((document.querySelector('#action-bar').getBoundingClientRect().bottom - innerHeight).toFixed(1))),
    boardBarOverlap: (() => { const a = document.querySelector('#board').getBoundingClientRect(), b = document.querySelector('#action-bar').getBoundingClientRect(); const dx = Math.min(a.right,b.right)-Math.max(a.left,b.left), dy = Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top); return (dx>0&&dy>0) ? +(dx*dy).toFixed(1) : 0; })(),
    dealerAnim: getComputedStyle(document.querySelector('#dealer')).animationName,
    dealerPicAnim: getComputedStyle(document.querySelector('#dealer-pic')).animationName,
    rimAnim: getComputedStyle(document.querySelector('#table-felt')).animationName
  };
}"""


async def my_turn(pg):
    try:
        return await pg.evaluate("() => !!(App.snap && App.snap.acting === 0 && App.options && !App.snap.result)")
    except Exception:
        return False


async def act_until(pg, cond_js, ms=25000):
    t0 = time.time()
    while (time.time() - t0) * 1000 < ms:
        try:
            if await pg.evaluate(cond_js):
                return True
        except Exception:
            pass
        if await my_turn(pg):
            try:
                await pg.click("#btn-call", timeout=700)
            except Exception:
                pass
        await pg.wait_for_timeout(70)
    return False


async def login_admin(pg):
    await pg.fill("#auth-id", "admin")
    await pg.fill("#auth-pw", "7073")
    await pg.click("#auth-submit")
    await pg.wait_for_timeout(900)


async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "www")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    report = {}
    all_errors = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()

            # ---------------------------------------------------------- 폴드7
            errs = []
            pg = await b.new_page(viewport={"width": 760, "height": 780}, device_scale_factor=2)
            pg.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
            pg.on("console", lambda m: errs.append("CONSOLE: " + m.text) if m.type == "error" else None)
            await pg.goto(f"http://127.0.0.1:{PORT}/index.html")
            await pg.wait_for_timeout(1400)

            r = {"steps": {}}
            r["steps"]["auth_screen"] = await pg.evaluate("() => document.querySelector('#screen-auth').classList.contains('active')")
            await pg.screenshot(path=os.path.join(SHOTS, "v6-auth.png"))

            # 회원가입
            await pg.click('.auth-tab[data-mode="signup"]')
            await pg.fill("#auth-id", "juhotest")
            await pg.fill("#auth-nick", "주호테스트")
            await pg.fill("#auth-pw", "1234")
            await pg.click("#auth-submit")
            await pg.wait_for_timeout(900)
            r["steps"]["signup"] = await pg.evaluate("() => ({lobby: document.querySelector('#screen-lobby').classList.contains('active'), acc: HoldemAuth.current().id, nick: document.querySelector('#pf-name').textContent})")
            r["steps"]["lobby_modes"] = await pg.evaluate("() => document.querySelectorAll('#mode-grid .mode-card').length")

            # 게스트 / 로그아웃
            await pg.click("#btn-logout")
            await pg.wait_for_timeout(500)
            r["steps"]["logout_to_auth"] = await pg.evaluate("() => document.querySelector('#screen-auth').classList.contains('active')")
            await pg.click("#auth-guest")
            await pg.wait_for_timeout(700)
            r["steps"]["guest"] = await pg.evaluate("() => ({guest: HoldemAuth.isGuest(), lobby: document.querySelector('#screen-lobby').classList.contains('active'), name: Progress.data.name})")
            await pg.click("#btn-logout")
            await pg.wait_for_timeout(500)

            # 운영자 로그인
            await login_admin(pg)
            r["steps"]["admin_login"] = await pg.evaluate("() => ({admin: HoldemAuth.isAdmin(), gmVisible: document.body.classList.contains('gm-visible'), gmUnlocked: App.gmUnlocked, menuGm: getComputedStyle(document.querySelector('#menu-gm')).display})")

            # 상점: 충전
            await pg.click('.tab[data-tab="shop"]')
            await pg.wait_for_timeout(400)
            r["steps"]["shop"] = await pg.evaluate("() => ({packs: document.querySelectorAll('.charge-pack').length, rims: document.querySelectorAll('#shop-rims .shop-item').length, fx: document.querySelectorAll('#shop-fx .shop-item').length, cards: document.querySelectorAll('#shop-cards .shop-item').length, faces: document.querySelectorAll('#shop-faces .shop-item').length, drops: document.querySelectorAll('#shop-drops .shop-item').length, boosters: document.querySelectorAll('#shop-boosters .booster-item').length, profiles: document.querySelectorAll('#shop-profiles .shop-item').length})")
            await pg.screenshot(path=os.path.join(SHOTS, "v6-shop.png"))
            before = await pg.evaluate("() => Progress.data.bankroll")
            await pg.click(".charge-pack")
            await pg.wait_for_timeout(400)
            r["steps"]["charge_modal"] = await pg.evaluate("() => ({on: document.querySelector('#modal-charge').classList.contains('on'), summary: document.querySelector('#charge-summary').textContent.replace(/\\s+/g,' ').trim()})")
            await pg.screenshot(path=os.path.join(SHOTS, "v6-charge.png"))
            await pg.click("#charge-confirm")
            await pg.wait_for_timeout(1500)
            r["steps"]["charge_result"] = await pg.evaluate("() => ({bank: Progress.data.bankroll, receipts: HoldemAuth.receipts().length, first: Progress.data.firstCharge})")
            r["steps"]["charge_gain"] = r["steps"]["charge_result"]["bank"] - before
            await pg.screenshot(path=os.path.join(SHOTS, "v6-shop-after.png"))

            # 스킨 장착 (GM 무료)
            await pg.click("#shop-rims .shop-item:nth-child(2) button")
            await pg.wait_for_timeout(350)
            await pg.click("#shop-fx .shop-item:nth-child(2) button")
            await pg.wait_for_timeout(350)
            await pg.click("#shop-faces .shop-item:nth-child(2) button")
            await pg.wait_for_timeout(300)
            await pg.click("#shop-drops .shop-item:nth-child(2) button")
            await pg.wait_for_timeout(300)
            await pg.click("#shop-profiles .shop-item:nth-child(2) button")
            await pg.wait_for_timeout(300)
            await pg.click('#shop-boosters button[data-buy="double"]')
            await pg.wait_for_timeout(250)
            await pg.click('#shop-boosters button[data-buy="blind"]')
            await pg.wait_for_timeout(250)
            r["steps"]["skins"] = await pg.evaluate("() => ({rim: Progress.data.rim, fx: Progress.data.fx, face: Progress.data.cardFace, drop: Progress.data.drop, profile: Progress.data.profile, bodyProfile: document.body.dataset.profile, boosters: Progress.data.boosters, dataRim: document.querySelector('#table-area').dataset.rim, theme: Lightning.theme})")
            await pg.click('.tab[data-tab="single"]')
            await pg.wait_for_timeout(250)

            # 시즌패스
            await pg.click('.mode-card[data-mode="pass"]')
            await pg.wait_for_timeout(450)
            r["steps"]["pass_open"] = await pg.evaluate("() => ({on: document.querySelector('#modal-pass').classList.contains('on'), rows: document.querySelectorAll('#pass-rows .pass-row').length, lv: document.querySelector('#pass-lv').textContent})")
            await pg.screenshot(path=os.path.join(SHOTS, "v6-pass.png"))
            # 운영자 패널에서 패스 XP 테스트
            await pg.click("#modal-pass .close-modal")
            await pg.wait_for_timeout(300)
            await pg.evaluate("() => { document.querySelector('#btn-gm').click(); }")
            await pg.wait_for_timeout(400)
            await pg.click("#gm-pass-xp")
            await pg.click("#gm-pass-xp")
            await pg.wait_for_timeout(300)
            r["steps"]["pass_xp"] = await pg.evaluate("() => ({xp: Progress.data.passXP, lv: Progress.passLevel()})")
            await pg.click("#modal-gm .close-modal")
            await pg.wait_for_timeout(300)
            await pg.click('.mode-card[data-mode="pass"]')
            await pg.wait_for_timeout(400)
            bank_b = await pg.evaluate("() => Progress.data.bankroll")
            await pg.click('#pass-rows .pass-row:nth-child(1) button[data-claim="free"]')
            await pg.wait_for_timeout(400)
            r["steps"]["pass_claim"] = await pg.evaluate("(b) => ({claimed: Progress.data.passClaimed, gain: Progress.data.bankroll - b})", bank_b)
            await pg.click("#pass-premium")
            await pg.wait_for_timeout(1400)
            r["steps"]["pass_premium"] = await pg.evaluate("() => ({premium: Progress.data.passPremium, receipts: HoldemAuth.receipts().length, btn: getComputedStyle(document.querySelector('#pass-premium')).display})")
            await pg.screenshot(path=os.path.join(SHOTS, "v6-pass-premium.png"))
            await pg.click("#modal-pass .close-modal")
            await pg.wait_for_timeout(300)

            # 헤즈업
            await pg.click('.mode-card[data-mode="headsup"]')
            await pg.wait_for_timeout(350)
            await pg.screenshot(path=os.path.join(SHOTS, "v6-headsup-modal.png"))
            await pg.evaluate("(rig) => App.rig(rig)", RIG_HU)
            await pg.click("#hu-start")
            await pg.wait_for_timeout(2300)
            r["steps"]["headsup"] = await pg.evaluate("""() => ({mode: App.mode, seats: App.engine.seats.length,
              dealerIsSb: App.engine.dealer === App.engine.sbSeat, acting: App.engine.acting, dealer: App.engine.dealer, sb: App.engine.sbSeat})""")
            await pg.screenshot(path=os.path.join(SHOTS, "v6-headsup.png"))

            # BLIND ALL-IN — 프리플랍에 카드 안 보고 올인
            t0 = time.time()
            while (time.time() - t0) < 9000:
                if await pg.evaluate("() => !!(App.snap && App.snap.acting === 0 && App.snap.street === 'preflop' && App.options)"):
                    break
                await pg.wait_for_timeout(80)
            blind_before = await pg.evaluate("() => Progress.boosterCount('blind')")
            await pg.click("#boost-blind")
            await pg.wait_for_timeout(500)
            r["steps"]["blind_allin"] = await pg.evaluate("(b) => ({used: b - Progress.boosterCount('blind'), pending: App.blindAllInPending, revealed: View.heroRevealed, street: App.snap && App.snap.street})", blind_before)
            await pg.screenshot(path=os.path.join(SHOTS, "v6-blind-allin.png"))
            await pg.wait_for_timeout(400)
            await pg.evaluate("() => View.revealHeroCards()")
            await pg.wait_for_timeout(400)

            # 번개: 플랍/턴/리버
            await pg.evaluate("""() => { window.__s=[]; window.__b=[]; const o=Lightning.strike.bind(Lightning);
              Lightning.strike=function(lv,t){ window.__s.push(lv); window.__last=Date.now(); return o(lv,t); };
              const ob=FX.streetBanner.bind(FX); FX.streetBanner=function(l,lv){ window.__b.push(l); return ob(l,lv); }; }""")
            got = {}
            t0 = time.time()
            while time.time() - t0 < 45 and len(got) < 3:
                try:
                    s = await pg.evaluate("() => window.__s.slice()")
                except Exception:
                    s = []
                for lv in set(s):
                    if lv in got:
                        continue
                    got[lv] = True
                    await pg.wait_for_timeout(140)
                    info = await pg.evaluate("""() => { const c=document.querySelector('#bolt-canvas'); const x=c.getContext('2d');
                      const d=x.getImageData(0,0,c.width,c.height).data; let a=0; for(let i=3;i<d.length;i+=4) a+=d[i];
                      const sb=document.querySelector('.street-banner');
                      return {alpha:a, banner: sb ? sb.textContent : '', bannerOpacity: sb ? +getComputedStyle(sb).opacity : 0,
                              flash: document.querySelectorAll('.impact-flash').length,
                              rail: document.querySelector('#table-rail').className}; }""")
                    await pg.screenshot(path=os.path.join(SHOTS, f"v6-lv{lv}-{ {1:'flop',2:'turn',3:'river'}[lv] }.png"))
                    r["steps"][f"lightning_lv{lv}"] = info
                    break
                if await my_turn(pg):
                    try:
                        await pg.click("#btn-call", timeout=700)
                    except Exception:
                        pass
                await pg.wait_for_timeout(70)
            r["steps"]["lightning_levels"] = await pg.evaluate("() => window.__s")
            r["steps"]["street_banners"] = await pg.evaluate("() => window.__b")

            # 2X WIN 보너스 정산 경로 검증
            await pg.evaluate("""() => { App.blindAllInPending = false; App.boostDouble = true;
              window.__st = App.engine.seats[0].stack;
              App.afterHand({ results: [{ seat: 0, amount: 500 }], type: 'fold' }); }""")
            await pg.wait_for_timeout(400)
            r["steps"]["double_win"] = await pg.evaluate("() => ({gain: App.engine.seats[0].stack - window.__st, active: App.boostDouble})")

            # 딜러 모션
            r["steps"]["dealer_motion"] = await pg.evaluate("""() => { const d=document.querySelector('#dealer');
              const pic=document.querySelector('#dealer-pic');
              const m1 = getComputedStyle(d).animationName, m2 = getComputedStyle(pic).animationName;
              d.classList.add('cheer'); const cheer = getComputedStyle(d).animationName; d.classList.remove('cheer');
              d.classList.add('dealing'); const deal = getComputedStyle(d).animationName; d.classList.remove('dealing');
              return {sway: m1, breathe: m2, cheer: cheer, deal: deal, rim: getComputedStyle(document.querySelector('.dl-frame'), '::after').animationName}; }""")
            m = await pg.evaluate(METRICS_JS)
            r["metrics"] = m

            # 운영자 패널
            await pg.click("#btn-gm")
            await pg.wait_for_timeout(600)
            r["steps"]["gm_panel"] = await pg.evaluate("() => ({on: document.querySelector('#modal-gm').classList.contains('on'), players: document.querySelectorAll('#gm-players .gm-player').length, grants: document.querySelectorAll('#gm-players [data-grant]').length, mode: document.querySelector('#gm-mode').textContent})")
            await pg.screenshot(path=os.path.join(SHOTS, "v6-gm-panel.png"))
            # 계정 칩 지급
            acc_before = await pg.evaluate("() => HoldemAuth.summary().filter(a => a.id === 'juhotest')[0].chips")
            await pg.click('#gm-players [data-kind="account"][data-key="juhotest"][data-grant="10000"]')
            await pg.wait_for_timeout(400)
            acc_after = await pg.evaluate("() => HoldemAuth.summary().filter(a => a.id === 'juhotest')[0].chips")
            r["steps"]["gm_grant"] = {"before": acc_before, "after": acc_after, "delta": acc_after - acc_before}
            # 운영자 모드 OFF / ON
            await pg.click("#gm-mode")
            await pg.wait_for_timeout(400)
            r["steps"]["gm_off"] = await pg.evaluate("() => ({unlocked: App.gmUnlocked, modal: document.querySelector('#modal-gm').classList.contains('on'), btnVisible: getComputedStyle(document.querySelector('#btn-gm')).display})")
            await pg.click("#btn-gm")
            await pg.wait_for_timeout(400)
            r["steps"]["gm_on"] = await pg.evaluate("() => ({unlocked: App.gmUnlocked, modal: document.querySelector('#modal-gm').classList.contains('on'), mode: document.querySelector('#gm-mode').textContent})")
            await pg.click("#modal-gm .close-modal")
            await pg.wait_for_timeout(300)

            # 랭크겜 + LP
            await pg.click("#btn-leave")
            await pg.wait_for_timeout(300)
            await pg.click("#menu-leave")
            await pg.wait_for_timeout(700)
            await pg.click('.mode-card[data-mode="ranked"]')
            await pg.wait_for_timeout(500)
            r["steps"]["ranked_modal"] = await pg.evaluate("() => ({on: document.querySelector('#modal-ranked').classList.contains('on'), rows: document.querySelectorAll('#rankboard-list .rank-row2').length, hero: document.querySelector('#rank-hero').textContent.replace(/\\s+/g,' ')})")
            await pg.screenshot(path=os.path.join(SHOTS, "v6-ranked-modal.png"))
            await pg.click("#ranked-start")
            await pg.wait_for_timeout(2400)
            r["steps"]["ranked_entry"] = await pg.evaluate("() => ({mode: App.mode, seats: App.engine.seats.length, chip: document.querySelector('#g-rank').textContent, chipOn: document.querySelector('#g-rank').classList.contains('on')})")
            await pg.evaluate("() => View.revealHeroCards()")
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=os.path.join(SHOTS, "v6-ranked.png"))
            lp_before = await pg.evaluate("() => Progress.data.lp")
            await pg.evaluate("() => { App.engine.seats[0].stack = Math.max(App.engine.bb, App.engine.seats[0].stack); App.afterHand({results:[{seat:0, amount:300}], type:'fold'}); }")
            await pg.wait_for_timeout(500)
            r["steps"]["ranked_lp"] = await pg.evaluate("(before) => ({before: before, after: Progress.data.lp, wins: Progress.data.rankedWins})", lp_before)
            await pg.click("#btn-leave")
            await pg.wait_for_timeout(300)
            await pg.click("#menu-leave")
            await pg.wait_for_timeout(700)

            # 토너먼트
            await pg.click('.mode-card[data-mode="tournament"]')
            await pg.wait_for_timeout(2300)
            r["steps"]["tournament_entry"] = await pg.evaluate("() => ({mode: App.mode, seats: App.engine.seats.length, sb: App.engine.sb, prize: App.tournament && App.tournament.prize})")
            await pg.screenshot(path=os.path.join(SHOTS, "v6-tournament.png"))
            await pg.evaluate("() => { App.engine.seats[0].stack = 0; App.tournamentEliminated(); }")
            await pg.wait_for_timeout(600)
            r["steps"]["tournament_payout"] = await pg.evaluate("() => ({title: document.querySelector('#victory-title').textContent, desc: document.querySelector('#victory-desc').textContent, modal: document.querySelector('#modal-victory').classList.contains('on'), vip: Progress.data.vipPoints})")
            await pg.screenshot(path=os.path.join(SHOTS, "v6-tournament-payout.png"))
            await pg.click("#victory-ok")
            await pg.wait_for_timeout(500)

            # 관전실
            await pg.click('.mode-card[data-mode="spectate"]')
            await pg.wait_for_timeout(2200)
            r["steps"]["spectate"] = await pg.evaluate("() => ({mode: App.mode, seats: App.engine.seats.length, allPro: App.engine.seats.every(s => s.grade === 'pro' || s.grade === 'expert')})")
            await pg.click("#btn-leave")
            await pg.wait_for_timeout(300)
            await pg.click("#menu-leave")
            await pg.wait_for_timeout(600)

            r["errors"] = errs[:20]
            r["error_count"] = len(errs)
            all_errors += errs
            report["fold7"] = r
            await pg.close()

            # ---------------------------------------------------------- 폰
            errs2 = []
            pg2 = await b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
            pg2.on("pageerror", lambda e: errs2.append("PAGEERROR: " + str(e)))
            pg2.on("console", lambda m: errs2.append("CONSOLE: " + m.text) if m.type == "error" else None)
            await pg2.goto(f"http://127.0.0.1:{PORT}/index.html")
            await pg2.wait_for_timeout(1200)
            await pg2.screenshot(path=os.path.join(SHOTS, "v6-phone-auth.png"))
            await login_admin(pg2)
            await pg2.screenshot(path=os.path.join(SHOTS, "v6-phone-lobby.png"))
            await pg2.click('.tab[data-tab="shop"]')
            await pg2.wait_for_timeout(400)
            await pg2.screenshot(path=os.path.join(SHOTS, "v6-phone-shop.png"))
            await pg2.click('.tab[data-tab="single"]')
            await pg2.click("#room-list .room-card")
            await pg2.wait_for_timeout(2400)
            await pg2.evaluate("() => View.revealHeroCards()")
            await pg2.wait_for_timeout(400)
            await pg2.screenshot(path=os.path.join(SHOTS, "v6-phone-table.png"))
            m2 = await pg2.evaluate(METRICS_JS)
            r2 = {"metrics": m2, "errors": errs2[:10], "error_count": len(errs2),
                  "auth_fit": await pg2.evaluate("() => ({sw: document.documentElement.scrollWidth, vw: innerWidth})")}
            all_errors += errs2
            report["phone"] = r2
            await pg2.close()
            await b.close()
    finally:
        srv.terminate()
    report["total_errors"] = len(all_errors)
    print(json.dumps(report, ensure_ascii=False, indent=1))


asyncio.run(main())
