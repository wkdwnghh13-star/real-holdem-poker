/* =============================================================================
 *  REAL HOLDEM POKER — AI (4 grades + exploitative pro)
 *  모든 등급은 동일한 ctx 를 받아 {action, amount, think} 를 돌려준다.
 * ========================================================================== */
(function (global) {
  'use strict';
  const P = global.Poker;

  const GRADE_KO = { newbie: '뉴비', beginner: '초보', expert: '고수', pro: '프로' };
  const GRADE_DESC = {
    newbie: '루즈-패시브 · 아무거나 콜',
    beginner: '기본 핸드만 · 단순 베팅',
    expert: '포지션 레인지 · 팟 오즈 · 세미블러프',
    pro: 'TAG/LAG · 상대 분석 · 트랩'
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function raiseTo(ctx, amount) {
    let to = Math.round(amount);
    to = clamp(to, ctx.minTo, ctx.maxTo);
    if (to >= ctx.maxTo) return { action: 'allin', amount: ctx.maxTo };
    return { action: 'raise', amount: to };
  }

  function pctOfPot(ctx, mult, addCall) {
    const pot = ctx.pot + (addCall ? ctx.toCall : 0);
    return ctx.thisBet + ctx.toCall + Math.max(0, Math.round(pot * mult));
  }

  /* ---------------------------------------------------------------- 공통 재료 */

  function strengthOf(ctx) {
    const all = ctx.hole.concat(ctx.board);
    if (all.length < 5) return { cat: -1, score: -1 };
    const ev = P.evaluate(all);
    return ev;
  }

  function equity(ctx, iters) {
    const opp = Math.max(1, ctx.liveOpponents);
    const n = iters || Math.min(420, Math.max(120, Math.floor(2400 / (opp + 1))));
    return P.monteCarloEquity(ctx.hole, ctx.board, opp, n, ctx.rng);
  }

  function hasDraw(ctx) { return P.drawInfo(ctx.hole, ctx.board); }

  function facedBet(ctx) { return ctx.toCall > 0; }

  /* ------------------------------------------------------------ 1. 뉴비 */
  function decideNewbie(ctx) {
    const r = ctx.rng();

    if (ctx.isPreflop) {
      const c = P.chenScore(ctx.hole);
      // VPIP ~65% : 거의 다 본다
      const willPlay = c >= 2 || r < 0.42;
      if (!willPlay) return { action: 'fold' };
      if (c >= 12 && r < 0.45) return raiseTo(ctx, ctx.bb * 3);
      if (c >= 9 && r < 0.18) return raiseTo(ctx, ctx.bb * 2);
      return facedBet(ctx) ? { action: 'call' } : { action: 'check' };
    }

    const ev = strengthOf(ctx);
    const draw = hasDraw(ctx);
    // 좋은 핸드면 작게 벳, 아니면 그냥 콜
    if (ev.cat >= 2 && r < 0.55) return raiseTo(ctx, pctOfPot(ctx, 0.4));
    if (ev.cat === 1 && r < 0.18) return raiseTo(ctx, pctOfPot(ctx, 0.3));

    if (!facedBet(ctx)) {
      if (draw && r < 0.5) return { action: 'check' };
      return { action: 'check' };
    }
    // 팟 오즈 무시하고 대부분 콜
    if (ev.cat >= 1 || draw) return { action: 'call' };
    if (ctx.toCall <= ctx.bb * 2) return { action: 'call' };
    if (ctx.toCall <= ctx.pot * 0.4 && r < 0.6) return { action: 'call' };
    return r < 0.72 ? { action: 'call' } : { action: 'fold' };
  }

  /* ----------------------------------------------------------- 2. 초보 */
  function decideBeginner(ctx) {
    const r = ctx.rng();
    if (ctx.isPreflop) {
      const c = P.chenScore(ctx.hole);
      if (c < 5) return { action: 'fold' };
      if (c >= 10 && r < 0.85) return raiseTo(ctx, ctx.bb * 3);
      if (c >= 8 && r < 0.3) return raiseTo(ctx, ctx.bb * 2.5);
      if (facedBet(ctx) && ctx.toCall > ctx.bb * 4) return r < 0.5 ? { action: 'call' } : { action: 'fold' };
      return facedBet(ctx) ? { action: 'call' } : { action: 'check' };
    }

    const ev = strengthOf(ctx);
    const boardPaired = ev && ev.cat >= 2;
    const topish = ev && ev.cat === 1;

    if (ev.cat >= 2 && r < 0.75) return raiseTo(ctx, pctOfPot(ctx, 0.5));
    if (topish && r < 0.35) return raiseTo(ctx, pctOfPot(ctx, 0.3));

    if (!facedBet(ctx)) return { action: 'check' };

    // 드로우 확률 계산 못함 → 맞았을 때만 콜
    if (ev.cat >= 2) return r < 0.85 ? { action: 'call' } : { action: 'fold' };
    if (ev.cat === 1) return ctx.toCall <= ctx.pot * 0.6 ? { action: 'call' } : (r < 0.4 ? { action: 'call' } : { action: 'fold' });
    if (ctx.toCall <= ctx.pot * 0.25 && r < 0.35) return { action: 'call' };
    return { action: 'fold' };
  }

  /* ----------------------------------------------------------- 3. 고수 */
  function decideExpert(ctx) {
    const r = ctx.rng();
    const pos = ctx.position;

    if (ctx.isPreflop) {
      const pct = P.percentileOf(ctx.hole);
      const open = { UTG: 14, MP: 19, CO: 25, BTN: 34, SB: 28, BB: 42 }[pos] || 22;
      const raised = ctx.raiseCount > 0;
      if (raised) {
        // 3-bet / defend
        if (pct <= 3.5) return raiseTo(ctx, Math.round(ctx.currentBet * 3));
        if (pct <= 8 && r < 0.55) return raiseTo(ctx, Math.round(ctx.currentBet * 2.8));
        if (pct <= open * 0.75) return { action: 'call' };
        if (pos === 'BB' && ctx.toCall <= ctx.bb * 3 && pct <= open) return { action: 'call' };
        return { action: 'fold' };
      }
      if (pct <= open * 0.55) return raiseTo(ctx, Math.round(ctx.bb * (2.6 + r * 0.9)));
      if (pct <= open) {
        if (pos === 'SB' && ctx.toCall > 0) return { action: 'call' };
        return r < 0.55 ? raiseTo(ctx, Math.round(ctx.bb * 2.5)) : (facedBet(ctx) ? { action: 'call' } : { action: 'check' });
      }
      if (pos === 'BB' && ctx.toCall <= ctx.bb && pct <= open * 1.4) return { action: 'check' };
      if (ctx.toCall === 0) return { action: 'check' };
      return { action: 'fold' };
    }

    const ev = strengthOf(ctx);
    const eq = equity(ctx);
    const potOdds = ctx.toCall > 0 ? ctx.toCall / (ctx.pot + ctx.toCall) : 0;
    const draw = hasDraw(ctx);
    const spr = ctx.stack / Math.max(1, ctx.pot);

    // 아주 강한 핸드
    if (ev.cat >= 6) {
      if (!facedBet(ctx)) return raiseTo(ctx, pctOfPot(ctx, 0.66));
      return r < 0.2 ? { action: 'call' } : raiseTo(ctx, pctOfPot(ctx, 0.85));
    }
    if (ev.cat >= 4) {
      // 스트레이트/플러시
      if (!facedBet(ctx)) return raiseTo(ctx, pctOfPot(ctx, 0.7));
      if (r < 0.12 && ctx.street !== 'river') return { action: 'call' };
      return raiseTo(ctx, pctOfPot(ctx, 1.0));
    }
    if (ev.cat === 3) {
      if (!facedBet(ctx)) return raiseTo(ctx, pctOfPot(ctx, 0.65));
      return r < 0.25 ? { action: 'call' } : raiseTo(ctx, pctOfPot(ctx, 0.9));
    }
    if (ev.cat === 2) {
      if (!facedBet(ctx)) return r < 0.8 ? raiseTo(ctx, pctOfPot(ctx, 0.55)) : { action: 'check' };
      if (potOdds < 0.45) return r < 0.75 ? { action: 'call' } : raiseTo(ctx, pctOfPot(ctx, 0.8));
      return r < 0.4 ? { action: 'call' } : { action: 'fold' };
    }
    if (ev.cat === 1) {
      if (!facedBet(ctx)) return r < 0.45 ? raiseTo(ctx, pctOfPot(ctx, 0.4)) : { action: 'check' };
      if (ctx.toCall <= ctx.pot * 0.5) return { action: 'call' };
      return r < 0.25 ? { action: 'call' } : { action: 'fold' };
    }

    // 드로우 / 에어
    if (draw) {
      if (!facedBet(ctx)) return r < 0.6 ? raiseTo(ctx, pctOfPot(ctx, 0.55)) : { action: 'check' };
      if (eq > potOdds + 0.02) return r < 0.22 ? raiseTo(ctx, pctOfPot(ctx, 1.1)) : { action: 'call' };
      return eq > potOdds * 0.85 ? { action: 'call' } : { action: 'fold' };
    }
    if (!facedBet(ctx)) return r < 0.28 ? raiseTo(ctx, pctOfPot(ctx, 0.5)) : { action: 'check' };
    return eq > potOdds + 0.05 ? { action: 'call' } : { action: 'fold' };
  }

  /* ----------------------------------------------------------- 4. 프로 */
  function decidePro(ctx) {
    const r = ctx.rng();
    const hs = ctx.heroStats || { hands: 0, vpip: 0, pfr: 0, foldToBet: 0, foldOpps: 0 };
    const hands = Math.max(1, hs.hands || 0);
    const heroVpip = (hs.vpip || 0) / hands;
    const heroFold = hs.foldOpps ? (hs.foldToBet || 0) / hs.foldOpps : 0.4;
    const fish = heroVpip > 0.45;          // 너무 많이 보는 상대 → 밸류 중심
    const nit = heroFold > 0.58 && hands >= 5; // 잘 접는 상대 → 블러프 늘림
    const station = heroFold < 0.28 && hands >= 5;

    if (ctx.isPreflop) {
      const pct = P.percentileOf(ctx.hole);
      const pos = ctx.position;
      const open = { UTG: 12, MP: 17, CO: 24, BTN: 38, SB: 30, BB: 46 }[pos] || 22;
      const wide = fish || station ? 1.25 : nit ? 0.85 : 1;
      const raised = ctx.raiseCount > 0;

      if (raised) {
        if (pct <= 2.2) return raiseTo(ctx, Math.round(ctx.currentBet * 3.2));
        if (pct <= 7 && r < 0.6) return raiseTo(ctx, Math.round(ctx.currentBet * 2.9));
        if (pct <= 11 && r < 0.35) return raiseTo(ctx, Math.round(ctx.currentBet * 2.7));
        if (pct <= open * 0.8 * wide) return { action: 'call' };
        if (pos === 'BB' && pct <= open * 1.1 && ctx.toCall <= ctx.bb * 2.5) return { action: 'call' };
        // 니트 상대에게 라이트 3벳
        if (nit && pos !== 'BB' && pct <= 22 && r < 0.22) return raiseTo(ctx, Math.round(ctx.currentBet * 3));
        return { action: 'fold' };
      }
      if (pct <= open * 0.5 * wide) {
        const size = Math.round(ctx.bb * (2.4 + r * 1.2) * (fish ? 1.15 : 1));
        return raiseTo(ctx, size);
      }
      if (pct <= open * wide) return r < 0.6 ? raiseTo(ctx, Math.round(ctx.bb * 2.6)) : (facedBet(ctx) ? { action: 'call' } : { action: 'check' });
      if (pos === 'BTN' && r < 0.35) return raiseTo(ctx, Math.round(ctx.bb * 2.5));
      if (pos === 'BB' && ctx.toCall <= ctx.bb) return { action: 'check' };
      if (ctx.toCall === 0) return { action: 'check' };
      return { action: 'fold' };
    }

    const ev = strengthOf(ctx);
    const eq = equity(ctx, 300);
    const potOdds = ctx.toCall > 0 ? ctx.toCall / (ctx.pot + ctx.toCall) : 0;
    const draw = hasDraw(ctx);
    const spr = ctx.stack / Math.max(1, ctx.pot);
    const river = ctx.street === 'river';
    const board = ctx.board;
    const boardPairish = board.length >= 3 && (board.filter(function (c, i, a) { return a.some(function (d, j) { return j !== i && d.r === c.r; }); }).length >= 3);

    // 트랩: 아주 강한 핸드를 가끔 체크/콜
    const trap = !facedBet(ctx) && (ev.cat >= 6 || (ev.cat >= 4 && r < 0.18));

    if (ev.cat >= 6) {
      if (facedBet(ctx)) {
        if (trap && r < 0.25 && ctx.street !== 'river') return { action: 'call' };
        return r < 0.15 ? { action: 'call' } : raiseTo(ctx, pctOfPot(ctx, 0.9));
      }
      if (trap) return { action: 'check' };
      return raiseTo(ctx, pctOfPot(ctx, fish ? 0.85 : 0.7));
    }
    if (ev.cat >= 4) {
      if (facedBet(ctx)) return r < 0.15 ? { action: 'call' } : raiseTo(ctx, pctOfPot(ctx, fish ? 1.2 : 1.0));
      return raiseTo(ctx, pctOfPot(ctx, 0.72));
    }
    if (ev.cat === 3) {
      if (facedBet(ctx)) return r < 0.2 && ctx.street !== 'river' ? { action: 'call' } : raiseTo(ctx, pctOfPot(ctx, 0.95));
      return r < 0.15 ? { action: 'check' } : raiseTo(ctx, pctOfPot(ctx, 0.7));
    }
    if (ev.cat === 2) {
      if (!facedBet(ctx)) return r < 0.85 ? raiseTo(ctx, pctOfPot(ctx, 0.6)) : { action: 'check' };
      if (potOdds < 0.42) return r < 0.7 ? { action: 'call' } : raiseTo(ctx, pctOfPot(ctx, 0.85));
      return r < 0.35 ? { action: 'call' } : { action: 'fold' };
    }
    if (ev.cat === 1) {
      if (!facedBet(ctx)) {
        if (fish) return raiseTo(ctx, pctOfPot(ctx, 0.55));            // 스테이션 상대 씬 밸류
        return r < 0.5 ? raiseTo(ctx, pctOfPot(ctx, 0.42)) : { action: 'check' };
      }
      if (station && ctx.toCall <= ctx.pot * 0.7) return { action: 'call' };
      if (ctx.toCall <= ctx.pot * 0.4) return { action: 'call' };
      return r < 0.2 ? { action: 'call' } : { action: 'fold' };
    }

    // SPR 낮으면 강한 드로우 올인 압박
    if (draw) {
      if (spr < 1.6 && eq > 0.42) return { action: 'allin', amount: ctx.maxTo };
      if (!facedBet(ctx)) return r < 0.7 ? raiseTo(ctx, pctOfPot(ctx, 0.6)) : { action: 'check' };
      if (eq > potOdds + 0.03) return r < 0.2 ? raiseTo(ctx, pctOfPot(ctx, 1.2)) : { action: 'call' };
      return eq > potOdds * 0.9 ? { action: 'call' } : { action: 'fold' };
    }

    // 폴라라이즈드 블러프
    const bluffFreq = nit ? 0.42 : fish ? 0.06 : station ? 0.18 : 0.24;
    if (!facedBet(ctx)) {
      if (river && r < bluffFreq) return raiseTo(ctx, pctOfPot(ctx, fish ? 0.5 : 0.9));
      if (boardPairish && r < bluffFreq * 0.7) return raiseTo(ctx, pctOfPot(ctx, 0.65));
      return r < bluffFreq ? raiseTo(ctx, pctOfPot(ctx, 0.55)) : { action: 'check' };
    }
    // 베팅에 맞았을 때: 레이즈로 압박 or 폴드
    if (river && nit && r < 0.12) return raiseTo(ctx, pctOfPot(ctx, 1.2));
    return eq > potOdds + 0.04 ? { action: 'call' } : { action: 'fold' };
  }

  /* ------------------------------------------------------------- 인터페이스 */

  function sanitize(ctx, dec) {
    if (!dec || typeof dec !== 'object') return { action: ctx.canCheck ? 'check' : 'fold' };
    let a = dec.action;
    const o = ctx;
    if (a === 'raise' || a === 'bet' || a === 'allin') {
      if (!o.canRaise && a !== 'allin') {
        return o.canCheck ? { action: 'check' } : (o.toCall <= o.stack ? { action: 'call' } : { action: 'fold' });
      }
      const amt = Math.round(dec.amount || 0);
      if (a === 'allin' || amt >= o.maxTo) return { action: 'allin', amount: o.maxTo };
      if (amt <= o.toCall + o.thisBet) {
        // 최소 레이즈 미달이면 콜로 처리
        return o.canCheck ? { action: 'check' } : { action: 'call' };
      }
      return { action: 'raise', amount: clamp(amt, o.minTo, o.maxTo) };
    }
    if (a === 'call') {
      if (!o.canCall) return o.canCheck ? { action: 'check' } : { action: 'fold' };
      if (o.toCall >= o.stack) return { action: 'call' };
      return { action: 'call' };
    }
    if (a === 'check') return o.canCheck ? { action: 'check' } : (o.canCall ? { action: 'call' } : { action: 'fold' });
    return { action: 'fold' };
  }

  function decide(ctx) {
    let d;
    switch (ctx.grade) {
      case 'newbie': d = decideNewbie(ctx); break;
      case 'beginner': d = decideBeginner(ctx); break;
      case 'expert': d = decideExpert(ctx); break;
      case 'pro': d = decidePro(ctx); break;
      default: d = decideBeginner(ctx);
    }
    const res = sanitize(ctx, d);
    const speed = ctx.speed === 'fast' ? 1 : 2.4;
    let base = ctx.grade === 'newbie' ? 420 : ctx.grade === 'beginner' ? 520 : ctx.grade === 'expert' ? 680 : 820;
    if (ctx.street !== 'preflop' && (res.action === 'raise' || res.action === 'allin')) base += 320;
    const think = Math.round((base + ctx.rng() * 420) / (speed === 1 ? 2.2 : 1));
    return { action: res.action, amount: res.amount || 0, think: Math.max(260, think) };
  }

  global.PokerAI = { decide: decide, GRADE_KO: GRADE_KO, GRADE_DESC: GRADE_DESC };
})(window);
