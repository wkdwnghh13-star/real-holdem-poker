/* =============================================================================
 *  REAL HOLDEM POKER — 온라인 멀티플레이 (호스트 권한 모델)
 *  호스트: 덱 셔플 · 홀카드 분배(개인화 전송) · 턴 진행 · 쇼다운 판정 전담
 *  클라이언트: 스냅샷 렌더 + 액션 전송
 * ========================================================================== */
(function (global) {
  'use strict';

  const AI_NAMES = ['한강타짜', '블러핑장인', '포커페이스99', '리버헌터', '칩리더', '올인스타', '슬로우롤', '매버릭'];
  const AVATARS = ['🦈', '🐺', '🦊', '🐯', '🦁', '🐻', '🐲', '🐼'];

  function MPSession(opts) {
    this.opts = opts || {};
    this.role = this.opts.role;             // 'host' | 'client'
    this.code = String(this.opts.code || '');
    this.name = this.opts.name || '플레이어';
    this.title = this.opts.title || null;
    this.account = this.opts.account || null;   // {id, nick, tier, chips, role}
    this.transport = this.opts.transport || 'bc';
    this.relayUrl = this.opts.relayUrl || '';
    this.size = this.opts.size || 6;
    this.fillGrade = this.opts.fillGrade || 'expert';
    this.buyIn = this.opts.buyIn || 10000;
    this.room = this.opts.room || { sb: 25, bb: 50, name: '친구방' };
    this.handlers = this.opts.handlers || {};
    this.id = global.Net.makeId();
    this.clients = new Map();               // id -> {id, seat, name, title, connected}
    this.engine = null;
    this.runner = null;
    this.started = false;
    this.seat = this.role === 'host' ? 0 : null;
    this.alive = true;
    this._loopRunning = false;
  }

  MPSession.prototype.h = function (name) {
    const fn = this.handlers[name];
    const args = Array.prototype.slice.call(arguments, 1);
    if (typeof fn === 'function') return fn.apply(null, args);
    return null;
  };

  MPSession.prototype.connect = function () {
    const self = this;
    const handlers = {
      onStatus: function (st, detail) {
        if (!self.alive) return;
        if (st === 'error' || st === 'timeout') {
          if (self.connected) return;               // 이미 다른 경로로 연결됨
          self.h('onStatus', st, detail);
          return;
        }
        if (st === 'open') {
          self.connected = true;
          if (self.account) self.net.send(null, { t: 'accountSync', profile: self.account });
        }
        self.h('onStatus', st, detail);
        if (st === 'open' && self.role === 'client' && !self.joined) self.sendJoin();
      },
      onPeer: function (id, info) {
        if (self.role !== 'host') return;
        if (!self.clients.has(id)) {
          self.clients.set(id, { id: id, seat: null, name: (info && info.name) || '친구', title: null, connected: true });
          self.assignSeats();
          self.broadcastLobby();
        }
      },
      onPeerLeave: function (id) {
        if (self.role !== 'host') return;
        const c = self.clients.get(id);
        if (c) {
          c.connected = false;
          if (self.started && c.seat != null && self.engine) {
            const s = self.engine.seats[c.seat];
            s.name = c.name + '(AI)';
            s.grade = 'expert';
            s.remote = false;
            self.runner.humanSeats.delete(c.seat);
            self.push();
            self.h('onSeatTakenOver', c.name);
          }
          self.clients.delete(id);
          if (!self.started) { self.assignSeats(); self.broadcastLobby(); }
        }
      },
      onMessage: function (from, msg) { self.onMessage(from, msg); }
    };

    const mk = function (transport) {
      return global.Net.create({
        role: self.role, code: self.code, id: self.id, name: self.name, title: self.title,
        transport: transport, relayUrl: self.relayUrl, handlers: handlers
      });
    };

    this.net = new global.Net.MultiAdapter();
    const t = this.transport;
    if (t === 'ws') {
      this.net.add(mk('ws'));
      return;
    }
    // 호스트는 항상 같은 기기(BC) + 인터넷(P2P) 둘 다 열어둔다
    if (t === 'auto' || t === 'bc' || t === 'peer') {
      if (t !== 'peer') this.net.add(mk('bc'));
      if (t !== 'bc' && global.Peer) {
        if (this.role === 'host' || t === 'peer') {
          this.net.add(mk('peer'));
        } else {
          // 참가자: 같은 기기 연결을 먼저 시도하고, 응답 없으면 P2P로 전환
          this._peerTimer = setTimeout(function () {
            if (self.alive && !self.joined && global.Peer) self.net.add(mk('peer'));
          }, 1700);
        }
      }
    }
  };

  /* --------------------------------------------------------------- 클라이언트 */

  MPSession.prototype.sendJoin = function () {
    if (this.role !== 'client') return;
    this.net.send(null, { t: 'joinReq', name: this.name, title: this.title, account: this.account });
    this.h('onStatus', 'joining');
  };

  /* ----------------------------------------------------------------- 호스트 */

  MPSession.prototype.assignSeats = function () {
    if (this.role !== 'host') return;
    let next = 1;
    const taken = new Set();
    this.clients.forEach(function (c) { if (c.seat != null) taken.add(c.seat); });
    this.clients.forEach(function (c) {
      if (c.seat == null) {
        while (next <= this.size - 1 && taken.has(next)) next++;
        if (next > this.size - 1) { c.seat = null; return; }
        c.seat = next; taken.add(next); next++;
      }
    }, this);
  };

  MPSession.prototype.lobbyState = function () {
    const seats = [];
    seats.push({ seat: 0, name: this.name, title: this.title, ai: false, host: true, connected: true, account: this.account });
    this.clients.forEach(function (c) {
      if (c.seat != null) seats.push({ seat: c.seat, name: c.name, title: c.title, ai: false, host: false, connected: c.connected, account: c.account || null });
    });
    const list = seats.sort(function (a, b) { return a.seat - b.seat; });
    for (let i = 0; i < this.size; i++) {
      if (!list.some(function (s) { return s.seat === i; })) list.push({ seat: i, name: AI_NAMES[i % AI_NAMES.length], ai: true, grade: this.fillGrade });
    }
    list.sort(function (a, b) { return a.seat - b.seat; });
    return { t: 'lobby', code: this.code, size: this.size, seats: list, fillGrade: this.fillGrade, started: this.started, room: this.room.name };
  };

  MPSession.prototype.broadcastLobby = function () {
    if (this.role !== 'host') return;
    const st = this.lobbyState();
    this.clients.forEach(function (c) {
      if (c.connected) this.net.send(c.id, st);
    }, this);
    this.h('onLobby', st);
  };

  MPSession.prototype.clientCount = function () {
    let n = 0;
    this.clients.forEach(function (c) { if (c.connected && c.seat != null) n++; });
    return n;
  };

  MPSession.prototype.startGame = function () {
    if (this.role !== 'host') return false;
    const self = this;
    this.started = true;
    const players = [];
    players.push({ name: this.name, grade: 'human', isHero: true, stack: this.buyIn, title: this.title, avatar: '🎯' });
    const seated = [];
    this.clients.forEach(function (c) { if (c.connected && c.seat != null) seated.push(c); });
    seated.sort(function (a, b) { return a.seat - b.seat; });
    // 1번 좌석부터 순서대로 채우되, 빈 좌석은 AI
    const bySeat = {};
    seated.forEach(function (c) { bySeat[c.seat] = c; });
    const grades = (this.opts.grades || ['expert', 'expert', 'beginner', 'expert', 'pro', 'expert', 'beginner', 'pro']);
    let ai = 0;
    for (let i = 1; i < this.size; i++) {
      if (bySeat[i]) {
        players.push({ name: bySeat[i].name, grade: 'human', stack: this.buyIn, title: bySeat[i].title, remote: true, avatar: AVATARS[i % AVATARS.length] });
      } else {
        const g = this.fillGrade === 'mix' ? grades[ai % grades.length] : this.fillGrade;
        players.push({ name: AI_NAMES[ai % AI_NAMES.length], grade: g, stack: this.buyIn, avatar: AVATARS[ai % AVATARS.length] });
        ai++;
      }
    }
    this.engine = new global.Poker.Holdem({
      seatCount: this.size, smallBlind: this.room.sb, bigBlind: this.room.bb, players: players
    });
    const humanSeats = [0];
    seated.forEach(function (c) { humanSeats.push(c.seat); });
    this.humanSeats = humanSeats;

    this.runner = new global.GameRunner({
      engine: this.engine,
      humanSeats: humanSeats,
      speed: this.opts.speed || 'normal',
      turnSeconds: 30,
      heroStats: this.opts.heroStats || function () { return null; },
      onSnapshot: function (meta) { self.push(meta); },
      onHumanTurn: function (seat, options) {
        if (seat === 0) self.h('onMyTurn', options, 0);
        else self.h('onFriendTurn', seat);
      },
      onHandDone: function (res) { self.h('onHandDone', res); },
      onLog: function () {}
    });

    this.clients.forEach(function (c) {
      if (c.connected && c.seat != null) {
        self.net.send(c.id, { t: 'start', you: c.seat, snapshot: self.snapFor(c.seat, { phase: 'start' }), room: self.room, size: self.size });
      }
    });
    this.h('onStart', { you: 0, snapshot: this.snapFor(0, { phase: 'start' }), room: this.room, size: this.size });
    this.loop();
    return true;
  };

  MPSession.prototype.push = function (meta) {
    if (!this.engine) return;
    const self = this;
    const m = meta || {};
    this.clients.forEach(function (c) {
      if (c.connected && c.seat != null) self.net.send(c.id, { t: 'state', snapshot: self.snapFor(c.seat, m) });
    });
    this.h('onSnapshot', this.snapFor(0, m));
  };

  MPSession.prototype.snapFor = function (seat, meta) {
    return global.Snap.build(this.engine, seat, meta || {}, seat === 0 ? !!this.gmPeek : false, seat === 0 ? !!this.gmBoard : false);
  };

  MPSession.prototype.loop = async function () {
    if (this._loopRunning) return;
    this._loopRunning = true;
    const sleep = global.sleepFn;
    while (this.alive && this.started) {
      const funded = this.engine.seats.filter(function (s) { return s.stack > 0; });
      if (funded.length < 2) break;
      await this.runner.runHand();
      this.handCount = (this.handCount || 0) + 1;
      await sleep(this.runner.ms(1800, 900));
      if (this.handCount > 400) break;
    }
    this._loopRunning = false;
    this.h('onGameOver');
  };

  /* --------------------------------------------------------- 메시지 처리 */

  MPSession.prototype.onMessage = function (from, msg) {
    if (!msg || !msg.t) return;
    const self = this;

    if (this.role === 'host') {
      if (msg.t === 'joinReq') {
        let c = this.clients.get(from);
        if (!c) {
          c = { id: from, seat: null, name: msg.name || '친구', title: msg.title || null, connected: true, account: msg.account || null };
          this.clients.set(from, c);
          this.assignSeats();
        } else {
          c.name = msg.name || c.name; c.title = msg.title || c.title; c.connected = true;
          if (msg.account) c.account = msg.account;
        }
        this.broadcastLobby();
        if (this.started && c.seat != null) {
          this.net.send(from, { t: 'start', you: c.seat, snapshot: this.snapFor(c.seat, { phase: 'rejoin' }), room: this.room, size: this.size });
        }
        return;
      }
      if (msg.t === 'action') {
        let seat = null;
        this.clients.forEach(function (c) { if (c.id === from) seat = c.seat; });
        if (seat == null || !this.runner) return;
        this.runner.submitAction(seat, msg.action, msg.amount);
        return;
      }
      if (msg.t === 'leave') {
        const c = this.clients.get(from);
        if (c) { c.connected = false; this.clients.delete(from); this.broadcastLobby(); }
        return;
      }
      if (msg.t === 'hello') {
        this.broadcastLobby();
        return;
      }
    } else {
      // client
      if (msg.t === 'hostPing') { if (!this.joined) this.sendJoin(); return; }
      if (msg.t === 'lobby') { this.joined = true; this.h('onLobby', msg); return; }
      if (msg.t === 'start') {
        this.joined = true; this.started = true; this.seat = msg.you;
        this.roomInfo = msg.room; this.size = msg.size;
        this.h('onStart', msg);
        return;
      }
      if (msg.t === 'state') { this.h('onSnapshot', msg.snapshot); return; }
      if (msg.t === 'end') { this.h('onClosed'); return; }
    }
  };

  MPSession.prototype.sendAction = function (action, amount) {
    if (this.role === 'client') this.net.send(null, { t: 'action', action: action, amount: amount });
    else if (this.runner) this.runner.submitAction(0, action, amount);
  };

  /* 호스트: 좌석 채울 AI 등급 변경 */
  MPSession.prototype.setFillGrade = function (g) {
    this.fillGrade = g;
    this.broadcastLobby();
  };

  MPSession.prototype.kick = function (seat) {
    const self = this;
    this.clients.forEach(function (c) {
      if (c.seat === seat) {
        self.net.send(c.id, { t: 'kicked' });
        c.connected = false;
      }
    });
    this.clients.forEach(function (c, id) { if (!c.connected) self.clients.delete(id); });
    this.broadcastLobby();
  };

  MPSession.prototype.close = function () {
    this.alive = false;
    if (this._peerTimer) clearTimeout(this._peerTimer);
    if (this.runner) this.runner.stop();
    if (this.net) this.net.close();
    this.h('onClosed');
  };

  global.MPSession = MPSession;
  global.MP = { AI_NAMES: AI_NAMES, AVATARS: AVATARS };
})(window);
