/* =============================================================================
 *  REAL HOLDEM POKER — 진행도: 뱅크롤 · VIP · 스킨 · 칭호 · 통계
 * ========================================================================== */
(function (global) {
  'use strict';

  const KEY = 'realholdem.progress.v1';

  const DEFAULT = {
    v: 1,
    name: '주호',
    bankroll: 50000,
    peak: 50000,
    hands: 0, wins: 0, showdowns: 0, showdownWins: 0, foldWins: 0,
    tournamentsWon: 0,
    bestHandCat: -1, bestHandName: '',
    ownedCards: ['classic'], ownedFelts: ['emerald'],
    card: 'classic', felt: 'emerald', title: null,
    sound: true, speed: 'normal',
    haptics: true, bgmStyle: 'lofi',
    tutorialDone: false,
    tableSize: 6,
    lastRoom: 'newbie',
    totalWinnings: 0,
    gmPin: '7073',
    blindPreset: 'room',
    quickPresets: ['min', 'half', 'pot', 'max'],
    auto: false
  };

  const TIERS = [
    { id: 'bronze', name: '브론즈', min: 0, color: '#c88a56', icon: '◆', unlock: '기본 테이블' },
    { id: 'silver', name: '실버', min: 75000, color: '#d7e0ea', icon: '◆◆', unlock: '고수방 · 혼합방 · 토너먼트' },
    { id: 'gold', name: '골드', min: 200000, color: '#f3c74f', icon: '◆◆◆', unlock: '프로방' },
    { id: 'diamond', name: 'VIP 다이아', min: 500000, color: '#8ef6ff', icon: '💎', unlock: '하이롤러 VIP 테이블' }
  ];

  const ROOMS = [
    { id: 'newbie', name: '뉴비방', sb: 10, bb: 20, tier: 0, accent: '#7bd88f',
      grades: ['newbie', 'newbie', 'beginner', 'newbie', 'beginner', 'newbie', 'beginner', 'newbie'],
      desc: '루즈한 초보들 사이에서 감을 잡는 테이블' },
    { id: 'beginner', name: '초보방', sb: 25, bb: 50, tier: 0, accent: '#6fc3ff',
      grades: ['beginner', 'beginner', 'newbie', 'beginner', 'expert', 'beginner', 'newbie', 'beginner'],
      desc: '기본기는 있는 상대들. 팟 오즈를 익히기 좋아' },
    { id: 'expert', name: '고수방', sb: 50, bb: 100, tier: 1, accent: '#ffd166',
      grades: ['expert', 'expert', 'beginner', 'expert', 'pro', 'expert', 'beginner', 'expert'],
      desc: '포지션·레인지 싸움. 함부로 콜하면 털린다' },
    { id: 'pro', name: '프로방', sb: 100, bb: 200, tier: 2, accent: '#ff7b72',
      grades: ['pro', 'pro', 'expert', 'pro', 'expert', 'pro', 'expert', 'pro'],
      desc: '너의 VPIP·폴드율을 읽고 찌르는 프로들' },
    { id: 'mixed', name: '혼합방', sb: 50, bb: 100, tier: 1, accent: '#c58cff',
      grades: ['newbie', 'beginner', 'expert', 'pro', 'beginner', 'expert', 'newbie', 'pro'],
      desc: '등급이 뒤섞인 9인 테이블. 좌석 성향 파악이 관건' },
    { id: 'highroller', name: '하이롤러 VIP', sb: 500, bb: 1000, tier: 3, accent: '#8ef6ff',
      grades: ['pro', 'pro', 'pro', 'pro', 'pro', 'pro', 'pro', 'pro'],
      desc: '100만 칩 뱅크롤의 증명. 8명 전원 프로' }
  ];

  const CARDS_SKINS = [
    { id: 'classic', name: '클래식 크림슨', price: 0, desc: '정통 카지노 레드 + 골드 프레임' },
    { id: 'blackgold', name: '블랙 골드', price: 25000, desc: '검정 벨벳 + 금박 길로셰' },
    { id: 'neonroyal', name: '네온 로열', price: 60000, desc: '네온 블루 발광 + 회로 패턴' }
  ];

  const FELT_SKINS = [
    { id: 'emerald', name: '에메랄드', price: 0, desc: '정통 리치 그린 펠트' },
    { id: 'crimson', name: '크림슨 VIP', price: 30000, desc: '딥 크림슨 + 골드 스티치' },
    { id: 'midnight', name: '미드나잇 골드', price: 80000, desc: '미드나잇 블루 + 샴페인 골드' }
  ];

  const TITLES = [
    { id: 'rookie', name: 'WSOP 루키', desc: '토너먼트 첫 우승', cond: function (d) { return d.tournamentsWon >= 1; } },
    { id: 'bluffer', name: '블러핑 마스터', desc: '상대를 폴드시켜 30승', cond: function (d) { return d.foldWins >= 30; } },
    { id: 'emperor', name: '홀덤 황제', desc: '토너먼트 3회 우승', cond: function (d) { return d.tournamentsWon >= 3; } },
    { id: 'grinder', name: '그라인더', desc: '100핸드 플레이', cond: function (d) { return d.hands >= 100; } },
    { id: 'shark', name: '테이블 샤크', desc: '뱅크롤 20만 돌파', cond: function (d) { return d.peak >= 200000; } }
  ];

  const Progress = {
    data: null,
    listeners: [],

    load() {
      try {
        const raw = global.localStorage.getItem(KEY);
        this.data = Object.assign({}, DEFAULT, raw ? JSON.parse(raw) : {});
      } catch (e) { this.data = Object.assign({}, DEFAULT); }
      // 배열 보정
      ['ownedCards', 'ownedFelts'].forEach(function (k) {
        if (!Array.isArray(Progress.data[k])) Progress.data[k] = DEFAULT[k].slice();
      });
      return this.data;
    },

    save() {
      try { global.localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {}
      this.listeners.forEach(function (fn) { try { fn(Progress.data); } catch (e) {} });
    },

    on(fn) { this.listeners.push(fn); },
    emit() { this.save(); },

    reset() { this.data = Object.assign({}, DEFAULT); this.save(); },

    /* ------------------------------------------------------------ 뱅크롤 */
    addChips(n) {
      this.data.bankroll = Math.max(0, Math.round(this.data.bankroll + n));
      if (n > 0) this.data.totalWinnings += n;
      if (this.data.bankroll > this.data.peak) this.data.peak = this.data.bankroll;
      this.save();
    },
    setBankroll(n) { this.data.bankroll = Math.max(0, Math.round(n)); if (this.data.bankroll > this.data.peak) this.data.peak = this.data.bankroll; this.save(); },
    refill(amount) {
      const amt = amount || 50000;
      this.data.bankroll = Math.max(this.data.bankroll, 0) + amt;
      this.save();
      return amt;
    },

    /* --------------------------------------------------------------- VIP */
    tier() {
      const b = this.data.peak;
      let t = TIERS[0];
      for (let i = 0; i < TIERS.length; i++) if (b >= TIERS[i].min) t = TIERS[i];
      return t;
    },
    tierIndex() { return TIERS.indexOf(this.tier()); },
    nextTier() {
      const i = this.tierIndex();
      return TIERS[i + 1] || null;
    },
    tierProgress() {
      const cur = this.tier(), nxt = this.nextTier();
      if (!nxt) return 1;
      return Math.max(0, Math.min(1, (this.data.peak - cur.min) / (nxt.min - cur.min)));
    },
    canEnter(room) {
      return this.tierIndex() >= (room.tier || 0);
    },

    /* ------------------------------------------------------------ 통계 */
    recordHand(info) {
      const d = this.data;
      d.hands++;
      if (info.won) d.wins++;
      if (info.showdown) { d.showdowns++; if (info.won) d.showdownWins++; }
      if (info.won && !info.showdown) d.foldWins++;
      if (info.bestCat !== undefined && info.bestCat > d.bestHandCat) {
        d.bestHandCat = info.bestCat; d.bestHandName = info.bestName || '';
      }
      this.save();
    },
    recordTournamentWin() { this.data.tournamentsWon++; this.save(); },

    /* ---------------------------------------------------------- 스킨/칭호 */
    owns(kind, id) {
      const arr = kind === 'card' ? this.data.ownedCards : this.data.ownedFelts;
      return arr.indexOf(id) >= 0;
    },
    buy(kind, id) {
      const list = kind === 'card' ? CARDS_SKINS : FELT_SKINS;
      const item = list.filter(function (x) { return x.id === id; })[0];
      if (!item) return { ok: false, msg: '없는 상품' };
      if (this.owns(kind, id)) return { ok: false, msg: '이미 보유' };
      if (this.data.bankroll < item.price) return { ok: false, msg: '칩이 부족해' };
      this.data.bankroll -= item.price;
      if (kind === 'card') this.data.ownedCards.push(id); else this.data.ownedFelts.push(id);
      this.save();
      return { ok: true, item: item };
    },
    equip(kind, id) {
      if (!this.owns(kind, id)) return false;
      if (kind === 'card') this.data.card = id; else this.data.felt = id;
      this.save();
      return true;
    },
    titles() {
      const d = this.data;
      return TITLES.map(function (t) { return { id: t.id, name: t.name, desc: t.desc, unlocked: t.cond(d) }; });
    },
    equippedTitle() {
      const t = this.titles().filter(function (x) { return x.id === Progress.data.title; })[0];
      return t && t.unlocked ? t : null;
    },
    setTitle(id) {
      if (!id) { this.data.title = null; this.save(); return true; }
      const t = thisTitles(this.data).filter(function (x) { return x.id === id && x.unlocked; })[0];
      if (!t) return false;
      this.data.title = id; this.save(); return true;
    },

    room(id) { return ROOMS.filter(function (r) { return r.id === id; })[0]; }
  };

  function thisTitles(d) { return TITLES.map(function (t) { return { id: t.id, name: t.name, desc: t.desc, unlocked: t.cond(d) }; }); }

  Progress.load();

  global.Progress = Progress;
  global.TIERS = TIERS;
  global.ROOMS = ROOMS;
  global.CARD_SKINS = CARDS_SKINS;
  global.FELT_SKINS = FELT_SKINS;
  global.TITLES = TITLES;
})(window);
