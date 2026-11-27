/* =============================================================================
 *  REAL HOLDEM POKER — 테이블 뷰 (스냅샷 렌더러 + 카드/족보 이펙트)
 * ========================================================================== */
(function (global) {
  'use strict';
  const P = global.Poker;
  const C = global.Cards;
  const Haptic = global.Haptic || { fire: function () {} };

  /* ---------------------------------------------------------- 스냅샷 생성 */

  const Snap = {
    build(engine, you, meta, revealAll, boardPeek) {
      meta = meta || {};
      const seats = engine.seats.map(function (s) {
        const showHole = revealAll || (s.idx === you) || s.revealed;
        return {
          idx: s.idx, name: s.name, grade: s.grade, stack: s.stack, bet: s.bet,
          committed: s.committed, inHand: s.inHand, folded: s.folded, allIn: s.allIn,
          lastAction: s.lastAction, lastAmount: s.lastAmount, revealed: s.revealed,
          won: s.won, delta: s.delta,
          hole: showHole ? s.hole.slice() : null,
          peek: !!(revealAll && s.idx !== you && !s.revealed),
          peekHand: peekHandName(engine, s, you, showHole),
          cardCount: s.hole.length,
          handName: s.hand ? s.hand.name : null,
          title: s.title || null, avatar: s.avatar || null, bot: !s.isHero && !s.remote
        };
      });
      return {
        you: you, handNo: engine.handNo, sid: engine.sessionId, street: engine.street, board: engine.board.slice(),
        pot: engine.potTotal(), dealer: engine.dealer, sbSeat: engine.sbSeat, bbSeat: engine.bbSeat,
        currentBet: engine.currentBet, acting: engine.acting, seats: seats,
        bb: engine.bb, sb: engine.sb,
        options: (you != null && engine.acting === you) ? engine.options(you) : null,
        result: engine.street === 'showdown' ? engine.lastResult : null,
        preview: boardPeek ? previewBoard(engine) : null,
        meta: meta, ts: Date.now()
      };
    }
  };

  /* GM 보드 미리보기: 엔진 덱에서 아직 깔리지 않은 플랍/턴/리버 예정 카드 */
  function previewBoard(engine) {
    if (!engine || !engine.deck || !engine.deck.length) return null;
    const left = Math.max(0, 5 - (engine.board ? engine.board.length : 0));
    if (!left) return null;
    const ptr = engine.dealPtr || 0;
    const out = [];
    for (let i = 0; i < left; i++) {
      const c = engine.deck[ptr + i];
      if (!c) break;
      out.push(c);
    }
    return out.length ? out : null;
  }

  /* GM 엿보기: 상대의 현재 보드 기준 족보 (실시간) */
  const CAT_SHORT = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];
  function peekHandName(engine, s, you, showHole) {
    if (!showHole || s.idx === you) return null;
    if (!s.hole || s.hole.length < 2 || s.folded) return null;
    if (!engine.board || engine.board.length < 3) return null;
    const ev = P.evaluate(s.hole.concat(engine.board));
    if (!ev) return null;
    return CAT_SHORT[ev.cat] || null;
  }

  /* ------------------------------------------------------------- 좌석 배치 */
  /* 테이블 상단 중앙은 딜러 자리라서 비워 둔다. 값은 table-area 기준 % */
  const SEAT_SLOTS = {
    2: [[25, 27]],
    3: [[27, 30], [73, 30]],
    4: [[31, 14], [69, 14], [14, 46]],
    5: [[31, 13], [69, 13], [11, 44], [89, 44]],
    6: [[30.5, 13.5], [69.5, 13.5], [12, 38], [88, 38], [13, 78]],
    7: [[31.5, 12], [68.5, 12], [10, 31], [90, 31], [10, 57], [90, 57]],
    8: [[31.5, 11.5], [68.5, 11.5], [11, 30], [89, 30], [11, 53], [89, 53], [22, 74]],
    9: [[30, 11], [70, 11], [11, 30], [89, 30], [11, 52], [89, 52], [19, 73], [81, 73]]
  };

  /* 등록되지 않은 인원수는 상단 중앙(딜러)을 비우고 좌우 열에 배치 */
  function seatSlots(n) {
    const fixed = SEAT_SLOTS[n];
    if (fixed) return fixed.slice(0, n - 1);
    const m = Math.max(1, n - 1);
    const perCol = Math.ceil(m / 2);
    const out = [];
    for (let k = 0; k < m; k++) {
      const col = k % 2 === 0 ? 0 : 1;        // 0 = 왼쪽 열, 1 = 오른쪽 열
      const row = Math.floor(k / 2);
      const y = perCol <= 1 ? 40 : 24 + (row * 52) / (perCol - 1);
      out.push([col === 0 ? 13 : 87, y]);
    }
    return out;
  }

  /* ------------------------------------------------------------------- View */

  const View = {
    el: {},
    snap: null,
    prev: null,
    seatCount: 0,
    you: 0,
    skins: { card: 'classic', felt: 'emerald' },
    heroRevealed: false,
    handFxDone: 0,
    cardEls: [],
    onPeek: null,

    init(dom, opts) {
      this.el = dom;
      this.skins.card = (opts && opts.cardSkin) || 'classic';
      this.skins.felt = (opts && opts.feltSkin) || 'emerald';
      const self = this;
      if (dom.fxCanvas) global.FX.init(dom.fxCanvas, dom.fxLayer);
      this.applySkins();
      if (dom.heroCards) {
        dom.heroCards.addEventListener('pointerdown', function (e) { self.startPeek(e); });
      }
      global.addEventListener('pointermove', function (e) { self.movePeek(e); });
      global.addEventListener('pointerup', function (e) { self.endPeek(e); });
      /* 액션바 높이 변화·회전 등으로 테이블 영역 크기가 바뀌면 좌석을 다시 맞춘다 */
      if (dom.tableArea && global.ResizeObserver) {
        const ro = new global.ResizeObserver(function () { self.refitSeats(); });
        ro.observe(dom.tableArea);
        this._ro = ro;
      }
    },

    applySkins() {
      const t = this.el.tableArea;
      if (!t) return;
      t.dataset.felt = this.skins.felt;
      document.documentElement.dataset.cardSkin = this.skins.card;
    },

    /* ------------------------------------------------------------ 딜러 */

    setDealer(d) {
      if (!d) return;
      this.dealer = d;
      const pic = document.getElementById('dealer-pic');
      const nm = document.getElementById('dealer-name');
      const box = document.getElementById('dealer');
      if (pic) pic.style.backgroundImage = 'url("' + d.src + '")';
      if (nm) nm.textContent = d.name;
      if (box) {
        box.dataset.outfit = d.outfit || '';
        box.classList.remove('swap');
        void box.offsetWidth;
        box.classList.add('swap');
      }
    },

    setSkins(card, felt) {
      if (card) this.skins.card = card;
      if (felt) this.skins.felt = felt;
      this.applySkins();
      if (this.snap) this.render(this.snap, true);
    },

    /* ------------------------------------------------------------ 좌석 DOM */

    buildSeats(n, you) {
      this.seatCount = n;
      this.you = you;
      const wrap = this.el.seats;
      wrap.innerHTML = '';
      wrap.className = 'seats n' + n;
      const slots = seatSlots(n);
      const area = this.el.tableArea;
      if (area) area.dataset.seats = String(n);
      const areaW = wrap.clientWidth || 1;
      const areaH = wrap.clientHeight || 1;
      let ai = 0;
      for (let i = 0; i < n; i++) {
        if (i === you) continue;
        const p = slots[Math.min(ai++, slots.length - 1)] || [50, 30];
        const s = document.createElement('div');
        s.className = 'seat ' + (p[1] < 50 ? 'up' : 'down');
        s.dataset.idx = i;
        s.dataset.sx = String(p[0]);
        s.dataset.sy = String(p[1]);
        s.style.setProperty('--bx', (-(p[0] - 50) / 50 * 26).toFixed(0) + 'px');
        s.innerHTML =
          '<div class="seat-cards"></div>' +
          '<div class="seat-main">' +
            '<div class="avatar"><span class="av-face"></span><div class="av-glow"></div></div>' +
            '<div class="grade"></div>' +
            '<div class="badge"></div>' +
            '<div class="seat-meta"><div class="nm"></div><div class="stk"></div></div>' +
          '</div>' +
          '<div class="dbtn">D</div>' +
          '<div class="think"><i></i><i></i><i></i></div>' +
          '<div class="seat-bet"></div>' +
          '<div class="peek-hand"></div>';
        wrap.appendChild(s);
        this.fitSeat(s, areaW, areaH);
      }
      // 히어로 베팅 칩은 테이블 아래쪽
      const hb = document.createElement('div');
      hb.className = 'seat-bet hero-bet';
      hb.id = 'hero-bet';
      wrap.appendChild(hb);
    },

    /* 좌석이 테이블 영역 밖으로 1px도 나가지 않게 실제 크기 기준으로 클램프 */
    fitSeat(node, areaW, areaH) {
      const sx = +(node.dataset.sx || 50), sy = +(node.dataset.sy || 30);
      const halfW = node.offsetWidth / 2, halfH = node.offsetHeight / 2;
      const x = Math.min(Math.max(halfW + 1, sx / 100 * areaW), Math.max(halfW + 1, areaW - halfW - 1));
      const y = Math.min(Math.max(halfH + 1, sy / 100 * areaH), Math.max(halfH + 1, areaH - halfH - 1));
      node.style.left = x.toFixed(1) + 'px';
      node.style.top = y.toFixed(1) + 'px';
      node.classList.toggle('up', y < areaH / 2);
      node.classList.toggle('down', y >= areaH / 2);
    },

    refitSeats() {
      const wrap = this.el.seats;
      if (!wrap) return;
      const areaW = wrap.clientWidth || 1, areaH = wrap.clientHeight || 1;
      const self = this;
      wrap.querySelectorAll('.seat').forEach(function (n) { self.fitSeat(n, areaW, areaH); });
    },

    /* -------------------------------------------------------------- 렌더링 */

    render(snap, force) {
      const prev = this.prev;
      // 오래된 스냅샷이 늦게 도착해 화면을 되돌리는 것 방지
      const sig = (snap.handNo || 0) * 10 + (snap.board ? snap.board.length : 0);
      if (!force && this._sig !== undefined && sig < this._sig) return;
      this._sig = sig;
      this.snap = snap;
      this._bb = snap.bb || this._bb;
      const n = snap.seats.length;
      if (force || this.seatCount !== n || this.you !== snap.you) {
        this.buildSeats(n, snap.you);
        this.handFxDone = 0;
        this.heroRevealed = false;
      }
      const seatMap = {};
      snap.seats.forEach(function (s) { seatMap[s.idx] = s; });

      // 좌석 업데이트
      const nodes = this.el.seats.querySelectorAll('.seat');
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const s = seatMap[+node.dataset.idx];
        if (!s) continue;
        this.paintSeat(node, s, snap);
      }

      // 이름/카드가 채워진 뒤 실제 높이로 좌석 재배치
      this.refitSeats();

      // 보드
      this.paintBoard(snap, prev);

      // 팟
      this.paintPot(snap);

      // 히어로 패널
      this.paintHero(snap, prev);

      // 딜러 → 좌석/보드 딜링 연출
      this.fxDeal(snap);

      // 결과 이펙트
      if (snap.result && (!prev || prev.handNo !== snap.handNo || !prev.result)) {
        this.playResult(snap);
      }
      // 보드 완성으로 인한 족보 이펙트 (히어로)
      if (!snap.result) this.checkHandMade(snap, prev);

      this.prev = JSON.parse(JSON.stringify({
        handNo: snap.handNo, board: snap.board, street: snap.street, you: snap.you,
        result: snap.result, seats: snap.seats, pot: snap.pot, acting: snap.acting
      }));
    },

    paintSeat(node, s, snap) {
      const idx = s.idx;
      const nm = node.querySelector('.nm');
      const stk = node.querySelector('.stk');
      const grade = node.querySelector('.grade');
      const badge = node.querySelector('.badge');
      const bet = node.querySelector('.seat-bet');
      const dbtn = node.querySelector('.dbtn');
      const cards = node.querySelector('.seat-cards');
      const av = node.querySelector('.av-face');

      node.classList.toggle('folded', !!s.folded);
      node.classList.toggle('allin', !!s.allIn);
      node.classList.toggle('acting', snap.acting === idx);
      node.classList.toggle('winner', !!(snap.result && snap.result.results && snap.result.results.some(function (r) { return r.seat === idx && r.amount > 0; })));
      node.classList.toggle('out', s.stack <= 0 && !s.inHand);

      nm.textContent = s.name;
      stk.textContent = C.fmt(s.stack);
      av.textContent = (s.avatar || '');
      const g = s.grade || 'beginner';
      grade.textContent = global.PokerAI.GRADE_KO[g] || '';
      grade.className = 'grade g-' + g;
      grade.style.display = s.isHero === false && g ? '' : (g ? '' : 'none');
      dbtn.classList.toggle('on', snap.dealer === idx);

      if (s.lastAction && s.inHand && !s.folded) {
        badge.textContent = s.lastAction;
        const k = s.lastAction.toLowerCase().replace(/[^a-z]/g, '');
        badge.className = 'badge on ' + ((k === 'sb' || k === 'bb') ? 'a-blind' : 'a-' + k);
        if (snap.acting === idx) badge.classList.add('act');
      } else if (s.folded) {
        badge.textContent = 'FOLD';
        badge.className = 'badge on a-fold dim';
      } else {
        badge.className = 'badge';
        badge.textContent = '';
      }

      if (s.bet > 0) {
        bet.innerHTML = '';
        bet.appendChild(C.chipStack(s.bet, 16));
        bet.classList.add('on');
        if (snap.result) bet.classList.remove('on');
      } else {
        bet.innerHTML = '';
        bet.classList.remove('on');
      }

      // 카드
      const wantKey = (s.hole ? s.hole.map(function (c) { return c.r + '_' + c.s; }).join(',') : 'down' + s.cardCount) + '|' + (s.revealed ? 'R' : 'D') + '|' + snap.street;
      cards.classList.toggle('gm-peek', !!s.peek);
      const peekEl = node.querySelector('.peek-hand');
      if (cards.dataset.key !== wantKey) {
        cards.dataset.key = wantKey;
        cards.innerHTML = '';
        const cnt = s.hole ? s.hole.length : s.cardCount;
        for (let k = 0; k < cnt; k++) {
          const card = s.hole ? s.hole[k] : null;
          const el = C.cardEl(card || (s.hole ? null : { r: 2, s: 0 }), { faceDown: !s.hole, skin: this.skins.card });
          if (!s.hole) { el.dataset.hidden = '1'; }
          el.classList.add('mini');
          el.style.setProperty('--d', (k * 70) + 'ms');
          el.classList.add('dealing');
          cards.appendChild(el);
          if (s.hole) this.cardEls.push(el);
        }
        if (s.revealed && s.hole) {
          const self = this;
          setTimeout(function () { Sound.flip(); }, 160);
          const els = cards.querySelectorAll('.card');
          for (let k = 0; k < els.length; k++) {
            (function (el, k2) {
              setTimeout(function () { global.FX.cardReveal(el); }, 120 + k2 * 120);
            })(els[k], k);
          }
        }
      } else if (s.folded) {
        cards.classList.add('muck');
      }
      if (peekEl) {
        peekEl.textContent = s.peekHand || '';
        peekEl.classList.toggle('on', !!s.peekHand);
      }
      if (!s.folded) cards.classList.remove('muck');
    },

    paintBoard(snap, prev) {
      const el = this.el.board;
      const board = snap.board;
      const hkey = String(snap.sid || '') + '_' + snap.handNo;
      if (el.dataset.hand !== hkey) {
        el.innerHTML = '';
        el.dataset.hand = hkey;
        this.cardEls = [];
        for (let i = 0; i < 5; i++) {
          const slot = document.createElement('div');
          slot.className = 'board-slot empty';
          slot.dataset.i = i;
          el.appendChild(slot);
        }
      }
      const slots = el.querySelectorAll('.board-slot');
      // 새 보드 카드는 딜러에서 날아오는 연출에 맡기고, 여기서는 숨김 상태로만 만든다
      const deferFlight = !!(snap.meta && snap.meta.phase === 'board');
      for (let i = 0; i < board.length; i++) {
        const slot = slots[i];
        if (!slot || slot.dataset.filled === '1') continue;
        slot.dataset.filled = '1';
        slot.classList.remove('empty');
        slot.classList.remove('has-ghost');
        slot.dataset.ghost = '';
        const g = slot.querySelector('.ghost-card');
        if (g) g.remove();
        const card = board[i];
        const c = C.cardEl(card, { skin: this.skins.card });
        c.style.setProperty('--d', '0ms');
        slot.appendChild(c);
        this.cardEls.push(c);
        if (deferFlight) {
          c.classList.add('await');
        } else {
          c.classList.add('flip-in');
          (function (cc, delay) {
            setTimeout(function () {
              Sound.deal();
              Sound.flip();
              global.FX.cardReveal(cc);
            }, delay);
          })(c, (i - (prev && prev.handNo === snap.handNo ? Math.min(prev.board.length, board.length) : 0)) * 170 + 120);
        }
      }
      // GM 보드 미리보기 — 빈 자리에 예정 카드를 시안 점선으로
      const preview = snap.preview || null;
      for (let i = board.length; i < 5; i++) {
        const slot = slots[i];
        if (!slot) continue;
        const card = preview ? preview[i - board.length] : null;
        const key = card ? (card.r + '_' + card.s) : '';
        if (slot.dataset.ghost === key) continue;
        slot.dataset.ghost = key;
        const old = slot.querySelector('.ghost-card');
        if (old) old.remove();
        if (card) {
          const gc = C.cardEl(card, { skin: this.skins.card });
          gc.classList.add('ghost-card');
          slot.appendChild(gc);
          slot.classList.add('has-ghost');
        } else {
          slot.classList.remove('has-ghost');
        }
      }
    },

    paintPot(snap) {
      const pot = this.el.pot;
      const val = snap.pot;
      if (pot.dataset.val !== String(val)) {
        pot.dataset.val = String(val);
        if (val > 0) {
          pot.innerHTML = '<div class="pot-chips"></div><div class="pot-text"><span class="pot-lbl">POT</span><b>' + C.fmt(val) + '</b></div>';
          const pc = pot.querySelector('.pot-chips');
          const stack = C.chipStack(val, 16);
          stack.classList.add('pot-stack');
          pc.appendChild(stack);
        } else {
          pot.innerHTML = '';
        }
      }
    },

    paintHero(snap, prev) {
      const s = snap.seats[snap.you];
      if (!s) return;
      const p = this.el.heroPanel;
      p.classList.toggle('acting', snap.acting === snap.you);
      p.classList.toggle('folded', !!s.folded);
      const nm = p.querySelector('.hero-nm');
      if (nm) nm.textContent = (s.name || '나') + (s.title ? ' · ' + s.title : '');
      const stk = p.querySelector('.hero-stk');
      if (stk) stk.textContent = C.fmt(s.stack);
      const grade = p.querySelector('.hero-grade');
      if (grade) grade.textContent = '';

      const cards = this.el.heroCards;
      const hkey2 = String(snap.sid || '') + '_' + snap.handNo;
      if (cards.dataset.hand !== hkey2) {
        cards.dataset.hand = hkey2;
        cards.innerHTML = '';
        this.heroRevealed = false;
        const cnt = s.hole ? s.hole.length : s.cardCount;
        for (let k = 0; k < cnt; k++) {
          const card = s.hole ? s.hole[k] : null;
          const el = C.cardEl(card || { r: 2, s: 0 }, { faceDown: true, skin: this.skins.card });
          el.classList.add('hero-card', 'is-down');
          el.dataset.slot = k;
          if (!card) el.dataset.blank = '1';
          el.style.setProperty('--d', (k * 110) + 'ms');
          cards.appendChild(el);
          setTimeout(function () { Sound.deal(); }, k * 150);
          if (card) this.cardEls.push(el);
        }
        const hint = document.createElement('div');
        hint.className = 'peek-hint';
        hint.textContent = '카드를 탭하면 오픈';
        cards.appendChild(hint);
        // 자동 오픈 (액션 차례가 되면)
      }

      // 상태 표시
      const label = p.querySelector('.hand-label');
      const sub = p.querySelector('.hand-sub');
      if (s.folded) { label.textContent = '폴드'; sub.textContent = ''; }
      else if (this.heroRevealed && s.hole) {
        const d = P.describeHole(s.hole, snap.board);
        label.textContent = d.label;
        sub.textContent = d.sub || '';
      } else {
        label.textContent = '';
        sub.textContent = '';
      }
    },

    /* ------------------------------------------------------ 딜링 연출 */

    dealerPoint() {
      const pic = document.getElementById('dealer-pic') || document.getElementById('dealer');
      if (!pic) return null;
      const r = pic.getBoundingClientRect();
      if (!r.width) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.52, w: r.width, h: r.height };
    },

    dealerFlash() {
      const d = document.getElementById('dealer');
      if (!d) return;
      d.classList.remove('dealing');
      void d.offsetWidth;
      d.classList.add('dealing');
      setTimeout(function () { d.classList.remove('dealing'); }, 680);
    },

    /* 딜러 위치에서 대상 카드 자리로 뒷면 카드를 실제로 날려 보낸다 */
    flyCard(target, delay, dur, cb) {
      const layer = this.el.fxLayer;
      const o = this.dealerPoint();
      if (!layer || !o || !target) { if (cb) cb(); return; }
      const r = target.getBoundingClientRect();
      if (!r.width || !r.height) { if (cb) cb(); return; }
      // 좌석/히어로 카드 크기가 달라도 날아가는 카드는 같은 크기로 (딜링 일관성)
      const tw = Math.min(r.width, 44);
      const w = tw, h = tw * 1.42;
      const el = document.createElement('div');
      el.className = 'deal-fly';
      el.style.left = (o.x - w / 2) + 'px';
      el.style.top = (o.y - h / 2) + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      layer.appendChild(el);
      const dx = (r.left + r.width / 2) - o.x;
      const dy = (r.top + r.height / 2) - o.y;
      const spin = (Math.random() * 12 - 6).toFixed(1);
      let anim = null;
      try {
        anim = el.animate([
          { transform: 'translate(0px, 0px) rotate(-7deg) scale(1.05)' },
          { transform: 'translate(' + (dx * 0.5).toFixed(1) + 'px,' + (dy * 0.5 - 24).toFixed(1) + 'px) rotate(' + spin + 'deg) scale(1.01)', offset: 0.6 },
          { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) rotate(0deg) scale(1)' }
        ], { duration: dur, delay: delay, easing: 'cubic-bezier(.25,.75,.35,1)', fill: 'both' });
      } catch (e) {
        el.remove(); if (cb) cb(); return;
      }
      const done = function () {
        if (el.parentNode) el.remove();
        if (cb) cb();
      };
      anim.onfinish = done;
      anim.oncancel = done;
    },

    holeTarget(snap, seat, pass) {
      if (seat === snap.you) {
        const list = document.querySelectorAll('#hero-cards .hero-card');
        return list[pass] || null;
      }
      const node = this.el.seats.querySelector('.seat[data-idx="' + seat + '"]');
      if (!node) return null;
      const cards = node.querySelectorAll('.seat-cards .card');
      return cards[pass] || null;
    },

    fxDeal(snap) {
      const meta = snap.meta || {};
      if (!meta.phase) return;
      if (meta.phase === 'deal' && meta.dealHole) this.dealHoleFx(snap);
      else if (meta.phase === 'board' && meta.dealt) this.dealBoardFx(snap, meta.dealt);
    },

    dealHoleFx(snap) {
      const key = 'H' + (snap.sid || '') + ':' + snap.handNo;
      if (this._fxDealKey === key) return;
      this._fxDealKey = key;
      const n = snap.seats.length;
      const start = (snap.dealer + 1) % n;
      const order = [];
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < n; k++) {
          const idx = (start + k) % n;
          const s = snap.seats[idx];
          if (s && s.inHand) order.push({ seat: idx, pass: pass });
        }
      }
      if (!order.length) return;
      const self = this;
      const stagger = Math.min(58, Math.round(520 / order.length));
      const dp = this.dealerPoint();
      if (dp && global.FX) global.FX.glow(dp.x, dp.y, 'rgba(255,214,102,0.16)', Math.max(40, dp.w * 0.5));
      this.dealerFlash();
      order.forEach(function (o, i) {
        const target = self.holeTarget(snap, o.seat, o.pass);
        if (!target) return;
        target.classList.remove('dealing');
        if (!target.classList.contains('await')) target.classList.add('await');
        self.flyCard(target, i * stagger, 300, function () {
          target.classList.remove('await');
          target.classList.add('landed');
          setTimeout(function () { target.classList.remove('landed'); }, 260);
        });
      });
      // 안전장치: 연출이 중간에 끊겨도 카드가 영영 숨지 않게
      setTimeout(function () {
        document.querySelectorAll('.seat-cards .card.await, #hero-cards .card.await').forEach(function (c) {
          c.classList.remove('await');
        });
      }, 2600);
    },

    dealBoardFx(snap, dealt) {
      const key = 'B' + (snap.sid || '') + ':' + snap.handNo + ':' + snap.board.length;
      if (this._fxBoardKey === key) return;
      this._fxBoardKey = key;
      const slots = this.el.board.querySelectorAll('.board-slot');
      const self = this;
      const first = Math.max(0, snap.board.length - dealt);
      this.dealerFlash();
      let d = 0;
      for (let i = first; i < snap.board.length; i++) {
        const slot = slots[i];
        if (!slot) continue;
        const cardEl = slot.querySelector('.card');
        if (!cardEl) continue;
        cardEl.classList.add('await');
        (function (cc, delay) {
          self.flyCard(cc, delay, 260, function () {
            cc.classList.remove('await');
            cc.classList.add('flip-in');
            Sound.deal();
            Sound.flip();
            global.FX.cardReveal(cc);
          });
        })(cardEl, d * 130);
        d++;
      }
    },

    /* ------------------------------------------------------------ 이펙트 */

    revealHeroCards(auto) {
      if (this.heroRevealed) return;
      const cards = this.el.heroCards;
      const els = cards.querySelectorAll('.hero-card');
      if (!els.length) return;
      this.heroRevealed = true;
      const self = this;
      els.forEach(function (el, i) {
        setTimeout(function () {
          el.classList.remove('is-down');
          el.classList.add('flipping');
          Sound.flip();
          global.FX.cardReveal(el);
          setTimeout(function () { el.classList.remove('flipping'); }, 900);
        }, i * 130);
      });
      const hint = cards.querySelector('.peek-hint');
      if (hint) { hint.classList.add('gone'); setTimeout(function () { hint.remove(); }, 400); }
      if (this.snap) this.paintHero(this.snap, null);
      if (this.onPeek) this.onPeek();
    },

    startPeek(e) {
      const card = e.target.closest ? e.target.closest('.hero-card') : null;
      if (!card || !card.classList.contains('is-down')) return;
      this._peek = { card: card, y: e.clientY, moved: 0, id: card.dataset.slot };
      card.classList.add('peeking');
    },
    movePeek(e) {
      if (!this._peek) return;
      const dy = this._peek.y - e.clientY;
      this._peek.moved = Math.max(this._peek.moved, Math.abs(dy));
      const p = Math.max(0, Math.min(1, dy / 90));
      this._peek.card.style.setProperty('--pk', p.toFixed(2));
      if (p > 0.5 && !this._peek.sounded) { this._peek.sounded = true; Sound.deal(); }
    },
    endPeek(e) {
      if (!this._peek) return;
      const peek = this._peek;
      this._peek = null;
      peek.card.classList.remove('peeking');
      peek.card.style.setProperty('--pk', '0');
      if (peek.moved < 8) {
        // 탭 → 시원하게 오픈
        this.revealHeroCards();
      }
    },

    checkHandMade(snap, prev) {
      if (!this.heroRevealed) return;
      const s = snap.seats[snap.you];
      if (!s || !s.hole || s.folded) return;
      if (snap.board.length < 5) {
        if (snap.board.length < 3) return;
      }
      const ev = P.evaluate(s.hole.concat(snap.board));
      if (!ev) return;
      const key = snap.handNo + ':' + snap.board.length;
      if (this.handFxDone >= ev.cat && this._lastCatKey === key) return;
      this._lastCatKey = key;
      if (ev.cat < 2) return;
      if (this.handFxDone >= ev.cat) return;
      this.handFxDone = ev.cat;
      const catName = P.CAT_KO[ev.cat];
      const els = [];
      const self = this;
      (ev.best5 || []).forEach(function (c) {
        const found = self.findCardEl(c);
        if (found) els.push(found);
      });
      global.FX.handComplete(els, catName);
      if (ev.cat >= 3) {
        Haptic.fire([40, 40, 80]);
        Sound.fanfare();
        global.FX.banner((ev.cat === 8 && ev.kickers[0] === 14) ? '로열 플러시!' : catName + '!', '내 핸드 완성', { cls: 'cat' + ev.cat });
        global.FX.confettiBurst(global.innerWidth / 2, global.innerHeight * 0.42, 40);
      } else if (ev.cat === 2) {
        Sound.fanfare(0.05);
      }
    },

    findCardEl(card) {
      const list = this.cardEls || [];
      for (let i = 0; i < list.length; i++) {
        const el = list[i];
        if (!el || !el.dataset || el.dataset.rank === undefined) continue;
        const r = el.dataset.rank, s = 'shdc'.indexOf(el.dataset.suit);
        if (P.RANK_STR[card.r] === r && card.s === s) return el;
      }
      return null;
    },

    playResult(snap) {
      const res = snap.result;
      if (!res || !res.results) return;
      const winners = res.results.filter(function (r) { return r.amount > 0; });
      if (!winners.length) return;
      const best = winners.slice().sort(function (a, b) { return b.amount - a.amount; })[0];
      const youWon = winners.some(function (w) { return w.seat === snap.you; });
      const showdown = res.type === 'showdown';

      // 족보 5장 글로우
      const els = [];
      const self = this;
      winners.forEach(function (w) {
        if (w.best5) w.best5.forEach(function (c) {
          const el = self.findCardEl(c);
          if (el && els.indexOf(el) < 0) els.push(el);
        });
      });
      if (els.length) global.FX.handComplete(els, best.handName);

      // 팟 → 승자 칩 샤워
      const potEl = this.el.pot.querySelector('.pot-chips') || this.el.pot;
      const pr = potEl.getBoundingClientRect();
      const target = this.seatCenter(best.seat);
      if (pr && target && best.amount > 0) {
        global.FX.chipFly(
          { x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 },
          target, Math.min(20, 6 + Math.round(best.amount / Math.max(1, this._bb || 20))), youWon ? 'c25' : 'c5'
        );
      }

      const cc = best.best5 ? P.evaluate(best.best5).cat : -1;
      const name = best.handName || '';
      if (winners.length > 1) {
        global.FX.banner('스플릿 팟', name || '동점', { cls: 'split' });
      } else if (cc >= 2) {
        if (!this._madeBanner) {
          global.FX.banner(name.split(' · ')[0] + '!', name.split(' · ')[1] || '', { cls: 'cat' + cc, note: (youWon ? '내가 획득 ' : '') + '+' + C.fmt(best.amount) });
        }
      } else if (youWon && showdown) {
        global.FX.banner('WINNER', name || '', { cls: 'win', note: '+' + C.fmt(best.amount) });
      }
      if (youWon) {
        Sound.win();
        if (showdown) Haptic.fire([40, 40, 80]);
        if (showdown && best.amount >= (this._bb || 20) * 4) {
          global.FX.coinShower(global.innerWidth / 2, global.innerHeight * 0.5, global.innerWidth * 0.7, 34);
        }
        const hp = this.el.heroPanel;
        if (hp) { hp.classList.add('win-flash'); setTimeout(function () { hp.classList.remove('win-flash'); }, 1400); }
      } else if (showdown) {
        Sound.lose(0.1);
      }
      const winNode = this.el.seats.querySelector('.seat[data-idx="' + best.seat + '"]');
      if (winNode) winNode.classList.add('winner');
    },

    seatCenter(idx) {
      if (idx === this.you) {
        const r = this.el.heroPanel.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      const node = this.el.seats.querySelector('.seat[data-idx="' + idx + '"]');
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },

    boardCenter() {
      const r = this.el.board.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },

    /* 액션 배지 + 사운드 */
    fxAction(snap, meta) {
      const a = meta.action, seat = meta.actionSeat;
      if (!a) return;
      const node = seat === snap.you ? null : this.el.seats.querySelector('.seat[data-idx="' + seat + '"]');
      if (a === 'check') Sound.check();
      else if (a === 'fold') Sound.fold();
      else if (a === 'call') Sound.chip(0, 2);
      else if (a === 'raise' || a === 'bet') { Sound.chip(0, 4); }
      else if (a === 'allin') { Sound.allin(); if (node) global.FX.shake(node, 400); }
      if (node && (a === 'raise' || a === 'allin' || a === 'bet')) {
        const b = node.querySelector('.badge');
        if (b) { b.classList.add('pop'); setTimeout(function () { b.classList.remove('pop'); }, 500); }
      }
    }
  };

  global.Snap = Snap;
  global.View = View;
})(window);
