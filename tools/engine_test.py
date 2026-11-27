"""엔진 정확성 검증 (headless): 족보 판정 · 사이드팟 · 칩 보존 · AI 행동 유효성"""
import asyncio, subprocess, sys, time, os, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(ROOT)
PORT = 8898

JS = r"""
() => {
  const P = window.Poker;
  const out = { tests: [], fails: [] };
  const c = (r, s) => ({ r, s });   // s: 0♠ 1♥ 2♦ 3♣
  function eq(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    out.tests.push({ name, ok, got, want });
    if (!ok) out.fails.push(name + ' → got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
  }
  function cat(cards) { return P.evaluate(cards).cat; }

  // ---- 족보 기본 ----
  eq('로열플러시 cat', cat([c(14,0),c(13,0),c(12,0),c(11,0),c(10,0)]), 8);
  eq('스트레이트플러시 cat', cat([c(9,1),c(8,1),c(7,1),c(6,1),c(5,1)]), 8);
  eq('포카드 cat', cat([c(5,0),c(5,1),c(5,2),c(5,3),c(9,0)]), 7);
  eq('풀하우스 cat', cat([c(5,0),c(5,1),c(5,2),c(9,3),c(9,0)]), 6);
  eq('플러시 cat', cat([c(14,1),c(9,1),c(6,1),c(4,1),c(2,1)]), 5);
  eq('스트레이트 cat', cat([c(9,0),c(8,1),c(7,2),c(6,3),c(5,0)]), 4);
  eq('휠 스트레이트 cat', cat([c(14,0),c(2,1),c(3,2),c(4,3),c(5,0)]), 4);
  eq('휠 하이 = 5', P.evaluate([c(14,0),c(2,1),c(3,2),c(4,3),c(5,0)]).kickers[0], 5);
  eq('트립스 cat', cat([c(7,0),c(7,1),c(7,2),c(9,3),c(2,0)]), 3);
  eq('투페어 cat', cat([c(7,0),c(7,1),c(9,2),c(9,3),c(2,0)]), 2);
  eq('원페어 cat', cat([c(7,0),c(7,1),c(9,2),c(5,3),c(2,0)]), 1);
  eq('하이카드 cat', cat([c(14,0),c(9,1),c(7,2),c(5,3),c(2,0)]), 0);

  // ---- 키커 비교 ----
  const a = P.evaluate([c(14,0),c(14,1),c(13,2),c(9,3),c(7,0)]);
  const b = P.evaluate([c(14,2),c(14,3),c(12,0),c(9,1),c(7,2)]);
  eq('AK킥커 > AQ킥커', a.score > b.score, true);
  const c1 = P.evaluate([c(9,0),c(9,1),c(7,2),c(7,3),c(14,0)]);
  const c2 = P.evaluate([c(9,2),c(9,3),c(7,0),c(7,1),c(13,2)]);
  eq('투페어 A킥커 > K킥커', c1.score > c2.score, true);

  // ---- 7장 최고 5장 ----
  const seven = [c(14,0),c(13,0),c(12,0),c(11,0),c(10,0),c(2,1),c(3,2)];
  eq('7장 로열플러시', P.evaluate(seven).cat, 8);
  eq('7장 베스트5 길이', P.evaluate(seven).best5.length, 5);

  // ---- 플러시 vs 스트레이트 ----
  const flush = P.evaluate([c(14,1),c(9,1),c(6,1),c(4,1),c(2,1)]);
  const straight = P.evaluate([c(9,0),c(8,1),c(7,2),c(6,3),c(5,0)]);
  eq('플러시 > 스트레이트', flush.score > straight.score, true);

  // ---- 사이드팟 ----
  const e = new P.Holdem({ seatCount: 4, smallBlind: 10, bigBlind: 20,
    players: [{name:'a',stack:100},{name:'b',stack:40},{name:'c',stack:100},{name:'d',stack:40}] });
  e.seats[0].committed = 100; e.seats[1].committed = 40; e.seats[2].committed = 100; e.seats[3].committed = 40;
  e.seats.forEach(s => { s.inHand = true; });
  e.seats[3].folded = true;
  const pots = e.buildPots();
  eq('사이드팟 개수', pots.length, 2);
  eq('메인팟 금액', pots[0].amount, 160);
  eq('메인팟 대상', pots[0].eligible.map(s => s.idx).sort(), [0,1,2]);
  eq('사이드팟 금액', pots[1].amount, 120);
  eq('사이드팟 대상', pots[1].eligible.map(s => s.idx).sort(), [0,2]);

  // ---- 랜덤 핸드 시뮬레이션: 칩 보존 ----
  function playHand(eng, rng) {
    eng.startHand();
    let guard = 0;
    while (guard++ < 300) {
      if (eng.acting === null) {
        if (eng.street === 'river') break;
        eng.beginNextStreet();
        if (eng.street === 'showdown') break;
        continue;
      }
      const seat = eng.acting;
      const o = eng.options(seat);
      const r = rng();
      let act;
      if (o.canRaise && r < 0.16) act = 'raise';
      else if (o.toCall > 0 && r < 0.28) act = 'fold';
      else act = o.canCheck ? 'check' : 'call';
      if (act === 'raise') eng.act('raise', Math.min(o.maxTo, o.minTo + Math.floor(r * 40)));
      else eng.act(act, 0);
    }
    if (eng.street !== 'showdown') eng.finish();
    return eng.lastResult;
  }
  let seed = 12345;
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const players = [];
  const stacks = [2000, 2000, 2000, 2000, 2000, 2000];
  for (let i = 0; i < 6; i++) players.push({ name: 'P' + i, grade: 'expert', stack: stacks[i] });
  const eng = new P.Holdem({ seatCount: 6, smallBlind: 10, bigBlind: 20, players });
  const total0 = players.reduce((a, p) => a + p.stack, 0);
  let hands = 0, negative = 0, mismatch = 0;
  for (let h = 0; h < 400; h++) {
    if (eng.seats.filter(s => s.stack > 0).length < 2) {
      eng.seats.forEach(s => { s.stack = 2000; });
    }
    const before = eng.seats.reduce((a, s) => a + s.stack, 0);
    playHand(eng, rng);
    hands++;
    const after = eng.seats.reduce((a, s) => a + s.stack, 0);
    if (after !== before) mismatch++;
    if (eng.seats.some(s => s.stack < 0)) negative++;
    if (eng.seats.some(s => s.committed < 0)) negative++;
  }
  eq('핸드 400회 칩 보존 실패 0', mismatch, 0);
  eq('음수 스택 0', negative, 0);
  eq('핸드 카운터', hands >= 400, true);

  // ---- AI 행동 유효성 ----
  let aiBad = 0, aiCount = 0;
  for (let h = 0; h < 60; h++) {
    const pl = [];
    const grades = ['newbie','beginner','expert','pro','expert','pro'];
    for (let i = 0; i < 6; i++) pl.push({ name: 'A' + i, grade: grades[i], stack: 3000 });
    const en = new P.Holdem({ seatCount: 6, smallBlind: 10, bigBlind: 20, players: pl });
    en.startHand();
    let guard = 0;
    while (guard++ < 200) {
      if (en.acting === null) {
        if (en.street === 'river') break;
        en.beginNextStreet();
        if (en.street === 'showdown') break;
        continue;
      }
      const seat = en.acting;
      const s = en.seats[seat];
      const o = en.options(seat);
      const ctx = {
        grade: s.grade, hole: s.hole, board: en.board, street: en.street,
        pot: o.pot, toCall: o.toCall, currentBet: o.currentBet, thisBet: o.thisBet,
        minTo: o.minTo, maxTo: o.maxTo, stack: s.stack, bb: en.bb,
        canCheck: o.canCheck, canCall: o.canCall, canRaise: o.canRaise,
        liveOpponents: en.liveSeats().length - 1, position: 'BTN', isPreflop: en.street === 'preflop',
        raiseCount: en.raiseCount, heroStats: { hands: 10, vpip: 6, pfr: 2, foldToBet: 4, foldOpps: 10 },
        speed: 'fast', rng: Math.random, spr: 3, seatCount: 6, numActive: 4
      };
      const d = window.PokerAI.decide(ctx);
      aiCount++;
      if (!d || !d.action) { aiBad++; }
      if (d.action === 'raise' && !o.canRaise) { aiBad++; }
      if (d.action === 'check' && !o.canCheck) { aiBad++; }
      if ((d.action === 'raise') && (d.amount < o.minTo || d.amount > o.maxTo)) { aiBad++; }
      const r = en.act(d.action, d.amount);
      if (r === null) aiBad++;
    }
    if (en.street !== 'showdown') en.finish();
  }
  eq('AI 결정 유효성 실패 0', aiBad, 0);
  out.aiCount = aiCount;
  out.failCount = out.fails.length;
  return out;
}
"""

async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "www")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            page = await b.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            await page.goto(f"http://127.0.0.1:{PORT}/index.html")
            await page.wait_for_timeout(700)
            res = await page.evaluate(JS)
            print(json.dumps({k: v for k, v in res.items() if k != "tests"}, ensure_ascii=False))
            for t in res["tests"]:
                if not t["ok"]:
                    print("FAIL:", t["name"], "got", t["got"], "want", t["want"])
            print("passed", sum(1 for t in res["tests"] if t["ok"]), "/", len(res["tests"]))
            if errs:
                print("PAGE ERRORS:", errs[:5])
            await b.close()
    finally:
        srv.terminate()

asyncio.run(main())
