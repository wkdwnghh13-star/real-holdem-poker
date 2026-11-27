/* =============================================================================
 *  REAL HOLDEM POKER — Texas Hold'em Engine
 *  UI 비의존 순수 로직. 카드/보드/베팅/사이드팟/쇼다운 전부 여기서 처리.
 * ========================================================================== */
(function (global) {
  'use strict';

  const SUITS = ['s', 'h', 'd', 'c'];
  const SUIT_KO = ['스페이드', '하트', '다이아몬드', '클럽'];
  const SUIT_SYM = ['\u2660', '\u2665', '\u2666', '\u2663'];
  const RANK_STR = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const RANK_KO = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: '잭', 12: '퀸', 13: '킹', 14: '에이스' };
  const CAT_KO = ['하이 카드', '원 페어', '투 페어', '트립스', '스트레이트', '플러시', '풀 하우스', '포 카드', '스트레이트 플러시'];

  /* ---------------------------------------------------------------- evaluator */

  const COMBO_CACHE = {};
  function combos5(n) {
    if (COMBO_CACHE[n]) return COMBO_CACHE[n];
    const out = [];
    (function pick(start, cur) {
      if (cur.length === 5) { out.push(cur.slice()); return; }
      for (let i = start; i < n; i++) { cur.push(i); pick(i + 1, cur); cur.pop(); }
    })(0, []);
    COMBO_CACHE[n] = out;
    return out;
  }

  function straightHigh(uniq) { // uniq: descending unique ranks (5개)
    if (uniq.length < 5) return 0;
    if (uniq[0] - uniq[4] === 4) return uniq[0];
    // wheel A-5-4-3-2
    if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) return 5;
    return 0;
  }

  // 5장 점수: cat*15^5 + kicker들 (base 15) — 숫자 비교만으로 대소/동점 판정
  const P15 = [759375, 50625, 3375, 225, 15, 1];
  function eval5(cs) {
    const rs = [cs[0].r, cs[1].r, cs[2].r, cs[3].r, cs[4].r].sort(function (a, b) { return b - a; });
    const flush = (cs[0].s === cs[1].s && cs[1].s === cs[2].s && cs[2].s === cs[3].s && cs[3].s === cs[4].s);
    const uniq = [];
    for (let i = 0; i < 5; i++) if (uniq[uniq.length - 1] !== rs[i]) uniq.push(rs[i]);
    const sh = straightHigh(uniq);

    const counts = {};
    for (let i = 0; i < 5; i++) counts[rs[i]] = (counts[rs[i]] || 0) + 1;
    const groups = Object.keys(counts).map(Number).map(function (r) { return { r: r, c: counts[r] }; })
      .sort(function (a, b) { return b.c - a.c || b.r - a.r; });

    let cat, k = [];
    if (flush && sh) { cat = 8; k = [sh]; }
    else if (groups[0].c === 4) { cat = 7; k = [groups[0].r, groups[1].r]; }
    else if (groups[0].c === 3 && groups[1] && groups[1].c === 2) { cat = 6; k = [groups[0].r, groups[1].r]; }
    else if (flush) { cat = 5; k = rs; }
    else if (sh) { cat = 4; k = [sh]; }
    else if (groups[0].c === 3) { cat = 3; k = [groups[0].r, groups[1].r, groups[2].r]; }
    else if (groups[0].c === 2 && groups[1] && groups[1].c === 2) { cat = 2; k = [groups[0].r, groups[1].r, groups[2].r]; }
    else if (groups[0].c === 2) { cat = 1; k = [groups[0].r, groups[1].r, groups[2].r, groups[3].r]; }
    else { cat = 0; k = rs; }

    let v = cat * P15[0];
    for (let i = 0; i < 5; i++) v += (k[i] || 0) * P15[i + 1];
    return v;
  }

  function decode(score) {
    const cat = Math.floor(score / P15[0]);
    let rest = score - cat * P15[0];
    const k = [];
    for (let i = 1; i <= 5; i++) { k.push(Math.floor(rest / P15[i])); rest -= Math.floor(rest / P15[i]) * P15[i]; }
    return { cat: cat, k: k };
  }

  function nameOf(cat, k, cards5) {
    const kk = function (i) { return RANK_KO[k[i]] || ''; };
    switch (cat) {
      case 8: return k[0] === 14 ? '로열 플러시' : '스트레이트 플러시 · ' + kk(0) + ' 하이';
      case 7: return '포 카드 · ' + kk(0);
      case 6: return '풀 하우스 · ' + kk(0) + ' 위 ' + kk(1);
      case 5: {
        const s = cards5 && cards5[0] ? SUIT_KO[cards5[0].s] : '';
        return '플러시 · ' + s + ' ' + kk(0) + ' 하이';
      }
      case 4: return '스트레이트 · ' + kk(0) + ' 하이';
      case 3: return '트립스 · ' + kk(0);
      case 2: return '투 페어 · ' + kk(0) + ' & ' + kk(1);
      case 1: return '원 페어 · ' + kk(0);
      default: return '하이 카드 · ' + kk(0);
    }
  }

  function evaluate(cards) {
    if (!cards || cards.length < 5) return null;
    const cs = combos5(cards.length);
    let bestScore = -1, best5 = null;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const five = [cards[c[0]], cards[c[1]], cards[c[2]], cards[c[3]], cards[c[4]]];
      const sc = eval5(five);
      if (sc > bestScore) { bestScore = sc; best5 = five; }
    }
    const d = decode(bestScore);
    return { score: bestScore, cat: d.cat, kickers: d.k, best5: best5, name: nameOf(d.cat, d.k, best5) };
  }

  /* ------------------------------------------------------------------ draws */

  function rankSetHasStraight(set) {
    for (let hi = 14; hi >= 5; hi--) {
      let ok = true;
      for (let i = 0; i < 5; i++) if (!set.has(hi - i)) { ok = false; break; }
      if (ok) return true;
      if (hi === 5 && set.has(14) && set.has(2) && set.has(3) && set.has(4) && set.has(5)) return true;
    }
    return false;
  }

  function drawInfo(hole, board) {
    if (!hole || hole.length < 2) return '';
    if (board && board.length >= 5) return '';
    const all = hole.concat(board || []);
    if (all.length < 4) return '';
    const ev = all.length >= 5 ? evaluate(all) : null;
    if (ev && ev.cat >= 5) return '';
    const out = [];

    // 플러시 드로우
    const sc = [0, 0, 0, 0];
    for (let i = 0; i < all.length; i++) sc[all[i].s]++;
    let flushDraw = false;
    for (let s = 0; s < 4; s++) if (sc[s] === 4) flushDraw = true;
    if (flushDraw) out.push('플러시 드로우');

    // 스트레이트 드로우
    if (!(ev && ev.cat === 4)) {
      const set = new Set();
      for (let i = 0; i < all.length; i++) set.add(all[i].r);
      let outs = 0;
      for (let r = 2; r <= 14; r++) {
        if (set.has(r)) continue;
        set.add(r);
        if (rankSetHasStraight(set)) outs++;
        set.delete(r);
      }
      if (outs >= 2) out.push('오픈 스트레이트 드로우');
      else if (outs === 1) out.push('것샷 드로우');
    }
    return out.join(' · ');
  }

  /* ------------------------------------------------------------ preflop text */

  function preflopName(hole) {
    if (!hole || hole.length < 2) return '';
    const a = hole[0], b = hole[1];
    const hi = Math.max(a.r, b.r), lo = Math.min(a.r, b.r);
    const suited = a.s === b.s;
    const SH = function (r) { return r === 10 ? 'T' : RANK_STR[r]; };
    if (a.r === b.r) return SH(a.r) + SH(a.r) + ' · ' + RANK_KO[a.r] + ' 페어';
    const tag = suited ? '수딧' : '오프수트';
    return SH(hi) + SH(lo) + (suited ? 's' : 'o') + ' · ' + RANK_KO[hi] + ' ' + RANK_KO[lo] + ' ' + tag;
  }

  function describeHole(hole, board) {
    const b = board || [];
    if (!hole || hole.length < 2) return { label: '', sub: '' };
    if (b.length < 3) return { label: preflopName(hole), sub: drawInfo(hole, b) };
    const ev = evaluate(hole.concat(b));
    return { label: ev ? ev.name : '', sub: drawInfo(hole, b), ev: ev };
  }

  /* ------------------------------------------------------- preflop percentile */

  function chenScore(hole) {
    const a = hole[0], b = hole[1];
    const hi = Math.max(a.r, b.r), lo = Math.min(a.r, b.r);
    const pt = { 14: 10, 13: 8, 12: 7, 11: 6, 10: 5, 9: 4.5, 8: 3.5, 7: 3, 6: 2.5, 5: 2, 4: 1.5, 3: 1, 2: 0.5 };
    let s;
    if (a.r === b.r) { s = Math.max(pt[hi] * 2, 5); return s; }
    s = pt[hi];
    if (a.s === b.s) s += 2;
    const gap = hi - lo - 1;
    if (gap === 1) s -= 1; else if (gap === 2) s -= 2; else if (gap === 3) s -= 4; else if (gap >= 4) s -= 5;
    if (gap <= 1 && hi < 12) s += 1;
    return Math.ceil(s);
  }

  // 169개 스타팅 핸드를 점수순 정렬해 상위 % 로 변환
  let PCT_TABLE = null;
  function percentileOf(hole) {
    if (!PCT_TABLE) {
      const list = [];
      for (let hi = 2; hi <= 14; hi++) {
        for (let lo = 2; lo <= hi; lo++) {
          for (let su = 0; su < 2; su++) {
            if (hi === lo && su === 1) continue;
            const h = [{ r: hi, s: 0 }, { r: lo, s: su }];
            list.push({ hi: hi, lo: lo, suited: su === 0, score: chenScore(h) });
          }
        }
      }
      list.sort(function (a, b) { return b.score - a.score || b.hi - a.hi || (b.suited ? 1 : 0) - (a.suited ? 1 : 0) || b.lo - a.lo; });
      const map = {};
      list.forEach(function (h, i) { map[h.hi + '_' + h.lo + '_' + (h.suited ? 1 : 0)] = (i + 1) / list.length * 100; });
      PCT_TABLE = map;
    }
    const hi = Math.max(hole[0].r, hole[1].r), lo = Math.min(hole[0].r, hole[1].r);
    const suited = hole[0].s === hole[1].s;
    return PCT_TABLE[hi + '_' + lo + '_' + (suited ? 1 : 0)];
  }

  /* --------------------------------------------------------------- equity MC */

  function monteCarloEquity(hole, board, numOpp, iters, rng) {
    rng = rng || Math.random;
    if (numOpp <= 0) return 1;
    const used = {};
    for (let i = 0; i < hole.length; i++) used[hole[i].r + '_' + hole[i].s] = 1;
    for (let i = 0; i < board.length; i++) used[board[i].r + '_' + board[i].s] = 1;
    const rem = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) {
      if (!used[r + '_' + s]) rem.push({ r: r, s: s });
    }
    const needBoard = 5 - board.length;
    const need = needBoard + numOpp * 2;
    let win = 0, tie = 0;
    for (let it = 0; it < iters; it++) {
      // 부분 셔플로 필요한 만큼만 뽑기
      for (let k = 0; k < need; k++) {
        const j = k + Math.floor(rng() * (rem.length - k));
        const t = rem[k]; rem[k] = rem[j]; rem[j] = t;
      }
      const full = board.concat(rem.slice(0, needBoard));
      const mine = evaluate(hole.concat(full));
      let best = mine.score, tieFlag = false, lost = false;
      for (let o = 0; o < numOpp; o++) {
        const oh = [rem[needBoard + o * 2], rem[needBoard + o * 2 + 1]];
        const sc = evaluate(oh.concat(full)).score;
        if (sc > best) { lost = true; break; }
        if (sc === best) tieFlag = true;
      }
      if (!lost) { if (tieFlag) tie += 0.5; else win += 1; }
    }
    return (win + tie) / iters;
  }

  /* ------------------------------------------------------------------- deck */

  function makeDeck() {
    const deck = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push({ r: r, s: s });
    return deck;
  }

  function shuffle(deck, rng) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor((rng || Math.random)() * (i + 1));
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  /* ================================================================ GAME === */

  function Holdem(opts) {
    opts = opts || {};
    this.seatCount = opts.seatCount || 6;
    this.sb = opts.smallBlind || 10;
    this.bb = opts.bigBlind || 20;
    this.rng = opts.rng || Math.random;
    this.onEvent = opts.onEvent || function () {};

    this.seats = (opts.players || []).map(function (p, i) {
      return {
        idx: i, name: p.name, grade: p.grade || 'beginner', isHero: !!p.isHero,
        avatar: p.avatar || '', stack: p.stack, hole: [], bet: 0, committed: 0,
        inHand: false, folded: false, allIn: false, acted: false, canRaiseNow: true,
        lastAction: null, lastAmount: 0, won: 0, revealed: false, hand: null, delta: 0
      };
    });
    this.dealer = Math.floor(this.rng() * this.seatCount);
    this.handNo = 0;
    this.sessionId = 'S' + Math.random().toString(36).slice(2, 8);
    this.street = 'idle';
    this.board = [];
    this.deck = [];
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.acting = null;
    this.lastAggressor = null;
    this.raiseCount = 0;
    this.sbSeat = -1;
    this.bbSeat = -1;
    this.lastResult = null;
  }

  Holdem.prototype.emit = function (type, data) { this.onEvent(type, data || {}); };

  Holdem.prototype.nextSeat = function (from, pred) {
    for (let k = 1; k <= this.seatCount; k++) {
      const i = (from + k) % this.seatCount;
      if (pred(this.seats[i])) return i;
    }
    return -1;
  };

  Holdem.prototype.liveSeats = function () {
    return this.seats.filter(function (s) { return s.inHand && !s.folded; });
  };

  Holdem.prototype.potTotal = function () {
    let p = 0;
    for (let i = 0; i < this.seats.length; i++) p += this.seats[i].committed;
    return p;
  };

  /* ---------------------------------------------------------- hand lifecycle */

  Holdem.prototype.startHand = function () {
    const funded = this.seats.filter(function (s) { return s.stack > 0; });
    if (funded.length < 2) return false;

    this.handNo++;
    this.board = [];
    this.street = 'preflop';
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.acting = null;
    this.raiseCount = 0;
    this.lastAggressor = null;
    this.lastResult = null;

    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.hole = []; s.bet = 0; s.committed = 0; s.won = 0; s.delta = 0;
      s.inHand = s.stack > 0;
      s.folded = !s.inHand;
      s.allIn = false; s.acted = false; s.canRaiseNow = true;
      s.lastAction = null; s.lastAmount = 0; s.revealed = false; s.hand = null;
    }

    this.dealer = this.nextSeat(this.dealer, function (s) { return s.inHand; });
    const n = this.seats.filter(function (s) { return s.inHand; }).length;

    let sbSeat, bbSeat;
    if (n === 2) {
      sbSeat = this.dealer;
      bbSeat = this.nextSeat(this.dealer, function (s) { return s.inHand; });
    } else {
      sbSeat = this.nextSeat(this.dealer, function (s) { return s.inHand; });
      bbSeat = this.nextSeat(sbSeat, function (s) { return s.inHand; });
    }
    this.sbSeat = sbSeat; this.bbSeat = bbSeat;

    this.emit('handStart', { handNo: this.handNo, dealer: this.dealer, sbSeat: sbSeat, bbSeat: bbSeat });

    this.postBlind(sbSeat, this.sb, 'SB');
    this.postBlind(bbSeat, this.bb, 'BB');

    this.deck = this.riggedDeck ? this.riggedDeck.slice() : shuffle(makeDeck(), this.rng);
    this.dealPtr = 0;
    for (let round = 0; round < 2; round++) {
      let i = this.dealer;
      for (let k = 0; k < this.seatCount; k++) {
        i = (i + 1) % this.seatCount;
        if (this.seats[i].inHand) this.seats[i].hole.push(this.nextCard());
      }
    }
    this.currentBet = this.bb;
    this.minRaise = this.bb;

    const first = (n === 2) ? this.dealer : this.nextSeat(bbSeat, function (s) { return s.inHand; });
    this.emit('holeCards', {});
    this.street = 'preflop';
    this.emit('street', { street: 'preflop', board: [] });
    this.acting = this.pickActor(first);
    if (this.acting === null) this.emit('streetComplete', { street: 'preflop' });
    return true;
  };

  Holdem.prototype.nextCard = function () {
    if (this.dealPtr >= this.deck.length) { this.deck = shuffle(makeDeck(), this.rng); this.dealPtr = 0; }
    return this.deck[this.dealPtr++];
  };

  Holdem.prototype.postBlind = function (idx, amount, label) {
    const s = this.seats[idx];
    const pay = Math.min(amount, s.stack);
    s.stack -= pay; s.bet += pay; s.committed += pay;
    if (s.stack === 0) s.allIn = true;
    s.lastAction = label; s.lastAmount = pay;
    this.emit('blind', { seat: idx, label: label, amount: pay, allIn: s.allIn });
  };

  Holdem.prototype.pickActor = function (startIdx) {
    const live = this.liveSeats();
    if (live.length <= 1) return null;
    const actives = live.filter(function (s) { return !s.allIn; });
    if (actives.length === 0) return null;
    const need = actives.filter(function (s) { return !s.acted || s.bet < this.currentBet; }, this);
    if (need.length === 0) return null;
    for (let k = 0; k < this.seatCount; k++) {
      const i = (startIdx + k) % this.seatCount;
      const s = this.seats[i];
      if (s.inHand && !s.folded && !s.allIn && (!s.acted || s.bet < this.currentBet)) return i;
    }
    return null;
  };

  Holdem.prototype.options = function (idx) {
    const s = this.seats[idx];
    const toCall = Math.max(0, this.currentBet - s.bet);
    const maxTo = s.bet + s.stack;
    let minTo = this.currentBet + this.minRaise;
    if (minTo > maxTo) minTo = maxTo;
    return {
      toCall: Math.min(toCall, s.stack),
      toCallFull: toCall,
      canCheck: toCall === 0,
      canCall: toCall > 0 && s.stack > 0,
      canRaise: s.stack > toCall && s.canRaiseNow,
      canAllIn: s.stack > 0,
      minTo: Math.min(minTo, maxTo),
      maxTo: maxTo,
      thisBet: s.bet,
      pot: this.potTotal(),
      currentBet: this.currentBet,
      minRaise: this.minRaise
    };
  };

  Holdem.prototype.act = function (action, amount) {
    const idx = this.acting;
    if (idx === null || idx === undefined) return null;
    const s = this.seats[idx];
    const toCall = Math.max(0, this.currentBet - s.bet);
    const ev = { seat: idx, action: action, added: 0, total: s.bet, allIn: false, street: this.street };
    let fullRaise = false;

    if (action === 'fold') {
      s.folded = true; s.lastAction = 'FOLD'; s.lastAmount = 0;
    } else if (action === 'check') {
      if (toCall > 0) return null;
      s.lastAction = 'CHECK'; s.lastAmount = 0;
    } else if (action === 'call') {
      const pay = Math.min(toCall, s.stack);
      s.stack -= pay; s.bet += pay; s.committed += pay;
      ev.added = pay;
      if (s.stack === 0) s.allIn = true;
      s.lastAction = s.allIn ? 'ALL-IN' : 'CALL';
      s.lastAmount = pay;
    } else if (action === 'raise' || action === 'allin' || action === 'bet') {
      const maxTo = s.bet + s.stack;
      let target = (action === 'raise' || action === 'bet') ? Math.round(amount || 0) : maxTo;
      if (target > maxTo) target = maxTo;
      if (target < s.bet) target = s.bet;
      const minTo = this.currentBet + this.minRaise;
      if (target < minTo && target < maxTo) target = minTo;
      const add = target - s.bet;
      s.stack -= add; s.bet += add; s.committed += add;
      ev.added = add;
      if (s.stack === 0) s.allIn = true;

      const inc = s.bet - this.currentBet;
      if (inc > 0) {
        const isFull = inc >= this.minRaise;
        this.currentBet = s.bet;
        if (isFull) { this.minRaise = inc; fullRaise = true; }
        s.lastAction = s.allIn ? 'ALL-IN' : (toCall > 0 ? 'RAISE' : 'BET');
        s.lastAmount = s.bet;
        this.lastAggressor = idx;
        this.raiseCount++;
      } else {
        s.lastAction = s.allIn ? 'ALL-IN' : 'CALL';
        s.lastAmount = s.bet;
      }
    } else {
      return null;
    }

    ev.total = s.bet;
    ev.allIn = s.allIn;
    s.acted = true;
    s.canRaiseNow = false;

    if (fullRaise) {
      for (let i = 0; i < this.seats.length; i++) {
        const o = this.seats[i];
        if (o !== s && o.inHand && !o.folded && !o.allIn) { o.acted = false; o.canRaiseNow = true; }
      }
    }

    this.emit('action', ev);
    const next = this.pickActor((idx + 1) % this.seatCount);
    this.acting = next;
    if (next === null) this.emit('streetComplete', { street: this.street });
    return ev;
  };

  Holdem.prototype.streetDone = function () { return this.acting === null; };

  Holdem.prototype.beginNextStreet = function () {
    const live = this.liveSeats();
    if (live.length <= 1) { this.finish(); return; }
    if (this.street === 'river') { this.finish(); return; }

    for (let i = 0; i < this.seats.length; i++) {
      this.seats[i].bet = 0;
      this.seats[i].acted = false;
      this.seats[i].canRaiseNow = true;
      this.seats[i].lastAction = null;
      this.seats[i].lastAmount = 0;
    }
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.raiseCount = 0;

    const nxt = { preflop: 'flop', flop: 'turn', turn: 'river' }[this.street];
    const deal = nxt === 'flop' ? 3 : 1;
    const dealt = [];
    for (let i = 0; i < deal; i++) { const c = this.nextCard(); this.board.push(c); dealt.push(c); }
    this.street = nxt;
    this.emit('street', { street: nxt, board: this.board.slice(), dealt: dealt });
    this.acting = this.pickActor(this.nextSeat(this.dealer, function (s) { return s.inHand; }));
    if (this.acting === null) this.emit('streetComplete', { street: nxt });
    return nxt;
  };

  /* ---------------------------------------------------------------- showdown */

  Holdem.prototype.buildPots = function () {
    const contribs = [];
    for (let i = 0; i < this.seats.length; i++) if (this.seats[i].committed > 0) contribs.push(this.seats[i]);
    const levels = Array.from(new Set(contribs.map(function (s) { return s.committed; }))).sort(function (a, b) { return a - b; });
    const pots = [];
    let prev = 0;
    for (let li = 0; li < levels.length; li++) {
      const lv = levels[li];
      let amount = 0;
      const eligible = [];
      for (let i = 0; i < contribs.length; i++) {
        const s = contribs[i];
        const add = Math.min(s.committed, lv) - Math.min(s.committed, prev);
        if (add > 0) amount += add;
        if (s.committed >= lv && s.inHand && !s.folded) eligible.push(s);
      }
      if (amount > 0) pots.push({ amount: amount, eligible: eligible });
      prev = lv;
    }
    return pots;
  };

  Holdem.prototype.finish = function () {
    const live = this.liveSeats();
    const pots = this.buildPots();
    const before = this.seats.map(function (s) { return s.stack; });

    // 언콜드 베팅 반환 (한 명만 최고액일 때)
    const contribs = this.seats.filter(function (s) { return s.committed > 0; })
      .sort(function (a, b) { return b.committed - a.committed; });
    if (contribs.length >= 1) {
      const top = contribs[0];
      const second = contribs[1] ? contribs[1].committed : 0;
      if (top.committed > second) {
        const diff = top.committed - second;
        top.stack += diff; top.committed -= diff;
        this.emit('refund', { seat: top.idx, amount: diff });
      }
    }
    const potsFinal = this.buildPots();
    const totalPot = potsFinal.reduce(function (a, p) { return a + p.amount; }, 0);

    const results = [];
    if (live.length === 1) {
      const w = live[0];
      w.stack += totalPot;
      w.won += totalPot;
      results.push({ seat: w.idx, amount: totalPot, handName: null, best5: null, reason: 'fold' });
      this.emit('showdown', { type: 'fold', seat: w.idx, pot: totalPot });
      this.street = 'showdown';
      this.lastResult = { type: 'fold', pot: totalPot, results: results, board: this.board.slice() };
      this.settle(before);
      return this.lastResult;
    }

    // 카드 공개 + 핸드 평가
    for (let i = 0; i < live.length; i++) {
      const s = live[i];
      s.revealed = true;
      s.hand = evaluate(s.hole.concat(this.board));
    }

    const orderFromDealer = [];
    let i0 = this.dealer;
    for (let k = 0; k < this.seatCount; k++) { i0 = (i0 + 1) % this.seatCount; if (this.seats[i0]) orderFromDealer.push(i0); }

    for (let pi = 0; pi < potsFinal.length; pi++) {
      const pot = potsFinal[pi];
      const elig = pot.eligible.slice();
      if (!elig.length) continue;
      let best = -1;
      for (let i = 0; i < elig.length; i++) if (elig[i].hand && elig[i].hand.score > best) best = elig[i].hand.score;
      const winners = elig.filter(function (s) { return s.hand && s.hand.score === best; });
      if (!winners.length) continue;
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      const ordered = orderFromDealer.map(function (idx) { return winners.filter(function (w) { return w.idx === idx; })[0]; }).filter(Boolean);
      for (let wi = 0; wi < ordered.length; wi++) {
        const w = ordered[wi];
        let amt = share;
        if (rem > 0) { amt += 1; rem--; }
        w.stack += amt; w.won += amt;
        const r = results.filter(function (x) { return x.seat === w.idx; })[0];
        if (r) r.amount += amt;
        else results.push({ seat: w.idx, amount: amt, handName: w.hand.name, best5: w.hand.best5, reason: 'showdown' });
      }
    }

    this.street = 'showdown';
    this.lastResult = { type: 'showdown', pot: totalPot, results: results, board: this.board.slice() };
    this.emit('showdown', { type: 'showdown', pot: totalPot, results: results });
    this.settle(before);
    return this.lastResult;
  };

  Holdem.prototype.settle = function (before) {
    for (let i = 0; i < this.seats.length; i++) this.seats[i].delta = this.seats[i].stack - before[i] + this.seats[i].committed * 0;
    this.emit('handEnd', { result: this.lastResult, deltas: this.seats.map(function (s) { return s.delta; }) });
  };

  /* ------------------------------------------------------------------ export */

  const Poker = {
    SUITS: SUITS, SUIT_KO: SUIT_KO, SUIT_SYM: SUIT_SYM,
    RANK_STR: RANK_STR, RANK_KO: RANK_KO, CAT_KO: CAT_KO,
    Holdem: Holdem,
    evaluate: evaluate, eval5: eval5, drawInfo: drawInfo, describeHole: describeHole,
    preflopName: preflopName, chenScore: chenScore, percentileOf: percentileOf,
    monteCarloEquity: monteCarloEquity, makeDeck: makeDeck, shuffle: shuffle
  };
  global.Poker = Poker;
  if (typeof module !== 'undefined' && module.exports) module.exports = Poker;
})(typeof window !== 'undefined' ? window : globalThis);
