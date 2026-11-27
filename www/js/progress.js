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
    ownedCards: ['classic'], ownedFelts: ['emerald'], ownedRims: ['cyan'], ownedFx: ['bolt_cyan'],
    ownedFaces: ['face_classic'], ownedDrops: ['drop_basic'], ownedProfiles: ['cyber_cyan'],
    card: 'classic', felt: 'emerald', rim: 'cyan', fx: 'bolt_cyan',
    cardFace: 'face_classic', drop: 'drop_basic', profile: 'cyber_cyan',
    boosters: { double: 0, blind: 0, risk: 0 },
    passXP: 0, passPremium: false, passClaimed: [],
    ownedWins: ['win_neon'], ownedLoses: ['lose_glitch'], winFx: 'win_neon', loseFx: 'lose_glitch',
    dealersMet: [], catsSeen: [], collectionClaims: [],
    title: null,
    sound: true, speed: 'normal',
    haptics: true, bgmStyle: 'lofi',
    tutorialDone: false,
    tableSize: 6,
    /* 랭크 · VIP 포인트 · 모드 전적 */
    lp: 0, rankedWins: 0, rankedLosses: 0, vipPoints: 0,
    headsUpWins: 0, tournamentBest: 0,
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
    { id: 'classic', name: '네온 크림슨', price: 0, desc: '시안 회로 + 마젠타 번개 프레임' },
    { id: 'blackgold', name: '블랙 골드', price: 25000, desc: '검정 벨벳 + 금박 길로셰' },
    { id: 'neonroyal', name: '네온 로열', price: 60000, desc: '네온 블루 발광 + 회로 패턴' }
  ];

  const FELT_SKINS = [
    { id: 'emerald', name: '네온 시안', price: 0, desc: '시안 듀얼 림 + 사이버 그리드' },
    { id: 'crimson', name: '네온 마젠타', price: 30000, desc: '마젠타 딥 글로우 펠트' },
    { id: 'midnight', name: '네온 바이올렛', price: 80000, desc: '미드나잇 바이올렛 + 블루 네온' }
  ];

  /* 테이블 네온 림(테두리) 테마 */
  const RIM_SKINS = [
    { id: 'cyan', name: '시안 듀얼', price: 0, desc: '시안 → 마젠타 기본 아케이드 림', a: '#00f5ff', b: '#ff2bd6' },
    { id: 'magenta', name: '마젠타 펄스', price: 25000, desc: '핑크·마젠타 그라데이션 림', a: '#ff2bd6', b: '#ff8ae0' },
    { id: 'violet', name: '울트라 바이올렛', price: 50000, desc: '퍼플·블루 사이버 림', a: '#7b2bff', b: '#00a2ff' },
    { id: 'gold', name: '골드 잭팟', price: 90000, desc: '잭팟 테이블 전용 골드 림', a: '#ffe27a', b: '#ff8a00' }
  ];

  /* 번개 이펙트 스킨 (플랍/턴/리버 방전 색상) */
  const FX_SKINS = [
    { id: 'bolt_cyan', name: '시안 볼트', price: 0, desc: '기본 시안·퍼플 전기', a: '#00f5ff', b: '#b06bff' },
    { id: 'bolt_magenta', name: '마젠타 볼트', price: 20000, desc: '핑크·마젠타 방전', a: '#ff2bd6', b: '#ff9de8' },
    { id: 'bolt_galaxy', name: '갤럭시 볼트', price: 45000, desc: '퍼플·블루 우주 번개', a: '#8b5cff', b: '#33e0ff' },
    { id: 'bolt_gold', name: '골드 볼트', price: 80000, desc: '잭팟 금빛 번개', a: '#ffe27a', b: '#ff9a00' }
  ];

  /* 카드 앞면 스킨 */
  const FACE_SKINS = [
    { id: 'face_classic', name: '클래식 화이트', price: 0, desc: '정통 화이트 카드 앞면' },
    { id: 'face_cyber', name: '네온 사이버', price: 20000, desc: '시안 발광 테두리 + 홀로그램' },
    { id: 'face_gold', name: '블랙 골드', price: 45000, desc: '금박 프레임 + 딥 블랙 인덱스' }
  ];

  /* 카드 드랍 이펙트 스킨 — 카드가 테이블에 떨어질 때 */
  const DROP_SKINS = [
    { id: 'drop_basic', name: '기본 드랍', price: 0, desc: '부드러운 스파크', a: '#ffe9a8', b: '#ffd166' },
    { id: 'drop_bolt', name: '네온 번개 드랍', price: 25000, desc: '시안·마젠타 전기 스파크', a: '#00f5ff', b: '#ff2bd6' },
    { id: 'drop_gold', name: '골드 스파크 드랍', price: 40000, desc: '금빛 스파크 + 코인', a: '#ffe27a', b: '#ff8a00' }
  ];

  /* 승리 / 패배 연출 스킨 */
  const WIN_SKINS = [
    { id: 'win_neon', name: '네온 폭죽', price: 0, desc: '시안·마젠타 폭죽 + 링' },
    { id: 'win_gold', name: '골드 샤워', price: 30000, desc: '금화 폭포 + 별' },
    { id: 'win_bolt', name: '볼트 버스트', price: 50000, desc: '화면 번개 + 스파크' }
  ];
  const LOSE_SKINS = [
    { id: 'lose_glitch', name: '글리치 다운', price: 0, desc: '화면 글리치 노이즈' },
    { id: 'lose_powerdown', name: '전류 다운', price: 20000, desc: '네온이 꺼지는 파워다운' }
  ];

  /* 인게임 부스터 (소모품) */
  const BOOSTERS = [
    { id: 'double', name: '2X WIN', price: 30000, qty: 3, desc: '사용한 판 승리 시 획득 2배' },
    { id: 'blind', name: 'BLIND ALL-IN', price: 25000, qty: 3, desc: '안 봤다 올인 · 승리 시 +50%' },
    { id: 'risk', name: '플랍 2X 승부', price: 40000, qty: 3, desc: '플랍부터 승리 2배 / 패배 2배' }
  ];

  /* 프로필 스킨 — 아바타 네온 프레임 */
  const PROFILE_SKINS = [
    { id: 'cyber_cyan', name: '사이버 시안', price: 0, desc: '시안 네온 링', a: '#00f5ff', b: '#7b2bff' },
    { id: 'magenta_pulse', name: '마젠타 펄스', price: 20000, desc: '마젠타 펄스 링', a: '#ff2bd6', b: '#ff9de8' },
    { id: 'gold_crown', name: '골드 크라운', price: 45000, desc: '골드 크라운 프레임', a: '#ffe27a', b: '#ff8a00' }
  ];

  /* 네온 시즌패스 — 10레벨, 무료/프리미엄 두 라인 */
  const PASS_STEP = 120;
  const PASS_LEVELS = [
    { lv: 1, free: { chips: 3000 }, premium: { chips: 10000, boosters: { double: 1 } } },
    { lv: 2, free: { chips: 5000 }, premium: { chips: 20000, boosters: { blind: 1 } } },
    { lv: 3, free: { chips: 5000, boosters: { double: 1 } }, premium: { chips: 30000, boosters: { double: 2 } } },
    { lv: 4, free: { chips: 8000 }, premium: { chips: 40000 } },
    { lv: 5, free: { chips: 8000, boosters: { blind: 1 } }, premium: { chips: 60000, profile: 'magenta_pulse' } },
    { lv: 6, free: { chips: 10000 }, premium: { chips: 80000, boosters: { double: 2 } } },
    { lv: 7, free: { chips: 10000 }, premium: { chips: 100000 } },
    { lv: 8, free: { chips: 15000, boosters: { double: 1 } }, premium: { chips: 150000, face: 'face_gold' } },
    { lv: 9, free: { chips: 15000 }, premium: { chips: 200000, boosters: { blind: 2 } } },
    { lv: 10, free: { chips: 25000, profile: 'gold_crown' }, premium: { chips: 400000, boosters: { double: 3 } } }
  ];

  /* 랭크(랭크겜) 티어 — LP 누적으로 승급 */
  const RANKS = [
    { id: 'bronze', name: '브론즈', min: 0, color: '#c98a5a', icon: '◆' },
    { id: 'silver', name: '실버', min: 300, color: '#d7e0ea', icon: '◆◆' },
    { id: 'gold', name: '골드', min: 700, color: '#ffd166', icon: '◆◆◆' },
    { id: 'platinum', name: '플래티넘', min: 1200, color: '#7ef7ff', icon: '◇' },
    { id: 'diamond', name: '다이아', min: 1800, color: '#8ec8ff', icon: '💎' },
    { id: 'master', name: '마스터', min: 2500, color: '#c58cff', icon: '★' },
    { id: 'grandmaster', name: '그랜드마스터', min: 3500, color: '#ff2bd6', icon: '👑' }
  ];

  const TITLES = [    { id: 'rookie', name: 'WSOP 루키', desc: '토너먼트 첫 우승', cond: function (d) { return d.tournamentsWon >= 1; } },
    { id: 'bluffer', name: '블러핑 마스터', desc: '상대를 폴드시켜 30승', cond: function (d) { return d.foldWins >= 30; } },
    { id: 'emperor', name: '홀덤 황제', desc: '토너먼트 3회 우승', cond: function (d) { return d.tournamentsWon >= 3; } },
    { id: 'grinder', name: '그라인더', desc: '100핸드 플레이', cond: function (d) { return d.hands >= 100; } },
    { id: 'shark', name: '테이블 샤크', desc: '뱅크롤 20만 돌파', cond: function (d) { return d.peak >= 200000; } },
    { id: 'dealer_master', name: '딜러 킬러', desc: '여성 딜러 10명 모두 만남', cond: function (d) { return (d.dealersMet || []).length >= 10; } },
    { id: 'hand_master', name: '핸드 마스터', desc: '족보 9종 모두 달성', cond: function (d) { return (d.catsSeen || []).length >= 9; } }
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
      ['ownedCards', 'ownedFelts', 'ownedRims', 'ownedFx', 'ownedFaces', 'ownedDrops', 'ownedProfiles', 'ownedWins', 'ownedLoses'].forEach(function (k) {
        if (!Array.isArray(Progress.data[k])) Progress.data[k] = DEFAULT[k].slice();
      });
      ['dealersMet', 'catsSeen', 'collectionClaims'].forEach(function (k) {
        if (!Array.isArray(Progress.data[k])) Progress.data[k] = DEFAULT[k].slice();
      });
      if (!Progress.data.boosters || typeof Progress.data.boosters !== 'object') {
        Progress.data.boosters = { double: 0, blind: 0, risk: 0 };
      }
      if (Progress.data.boosters.risk === undefined) Progress.data.boosters.risk = 0;
      if (!Array.isArray(Progress.data.passClaimed)) Progress.data.passClaimed = [];
      if (typeof Progress.data.passPremium !== 'boolean') Progress.data.passPremium = false;
      if (typeof Progress.data.passXP !== 'number') Progress.data.passXP = 0;
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

    /* ------------------------------------------------------------ 랭크(LP) */
    rank() {
      const lp = Math.max(0, Number(this.data.lp || 0));
      let r = RANKS[0];
      for (let i = 0; i < RANKS.length; i++) if (lp >= RANKS[i].min) r = RANKS[i];
      return r;
    },
    rankIndex() {
      return RANKS.indexOf(this.rank());
    },
    nextRank() {
      return RANKS[this.rankIndex() + 1] || null;
    },
    rankProgress() {
      const cur = this.rank(), nxt = this.nextRank();
      if (!nxt) return 1;
      return Math.max(0, Math.min(1, (this.data.lp - cur.min) / (nxt.min - cur.min)));
    },
    addLP(n) {
      const before = this.rank();
      this.data.lp = Math.max(0, Math.round((this.data.lp || 0) + n));
      if (n > 0) this.data.rankedWins++;
      else if (n < 0) this.data.rankedLosses++;
      this.save();
      const after = this.rank();
      return { lp: this.data.lp, before: before, after: after, up: after !== before };
    },
    addVip(n) {
      this.data.vipPoints = Math.max(0, (this.data.vipPoints || 0) + n);
      this.save();
      return this.data.vipPoints;
    },

    /* ---------------------------------------------------- 컬렉션(도감) */
    markDealerMet(id) {
      if (!id) return;
      this.data.dealersMet = this.data.dealersMet || [];
      if (this.data.dealersMet.indexOf(id) < 0) {
        this.data.dealersMet = this.data.dealersMet.concat([id]);
        this.save();
        return true;
      }
      return false;
    },
    markCat(cat) {
      if (cat === null || cat === undefined || cat < 0) return;
      this.data.catsSeen = this.data.catsSeen || [];
      if (this.data.catsSeen.indexOf(cat) < 0) {
        this.data.catsSeen = this.data.catsSeen.concat([cat]);
        this.save();
      }
    },
    collectionStats() {
      const d = this.data;
      const owns = {
        card: (d.ownedCards || []).length,
        felt: (d.ownedFelts || []).length,
        rim: (d.ownedRims || []).length,
        fx: (d.ownedFx || []).length,
        face: (d.ownedFaces || []).length,
        drop: (d.ownedDrops || []).length,
        profile: (d.ownedProfiles || []).length,
        win: (d.ownedWins || []).length,
        lose: (d.ownedLoses || []).length
      };
      const totalSkins = (global.CARD_SKINS ? CARD_SKINS.length : 3) + FELT_SKINS.length + RIM_SKINS.length +
        FX_SKINS.length + FACE_SKINS.length + DROP_SKINS.length + PROFILE_SKINS.length + WIN_SKINS.length + LOSE_SKINS.length;
      const ownedSkins = Object.keys(owns).reduce(function (s, k) { return s + owns[k]; }, 0);
      const dealers = (d.dealersMet || []).length;
      const cats = (d.catsSeen || []).length;
      const pct = Math.round((ownedSkins / Math.max(1, totalSkins) * 40) + (dealers / 10 * 30) + (cats / 9 * 30));
      return { owns: owns, ownedSkins: ownedSkins, totalSkins: totalSkins, dealers: dealers, cats: cats, pct: Math.min(100, pct) };
    },
    claimCollection(kind) {
      const d = this.data;
      const st = this.collectionStats();
      d.collectionClaims = d.collectionClaims || [];
      if (d.collectionClaims.indexOf(kind) >= 0) return { ok: false, msg: '이미 받았어' };
      if (kind === 'dealers' && st.dealers < 10) return { ok: false, msg: '딜러 10명을 모두 만나야 해' };
      if (kind === 'cats' && st.cats < 9) return { ok: false, msg: '족보 9종을 모두 달성해야 해' };
      if (kind === 'collection' && st.pct < 100) return { ok: false, msg: '컬렉션 100% 달성 필요' };
      const reward = kind === 'dealers' ? 50000 : kind === 'cats' ? 100000 : 150000;
      d.bankroll += reward;
      d.collectionClaims = d.collectionClaims.concat([kind]);
      this.save();
      return { ok: true, reward: reward };
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
      d.passXP = (d.passXP || 0) + (info.won ? 35 : 10);
      this.save();
    },
    recordTournamentWin() { this.data.tournamentsWon++; this.save(); },

    /* ---------------------------------------------------------- 스킨/칭호 */
    _kind(kind) {
      if (kind === 'card') return { list: CARDS_SKINS, arr: 'ownedCards', eq: 'card' };
      if (kind === 'rim') return { list: RIM_SKINS, arr: 'ownedRims', eq: 'rim' };
      if (kind === 'fx') return { list: FX_SKINS, arr: 'ownedFx', eq: 'fx' };
      if (kind === 'face') return { list: FACE_SKINS, arr: 'ownedFaces', eq: 'cardFace' };
      if (kind === 'drop') return { list: DROP_SKINS, arr: 'ownedDrops', eq: 'drop' };
      if (kind === 'profile') return { list: PROFILE_SKINS, arr: 'ownedProfiles', eq: 'profile' };
      if (kind === 'win') return { list: WIN_SKINS, arr: 'ownedWins', eq: 'winFx' };
      if (kind === 'lose') return { list: LOSE_SKINS, arr: 'ownedLoses', eq: 'loseFx' };
      return { list: FELT_SKINS, arr: 'ownedFelts', eq: 'felt' };
    },
    owns(kind, id) {
      const k = this._kind(kind);
      const arr = this.data[k.arr] || [];
      return arr.indexOf(id) >= 0;
    },
    buy(kind, id) {
      const k = this._kind(kind);
      const item = k.list.filter(function (x) { return x.id === id; })[0];
      if (!item) return { ok: false, msg: '없는 상품' };
      if (this.owns(kind, id)) return { ok: false, msg: '이미 보유' };
      if (this.data.bankroll < item.price) return { ok: false, msg: '칩이 부족해' };
      this.data.bankroll -= item.price;
      this.data[k.arr] = (this.data[k.arr] || []).concat([id]);
      this.save();
      return { ok: true, item: item };
    },
    equip(kind, id) {
      if (!this.owns(kind, id)) return false;
      const k = this._kind(kind);
      this.data[k.eq] = id;
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

    /* 인게임 부스터 */
    boosterCount(id) {
      const b = this.data.boosters || {};
      return Number(b[id] || 0);
    },
    buyBooster(id) {
      const item = BOOSTERS.filter(function (x) { return x.id === id; })[0];
      if (!item) return { ok: false, msg: '없는 상품' };
      if (this.data.bankroll < item.price) return { ok: false, msg: '칩이 부족해' };
      this.data.bankroll -= item.price;
      this.data.boosters = this.data.boosters || {};
      this.data.boosters[id] = this.boosterCount(id) + item.qty;
      this.save();
      return { ok: true, item: item, count: this.data.boosters[id] };
    },
    useBooster(id) {
      if (this.boosterCount(id) <= 0) return false;
      this.data.boosters[id] = this.boosterCount(id) - 1;
      this.save();
      return true;
    },

    /* ---------------------------------------------------------- 시즌패스 */
    passStep: PASS_STEP,
    passLevels() { return PASS_LEVELS; },
    passLevel() {
      return Math.max(1, Math.min(PASS_LEVELS.length, Math.floor((this.data.passXP || 0) / PASS_STEP) + 1));
    },
    passProgress() {
      const lv = this.passLevel();
      if (lv >= PASS_LEVELS.length) return 1;
      return Math.max(0, ((this.data.passXP || 0) - (lv - 1) * PASS_STEP) / PASS_STEP);
    },
    addPassXP(n) {
      const before = this.passLevel();
      this.data.passXP = Math.max(0, (this.data.passXP || 0) + Math.round(n || 0));
      this.save();
      const after = this.passLevel();
      return { xp: this.data.passXP, before: before, after: after, levelUp: after > before };
    },
    passClaimed(line, lv) {
      return (this.data.passClaimed || []).indexOf(line + lv) >= 0;
    },
    claimPass(line, lv) {
      const def = PASS_LEVELS.filter(function (x) { return x.lv === lv; })[0];
      if (!def) return { ok: false, msg: '없는 보상' };
      if (line === 'premium' && !this.data.passPremium) return { ok: false, msg: '프리미엄 패스 필요' };
      if (this.passLevel() < lv) return { ok: false, msg: '레벨이 부족해' };
      if (this.passClaimed(line, lv)) return { ok: false, msg: '이미 받았어' };
      const r = def[line] || {};
      if (r.chips) this.data.bankroll += r.chips;
      if (r.boosters) {
        this.data.boosters = this.data.boosters || {};
        Object.keys(r.boosters).forEach(function (k) {
          this.data.boosters[k] = (this.data.boosters[k] || 0) + r.boosters[k];
        }, this);
      }
      if (r.profile && (this.data.ownedProfiles || []).indexOf(r.profile) < 0) {
        this.data.ownedProfiles = (this.data.ownedProfiles || []).concat([r.profile]);
      }
      if (r.face && (this.data.ownedFaces || []).indexOf(r.face) < 0) {
        this.data.ownedFaces = (this.data.ownedFaces || []).concat([r.face]);
      }
      this.data.passClaimed = (this.data.passClaimed || []).concat([line + lv]);
      this.save();
      return { ok: true, reward: r };
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
  global.RIM_SKINS = RIM_SKINS;
  global.FX_SKINS = FX_SKINS;
  global.FACE_SKINS = FACE_SKINS;
  global.DROP_SKINS = DROP_SKINS;
  global.PROFILE_SKINS = PROFILE_SKINS;
  global.WIN_SKINS = WIN_SKINS;
  global.LOSE_SKINS = LOSE_SKINS;
  global.PASS_LEVELS = PASS_LEVELS;
  global.BOOSTERS = BOOSTERS;
  global.RANKS = RANKS;
  global.TITLES = TITLES;
})(window);
