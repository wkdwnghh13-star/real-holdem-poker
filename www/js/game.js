/* =============================================================================
 *  REAL HOLDEM POKER — 게임 러너
 *  엔진을 굴리고, AI 템포/휴먼 액션 대기/딜레이를 관리한다.
 *  로컬 싱글플레이와 멀티플레이 호스트가 같은 러너를 쓴다.
 * ========================================================================== */
(function (global) {
  'use strict';
  const P = global.Poker;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function GameRunner(opts) {
    this.engine = opts.engine;
    this.humanSeats = new Set(opts.humanSeats || []);
    this.speed = opts.speed || 'normal';       // normal | fast
    this.onSnapshot = opts.onSnapshot || function () {};
    this.onLog = opts.onLog || function () {};
    this.heroStatsRef = opts.heroStats || function () { return null; };
    this.turnSeconds = opts.turnSeconds || 30;
    this.pending = null;
    this.stopped = false;
    this._timer = null;
    this.onHumanTurn = opts.onHumanTurn || function () {};
    this.onHandDone = opts.onHandDone || function () {};
    this.lastHandStats = null;
    this._resolveHand = null;
  }

  GameRunner.prototype.ms = function (normal, fast) {
    return this.speed === 'fast' ? (fast === undefined ? Math.round(normal * 0.45) : fast) : normal;
  };

  GameRunner.prototype.snapshot = function (meta) {
    if (this.stopped) return;
    this.onSnapshot(meta || {});
  };

  GameRunner.prototype.stop = function () {
    this.stopped = true;
    if (this.pending) { try { this.pending.resolve({ action: 'fold' }); } catch (e) {} this.pending = null; }
    if (this._timer) clearTimeout(this._timer);
  };

  /* ------------------------------------------------------------- AI 결정 */

  GameRunner.prototype.positionOf = function (idx) {
    const e = this.engine;
    const inHand = e.seats.filter(function (s) { return s.inHand; });
    const n = inHand.length;
    if (n === 2) return e.seats[idx].isHero ? '' : '';
    const order = [];
    let i = e.dealer;
    for (let k = 0; k < e.seatCount; k++) { i = (i + 1) % e.seatCount; if (e.seats[i].inHand) order.push(i); }
    const pos = order.indexOf(idx);
    if (pos < 0) return 'MP';
    if (n === 2) return idx === e.dealer ? 'SB' : 'BB';
    if (idx === e.sbSeat) return 'SB';
    if (idx === e.bbSeat) return 'BB';
    if (idx === e.dealer) return 'BTN';
    const after = order.length;
    if (pos === 0) return 'UTG';
    if (pos === 1) return 'MP';
    if (pos === after - 2) return 'CO';
    return 'MP';
  };

  GameRunner.prototype.aiContext = function (seat) {
    const e = this.engine;
    const s = e.seats[seat];
    const o = e.options(seat);
    const live = el => el.inHand && !el.folded;
    const liveSeats = e.seats.filter(function (x) { return x.isHero; }); // placeholder
    const liveAll = e.seats.filter(function (x) { return x.inHand && !x.folded; });
    const me = e.seats[seat];
    const opp = liveAll.filter(function (x) { return x.idx !== seat; }).length;
    return {
      grade: me.grade, hole: me.hole, board: e.board, street: e.street,
      pot: o.pot, toCall: o.toCall, currentBet: o.currentBet, thisBet: o.thisBet,
      minTo: o.minTo, maxTo: o.maxTo, stack: me.stack, bb: e.bb, sb: e.sb,
      canCheck: o.canCheck, canCall: o.canCall, canRaise: o.canRaise,
      liveOpponents: Math.max(1, opp), position: this.positionOf(seat),
      isPreflop: e.street === 'preflop', raiseCount: e.raiseCount,
      heroStats: this.heroStatsRef(), speed: this.speed, rng: Math.random,
      spr: me.stack / Math.max(1, o.pot), seatCount: e.seatCount,
      numActive: liveAll.length
    };
  };

  GameRunner.prototype.aiAct = async function (seat) {
    // GM 강제 폴드 / 블러프
    if (this.gmForce && this.gmForce[seat]) {
      const f = this.gmForce[seat];
      delete this.gmForce[seat];
      const o = this.engine.options(seat);
      await sleep(this.ms(420, 140));
      if (f === 'fold') return { action: 'fold' };
      if (f === 'bluff') {
        if (o.canRaise) return { action: 'raise', amount: Math.min(o.maxTo, o.thisBet + o.toCall + Math.round(o.pot * 0.8)) };
        return o.canCheck ? { action: 'check' } : { action: 'call' };
      }
    }
    const ctx = this.aiContext(seat);
    const d = global.PokerAI.decide(ctx);
    await sleep(this.ms(Math.max(340, d.think), Math.max(90, d.think * 0.22)));
    return d;
  };

  /* ----------------------------------------------------------- 휴먼 액션 */

  GameRunner.prototype.waitHuman = function (seat) {
    const self = this;
    return new Promise(function (resolve) {
      self.pending = { seat: seat, resolve: resolve };
      self.onHumanTurn(seat, self.engine.options(seat));
      self._timer = setTimeout(function () {
        if (self.pending && self.pending.seat === seat) {
          const o = self.engine.options(seat);
          const dec = o.canCheck ? { action: 'check' } : { action: 'fold' };
          dec.timeout = true;
          self.pending = null;
          resolve(dec);
        }
      }, self.turnSeconds * 1000);
    });
  };

  GameRunner.prototype.submitAction = function (seat, action, amount) {
    if (!this.pending || this.pending.seat !== seat) return false;
    const r = this.pending.resolve;
    this.pending = null;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    r({ action: action, amount: amount });
    return true;
  };

  GameRunner.prototype.isWaitingHuman = function () {
    return !!this.pending;
  };

  /* --------------------------------------------------------------- 한 핸드 */

  GameRunner.prototype.runHand = async function () {
    const e = this.engine;
    this.stopped = false;
    if (!e.startHand()) return { empty: true };

    const antes = e.potTotal();
    this.snapshot({ phase: 'deal', dealHole: true });
    // 딜러 → 좌석으로 카드가 날아가는 연출 시간 확보
    await sleep(this.ms(900, 460));

    let guard = 0;
    while (guard++ < 240) {
      if (this.stopped) return null;
      const live = e.liveSeats();
      if (live.length <= 1) break;
      if (e.acting === null) {
        if (e.street === 'river') break;
        const before = e.board.length;
        e.beginNextStreet();
        if (e.street === 'showdown') break;
        this.snapshot({ phase: 'board', dealt: e.board.length - before, street: e.street });
        await sleep(this.ms(e.board.length === 3 ? 900 : 680, 220));
        continue;
      }
      const seat = e.acting;
      let dec;
      if (this.humanSeats.has(seat)) {
        dec = await this.waitHuman(seat);
        if (this.stopped) return null;
      } else {
        this.snapshot({ phase: 'thinking', thinking: seat });
        dec = await this.aiAct(seat);
      }
      const before = { stack: e.seats[seat].stack };
      e.act(dec.action, dec.amount);
      this.snapshot({ phase: 'action', actionSeat: seat, action: dec.action });
      this.onLog(seat, dec.action);
      const isAllIn = e.seats[seat].allIn;
      await sleep(this.ms(isAllIn ? 620 : (dec.timeout ? 60 : 180), isAllIn ? 240 : 60));
    }

    // 결과 정산
    let result = null;
    if (e.street !== 'showdown') result = e.finish();
    else result = e.lastResult;
    this.snapshot({ phase: 'result', result: result });
    await sleep(this.ms(1600, 900));
    this.onHandDone(result);
    return result;
  };

  global.GameRunner = GameRunner;
  global.sleepFn = sleep;
})(window);
