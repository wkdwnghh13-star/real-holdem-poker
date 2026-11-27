/* =============================================================================
 *  REAL HOLDEM POKER — 계정 · 세션 · 운영자 권한
 *  - 회원가입 / 로그인 / 게스트 체험 / 로그아웃
 *  - 계정별 진행도(뱅크롤·전적·스킨·영수증)를 localStorage 에 분리 저장
 *  - 운영자 계정(admin / juho) 로그인 시 운영자 모드 자동 활성화
 *  - 멀티플레이(relay)에는 공개 프로필(닉네임·티어·칩)만 동기화
 * ========================================================================== */
(function (global) {
  'use strict';

  const ACC_KEY = 'realholdem.accounts.v1';
  const SESS_KEY = 'realholdem.session.v1';
  const SESSION_DAYS = 30;

  /* 운영자 전용 계정 시드 — 로그인 화면의 '운영자 계정 안내'에 표기 */
  const ADMIN_SEEDS = [
    { id: 'admin', pw: '7073', nick: '운영자' },
    { id: 'juho', pw: '7073', nick: '주호' }
  ];

  function hash(str) {
    let h = 5381;
    const s = String(str);
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(36);
  }
  function nowISO() { return new Date().toISOString(); }
  function uid(prefix) {
    return (prefix || 'u_') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }
  function readJSON(key, fallback) {
    try {
      const raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { global.localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  const Auth = {
    accounts: [],
    session: null,
    listeners: [],

    /* ------------------------------------------------------------- 저장소 */
    load() {
      const list = readJSON(ACC_KEY, []);
      this.accounts = Array.isArray(list) ? list : [];
      /* 운영자 계정은 항상 존재하도록 보장 (비밀번호는 해시로만 저장) */
      const self = this;
      ADMIN_SEEDS.forEach(function (seed) {
        if (!self.find(seed.id)) {
          self.accounts.push({
            id: seed.id, pw: hash(seed.pw), nick: seed.nick, role: 'admin',
            createdAt: nowISO(), progress: null, receipts: []
          });
        }
      });
      this.saveAccounts();

      const sess = readJSON(SESS_KEY, null);
      this.session = (sess && sess.id && this.find(sess.id)) ? sess : null;
      return this.session;
    },

    saveAccounts() {
      writeJSON(ACC_KEY, this.accounts.map(function (a) {
        return {
          id: a.id, pw: a.pw, nick: a.nick, role: a.role || 'user', guest: !!a.guest,
          createdAt: a.createdAt, lastLogin: a.lastLogin || null,
          progress: a.progress || null, receipts: a.receipts || []
        };
      }));
    },

    find(id) {
      if (!id) return null;
      const key = String(id).toLowerCase();
      return this.accounts.filter(function (a) { return String(a.id).toLowerCase() === key; })[0] || null;
    },

    current() { return this.session ? this.find(this.session.id) : null; },
    isAdmin() { const a = this.current(); return !!(a && a.role === 'admin'); },
    isGuest() { const a = this.current(); return !!(a && a.guest); },

    emit() {
      const a = this.current();
      this.listeners.forEach(function (fn) { try { fn(a); } catch (e) {} });
    },
    on(fn) { this.listeners.push(fn); },

    /* ------------------------------------------------------------- 가입/로그인 */
    signup(opts) {
      opts = opts || {};
      const id = String(opts.id || '').trim().toLowerCase();
      const pw = String(opts.pw || '');
      const nick = String(opts.nick || '').trim();
      if (!/^[a-z0-9_]{4,16}$/.test(id)) return { ok: false, msg: '아이디는 영문·숫자 4~16자' };
      if (pw.length < 4) return { ok: false, msg: '비밀번호는 4자 이상' };
      if (!nick || nick.length > 12) return { ok: false, msg: '닉네임은 1~12자' };
      if (this.find(id)) return { ok: false, msg: '이미 사용 중인 아이디야' };
      const acct = {
        id: id, pw: hash(pw), nick: nick, role: 'user', guest: false,
        createdAt: nowISO(), progress: null, receipts: []
      };
      this.accounts.push(acct);
      this.saveAccounts();
      return this.login(id, pw);
    },

    login(id, pw) {
      const acct = this.find(id);
      if (!acct) return { ok: false, msg: '없는 아이디야' };
      if (acct.pw !== hash(pw)) return { ok: false, msg: '비밀번호가 달라' };
      acct.lastLogin = nowISO();
      this.session = { id: acct.id, at: nowISO() };
      writeJSON(SESS_KEY, this.session);
      this.saveAccounts();
      this.emit();
      return { ok: true, account: acct, admin: acct.role === 'admin' };
    },

    /* 게스트 체험 — 즉시 플레이, 계정은 로컬에만 저장 */
    guest(nick) {
      const n = 1 + this.accounts.filter(function (a) { return a.guest; }).length;
      const acct = {
        id: uid('guest_'), pw: hash(uid('g')), nick: (nick && nick.slice(0, 12)) || ('게스트' + n),
        role: 'user', guest: true, createdAt: nowISO(), progress: null, receipts: []
      };
      this.accounts.push(acct);
      this.saveAccounts();
      this.session = { id: acct.id, at: nowISO() };
      writeJSON(SESS_KEY, this.session);
      this.emit();
      return { ok: true, account: acct };
    },

    logout() {
      this.session = null;
      try { global.localStorage.removeItem(SESS_KEY); } catch (e) {}
      this.emit();
      return true;
    },

    /* ------------------------------------------------ 진행도(계정별) 연동 */
    snapshotProgress(Pr) {
      return {
        bankroll: Pr.data.bankroll, peak: Pr.data.peak,
        hands: Pr.data.hands, wins: Pr.data.wins,
        showdowns: Pr.data.showdowns, showdownWins: Pr.data.showdownWins,
        foldWins: Pr.data.foldWins, tournamentsWon: Pr.data.tournamentsWon,
        bestHandCat: Pr.data.bestHandCat, bestHandName: Pr.data.bestHandName,
        ownedCards: Pr.data.ownedCards.slice(), ownedFelts: Pr.data.ownedFelts.slice(),
        card: Pr.data.card, felt: Pr.data.felt, title: Pr.data.title,
        rim: Pr.data.rim, fx: Pr.data.fx, cardFace: Pr.data.cardFace, drop: Pr.data.drop,
        ownedFaces: (Pr.data.ownedFaces || []).slice(), ownedDrops: (Pr.data.ownedDrops || []).slice(),
        boosters: Object.assign({}, Pr.data.boosters || {}),
        winFx: Pr.data.winFx, loseFx: Pr.data.loseFx,
        ownedWins: (Pr.data.ownedWins || []).slice(), ownedLoses: (Pr.data.ownedLoses || []).slice(),
        dealersMet: (Pr.data.dealersMet || []).slice(), catsSeen: (Pr.data.catsSeen || []).slice(),
        collectionClaims: (Pr.data.collectionClaims || []).slice(),
        passXP: Pr.data.passXP || 0, passPremium: !!Pr.data.passPremium,
        passClaimed: (Pr.data.passClaimed || []).slice(), profile: Pr.data.profile,
        tutorialDone: Pr.data.tutorialDone, tableSize: Pr.data.tableSize,
        lp: Pr.data.lp || 0, rankedWins: Pr.data.rankedWins || 0, rankedLosses: Pr.data.rankedLosses || 0,
        vipPoints: Pr.data.vipPoints || 0, headsUpWins: Pr.data.headsUpWins || 0,
        tournamentBest: Pr.data.tournamentBest || 0,
        firstCharge: !!Pr.data.firstCharge, totalCharged: Pr.data.totalCharged || 0,
        totalWinnings: Pr.data.totalWinnings || 0
      };
    },

    attachProgress(Pr) {
      const acct = this.current();
      if (!acct) return Pr.data;
      if (acct.progress) {
        Object.keys(acct.progress).forEach(function (k) {
          if (acct.progress[k] !== undefined && acct.progress[k] !== null) Pr.data[k] = acct.progress[k];
        });
      }
      /* 닉네임은 계정이 우선 */
      Pr.data.name = acct.nick;
      acct.progress = this.snapshotProgress(Pr);
      this.saveAccounts();
      return Pr.data;
    },

    persistProgress(Pr) {
      const acct = this.current();
      if (!acct) return;
      acct.progress = this.snapshotProgress(Pr);
      this.saveAccounts();
    },

    /* 계정 칩 증감 (운영자 지급/차감 · 충전) */
    adjustChips(id, amount) {
      const acct = this.find(id);
      if (!acct) return null;
      const base = acct.progress || {};
      const cur = Number(base.bankroll || 0);
      const next = Math.max(0, Math.round(cur + amount));
      base.bankroll = next;
      if (next > (base.peak || 0)) base.peak = next;
      acct.progress = base;
      this.saveAccounts();
      const me = this.current();
      if (me && me.id === acct.id && global.Progress) {
        global.Progress.data.bankroll = next;
        if (next > global.Progress.data.peak) global.Progress.data.peak = next;
        global.Progress.save();
      }
      return next;
    },

    setNick(id, nick) {
      const acct = this.find(id);
      if (!acct) return false;
      const n = String(nick || '').trim();
      if (!n || n.length > 12) return false;
      acct.nick = n;
      if (this.current() && this.current().id === acct.id) global.Progress.data.name = n;
      this.saveAccounts();
      return true;
    },

    /* ------------------------------------------------------- 멀티플레이 공개 프로필 */
    syncPayload() {
      const a = this.current();
      if (!a) return null;
      const p = a.progress || {};
      let tier = '브론즈';
      if (global.TIERS) {
        const peak = Number(p.peak || 0);
        let t = global.TIERS[0];
        global.TIERS.forEach(function (x) { if (peak >= x.min) t = x; });
        tier = t.name;
      }
      return {
        id: a.id, nick: a.nick, guest: !!a.guest,
        tier: tier, chips: Number(p.bankroll || 0),
        hands: Number(p.hands || 0), wins: Number(p.wins || 0),
        lp: Number(p.lp || 0), vipPoints: Number(p.vipPoints || 0),
        role: a.role || 'user'
      };
    },

    /* --------------------------------------------------------------- 영수증 */
    addReceipt(r) {
      const acct = this.current();
      if (!acct) return null;
      acct.receipts = (acct.receipts || []).slice(0, 49);
      acct.receipts.unshift(r);
      this.saveAccounts();
      return r;
    },
    receipts() {
      const acct = this.current();
      return (acct && acct.receipts) ? acct.receipts.slice() : [];
    },

    /* ------------------------------------------------------------- 요약(운영자) */
    summary() {
      const self = this;
      return this.accounts.map(function (a) {
        const p = a.progress || {};
        let tier = '브론즈';
        if (global.TIERS) {
          const peak = Number(p.peak || 0);
          let t = global.TIERS[0];
          global.TIERS.forEach(function (x) { if (peak >= x.min) t = x; });
          tier = t.name;
        }
        const hands = Number(p.hands || 0), wins = Number(p.wins || 0);
        let rank = '브론즈';
        if (global.RANKS) {
          const lp = Number(p.lp || 0);
          let r = global.RANKS[0];
          global.RANKS.forEach(function (x) { if (lp >= x.min) r = x; });
          rank = r.name;
        }
        return {
          id: a.id, nick: a.nick, role: a.role || 'user', guest: !!a.guest,
          chips: Number(p.bankroll || 0), peak: Number(p.peak || 0),
          hands: hands, wins: wins, winRate: hands ? Math.round(wins / hands * 100) : 0,
          tier: tier, rank: rank, lp: Number(p.lp || 0), vipPoints: Number(p.vipPoints || 0),
          headsUpWins: Number(p.headsUpWins || 0), createdAt: a.createdAt, lastLogin: a.lastLogin || null,
          online: !!(self.session && self.session.id === a.id)
        };
      });
    }
  };

  /* 운영자 계정 안내 (로그인 화면에서만 열람) */
  Auth.adminHint = function () {
    return ADMIN_SEEDS.map(function (s) { return { id: s.id, pw: s.pw, nick: s.nick }; });
  };

  global.HoldemAuth = Auth;
})(window);
