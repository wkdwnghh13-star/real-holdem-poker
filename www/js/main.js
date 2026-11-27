/* =============================================================================
 *  REAL HOLDEM POKER — 앱 컨트롤러
 * ========================================================================== */
(function (global) {
  'use strict';
  const P = global.Poker;
  const C = global.Cards;
  const Pr = global.Progress;
  const Haptic = global.Haptic || { fire: function () {}, setEnabled: function () {} };
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  const sleep = global.sleepFn;

  /* 상대 닉네임 — 일반 유저 화면에서는 실제 사람처럼 보인다 (AI 표시는 운영자 전용) */
  const AI_NAMES = ['한강타짜', '블러핑장인', '포커페이스99', '리버헌터', '칩리더', '올인스타',
    '슬로우롤', '매버릭', '퀸오브하트', '빅스택', '레이즈킹', '픽션러버'];
  const AI_AV = ['🦈', '🐺', '🦊', '🐯', '🦁', '🐻', '🐲', '🐼'];
  const QUICK_LABEL = { min: '최소', third: '1/3팟', half: '1/2팟', three4: '3/4팟', pot: '팟', double: '2배팟', max: '올인' };
  const QUICK_ALL = ['min', 'third', 'half', 'three4', 'pot', 'double', 'max'];

  const App = {
    mode: null,
    engine: null,
    runner: null,
    room: null,
    size: 6,
    buyIn: 0,
    baseWallet: 0,
    running: false,
    snap: null,
    options: null,
    mp: null,
    tournament: null,
    heroStats: { hands: 0, vpip: 0, pfr: 0, foldToBet: 0, foldOpps: 0 },
    handStats: null,
    lastHandResult: null,
    auto: false,
    autoGrade: 'expert',
    huGrade: 'expert',
    huBlinds: '25/50',
    gmUnlocked: false,
    gmPeek: false,
    gmBoard: false,
    preAction: null,
    authMode: 'login',
    boostDouble: false,
    blindAllInPending: false,
    riskActive: false,

    /* ---------------------------------------------------------------- init */
    init() {
      const Auth = global.HoldemAuth;
      Pr.load();
      Auth.load();
      Auth.on(function () { App.syncAccountUI(); });
      /* 계정별 진행도 저장 — Progress.save() 때마다 현재 계정에 기록 */
      Pr.on(function () { Auth.persistProgress(Pr); });

      View.init({
        tableArea: $('#table-area'), seats: $('#seats'), board: $('#board'), pot: $('#pot'),
        heroPanel: $('#hero-panel'), heroCards: $('#hero-cards'),
        fxCanvas: $('#fx-canvas'), fxLayer: $('#fx-layer'),
        boltCanvas: $('#bolt-canvas'), impactLayer: $('#impact-layer')
      }, { cardSkin: Pr.data.card, feltSkin: Pr.data.felt, rimSkin: Pr.data.rim, fxSkin: Pr.data.fx,
           faceSkin: Pr.data.cardFace, dropSkin: Pr.data.drop });
      View.onPeek = function () { Sound.tap(); };

      Haptic.setEnabled(Pr.data.haptics !== false);
      if (global.Dealers) {
        global.Dealers.preload();
        View.setDealer(global.Dealers.random());
      }
      Sound.setEnabled(Pr.data.sound);
      Sound.setBgmStyle(Pr.data.bgmStyle || 'lofi');
      this.renderLobby();
      this.bind();
      this.bindAuth();
      this.bindCharge();
      this.buildRankTable();
      this.applySpeedUI();
      this.applySoundUI();
      this.applyHapticUI();
      this.renderPreRow();

      /* 로그인 세션이 있으면 바로 입장, 없으면 로그인 화면 */
      if (Auth.session) this.enterAsAccount(Auth.current(), true);
      else this.showAuth();

      if (!Pr.data.tutorialDone && Auth.session) {
        setTimeout(function () { App.toast('튜토리얼로 3분만에 감 잡기 — 로비 아래 🎓 버튼'); }, 900);
      }
      // 첫 제스처에 오디오 활성화
      const wake = function () { Sound.resume(); document.removeEventListener('pointerdown', wake); };
      document.addEventListener('pointerdown', wake);
    },

    /* ------------------------------------------------------- 계정 · 로그인 UI */
    showAuth() {
      this.authMode = 'login';
      $('#screen-game').classList.remove('active');
      $('#screen-lobby').classList.remove('active');
      $('#screen-auth').classList.add('active');
      /* 로그아웃 후에는 항상 '로그인' 탭부터 */
      $$('#auth-tabs .auth-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === 'login'); });
      const nickRow = $('#auth-nick-row');
      if (nickRow) nickRow.hidden = true;
      const submit = $('#auth-submit');
      if (submit) submit.textContent = '로그인';
      const err = $('#auth-err');
      if (err) err.textContent = '';
    },

    enterAsAccount(account, silent) {
      const Auth = global.HoldemAuth;
      if (!account) { this.showAuth(); return; }
      Auth.attachProgress(Pr);
      Pr.save();
      this.applyAccountUI(account);
      $('#screen-auth').classList.remove('active');
      $('#screen-game').classList.remove('active');
      $('#screen-lobby').classList.add('active');
      this.renderLobby();
      this.renderCharge();
      if (!silent) {
        Sound.fanfare(0);
        this.toast(account.nick + '님 접속' + (account.role === 'admin' ? ' · 운영자 모드 활성화' : ''));
      }
    },

    applyAccountUI(account) {
      const admin = !!(account && account.role === 'admin');
      document.body.classList.toggle('admin-account', admin);
      if (admin) {
        this.gmUnlocked = true;
        document.body.classList.add('gm-visible');
        $('#btn-gm').classList.add('on');
      } else {
        this.gmUnlocked = false;
        this.gmPeek = false;
        this.gmBoard = false;
        document.body.classList.remove('gm-visible');
        $('#btn-gm').classList.remove('on');
      }
      this.renderGm();
      const nm = $('#pf-name');
      if (nm && account) nm.textContent = account.nick + (admin ? ' · GM' : '');
    },

    syncAccountUI() {
      const a = global.HoldemAuth.current();
      this.applyAccountUI(a);
      this.renderLobby();
      if (a) this.renderCharge();
    },

    bindAuth() {
      const self = this;
      const Auth = global.HoldemAuth;
      let mode = self.authMode || 'login';

      function setMode(m) {
        mode = m;
        self.authMode = m;
        $$('#auth-tabs .auth-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === m); });
        $('#auth-nick-row').hidden = m !== 'signup';
        $('#auth-submit').textContent = m === 'signup' ? '가입하고 시작' : '로그인';
        $('#auth-err').textContent = '';
        Sound.tap();
      }
      $$('#auth-tabs .auth-tab').forEach(function (b) {
        b.addEventListener('click', function () { setMode(b.dataset.mode); });
      });

      $('#auth-form').addEventListener('submit', function (e) {
        e.preventDefault();
        const id = $('#auth-id').value.trim();
        const pw = $('#auth-pw').value;
        const nick = $('#auth-nick').value.trim();
        if (!id) { $('#auth-err').textContent = '아이디를 입력해'; return; }
        if (!pw) { $('#auth-err').textContent = '비밀번호를 입력해'; return; }
        const r = self.authMode === 'signup' ? Auth.signup({ id: id, pw: pw, nick: nick }) : Auth.login(id, pw);
        if (!r.ok) {
          $('#auth-err').textContent = r.msg || '로그인 실패';
          Sound.fold();
          Haptic.fire(40);
          return;
        }
        $('#auth-pw').value = '';
        self.enterAsAccount(r.account, false);
      });

      $('#auth-guest').addEventListener('click', function () {
        const r = Auth.guest();
        self.enterAsAccount(r.account, false);
      });

      $('#auth-admin-hint').addEventListener('click', function () {
        const body = $('#admin-hint-body');
        body.innerHTML = Auth.adminHint().map(function (h) {
          return '<div class="admin-hint-row"><b>' + h.id + '</b><span>PW ' + h.pw + '</span></div>';
        }).join('');
        $('#modal-admin-hint').classList.add('on');
        Sound.tap();
      });

      $('#btn-logout').addEventListener('click', function () { self.logout(); });

      $('#menu-gm').addEventListener('click', function () {
        self.setGmMode(!self.gmUnlocked);
      });
      $('#gm-mode').addEventListener('click', function () {
        self.setGmMode(!self.gmUnlocked);
      });
      $('#gm-players-refresh').addEventListener('click', function () {
        self.renderGmPlayers();
        Sound.tap();
        self.toast('플레이어 정보 갱신');
      });
      $('#gm-players').addEventListener('click', function (e) {
        const b = e.target.closest('button[data-grant]');
        if (!b) return;
        self.gmPlayerGrant(b.dataset.kind, b.dataset.key, +b.dataset.grant);
      });
    },

    logout() {
      if (this.running) {
        this.running = false;
        if (this.runner) this.runner.stop();
        if (this.mp) { try { this.mp.close(); } catch (e) {} this.mp = null; }
        this.engine = null; this.runner = null; this.snap = null; this.mode = null;
        global.FX.clear();
        if (global.Lightning) global.Lightning.clear();
      }
      Pr.save();
      global.HoldemAuth.logout();
      this.gmUnlocked = false;
      this.gmPeek = false;
      this.gmBoard = false;
      this.auto = false;
      document.body.classList.remove('admin-account', 'gm-visible');
      $('#btn-gm').classList.remove('on');
      this.showAuth();
      this.toast('로그아웃했어');
    },

    bind() {
      const self = this;
      // 탭
      $$('#lobby-tabs .tab').forEach(function (t) {
        t.addEventListener('click', function () {
          $$('#lobby-tabs .tab').forEach(function (x) { x.classList.remove('active'); });
          t.classList.add('active');
          $$('.pane').forEach(function (p) { p.classList.remove('active'); });
          $('#pane-' + t.dataset.tab).classList.add('active');
          Sound.tap();
        });
      });
      // 테이블 사이즈
      $$('#pane-single .size-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('#pane-single .size-btn').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          self.size = +b.dataset.size;
          Pr.data.tableSize = self.size; Pr.save();
          Sound.tap();
        });
      });
      this.size = Pr.data.tableSize || 6;
      $$('#pane-single .size-btn').forEach(function (b) { b.classList.toggle('on', +b.dataset.size === App.size); });

      /* 아케이드 모드 카드 — 캐시 / 헤즈업 / 랭크 / 토너먼트 / 관전 */
      $$('#mode-grid .mode-card').forEach(function (b) {
        b.addEventListener('click', function () {
          Sound.tap();
          const m = b.dataset.mode;
          if (m === 'cash') {
            const r = $('#room-list');
            if (r && r.scrollIntoView) r.scrollIntoView({ behavior: 'smooth', block: 'center' });
            self.toast('캐시게임 — 아래 방을 골라 입장');
          } else if (m === 'headsup') self.openHeadsUp();
          else if (m === 'ranked') self.openRanked();
          else if (m === 'tournament') self.startTournament();
          else if (m === 'spectate') self.startSpectate();
          else if (m === 'pass') self.openPass();
          else if (m === 'collection') self.openCollection();
        });
      });

      /* 헤즈업 모달 */
      $('#hu-start').addEventListener('click', function () {
        $('#modal-headsup').classList.remove('on');
        self.startHeadsUpWith(self.huGrade, +self.huBlinds.split('/')[0], +self.huBlinds.split('/')[1]);
      });
      $('#hu-friend').addEventListener('click', function () { self.startFriendHeadsUp(); });
      $$('#hu-grade button').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('#hu-grade button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          self.huGrade = b.dataset.g;
          Sound.tap();
        });
      });
      $$('#hu-blinds button').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('#hu-blinds button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          self.huBlinds = b.dataset.b;
          self.renderHeadsUp();
          Sound.tap();
        });
      });
      $('#ranked-start').addEventListener('click', function () {
        $('#modal-ranked').classList.remove('on');
        self.startRanked();
      });
      $('#g-rank').addEventListener('click', function () { if (self.mode === 'ranked') self.openRanked(); });
      $('#boost-2x').addEventListener('click', function () { self.activateBoost('double'); });
      $('#boost-blind').addEventListener('click', function () { self.blindAllIn(); });
      $('#boost-risk').addEventListener('click', function () { self.activateRisk(); });
      $$('.coll-tab').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('.coll-tab').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          self.renderCollection(b.dataset.coll);
          Sound.tap();
        });
      });
      $('#coll-claims').addEventListener('click', function (e) {
        const b = e.target.closest('button[data-coll-claim]');
        if (!b) return;
        self.claimCollectionReward(b.dataset.collClaim);
      });

      /* 시즌패스 */
      $('#pass-rows').addEventListener('click', function (e) {
        const b = e.target.closest('button[data-claim]');
        if (!b) return;
        self.claimPassReward(b.dataset.claim, +b.dataset.lv);
      });
      $('#pass-premium').addEventListener('click', function () { self.unlockPremiumPass(); });
      $('#gm-pass-xp').addEventListener('click', function () {
        Pr.addPassXP(Pr.passStep);
        self.renderPass();
        self.toast('+' + Pr.passStep + ' 패스 XP');
        Sound.tap();
      });
      $('#gm-pass-lv').addEventListener('click', function () {
        const need = Pr.passLevel() * Pr.passStep - (Pr.data.passXP || 0);
        Pr.addPassXP(Math.max(Pr.passStep, need));
        self.renderPass();
        self.toast('패스 레벨업');
        Sound.tap();
      });
      $('#gm-pass-prem').addEventListener('click', function () {
        Pr.data.passPremium = !Pr.data.passPremium;
        Pr.save();
        self.renderPass();
        self.toast('프리미엄 패스 ' + (Pr.data.passPremium ? 'ON' : 'OFF'));
        Sound.tap();
      });

      $('#btn-refill').addEventListener('click', function () {
        const amt = Pr.refill(50000);
        Sound.chip(0, 4);
        self.toast('+' + C.fmt(amt) + ' 칩 리필 완료');
        self.renderLobby();
      });
      $('#btn-tutorial').addEventListener('click', function () { self.startTutorial(); });
      $('#btn-tournament').addEventListener('click', function () { self.startTournament(); });

      // 게임 화면
      $('#btn-leave').addEventListener('click', function () { self.confirmLeave(); });
      $('#btn-menu').addEventListener('click', function () { $('#modal-menu').classList.add('on'); });
      $('#btn-sound').addEventListener('click', function () { self.toggleSound(); });
      $('#btn-speed').addEventListener('click', function () { self.toggleSpeed(); });
      $('#btn-fold').addEventListener('click', function () { self.heroAction('fold'); });
      $('#btn-call').addEventListener('click', function () { self.heroAction(self.options && self.options.toCall > 0 ? 'call' : 'check'); });
      $('#btn-check').addEventListener('click', function () { self.heroAction('check'); });
      $('#raise-minus').addEventListener('click', function () { self.nudgeRaise(-1); });
      $('#raise-plus').addEventListener('click', function () { self.nudgeRaise(1); });
      $('#btn-charge-top').addEventListener('click', function () { self.openStore(); });
      $('#btn-store-top').addEventListener('click', function () { self.openStore(); });
      $('#store-charge').addEventListener('click', function () { $('#modal-store').classList.remove('on'); self.openCharge('chip_1100'); });
      $('#store-pass').addEventListener('click', function () { $('#modal-store').classList.remove('on'); self.openPass(); });
      $('#store-collection').addEventListener('click', function () { $('#modal-store').classList.remove('on'); self.openCollection(); });
      $('#store-skins').addEventListener('click', function () {
        $('#modal-store').classList.remove('on');
        self.toast('로비 → 스킨 · 칭호 탭에서 장착할 수 있어');
      });
      $('#hud-challenge').addEventListener('click', function () { self.openCollection('hands'); });
      $('#hud-highroller').addEventListener('click', function () { self.openRanked(); });
      $('#hud-sidequest').addEventListener('click', function () { self.openCollection('dealers'); });
      $('#hud-daily').addEventListener('click', function () { self.claimDaily(); });
      $('#hud-combo').addEventListener('click', function () { self.openPass(); });
      $('#btn-raise').addEventListener('click', function () { self.heroAction('raise'); });
      $('#pre-check').addEventListener('click', function () { self.setPreAction('check'); });
      $('#pre-call').addEventListener('click', function () { self.setPreAction('call'); });
      $('#action-bar .quick').addEventListener('click', function (e) {
        const b = e.target.closest('button');
        if (b && b.dataset.q) { self.quickSize(b.dataset.q); Sound.tap(); }
      });
      $('#raise-slider').addEventListener('input', function () {
        $('#raise-val').textContent = C.fmt(+this.value);
        this.style.setProperty('--fill', ((this.value - this.min) / Math.max(1, this.max - this.min) * 100) + '%');
        self.updateRaiseLabel();
      });

      // 메뉴
      $$('.close-modal').forEach(function (b) {
        b.addEventListener('click', function () {
          const m = b.closest('.modal');
          if (m) m.classList.remove('on');
          Sound.tap();
        });
      });
      $$('.modal').forEach(function (m) {
        m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('on'); });
      });
      $('#menu-speed').addEventListener('click', function () { self.toggleSpeed(); });
      $('#menu-sound').addEventListener('click', function () { self.toggleSound(); });
      $('#menu-haptic').addEventListener('click', function () { self.toggleHaptic(); });
      $('#menu-help').addEventListener('click', function () { $('#modal-rank').classList.add('on'); });
      $('#menu-tutorial').addEventListener('click', function () {
        $('#modal-menu').classList.remove('on');
        self.startTutorial();
      });
      $('#menu-leave').addEventListener('click', function () {
        $('#modal-menu').classList.remove('on');
        self.leaveGame();
      });

      // 멀티
      $$('#mp-size button').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('#mp-size button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on'); Sound.tap();
        });
      });
      $$('#mp-blinds button').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('#mp-blinds button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on'); Sound.tap();
        });
      });
      $$('#mp-fill button').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('#mp-fill button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on'); Sound.tap();
        });
      });
      $$('#mp-transport button').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('#mp-transport button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          $('#ws-field').classList.toggle('on', b.dataset.t === 'ws');
          Sound.tap();
        });
      });
      $('#btn-create-room').addEventListener('click', function () { self.mpCreate(); });
      $('#btn-join-room').addEventListener('click', function () { self.mpJoin(); });
      $('#mp-code').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 4); });
      $('#mpl-start').addEventListener('click', function () {
        if (self.mp) self.mp.startGame();
      });
      $('#mpl-leave').addEventListener('click', function () { self.mpLeave(); });
      $('#mpl-copy').addEventListener('click', function () {
        const code = $('#mpl-code').textContent;
        try {
          navigator.clipboard.writeText(code);
          self.toast('코드 ' + code + ' 복사됨');
        } catch (e) { self.toast('코드: ' + code); }
        Sound.tap();
      });
      $$('#mpl-fill button').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('#mpl-fill button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          if (self.mp) self.mp.setFillGrade(b.dataset.grade);
          Sound.tap();
        });
      });

      // 버스트/승리
      $('#bust-refill').addEventListener('click', function () {
        $('#modal-bust').classList.remove('on');
        Pr.refill(50000);
        self.renderLobby();
        self.toast('리필 완료 — 다시 앉아보자');
        if (self.mode === 'single') self.reenterRoom();
      });
      $('#bust-lobby').addEventListener('click', function () {
        $('#modal-bust').classList.remove('on');
        self.leaveGame();
      });
      $('#victory-ok').addEventListener('click', function () {
        $('#modal-victory').classList.remove('on');
        self.leaveGame();
      });

      global.addEventListener('resize', function () {
        if (App.snap) View.render(App.snap, true);
      });

      this.bindGmAndPrefs();
    },

    /* ------------------------------------------------ GM · AUTO · 프리셋 */
    bindGmAndPrefs() {
      const self = this;
      // 퀵 베팅 프리셋 토글
      $$('.preset-chips').forEach(function (box) {
        box.addEventListener('click', function (e) {
          const b = e.target.closest('button');
          if (!b) return;
          const k = b.dataset.q;
          const arr = Pr.data.quickPresets.slice();
          const i = arr.indexOf(k);
          if (i >= 0) { if (arr.length <= 2) { self.toast('최소 2개는 남겨야 해'); return; } arr.splice(i, 1); }
          else { if (arr.length >= 5) { self.toast('최대 5개까지'); return; } arr.push(k); }
          Pr.data.quickPresets = QUICK_ALL.filter(function (x) { return arr.indexOf(x) >= 0; });
          Pr.save();
          Sound.tap();
          self.renderPresetChips();
          self.renderQuickBar();
        });
      });
      // 블라인드 프리셋
      $('#cfg-blinds').addEventListener('click', function (e) {
        const b = e.target.closest('button');
        if (!b) return;
        Pr.data.blindPreset = b.dataset.b; Pr.save();
        Sound.tap(); self.renderCfg();
      });
      // AI 수준
      $('#cfg-ailevel').addEventListener('click', function (e) {
        const b = e.target.closest('button');
        if (!b) return;
        Pr.data.aiLevel = b.dataset.g; Pr.save();
        Sound.tap(); self.renderCfg();
      });

      // 운영자 모드 — 운영자 계정으로 로그인하면 자동 활성화 (일반 계정에는 숨김)
      $('#btn-gm').addEventListener('click', function () { self.gmOpen(); });
      $('#btn-gm-lobby').addEventListener('click', function () { self.gmOpen(); });
      $('#gm-pin-ok').addEventListener('click', function () { self.gmTryUnlock(); });
      $('#gm-pin').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') self.gmTryUnlock();
      });
      document.addEventListener('pointerdown', function () { Sound.resume(); }, { passive: true });
      $('#gm-peek').addEventListener('click', function () { self.gmTogglePeek(); });
      $('#gm-board').addEventListener('click', function () { self.gmToggleBoard(); });
      $('#gm-auto').addEventListener('click', function () { self.toggleAuto(); });
      $('#gm-speed').addEventListener('click', function () { self.toggleSpeed(); self.renderGm(); });
      $('#gm-chip-10k').addEventListener('click', function () { self.gmGrant(10000); });
      $('#gm-chip-100k').addEventListener('click', function () { self.gmGrant(100000); });
      $('#gm-chip-go').addEventListener('click', function () {
        const n = parseInt(($('#gm-chip-amount').value || '').replace(/[^0-9]/g, ''), 10);
        if (!n) { self.toast('금액을 입력해'); return; }
        self.gmGrant(n);
      });
      $('#gm-fold').addEventListener('click', function () { self.gmForce('fold'); });
      $('#gm-bluff').addEventListener('click', function () { self.gmForce('bluff'); });
      $('#gm-pin-change').addEventListener('click', function () {
        const v = ($('#gm-newpin').value || '').trim();
        if (v.length < 4) { self.toast('PIN은 4자리 이상'); return; }
        Pr.data.gmPin = v; Pr.save();
        $('#gm-newpin').value = '';
        self.toast('PIN 변경됨');
      });
      $('#gm-hide').addEventListener('click', function () {
        self.setGmMode(false);
        self.toast('운영자 모드 OFF');
      });
      const specBtn = $('#btn-spectate');
      if (specBtn) specBtn.addEventListener('click', function () { self.startSpectate(); });
      $$('#gm-auto-grade button').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('#gm-auto-grade button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          self.autoGrade = b.dataset.g;
          Sound.tap();
        });
      });
    },

    renderQuickBar() {
      const el = $('#action-bar .quick');
      if (!el) return;
      const list = Pr.data.quickPresets || ['min', 'half', 'pot', 'max'];
      el.innerHTML = list.map(function (k) {
        return '<button type="button" data-q="' + k + '">' + (QUICK_LABEL[k] || k) + '</button>';
      }).join('');
    },

    renderPresetChips() {
      const list = Pr.data.quickPresets || [];
      $$('.preset-chips').forEach(function (el) {
        el.innerHTML = QUICK_ALL.map(function (k) {
          const on = list.indexOf(k) >= 0;
          return '<button type="button" data-q="' + k + '" class="' + (on ? 'on' : '') + '">' + (QUICK_LABEL[k] || k) + '</button>';
        }).join('');
      });
    },

    renderCfg() {
      const bp = Pr.data.blindPreset || 'room';
      $$('#cfg-blinds button').forEach(function (b) { b.classList.toggle('on', b.dataset.b === bp); });
      const al = Pr.data.aiLevel || 'room';
      $$('#cfg-ailevel button').forEach(function (b) { b.classList.toggle('on', b.dataset.g === al); });
      this.renderPresetChips();
      this.renderQuickBar();
    },

    /* --------------------------------------------------------------- 로비 */
    renderLobby() {
      const d = Pr.data;
      $('#pf-bankroll').textContent = full(d.bankroll);
      $('#pf-name').textContent = d.name || '주호';
      const t = Pr.equippedTitle();
      $('#pf-title').textContent = t ? t.name : '칭호 없음';
      const tier = Pr.tier();
      const vip = $('#pf-vip');
      vip.textContent = tier.name;
      vip.style.color = tier.color;
      vip.style.borderColor = hexA(tier.color, .45);
      vip.style.background = hexA(tier.color, .12);

      const nxt = Pr.nextTier();
      const bar = $('#tier-bar');
      bar.style.width = Math.round(Pr.tierProgress() * 100) + '%';
      bar.style.background = 'linear-gradient(90deg,' + hexA(tier.color, .8) + ',' + (nxt ? nxt.color : tier.color) + ')';
      $('#tier-next').textContent = nxt
        ? nxt.name + '까지 ' + C.fmt(Math.max(0, nxt.min - d.peak)) + ' · 최고 ' + C.fmt(d.peak)
        : '최고 등급 달성 · 최고 ' + C.fmt(d.peak);

      $('#pf-stats').textContent = d.hands + '핸드 · ' + d.wins + '승';
      $('#pf-best').textContent = d.bestHandCat >= 0 ? ('최고 족보 ' + (d.bestHandName || '')) : '최고 족보 —';
      const vp = $('#pf-vip-points');
      if (vp) vp.textContent = 'VIP ' + (d.vipPoints || 0) + 'P · ' + Pr.rank().name + ' ' + (d.lp || 0) + 'LP';
      document.body.dataset.profile = d.profile || 'cyber_cyan';

      this.renderRooms();
      this.renderShop();
      this.renderCharge();
      this.renderTournamentCard();
      this.renderCfg();
      this.updateHud();
      View.setSkins(d.card, d.felt, d.rim, d.fx, d.cardFace, d.drop);
    },

    renderRooms() {
      const wrap = $('#room-list');
      wrap.innerHTML = '';
      const self = this;
      ROOMS.forEach(function (room) {
        const buyIn = room.bb * 100;
        const locked = !Pr.canEnter(room);
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'room-card' + (locked ? ' locked' : '');
        el.style.setProperty('--acc', room.accent);
        const uniq = {};
        room.grades.forEach(function (g) { uniq[g] = (uniq[g] || 0) + 1; });
        const badges = Object.keys(uniq).map(function (g) {
          return '<span class="gdot g-' + g + '">' + global.PokerAI.GRADE_KO[g] + ' ' + uniq[g] + '</span>';
        }).join('');
        el.innerHTML =
          '<div class="rc-badge">' + (room.id === 'highroller' ? '💎' : room.id === 'pro' ? '🔥' : room.id === 'expert' ? '♠' : room.id === 'mixed' ? '🎲' : '♣') + '</div>' +
          '<div class="rc-main">' +
            '<b>' + room.name + ' <span style="font-size:10px;color:#8b979e;font-weight:600">· 바이인 ' + C.fmt(buyIn) + '</span></b>' +
            '<div class="rc-blinds">' + room.sb + ' / ' + room.bb + '</div>' +
            '<div class="rc-desc">' + room.desc + '</div>' +
            '<div class="rc-grades">' + badges + '</div>' +
          '</div>' +
          '<div class="rc-go">' + (locked ? TIERS[room.tier].name + ' 필요' : '입장 →') + '</div>';
        el.addEventListener('click', function () {
          if (locked) {
            const need = TIERS[room.tier];
            self.toast(need.name + ' 등급 필요 · 최고 뱅크롤 ' + C.fmt(need.min) + ' 달성하면 열려');
            Sound.fold();
            return;
          }
          self.startSingle(room.id, self.size);
        });
        wrap.appendChild(el);
      });
    },

    renderTournamentCard() {
      const card = $('#card-tournament');
      if (!card) return;
      card.classList.remove('locked');
      $('.tour-btn', card).textContent = '참가';
    },

    renderShop() {
      const self = this;
      const wallet = C.fmt(Pr.data.bankroll);

      const cc = $('#shop-cards');
      cc.innerHTML = '';
      CARD_SKINS.forEach(function (s) {
        const owns = Pr.owns('card', s.id);
        const eq = Pr.data.card === s.id;
        const el = document.createElement('div');
        el.className = 'shop-item' + (owns ? ' owned' : '') + (eq ? ' equipped' : '');
        const prev = document.createElement('div');
        prev.className = 'prev';
        const card = C.cardEl({ r: 14, s: 0 }, { faceDown: true, skin: s.id });
        card.style.setProperty('--w', '34px');
        prev.appendChild(card);
        el.appendChild(prev);
        const b = document.createElement('b'); b.textContent = s.name; el.appendChild(b);
        const price = document.createElement('div');
        price.className = 'price' + (s.price === 0 ? ' free' : '');
        price.textContent = s.price === 0 ? '기본' : C.fmt(s.price) + ' 칩';
        el.appendChild(price);
        const btn = document.createElement('button');
        btn.type = 'button';
        if (!owns) {
          btn.className = 'buy'; btn.textContent = self.gmUnlocked ? '무료(GM)' : '구매';
          btn.addEventListener('click', function () {
            if (self.gmUnlocked) {
              if (Pr.data.ownedCards.indexOf(s.id) < 0) Pr.data.ownedCards.push(s.id);
              Pr.save();
            } else {
              const r = Pr.buy('card', s.id);
              if (!r.ok) { self.toast(r.msg); Sound.fold(); return; }
            }
            Pr.equip('card', s.id);
            Sound.chip(0, 5);
            self.toast(s.name + ' 해금 & 장착!');
            self.renderLobby();
          });
        } else if (eq) {
          btn.className = 'eq'; btn.textContent = '사용 중'; btn.disabled = true;
        } else {
          btn.textContent = '장착';
          btn.addEventListener('click', function () {
            Pr.equip('card', s.id); Sound.tap(); self.toast(s.name + ' 장착'); self.renderLobby();
          });
        }
        el.appendChild(btn);
        cc.appendChild(el);
      });

      const fc = $('#shop-felts');
      fc.innerHTML = '';
      FELT_SKINS.forEach(function (s) {
        const owns = Pr.owns('felt', s.id);
        const eq = Pr.data.felt === s.id;
        const el = document.createElement('div');
        el.className = 'shop-item' + (owns ? ' owned' : '') + (eq ? ' equipped' : '');
        const prev = document.createElement('div');
        prev.className = 'prev';
        const felt = document.createElement('div');
        felt.className = 'felt-prev';
        felt.style.background = feltBg(s.id);
        prev.appendChild(felt);
        el.appendChild(prev);
        const b = document.createElement('b'); b.textContent = s.name; el.appendChild(b);
        const price = document.createElement('div');
        price.className = 'price' + (s.price === 0 ? ' free' : '');
        price.textContent = s.price === 0 ? '기본' : C.fmt(s.price) + ' 칩';
        el.appendChild(price);
        const btn = document.createElement('button');
        btn.type = 'button';
        if (!owns) {
          btn.className = 'buy'; btn.textContent = self.gmUnlocked ? '무료(GM)' : '구매';
          btn.addEventListener('click', function () {
            if (self.gmUnlocked) {
              if (Pr.data.ownedFelts.indexOf(s.id) < 0) Pr.data.ownedFelts.push(s.id);
              Pr.save();
            } else {
              const r = Pr.buy('felt', s.id);
              if (!r.ok) { self.toast(r.msg); Sound.fold(); return; }
            }
            Pr.equip('felt', s.id);
            Sound.chip(0, 5);
            self.toast(s.name + ' 해금 & 장착!');
            self.renderLobby();
          });
        } else if (eq) {
          btn.className = 'eq'; btn.textContent = '사용 중'; btn.disabled = true;
        } else {
          btn.textContent = '장착';
          btn.addEventListener('click', function () {
            Pr.equip('felt', s.id); Sound.tap(); self.toast(s.name + ' 장착'); self.renderLobby();
          });
        }
        el.appendChild(btn);
        fc.appendChild(el);
      });

      this.renderSkinGrid('#shop-drops', 'drop', global.DROP_SKINS || [], 'drop', function (s) {
        const d = document.createElement('div');
        d.className = 'fx-prev drop-prev';
        d.style.setProperty('--fx-a', s.a);
        d.style.setProperty('--fx-b', s.b);
        d.textContent = s.id === 'drop_gold' ? '✨' : s.id === 'drop_bolt' ? '⚡' : '✦';
        return d;
      });
      this.renderSkinGrid('#shop-faces', 'face', global.FACE_SKINS || [], 'cardFace', function (s) {
        const card = C.cardEl({ r: 14, s: 0 }, { skin: Pr.data.card });
        card.style.setProperty('--w', '34px');
        if (s.id === 'face_cyber') card.dataset.face = 'cyber';
        if (s.id === 'face_gold') card.dataset.face = 'gold';
        return card;
      });
      this.renderBoosters();
      this.renderSkinGrid('#shop-profiles', 'profile', global.PROFILE_SKINS || [], 'profile', function (s) {
        const d = document.createElement('div');
        d.className = 'pf-prev';
        d.style.setProperty('--pa', s.a);
        d.style.setProperty('--pb', s.b);
        d.textContent = '🎯';
        return d;
      });
      this.renderSkinGrid('#shop-wins', 'win', global.WIN_SKINS || [], 'winFx', function (s) {
        const d = document.createElement('div');
        d.className = 'fx-prev';
        d.style.setProperty('--fx-a', s.id === 'win_gold' ? '#ffe27a' : '#00f5ff');
        d.style.setProperty('--fx-b', s.id === 'win_bolt' ? '#ff2bd6' : '#7b2bff');
        d.textContent = s.id === 'win_gold' ? '🪙' : s.id === 'win_bolt' ? '⚡' : '🎉';
        return d;
      });
      this.renderSkinGrid('#shop-loses', 'lose', global.LOSE_SKINS || [], 'loseFx', function (s) {
        const d = document.createElement('div');
        d.className = 'fx-prev';
        d.style.setProperty('--fx-a', '#ff6b9d');
        d.style.setProperty('--fx-b', '#7b2bff');
        d.textContent = s.id === 'lose_powerdown' ? '🔌' : '📺';
        return d;
      });

      /* 테이블 네온 림 / 번개 이펙트 스킨 */
      this.renderSkinGrid('#shop-rims', 'rim', global.RIM_SKINS || [], 'rim', function (s) {
        const d = document.createElement('div');
        d.className = 'rim-prev';
        d.style.background = 'conic-gradient(from 200deg,' + s.a + ',' + s.b + ',' + s.a + ')';
        return d;
      });
      this.renderSkinGrid('#shop-fx', 'fx', global.FX_SKINS || [], 'fx', function (s) {
        const d = document.createElement('div');
        d.className = 'fx-prev';
        d.style.setProperty('--fx-a', s.a);
        d.style.setProperty('--fx-b', s.b);
        d.textContent = '⚡';
        return d;
      });

      const tc = $('#shop-titles');      tc.innerHTML = '';
      const equipped = Pr.data.title;
      Pr.titles().forEach(function (t) {
        const el = document.createElement('div');
        el.className = 'title-item' + (t.unlocked ? '' : ' locked') + (equipped === t.id ? ' equipped' : '');
        el.innerHTML = '<b>' + t.name + '</b><span>' + (t.unlocked ? t.desc : '🔒 ' + t.desc) + '</span>';
        const btn = document.createElement('button');
        btn.className = 'eq';
        btn.type = 'button';
        btn.textContent = equipped === t.id ? '장착 중' : '장착';
        if (!t.unlocked) { btn.disabled = true; btn.textContent = '잠김'; }
        else {
          btn.addEventListener('click', function () {
            Pr.setTitle(equipped === t.id ? null : t.id);
            Sound.tap(); self.renderLobby();
            self.toast(equipped === t.id ? '칭호 해제' : t.name + ' 장착');
          });
        }
        el.appendChild(btn);
        tc.appendChild(el);
      });
    },

    /* 스킨 그리드 공통 렌더러 (림 · 이펙트 등) */
    renderSkinGrid(sel, kind, list, eqKey, makePrev) {
      const host = $(sel);
      if (!host) return;
      const self = this;
      host.innerHTML = '';
      list.forEach(function (s) {
        const owns = Pr.owns(kind, s.id);
        const eq = Pr.data[eqKey] === s.id;
        const el = document.createElement('div');
        el.className = 'shop-item' + (owns ? ' owned' : '') + (eq ? ' equipped' : '');
        const prev = document.createElement('div');
        prev.className = 'prev';
        prev.appendChild(makePrev(s));
        el.appendChild(prev);
        const b = document.createElement('b'); b.textContent = s.name; el.appendChild(b);
        const price = document.createElement('div');
        price.className = 'price' + (s.price === 0 ? ' free' : '');
        price.textContent = s.price === 0 ? '기본' : C.fmt(s.price) + ' 칩';
        el.appendChild(price);
        const btn = document.createElement('button');
        btn.type = 'button';
        if (!owns) {
          btn.className = 'buy'; btn.textContent = self.gmUnlocked ? '무료(GM)' : '구매';
          btn.addEventListener('click', function () {
            if (self.gmUnlocked) {
              const arrKey = Pr._kind(kind).arr;
              if ((Pr.data[arrKey] || []).indexOf(s.id) < 0) Pr.data[arrKey] = (Pr.data[arrKey] || []).concat([s.id]);
              Pr.save();
            } else {
              const r = Pr.buy(kind, s.id);
              if (!r.ok) { self.toast(r.msg); Sound.fold(); return; }
            }
            Pr.equip(kind, s.id);
            Sound.chip(0, 5);
            self.toast(s.name + ' 해금 & 장착!');
            self.renderLobby();
          });
        } else if (eq) {
          btn.className = 'eq'; btn.textContent = '사용 중'; btn.disabled = true;
        } else {
          btn.textContent = '장착';
          btn.addEventListener('click', function () {
            Pr.equip(kind, s.id); Sound.tap();
            self.toast(s.name + ' 장착'); self.renderLobby();
          });
        }
        el.appendChild(btn);
        host.appendChild(el);
      });
    },

    /* ------------------------------------------------------- 현금 충전 상점 */
    bindCharge() {
      const self = this;
      const packs = $('#charge-packs');
      if (!packs) return;
      packs.addEventListener('click', function (e) {
        const b = e.target.closest('.charge-pack');
        if (!b) return;
        self.openCharge(b.dataset.pkg);
      });
      $('#charge-confirm').addEventListener('click', function () { self.confirmCharge(); });
    },

    renderCharge() {
      const B = global.HoldemBilling;
      const packs = $('#charge-packs');
      if (!packs || !B) return;
      const first = B.isFirstCharge();
      packs.innerHTML = B.packages.map(function (p) {
        const q = B.quote(p.id);
        return '<button class="charge-pack' + (p.tag === '추천' ? ' hot' : '') + '" type="button" data-pkg="' + p.id + '">' +
          '<span class="cp-tag">' + p.tag + '</span>' +
          '<span class="cp-chips">' + C.fmt(q.total) + ' 칩</span>' +
          '<span class="cp-price">' + p.price.toLocaleString('ko-KR') + '원</span>' +
          '<span class="cp-bonus">' + (first ? '첫 충전 +' + B.firstBonus + '% 포함' : (p.bonus ? '+' + p.bonus + '% 보너스' : '기본 패키지')) + '</span>' +
        '</button>';
      }).join('');
      $('#charge-mode').textContent = B.providerLabel();
      $('#charge-first').textContent = first
        ? '🎁 첫 충전 보너스 +' + B.firstBonus + '% — 모든 패키지가 두 배로 들어와'
        : '누적 충전 ' + (Pr.data.totalCharged || 0).toLocaleString('ko-KR') + '원';
      const list = global.HoldemAuth.receipts();
      const box = $('#charge-receipts');
      box.innerHTML = list.length ? list.map(function (r) {
        const d = new Date(r.at);
        const p2 = function (n) { return String(n).padStart(2, '0'); };
        const ts = d.getFullYear() + '.' + p2(d.getMonth() + 1) + '.' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
        return '<div class="receipt-row"><div><b>' + r.name + '</b><br><span>' + ts + ' · ' + r.provider + '</span></div>' +
          '<div class="rr-chips">+' + C.fmt(r.chips) + '</div></div>';
      }).join('') : '<div class="receipt-empty">아직 충전 내역이 없어</div>';
      const total = list.reduce(function (s, r) { return s + (r.price || 0); }, 0);
      $('#charge-total').textContent = list.length ? (list.length + '건 · ' + total.toLocaleString('ko-KR') + '원') : '';
    },

    openCharge(pkgId) {
      const B = global.HoldemBilling;
      const q = B && B.quote(pkgId);
      if (!q) return;
      this._chargePkg = pkgId;
      $('#charge-summary').innerHTML =
        '<div class="cs-row"><span>' + q.pkg.tag + ' 패키지</span><b>' + q.base.toLocaleString('ko-KR') + ' 칩</b></div>' +
        (q.pkgBonus ? '<div class="cs-row"><span>패키지 보너스 +' + q.pkg.bonus + '%</span><b>+' + q.pkgBonus.toLocaleString('ko-KR') + '</b></div>' : '') +
        (q.firstBonus ? '<div class="cs-row"><span>첫 충전 보너스 +' + B.firstBonus + '%</span><b>+' + q.firstBonus.toLocaleString('ko-KR') + '</b></div>' : '') +
        '<div class="cs-row total"><span>충전 칩</span><b>' + q.total.toLocaleString('ko-KR') + '</b></div>' +
        '<div class="cs-row"><span>결제 금액</span><b>' + q.price.toLocaleString('ko-KR') + '원</b></div>';
      $('#charge-provider').textContent = B.providerLabel();
      $('#charge-notice').textContent = B.isRealProvider()
        ? '결제를 누르면 스토어/가맹점 결제창이 열려.'
        : '샌드박스 모드예요 — 실제 금액은 청구되지 않고, 확인을 누르면 바로 충전됩니다.';
      const btn = $('#charge-confirm');
      btn.disabled = false;
      btn.textContent = '충전하기';
      $('#modal-charge').classList.add('on');
      Sound.tap();
    },

    async confirmCharge() {
      const B = global.HoldemBilling;
      const pkgId = this._chargePkg;
      if (!B || !pkgId) return;
      const btn = $('#charge-confirm');
      btn.disabled = true;
      btn.textContent = '결제 처리 중…';
      const r = await B.purchase(pkgId, {});
      btn.disabled = false;
      btn.textContent = '충전하기';
      if (!r.ok) {
        this.toast('❌ ' + (r.error || '결제 실패'));
        Sound.fold();
        return;
      }
      $('#modal-charge').classList.remove('on');
      this.renderLobby();
      this.renderCharge();
      Sound.chip(0, 8);
      Sound.fanfare(0.1);
      if (global.FX) global.FX.coinShower(innerWidth / 2, innerHeight * 0.35, innerWidth * 0.7, 30);
      this.toast('+' + C.fmt(r.chips) + ' 칩 충전 완료 · 영수증 ' + r.receipt.id);
      this._chargePkg = null;
    },

    /* ---------------------------------------------------------- 시즌패스 */
    openPass() {
      this.renderPass();
      $('#modal-pass').classList.add('on');
      Sound.tap();
    },

    renderPass() {
      const lv = Pr.passLevel();
      const rows = $('#pass-rows');
      if (!rows) return;
      $('#pass-lv').textContent = lv;
      $('#pass-title').textContent = '레벨 ' + lv + ' / 10';
      $('#pass-xp').textContent = (Pr.data.passXP || 0) + ' XP' +
        (lv < 10 ? ' · 다음까지 ' + Math.max(0, lv * Pr.passStep - (Pr.data.passXP || 0)) : ' · MAX');
      $('#pass-bar-fill').style.width = Math.round(Pr.passProgress() * 100) + '%';
      const prem = $('#pass-prem');
      prem.textContent = Pr.data.passPremium ? 'PREMIUM' : 'FREE';
      prem.classList.toggle('on', !!Pr.data.passPremium);
      $('#pass-premium').style.display = Pr.data.passPremium ? 'none' : '';

      const fmtReward = function (r) {
        if (!r) return '—';
        const parts = [];
        if (r.chips) parts.push(C.fmt(r.chips) + '칩');
        if (r.boosters) Object.keys(r.boosters).forEach(function (k) {
          parts.push((k === 'double' ? '2X WIN' : 'BLIND') + ' x' + r.boosters[k]);
        });
        if (r.profile) parts.push('프로필 스킨');
        if (r.face) parts.push('카드 앞면');
        return parts.join(' · ');
      };
      const btn = function (line, level, locked) {
        const claimed = Pr.passClaimed(line, level);
        const can = !claimed && !locked && Pr.passLevel() >= level;
        return '<button type="button" class="pass-claim' + (claimed ? ' done' : '') + '"' +
          ' data-claim="' + line + '" data-lv="' + level + '"' + (can ? '' : ' disabled') + '>' +
          (claimed ? '완료' : locked ? '🔒' : '받기') + '</button>';
      };
      rows.innerHTML = Pr.passLevels().map(function (l) {
        const claimedAny = Pr.passClaimed('free', l.lv) || Pr.passClaimed('premium', l.lv);
        return '<div class="pass-row' + (claimedAny ? ' done' : '') + '">' +
          '<span class="pr-lv">' + l.lv + '</span>' +
          '<span class="pr-free">' + fmtReward(l.free) + '</span>' + btn('free', l.lv, false) +
          '<span class="pr-prem">' + fmtReward(l.premium) + '</span>' + btn('premium', l.lv, !Pr.data.passPremium) +
        '</div>';
      }).join('');
    },

    claimPassReward(line, lv) {
      const r = Pr.claimPass(line, lv);
      if (!r.ok) { this.toast(r.msg); Sound.fold(); return; }
      Sound.chip(0, 6);
      Sound.fanfare(0.05);
      global.FX.coinShower(innerWidth / 2, innerHeight * 0.35, innerWidth * 0.7, 24);
      if (r.reward.profile) Pr.equip('profile', r.reward.profile);
      this.toast('시즌패스 LV' + lv + ' ' + (line === 'premium' ? '프리미엄' : '무료') + ' 보상 수령!');
      this.renderPass();
      this.renderLobby();
    },

    async unlockPremiumPass() {
      const B = global.HoldemBilling;
      const btn = $('#pass-premium');
      btn.disabled = true;
      btn.textContent = '결제 처리 중…';
      const r = await B.purchasePremiumPass();
      btn.disabled = false;
      btn.textContent = '프리미엄 해금 11,000원';
      if (!r.ok) { this.toast('❌ ' + r.error); return; }
      this.renderPass();
      this.renderLobby();
      Sound.trophy();
      this.toast('프리미엄 시즌패스 해금! 10레벨 보상이 열렸어');
    },

    /* ---------------------------------------------------------- 컬렉션 도감 */
    openCollection(tab) {
      if (tab) this._collTab = tab;
      this._collTab = this._collTab || 'skins';
      $$('.coll-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.coll === App._collTab); });
      this.renderCollection(this._collTab);
      $('#modal-collection').classList.add('on');
      Sound.tap();
    },

    renderCollection(tab) {
      const st = Pr.collectionStats();
      const pct = $('#coll-pct');
      if (!pct) return;
      pct.textContent = st.pct + '%';
      $('#coll-summary').textContent = '스킨 ' + st.ownedSkins + '/' + st.totalSkins + ' · 딜러 ' + st.dealers + '/10 · 족보 ' + st.cats + '/9';
      $('#coll-bar-fill').style.width = st.pct + '%';

      const claims = $('#coll-claims');
      const claimBtn = function (kind, need, reward, label) {
        const done = (Pr.data.collectionClaims || []).indexOf(kind) >= 0;
        return '<button type="button" class="coll-claim' + (done ? ' done' : '') + '"' +
          ' data-coll-claim="' + kind + '"' + (done || need ? '' : ' disabled') + '>' +
          (done ? '✅ ' + label : label + ' +' + C.fmt(reward)) + '</button>';
      };
      claims.innerHTML =
        claimBtn('dealers', st.dealers < 10, 50000, '딜러 도감') +
        claimBtn('cats', st.cats < 9, 100000, '족보 도감') +
        claimBtn('collection', st.pct < 100, 150000, '완전 수집');

      const body = $('#coll-body');
      if (tab === 'dealers') {
        const met = Pr.data.dealersMet || [];
        body.innerHTML = '<div class="coll-grid">' + (global.Dealers ? global.Dealers.list.map(function (d) {
          const on = met.indexOf(d.id) >= 0;
          return '<div class="coll-dealer' + (on ? ' met' : '') + '">' +
            '<div class="cd-pic" style="background-image:url(\'' + d.src + '\')"></div>' +
            '<b>' + (on ? d.name : '???') + '</b><i>' + (on ? d.outfit : '아직 못 만남') + '</i></div>';
        }).join('') : '') + '</div>';
      } else if (tab === 'hands') {
        const cats = Pr.data.catsSeen || [];
        body.innerHTML = '<div class="coll-grid">' + (P.CAT_KO || []).map(function (name, i) {
          const on = cats.indexOf(i) >= 0;
          return '<div class="coll-cat' + (on ? ' met' : '') + '"><b>' + (on ? name : '???') + '</b><i>' + (on ? '달성' : '미달성') + '</i></div>';
        }).join('') + '</div>';
      } else {
        const groups = [
          ['카드 뒷면', 'card', global.CARD_SKINS], ['펠트', 'felt', global.FELT_SKINS],
          ['네온 림', 'rim', global.RIM_SKINS], ['번개', 'fx', global.FX_SKINS],
          ['카드 앞면', 'face', global.FACE_SKINS], ['드랍', 'drop', global.DROP_SKINS],
          ['프로필', 'profile', global.PROFILE_SKINS], ['승리', 'win', global.WIN_SKINS],
          ['패배', 'lose', global.LOSE_SKINS]
        ];
        body.innerHTML = groups.map(function (g) {
          return '<div class="coll-group"><b>' + g[0] + '</b><div class="coll-chips">' +
            (g[2] || []).map(function (s) {
              const own = Pr.owns(g[1], s.id);
              return '<span class="coll-chip' + (own ? ' own' : '') + '">' + (own ? s.name : '???') + '</span>';
            }).join('') + '</div></div>';
        }).join('');
      }
    },

    claimCollectionReward(kind) {
      const r = Pr.claimCollection(kind);
      if (!r.ok) { this.toast(r.msg); Sound.fold(); return; }
      Sound.trophy();
      global.FX.coinShower(innerWidth / 2, innerHeight * 0.35, innerWidth * 0.7, 40);
      this.toast('컬렉션 보상 +' + C.fmt(r.reward) + ' 칩!');
      this.renderCollection(this._collTab);
      this.renderLobby();
    },

    /* ---------------------------------------------------------- 상단 HUD */
    openStore() {
      $('#modal-store').classList.add('on');
      Sound.tap();
    },

    nudgeRaise(dir) {
      const o = this.options;
      const slider = $('#raise-slider');
      if (!o || !slider) return;
      const step = Math.max(1, this.engine ? this.engine.bb : 20);
      let v = +slider.value + dir * step;
      v = Math.max(o.minTo, Math.min(o.maxTo, v));
      slider.value = v;
      slider.style.setProperty('--fill', ((v - slider.min) / Math.max(1, slider.max - slider.min) * 100) + '%');
      $('#raise-val').textContent = C.fmt(v);
      this.updateRaiseLabel();
      Sound.tap();
    },

    claimDaily() {
      const r = Pr.claimDaily();
      if (!r.ok) { this.toast(r.msg); return; }
      Sound.chip(0, 6);
      Sound.fanfare(0.05);
      global.FX.coinShower(innerWidth / 2, innerHeight * 0.35, innerWidth * 0.7, 30);
      this.toast('출석 보너스 +' + C.fmt(r.amount) + ' 칩!');
      this.updateHud();
      this.renderLobby();
    },

    updateHud() {
      const jp = $('#jp-value');
      if (jp) jp.textContent = C.fmt(Pr.data.bankroll);
      const gc = $('#g-chips');
      if (gc) gc.textContent = C.fmt(Pr.data.bankroll);
      const cats = (Pr.data.catsSeen || []).length;
      const q = $('#hud-quest-count');
      if (q) q.textContent = cats + ' / 9';
      const rf = $('#hud-rf-fill');
      if (rf) rf.style.width = ((Pr.data.catsSeen || []).indexOf(8) >= 0 ? 100 : Math.round(cats / 9 * 100)) + '%';
      const daily = $('#hud-daily-time');
      if (daily) daily.textContent = Pr.dailyAvailable() ? '받기' : '완료';
      const combo = $('#hud-combo-x');
      if (combo) combo.textContent = 'x' + Math.min(5, 2 + Math.floor((Pr.data.lp || 0) / 400));
    },

    /* ---------------------------------------------------------- 인게임 부스터 */
    renderBoosters() {
      const host = $('#shop-boosters');
      if (!host) return;
      const self = this;
      host.innerHTML = (global.BOOSTERS || []).map(function (b) {
        const n = Pr.boosterCount(b.id);
        return '<div class="booster-item' + (b.id === 'blind' ? ' blind' : '') + '">' +
          '<div class="bi-top"><b>' + b.name + '</b><span>' + n + '개</span></div>' +
          '<i>' + b.desc + '</i>' +
          '<button type="button" data-buy="' + b.id + '">' + C.fmt(b.price) + '칩 · ' + b.qty + '개</button>' +
        '</div>';
      }).join('');
      host.onclick = function (e) {
        const btn = e.target.closest('button[data-buy]');
        if (!btn) return;
        const id = btn.dataset.buy;
        if (self.gmUnlocked) {
          Pr.data.boosters = Pr.data.boosters || {};
          Pr.data.boosters[id] = Pr.boosterCount(id) + 3;
          Pr.save();
        } else {
          const r = Pr.buyBooster(id);
          if (!r.ok) { self.toast(r.msg); Sound.fold(); return; }
        }
        const item = (global.BOOSTERS || []).filter(function (x) { return x.id === id; })[0] || {};
        Sound.chip(0, 6);
        self.toast((item.name || id) + ' 3개 구매 완료');
        self.renderLobby();
        self.refreshBoostUI();
      };
    },

    refreshBoostUI() {
      const d = $('#boost-2x'), b = $('#boost-blind'), r = $('#boost-risk');
      if (!d || !b) return;
      const nd = Pr.boosterCount('double'), nb = Pr.boosterCount('blind'), nr = Pr.boosterCount('risk');
      d.querySelector('em').textContent = nd;
      b.querySelector('em').textContent = nb;
      d.classList.toggle('on', !!this.boostDouble);
      d.disabled = nd <= 0 && !this.boostDouble;
      b.disabled = nb <= 0;
      const inGame = !!this.engine && this.mode !== 'tutorial';
      const anyBoost = nd + nb + nr > 0 || this.boostDouble || this.riskActive;
      const row = $('#boost-row');
      if (row) row.style.display = (inGame && anyBoost) ? 'flex' : 'none';
      d.style.display = inGame ? '' : 'none';
      b.style.display = inGame ? '' : 'none';
      if (r) {
        r.querySelector('em').textContent = nr;
        r.classList.toggle('on', !!this.riskActive);
        r.disabled = nr <= 0 || !(this.snap && this.snap.street === 'flop');
        r.style.display = inGame ? '' : 'none';
      }
    },

    /* 플랍 2X 승부권 — 승리 2배 / 패배 2배 */
    activateRisk() {
      if (!this.engine || !this.snap) { this.toast('게임 중에만 사용할 수 있어'); return; }
      if (this.snap.street !== 'flop') { this.toast('플랍에서만 적용할 수 있어'); return; }
      if (this.riskActive) { this.toast('이미 이번 판에 적용 중'); return; }
      if (Pr.boosterCount('risk') <= 0) { this.toast('플랍 2X 승부권이 없어 — 상점에서 구매'); return; }
      Pr.useBooster('risk');
      this.riskActive = true;
      this.refreshBoostUI();
      global.FX.banner('2X RISK!', '승리 2배 · 패배 2배', { cls: 'win', duration: 1800 });
      Sound.bolt(2);
      Haptic.fire([30, 40, 80]);
      this.toast('플랍 2X 승부 ON — 이번 판 결과가 2배로 적용');
    },

    activateBoost(id) {
      if (!this.engine) { this.toast('게임 중에만 사용할 수 있어'); return; }
      if (id === 'double') {
        if (this.boostDouble) {
          this.boostDouble = false;
          this.refreshBoostUI();
          this.toast('2X WIN 해제');
          return;
        }
        if (Pr.boosterCount('double') <= 0) { this.toast('2X WIN 부스터가 없어 — 상점에서 구매'); return; }
        Pr.useBooster('double');
        this.boostDouble = true;
        this.refreshBoostUI();
        Sound.fanfare(0.04);
        Haptic.fire(30);
        global.FX.banner('2X WIN!', '이번 판 승리 2배', { cls: 'win', duration: 1700 });
        this.toast('2X WIN ON — 이번 판 승리 시 획득 2배');
      }
    },

    /* 안 봤다 올인 — 프리플랍에 카드를 보지 않고 올인 */
    blindAllIn() {
      const o = this.options;
      if (!this.engine || !o || !this.snap) { this.toast('내 차례에만 가능해'); return; }
      if (this.snap.street !== 'preflop') { this.toast('프리플랍에서만 쓸 수 있어'); return; }
      if (!o.canRaise) { this.toast('지금은 올인할 수 없어'); return; }
      if (Pr.boosterCount('blind') <= 0) { this.toast('BLIND ALL-IN 부스터가 없어 — 상점에서 구매'); return; }
      Pr.useBooster('blind');
      Pr.addPassXP(15);
      this.blindAllInPending = true;
      this.refreshBoostUI();
      /* 카드가 뒤집히지 않은 상태 유지 */
      View.heroRevealed = false;
      View.startTimer = null;
      const heroEl = document.querySelector('#hero-cards .hero-card');
      if (heroEl && global.Lightning) {
        const r = heroEl.getBoundingClientRect();
        global.Lightning.strike(3, { x: r.left, y: r.top, w: r.width, h: r.height });
        View.rimFlash(3);
        View.impactShake();
        View.dealerCheer(2);
      }
      global.FX.banner('BLIND ALL-IN!', '안 봤다 올인', { cls: 'win', duration: 1800 });
      Sound.bolt(3);
      Haptic.fire([60, 50, 110, 50, 180]);
      this.toast('BLIND ALL-IN! 승리 시 +50% 보너스');
      this.heroAction('raise', o.maxTo);
    },

    /* --------------------------------------------------------------- GM */
    gmOpen() {
      const Auth = global.HoldemAuth;
      if (!Auth.isAdmin()) {
        this.toast('운영자 계정으로 로그인해야 쓸 수 있어');
        Sound.fold();
        return;
      }
      if (!this.gmUnlocked) this.gmUnlocked = true;
      this.renderGm();
      this.renderGmPlayers();
      $('#modal-gm').classList.add('on');
    },

    /* 운영자 모드 ON/OFF 토글 */
    setGmMode(on) {
      const Auth = global.HoldemAuth;
      if (!Auth.isAdmin()) {
        this.toast('운영자 계정으로 로그인해야 해');
        return;
      }
      this.gmUnlocked = !!on;
      if (on) {
        document.body.classList.add('gm-visible');
        $('#btn-gm').classList.add('on');
        Sound.fanfare(0);
        this.toast('운영자 모드 ON — 플레이어 조회·칩 관리 사용 가능');
        this.renderGmPlayers();
        if (this.snap) this.refreshView();
        $('#modal-gm').classList.add('on');
      } else {
        this.gmPeek = false;
        this.gmBoard = false;
        this.auto = false;
        document.body.classList.add('admin-account');   // 버튼은 남겨 다시 켤 수 있게
        $('#btn-gm').classList.remove('on');
        $('#modal-gm').classList.remove('on');
        if (this.mp) { this.mp.gmPeek = false; this.mp.gmBoard = false; }
        if (this.snap) this.refreshView();
        this.toast('운영자 모드 OFF');
      }
      this.renderGm();
      Sound.tap();
    },

    gmTryUnlock() {
      const v = ($('#gm-pin').value || '').trim();
      if (!global.HoldemAuth.isAdmin()) {
        $('#gm-pin-err').textContent = '운영자 계정으로 로그인해';
        return;
      }
      if (v === (Pr.data.gmPin || '7073')) {
        this.gmUnlocked = true;
        document.body.classList.add('gm-visible');
        $('#modal-gm-pin').classList.remove('on');
        $('#btn-gm').classList.add('on');
        Sound.fanfare(0);
        this.renderGm();
        this.renderGmPlayers();
        $('#modal-gm').classList.add('on');
      } else {
        $('#gm-pin-err').textContent = 'PIN이 틀렸어';
        Sound.fold();
        Haptic.fire(60);
      }
    },

    renderGm() {
      const b = $('#gm-peek b');
      if (b) { b.textContent = this.gmPeek ? 'ON' : 'OFF'; b.style.color = this.gmPeek ? '#8ef6ff' : '#ffd98a'; }
      const bd = $('#gm-board b');
      if (bd) { bd.textContent = this.gmBoard ? 'ON' : 'OFF'; bd.style.color = this.gmBoard ? '#8ef6ff' : '#ffd98a'; }
      const a = $('#gm-auto b');
      if (a) { a.textContent = this.auto ? '켜짐' : '꺼짐'; a.style.color = this.auto ? '#8ce0a2' : '#ffd98a'; }
      const sp = $('#gm-speed b');
      if (sp) sp.textContent = Pr.data.speed === 'fast' ? '빠름' : '보통';
      $$('#gm-auto-grade button').forEach(function (x) { x.classList.toggle('on', x.dataset.g === App.autoGrade); });
      const mode = $('#gm-mode');
      if (mode) {
        mode.textContent = this.gmUnlocked ? 'ON' : 'OFF';
        mode.classList.toggle('off', !this.gmUnlocked);
      }
      const mg = $('#menu-gm b');
      if (mg) mg.textContent = this.gmUnlocked ? 'ON' : 'OFF';
    },

    /* ------------------------------------------- 운영자: 플레이어 정보 조회 */
    renderGmPlayers() {
      const wrap = $('#gm-players');
      if (!wrap) return;
      const Auth = global.HoldemAuth;
      const SUITS = ['♠', '♥', '♦', '♣'];
      const self = this;
      const fmt = C.fmt;
      const cardsTxt = function (hole) {
        if (!hole || !hole.length) return '—';
        return hole.map(function (c) { return P.RANK_STR[c.r] + SUITS[c.s]; }).join(' ');
      };
      const handTxt = function (hole, board) {
        if (!hole || hole.length < 2) return '';
        if (!board || board.length < 3) return '';
        const ev = P.evaluate(hole.concat(board));
        return ev ? (P.CAT_KO[ev.cat] || '') : '';
      };
      const rows = [];

      /* 1) 지금 테이블에 앉은 플레이어 (엔진/스냅샷) */
      const seats = this.engine ? this.engine.seats
        : (this.snap && this.snap.seats ? this.snap.seats : []);
      const board = this.engine ? this.engine.board : (this.snap ? this.snap.board : []);
      if (seats && seats.length) {
        seats.forEach(function (s) {
          const isHero = s.isHero || (this.snap && this.snap.you === s.idx) || s.idx === 0;
          const isHuman = !!(isHero || s.remote);
          const gKo = s.grade && global.PokerAI ? (global.PokerAI.GRADE_KO[s.grade] || '') : '';
          const hn = handTxt(s.hole, board);
          rows.push(
            '<div class="gm-player' + (isHero ? ' me' : '') + '">' +
              '<div class="gp-top"><b>' + (s.name || '플레이어') + '</b>' +
                '<span class="gp-badge ' + (isHuman ? '' : 'ai') + '">' + (isHuman ? '실제 유저' : ('AI · ' + (gKo || '초보'))) + '</span>' +
                '<span class="gp-chips">' + fmt(s.stack) + '</span></div>' +
              '<div class="gp-meta">' +
                '<span>테이블 스택</span>' +
                (s.lastAction ? '<span>' + s.lastAction + '</span>' : '') +
                (hn ? '<span class="gp-hand">' + hn + '</span>' : '') +
                '<span class="gp-hand">' + cardsTxt(s.hole) + '</span>' +
              '</div>' +
              '<div class="gp-actions">' +
                '<button class="gp-plus" type="button" data-kind="seat" data-key="' + s.idx + '" data-grant="10000">+10K</button>' +
                '<button class="gp-minus" type="button" data-kind="seat" data-key="' + s.idx + '" data-grant="-10000">-10K</button>' +
              '</div>' +
            '</div>'
          );
        }, this);
      }

      /* 2) 가입된 계정 전체 */
      const accts = Auth.summary();
      const me = Auth.current();
      const meSeat = this.engine ? this.engine.seats[0] : (this.snap ? this.snap.seats[this.snap.you] : null);
      accts.forEach(function (a) {
        const isMe = me && me.id === a.id;
        const hn = isMe && meSeat ? handTxt(meSeat.hole, board) : '';
        rows.push(
          '<div class="gm-player' + (a.online ? ' online' : '') + (isMe ? ' me' : '') + '">' +
            '<div class="gp-top"><b>' + a.nick + '</b>' +
              '<span class="gp-badge">실제 유저</span>' +
              (a.role === 'admin' ? '<span class="gp-badge admin">운영자</span>' : a.guest ? '<span class="gp-badge">게스트</span>' : '') +
              (a.online ? '<span class="gp-badge">접속중</span>' : '') +
              '<span class="gp-chips">' + fmt(a.chips) + '</span></div>' +
            '<div class="gp-meta">' +
              '<span>VIP ' + a.tier + '</span>' +
              '<span>' + a.wins + '승 / ' + a.hands + '판 (' + a.winRate + '%)</span>' +
              (isMe && hn ? '<span class="gp-hand">현재 ' + hn + '</span>' : '') +
              (isMe && meSeat ? '<span class="gp-hand">' + cardsTxt(meSeat.hole) + '</span>' : '<span>손패 —</span>') +
            '</div>' +
            '<div class="gp-actions">' +
              '<button class="gp-plus" type="button" data-kind="account" data-key="' + a.id + '" data-grant="10000">+10K</button>' +
              '<button class="gp-minus" type="button" data-kind="account" data-key="' + a.id + '" data-grant="-10000">-10K</button>' +
            '</div>' +
          '</div>'
        );
      });

      wrap.innerHTML = rows.join('') || '<div class="receipt-empty">플레이어가 없어</div>';
      const foot = $('#gm-players-foot');
      if (foot) {
        foot.textContent = '계정 ' + accts.length + '개 · 테이블 ' + (seats ? seats.length : 0) + '명 · [AI · 등급] / [실제 유저] 배지는 운영자에게만 보여';
      }
    },

    gmPlayerGrant(kind, key, amount) {
      const Auth = global.HoldemAuth;
      const amt = Math.round(amount || 0);
      if (!amt) return;
      if (kind === 'seat') {
        const e = this.engine;
        if (!e || !e.seats[+key]) { this.toast('테이블 진행 중에만 칩을 바꿀 수 있어'); return; }
        const s = e.seats[+key];
        s.stack = Math.max(0, s.stack + amt);
        if (+key === 0 && this.mode === 'single') Pr.setBankroll(this.baseWallet + s.stack);
        if (this.snap) this.onSnapshot({});
      } else {
        const next = Auth.adjustChips(key, amt);
        if (next == null) { this.toast('계정을 찾을 수 없어'); return; }
        if (Auth.current() && Auth.current().id === key) this.renderLobby();
      }
      this.toast((amt > 0 ? '+' : '') + full(amt) + ' 칩 ' + (amt > 0 ? '지급' : '차감'));
      Sound.chip(0, 4);
      this.renderGmPlayers();
      if (this.snap) this.refreshView();
    },

    gmTogglePeek() {
      this.gmPeek = !this.gmPeek;
      this.renderGm();
      Sound.tap();
      if (!this.engine && this.mode && this.mode.indexOf('mp') === 0) {
        this.toast('친구방은 호스트만 엿보기 가능');
      } else {
        this.toast(this.gmPeek ? '상대 패 공개 ON' : '상대 패 공개 OFF');
      }
      if (this.mp) this.mp.gmPeek = this.gmPeek;
      if (this.snap) this.refreshView();
    },

    gmToggleBoard() {
      this.gmBoard = !this.gmBoard;
      this.renderGm();
      Sound.tap();
      if (!this.engine && this.mode && this.mode.indexOf('mp') === 0 && this.mode !== 'mp-host') {
        this.toast('친구방은 호스트만 보드 미리보기 가능');
      } else {
        this.toast(this.gmBoard ? '보드 미리보기 ON — 예정 카드 표시' : '보드 미리보기 OFF');
      }
      if (this.mp) this.mp.gmBoard = this.gmBoard;
      if (this.snap) this.refreshView();
    },

    /* ------------------------------------------------- 미리 액션(프리액션) */

    setPreAction(kind) {
      const next = this.preAction === kind ? null : kind;
      if (next && this.mode !== 'single' && this.mode !== 'tournament' && this.mode !== 'mp-host' && this.mode !== 'mp-client') return;
      this.preAction = next;
      this.renderPreRow();
      Sound.tap();
      if (next === 'check') this.toast('미리 체크 예약 — 내 차례면 바로 체크 (레이즈 오면 해제)');
      else if (next === 'call') this.toast('미리 콜 예약 — 내 차례면 바로 콜');
      else this.toast('미리 액션 해제');
    },

    renderPreRow() {
      const row = $('#pre-row');
      if (!row) return;
      const c = $('#pre-check'), k = $('#pre-call');
      const a = this.preAction;
      if (c) {
        c.classList.toggle('on', a === 'check');
        c.textContent = a === 'check' ? '✓ 미리 체크 / 폴드' : '미리 체크 / 폴드';
      }
      if (k) {
        k.classList.toggle('on', a === 'call');
        k.textContent = a === 'call' ? '✓ 미리 콜' : '미리 콜';
      }
    },

    /* 내 턴이 되었을 때 예약한 미리 액션을 실행 */
    runPreAction(options) {
      const pre = this.preAction;
      if (!pre || this.auto) return false;
      this.preAction = null;
      this.renderPreRow();
      if (pre === 'check' && options && options.toCall > 0) {
        this.toast('앞사람 레이즈 — 미리 체크 해제, 직접 선택해');
        return false;
      }
      const self = this;
      const act = pre === 'call' ? ((options && options.toCall > 0) ? 'call' : 'check') : 'check';
      const label = act === 'call' ? ('미리 콜 ' + C.fmt(options.toCall)) : '미리 체크';
      setTimeout(function () {
        if (!self.runner && !(self.mode && self.mode.indexOf('mp') === 0)) return;
        self.toast(label + ' 자동 실행');
        self.heroAction(act);
      }, 240);
      return true;
    },

    refreshView() {
      if (this.engine) {
        this.onSnapshot({});
      } else if (this.mp && this.mode === 'mp-host') {
        this.mp.push({});
      }
    },

    gmGrant(n) {
      if (this.engine && this.mode === 'single') {
        this.engine.seats[0].stack += n;
        Pr.setBankroll(this.baseWallet + this.heroStack());
        this.onSnapshot({});
      } else if (this.engine && this.mode === 'tournament') {
        this.engine.seats[0].stack += n;
        this.onSnapshot({});
      } else {
        Pr.addChips(n);
        this.renderLobby();
      }
      this.toast('+' + full(n) + ' 칩 지급');
      Sound.chip(0, 6);
      $('#gm-chip-amount').value = '';
    },

    gmForce(kind) {
      if (!this.runner) { this.toast('게임 중에만 가능해'); return; }
      const e = this.engine;
      let n = 0;
      for (let i = 1; i < e.seats.length; i++) {
        if (e.seats[i].inHand && !e.seats[i].folded && !e.seats[i].allIn) {
          this.runner.gmForce = this.runner.gmForce || {};
          this.runner.gmForce[i] = kind;
          n++;
        }
      }
      this.toast(kind === 'fold' ? 'AI ' + n + '명 강제 폴드 예약' : 'AI ' + n + '명 블러프 예약');
      Sound.tap();
    },

    toggleAuto() {
      this.auto = !this.auto;
      this.renderGm();
      Pr.data.auto = this.auto; Pr.save();
      Sound.tap();
      this.toast(this.auto ? 'AUTO ON · ' + (global.PokerAI.GRADE_KO[this.autoGrade] || '') + ' AI가 대신 플레이' : 'AUTO OFF · 수동 조작');
      if (this.auto && this.runner && this.runner.pending) this.autoAct();
    },

    autoAct() {
      const self = this;
      const snap = this.snap;
      if (!snap || !this.options) return;
      let dec;
      try {
        if (this.engine && this.runner) {
          const ctx = this.runner.aiContext(0);
          ctx.grade = this.autoGrade;
          ctx.speed = 'fast';
          dec = global.PokerAI.decide(ctx);
        } else {
          const you = snap.you;
          const s = snap.seats[you];
          const o = this.options;
          const blinds = ($('#g-blinds').textContent || '10 / 20').split('/');
          const bb = parseInt(blinds[1], 10) || 20;
          const ctx = {
            grade: this.autoGrade, hole: s.hole, board: snap.board, street: snap.street,
            pot: o.pot, toCall: o.toCall, currentBet: o.currentBet, thisBet: o.thisBet,
            minTo: o.minTo, maxTo: o.maxTo, stack: s.stack, bb: bb, sb: Math.round(bb / 2),
            canCheck: o.canCheck, canCall: o.canCall, canRaise: o.canRaise,
            liveOpponents: Math.max(1, snap.seats.filter(function (x) { return x.inHand && !x.folded && x.idx !== you; }).length),
            position: 'MP', isPreflop: snap.street === 'preflop', raiseCount: 0,
            heroStats: null, speed: 'fast', rng: Math.random,
            spr: s.stack / Math.max(1, o.pot), seatCount: snap.seats.length, numActive: 0
          };
          dec = global.PokerAI.decide(ctx);
        }
      } catch (err) {
        dec = { action: this.options.canCheck ? 'check' : 'fold', amount: 0 };
      }
      const delay = Pr.data.speed === 'fast' ? 380 : 800;
      setTimeout(function () {
        if (!self.auto || !self.runner && self.mode !== 'mp-client') return;
        if (self.mode === 'mp-client' && !self.mp) return;
        if (self.runner && !self.runner.pending) return;
        const label = dec.action === 'raise' ? ('레이즈 ' + C.fmt(dec.amount)) :
          dec.action === 'call' ? '콜' : dec.action === 'check' ? '체크' : dec.action === 'allin' ? '올인' : '폴드';
        self.toast('AUTO · ' + label);
        self.heroAction(dec.action, dec.amount);
      }, delay);
    },

    /* ------------------------------------------------------------- 공통 UI */
    toast(msg) {
      const layer = $('#toast-layer');
      if (!layer) return;
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = msg;
      layer.appendChild(el);
      setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2200);
      setTimeout(function () { el.remove(); }, 2600);
    },
    toggleSound() {
      Pr.data.sound = !Pr.data.sound; Pr.save();
      Sound.setEnabled(Pr.data.sound);
      this.applySoundUI();
      if (Pr.data.sound) Sound.tap();
    },
    applySoundUI() {
      $('#btn-sound').textContent = Pr.data.sound ? '🔊' : '🔇';
      $('#menu-sound b').textContent = Pr.data.sound ? '켜짐' : '꺼짐';
    },
    toggleHaptic() {
      Pr.data.haptics = Pr.data.haptics === false;
      Pr.save();
      Haptic.setEnabled(Pr.data.haptics);
      this.applyHapticUI();
      if (Pr.data.haptics) Haptic.fire(30);
      Sound.tap();
    },
    applyHapticUI() {
      const b = $('#menu-haptic b');
      if (b) b.textContent = Pr.data.haptics === false ? '꺼짐' : '켜짐';
    },
    /* 턴 제한시간 (기본 30초) 프로그레스 바 */
    startTurnTimer(seconds) {
      this.stopTurnTimer();
      const total = (seconds || 30) * 1000;
      const wrap = $('#turn-timer'), fill = $('#tt-fill'), num = $('#tt-num');
      if (!wrap) return;
      this.turnDeadline = (global.performance ? performance.now() : Date.now()) + total;
      wrap.classList.add('on');
      wrap.classList.remove('warn');
      const self = this;
      const tick = function () {
        const now = global.performance ? performance.now() : Date.now();
        const left = Math.max(0, self.turnDeadline - now);
        if (fill) fill.style.width = (left / total * 100).toFixed(1) + '%';
        if (num) num.textContent = Math.ceil(left / 1000) + 's';
        wrap.classList.toggle('warn', left <= 5000);
        if (left <= 0) self.stopTurnTimer();
      };
      tick();
      this.turnTimerId = setInterval(tick, 100);
    },
    stopTurnTimer() {
      if (this.turnTimerId) { clearInterval(this.turnTimerId); this.turnTimerId = null; }
      const wrap = $('#turn-timer');
      if (wrap) { wrap.classList.remove('on'); wrap.classList.remove('warn'); }
    },
    turnTimerId: null,
    turnDeadline: 0,
    toggleSpeed() {
      Pr.data.speed = Pr.data.speed === 'fast' ? 'normal' : 'fast'; Pr.save();
      if (this.runner) this.runner.speed = Pr.data.speed;
      this.applySpeedUI();
      Sound.tap();
    },
    applySpeedUI() {
      const fast = Pr.data.speed === 'fast';
      $('#btn-speed').textContent = fast ? '2×' : '1×';
      $('#menu-speed b').textContent = fast ? '빠름' : '보통';
    },
    buildRankTable() {
      const body = $('#rank-table-body');
      if (!body) return;
      body.innerHTML = global.TUT_RANK_ROWS.map(function (r) {
        return '<div class="rank-row"><span class="rk" style="color:' + r[2] + '">' + r[0] + '</span><span class="rd">' + r[1] + '</span></div>';
      }).join('');
    },

    /* --------------------------------------------------------- 싱글 게임 */
    makePlayers(room, size, buyIn) {
      const players = [{
        name: Pr.data.name || '주호', grade: 'human', isHero: true, stack: buyIn,
        title: Pr.equippedTitle() ? Pr.equippedTitle().name : null, avatar: '🎯'
      }];
      // 상대 AI 수준: 방 기본 / 특정 등급 / 혼합
      const lvl = Pr.data.aiLevel || 'room';
      let grades;
      if (lvl === 'mix') grades = ['newbie', 'beginner', 'expert', 'pro', 'beginner', 'expert', 'newbie', 'pro'];
      else if (lvl !== 'room') grades = [lvl, lvl, lvl, lvl, lvl, lvl, lvl, lvl];
      else grades = room.grades || [];
      for (let i = 1; i < size; i++) {
        players.push({
          name: AI_NAMES[(i - 1) % AI_NAMES.length],
          grade: grades[(i - 1) % grades.length] || 'beginner',
          stack: buyIn, avatar: AI_AV[(i - 1) % AI_AV.length]
        });
      }
      return players;
    },

    async startSingle(roomId, size) {
      const room = Pr.room(roomId);
      let sb = room.sb, bb = room.bb;
      const bp = Pr.data.blindPreset || 'room';
      if (bp && bp !== 'room') { const pp = bp.split('/'); sb = +pp[0]; bb = +pp[1]; }
      const buyIn = bb * 100;
      const charge = this.gmUnlocked ? 0 : buyIn;
      if (Pr.data.bankroll < charge) {
        this.toast('바이인 ' + C.fmt(buyIn) + ' 필요 · 뱅크롤이 부족해');
        Sound.fold();
        return;
      }
      Sound.resume();
      this.mode = 'single';
      this.lastRoomId = roomId;
      this.room = { id: room.id, name: room.name + (bp !== 'room' ? ' · ' + sb + '/' + bb : ''), sb: sb, bb: bb };
      this.size = size; this.buyIn = buyIn;
      this.baseWallet = Pr.data.bankroll - charge;
      Pr.setBankroll(this.baseWallet);
      this.heroStats = { hands: 0, vpip: 0, pfr: 0, foldToBet: 0, foldOpps: 0 };
      this.tournament = null;

      const players = this.makePlayers(room, size, buyIn);
      this.engine = new P.Holdem({ seatCount: size, smallBlind: sb, bigBlind: bb, players: players });
      if (this._rig) { this.engine.riggedDeck = this._rig; this.engine.dealer = size - 1; this._rig = null; }
      this.setupRunner();
      this.enterGameScreen(this.room, size);
      this.running = true;
      this.loop();
    },

    setupRunner(humanList) {
      const self = this;
      this.runner = new global.GameRunner({
        engine: this.engine,
        humanSeats: humanList !== undefined ? humanList : [0],
        speed: Pr.data.speed,
        turnSeconds: 30,
        heroStats: function () { return self.aiHeroStats(); },
        onSnapshot: function (meta) { self.onSnapshot(meta); },
        onHumanTurn: function (seat, options) { self.onHumanTurn(options); },
        onHandDone: function (res) { self.lastHandResult = res; },
        onLog: function (seat, action) { }
      });
    },

    /* ------------------------------------------------------- 헤즈업 1:1 */
    openHeadsUp() {
      this.renderHeadsUp();
      $('#modal-headsup').classList.add('on');
      Sound.tap();
    },

    renderHeadsUp() {
      const bb = +(this.huBlinds.split('/')[1] || 50);
      const el = $('#hu-buyin');
      if (el) el.textContent = '바이인 ' + C.fmt(bb * 100) + '칩 · 2인 테이블 · 버튼=SB';
    },

    async startHeadsUpWith(grade, sb, bb) {
      const buyIn = bb * 100;
      const charge = this.gmUnlocked ? 0 : buyIn;
      if (Pr.data.bankroll < charge) {
        this.toast('바이인 ' + C.fmt(buyIn) + ' 필요 · 뱅크롤이 부족해');
        Sound.fold();
        return;
      }
      Sound.resume();
      this.mode = 'headsup';
      this.lastRoomId = null;
      this.room = { id: 'headsup', name: '헤즈업 1:1 · ' + (global.PokerAI.GRADE_KO[grade] || grade), sb: sb, bb: bb };
      this.size = 2; this.buyIn = buyIn;
      this.baseWallet = Pr.data.bankroll - charge;
      Pr.setBankroll(this.baseWallet);
      this.heroStats = { hands: 0, vpip: 0, pfr: 0, foldToBet: 0, foldOpps: 0 };
      this.tournament = null;
      const title = Pr.equippedTitle();
      const players = [
        { name: Pr.data.name || '주호', grade: 'human', isHero: true, stack: buyIn, title: title ? title.name : null, avatar: '🎯' },
        { name: AI_NAMES[0] + ' · 1:1', grade: grade, stack: buyIn, avatar: '🦈' }
      ];
      this.engine = new P.Holdem({ seatCount: 2, smallBlind: sb, bigBlind: bb, players: players });
      if (this._rig) { this.engine.riggedDeck = this._rig; this.engine.dealer = 1; this._rig = null; }
      this.setupRunner();
      this.enterGameScreen(this.room, 2);
      this.running = true;
      this.toast('헤즈업 시작 · 버튼=SB / 프리플랍 SB 선액션');
      this.loop();
    },

    startFriendHeadsUp() {
      $('#modal-headsup').classList.remove('on');
      $$('#lobby-tabs .tab').forEach(function (x) { x.classList.remove('active'); });
      const tab = $('.tab[data-tab="multi"]');
      if (tab) tab.classList.add('active');
      $$('.pane').forEach(function (p) { p.classList.remove('active'); });
      $('#pane-multi').classList.add('active');
      $$('#mp-size button').forEach(function (b) { b.classList.toggle('on', b.dataset.size === '2'); });
      this.toast('친구 1:1 — 방을 만들고 코드를 공유해');
    },

    /* --------------------------------------------------------- 랭크겜(LP) */
    openRanked() {
      this.renderRanked();
      $('#modal-ranked').classList.add('on');
      Sound.tap();
    },

    renderRanked() {
      const r = Pr.rank(), nxt = Pr.nextRank();
      const hero = $('#rank-hero');
      if (hero) {
        hero.innerHTML =
          '<div class="rank-badge" style="background:' + r.color + '">' + r.icon + '</div>' +
          '<div><b>' + r.name + '</b><span>시즌 ' + Pr.data.lp + 'LP · ' + Pr.data.rankedWins + '승 ' + Pr.data.rankedLosses + '패</span></div>' +
          '<div class="rank-lp">' + Pr.data.lp + '<span style="font-size:9px;color:#8fb0cc"> LP</span></div>';
      }
      const fill = $('#rank-bar-fill');
      if (fill) fill.style.width = Math.round(Pr.rankProgress() * 100) + '%';
      const nx = $('#rank-next');
      if (nx) nx.textContent = nxt ? (nxt.name + '까지 ' + Math.max(0, nxt.min - Pr.data.lp) + ' LP') : '최고 티어 달성 — 그랜드마스터!';

      const board = $('#rankboard-list');
      if (!board) return;
      const Auth = global.HoldemAuth;
      const rows = Auth.summary().slice().sort(function (a, b) { return b.lp - a.lp; });
      const me = Auth.current();
      board.innerHTML = rows.length ? rows.map(function (a, i) {
        const tier = (global.RANKS || []).reduce(function (m, x) { return a.lp >= x.min ? x : m; }, global.RANKS[0]);
        return '<div class="rank-row2' + (me && me.id === a.id ? ' me' : '') + '">' +
          '<span class="rb-no">' + (i + 1) + '</span>' +
          '<span class="rb-nick">' + a.nick + '</span>' +
          '<span class="rb-tier" style="color:' + tier.color + ';background:' + tier.color + '22">' + tier.name + '</span>' +
          '<span class="rb-lp">' + a.lp + ' LP</span>' +
        '</div>';
      }).join('') : '<div class="receipt-empty">아직 랭커가 없어 — 첫 시즌을 열어보자</div>';
    },

    renderRankChip() {
      const el = $('#g-rank');
      if (!el) return;
      if (this.mode === 'ranked') {
        const r = Pr.rank();
        el.classList.add('on');
        el.textContent = r.icon + ' ' + r.name + ' ' + Pr.data.lp + 'LP';
        el.style.color = r.color;
        el.style.borderColor = r.color;
        el.style.boxShadow = '0 0 12px ' + r.color + '55';
      } else {
        el.classList.remove('on');
        el.textContent = '';
      }
    },

    /* 랭크 티어별 상대 실력 분포 — 사람이 비지 않게 항상 5명 배치 */
    rankGrades() {
      const table = [
        ['newbie', 'newbie', 'beginner', 'newbie', 'beginner'],     // 브론즈
        ['beginner', 'beginner', 'expert', 'beginner', 'expert'],   // 실버
        ['expert', 'expert', 'beginner', 'expert', 'pro'],          // 골드
        ['expert', 'pro', 'expert', 'pro', 'expert'],               // 플래티넘
        ['pro', 'pro', 'expert', 'pro', 'pro'],                     // 다이아
        ['pro', 'pro', 'pro', 'expert', 'pro'],                     // 마스터
        ['pro', 'pro', 'pro', 'pro', 'pro']                         // 그랜드마스터
      ];
      return table[Math.min(table.length - 1, Pr.rankIndex())] || table[0];
    },

    async startRanked() {
      const buyIn = 10000;
      const charge = this.gmUnlocked ? 0 : buyIn;
      if (Pr.data.bankroll < charge) {
        this.toast('랭크겜 바이인 ' + C.fmt(buyIn) + ' 필요');
        Sound.fold();
        return;
      }
      Sound.resume();
      this.mode = 'ranked';
      this.lastRoomId = 'newbie';
      this.room = { id: 'ranked', name: '랭크겜 · ' + Pr.rank().name, sb: 50, bb: 100 };
      this.size = 6; this.buyIn = buyIn;
      this.baseWallet = Pr.data.bankroll - charge;
      Pr.setBankroll(this.baseWallet);
      this.heroStats = { hands: 0, vpip: 0, pfr: 0, foldToBet: 0, foldOpps: 0 };
      this.tournament = null;
      const grades = this.rankGrades();
      const players = this.makePlayers({ grades: grades }, 6, buyIn);
      this.engine = new P.Holdem({ seatCount: 6, smallBlind: 50, bigBlind: 100, players: players });
      if (this._rig) { this.engine.riggedDeck = this._rig; this.engine.dealer = 5; this._rig = null; }
      this.setupRunner();
      this.enterGameScreen(this.room, 6);
      this.running = true;
      this.toast('랭크겜 시작 · 승리 시 +LP, 패배 시 -LP');
      this.loop();
    },

    async startSpectate() {
      Sound.resume();
      this.mode = 'spectate';
      this.room = { id: 'spectate', name: '프로·고수 관전실', sb: 100, bb: 200 };
      this.size = 6; this.buyIn = 20000;
      this.baseWallet = Pr.data.bankroll;
      this.tournament = null;
      const pros = [
        { name: '아이비(프로)', grade: 'pro', avatar: '🦅', stack: 20000 },
        { name: '네그라누(프로)', grade: 'pro', avatar: '🦁', stack: 20000 },
        { name: '드완(프로)', grade: 'pro', avatar: '🐺', stack: 20000 },
        { name: '블러프킹(고수)', grade: 'expert', avatar: '🦊', stack: 20000 },
        { name: '올인퀸(고수)', grade: 'expert', avatar: '🐯', stack: 20000 },
        { name: '샤크(프로)', grade: 'pro', avatar: '🦈', stack: 20000 }
      ];
      this.engine = new P.Holdem({ seatCount: 6, smallBlind: 100, bigBlind: 200, players: pros });
      this.setupRunner([]);
      this.enterGameScreen(this.room, 6);
      this.running = true;
      this.toast('프로·고수 AI 6인 관전 시작! (우상단 1×/빠름 조절)');
      this.loop();
    },

    aiHeroStats() {
      const s = this.heroStats;
      return { hands: s.hands, vpip: s.vpip, pfr: s.pfr, foldToBet: s.foldToBet, foldOpps: s.foldOpps };
    },

    enterGameScreen(room, size) {
      $('#screen-lobby').classList.remove('active');
      $('#screen-game').classList.add('active');
      $('#g-room').textContent = room.name + (this.mode === 'tournament' ? ' Lv.' + (this.tournament.level + 1) : '');
      $('#g-blinds').textContent = this.engine.sb + ' / ' + this.engine.bb;
      this.renderRankChip();
      this.boostDouble = false;
      this.blindAllInPending = false;
      this.riskActive = false;
      this.refreshBoostUI();
      View.handFxDone = 0;
      View.prev = null;
      View._sig = undefined;
      global.FX.clear();
      // 방에 입장할 때마다 여성 딜러 10종 중 랜덤 1명
      if (global.Dealers) {
        View.setDealer(global.Dealers.random(View.dealer ? View.dealer.id : null));
      }
      this.stopTurnTimer();
    },

    onSnapshot(meta) {
      if (!this.engine) return;
      const snap = global.Snap.build(this.engine, 0, meta, this.gmPeek, this.gmBoard);
      this.snap = snap;
      if (meta && meta.phase === 'deal' && this.preAction) { this.preAction = null; this.renderPreRow(); }
      if (snap.result) this.lastResult = snap.result;
      View.render(snap);
      if (meta && meta.action) View.fxAction(snap, meta);
      if (meta && meta.action === 'allin' && meta.actionSeat === 0) Pr.addPassXP(15);
      this.updateHud();
      this.updateActionBar(snap);
      $('#g-blinds').textContent = this.engine.sb + ' / ' + this.engine.bb;
      if (this.mode === 'tournament') {
        $('#g-room').textContent = this.room.name + ' Lv.' + (this.tournament.level + 1);
      }
    },

    onHumanTurn(options) {
      this.options = options;
      const snap = this.snap;
      const canBlind = !!(snap && snap.street === 'preflop' && Pr.boosterCount('blind') > 0 && !View.heroRevealed);
      if (snap && !View.heroRevealed && !canBlind) setTimeout(function () { View.revealHeroCards(true); }, 120);
      if (!this.auto) Haptic.fire(35);
      if (this.auto) {
        this.updateActionBar(this.snap);
        this.autoAct();
        return;
      }
      this.updateActionBar(this.snap);
      this.startTurnTimer(this.runner ? this.runner.turnSeconds : 30);
      this.runPreAction(options);
    },

    updateActionBar(snap) {
      const bar = $('#action-bar');
      if (!snap) return;
      const isTurn = snap.acting === snap.you && snap.options;
      const you = snap.seats[snap.you];
      bar.classList.toggle('waiting', !isTurn);
      const preRow = $('#pre-row');
      if (preRow) {
        const canPre = !isTurn && !snap.result && snap.acting != null && you && you.inHand && !you.folded && !you.allIn &&
          (this.mode === 'single' || this.mode === 'tournament' || this.mode === 'mp-host' || this.mode === 'mp-client');
        preRow.classList.toggle('on', !!canPre);
      }
      if (!isTurn) {
        this.stopTurnTimer();
        const act = snap.acting != null ? snap.seats[snap.acting] : null;
        let txt = '딜링 중…';
        if (snap.result) txt = '핸드 종료';
        else if (this.auto && snap.acting === snap.you) txt = 'AUTO 플레이 중…';
        else if (act) txt = act.name + ' 차례';
        else if (you && you.folded) txt = '폴드 — 다음 핸드 대기';
        $('#wait-text').textContent = txt;
        if (!this.auto) this.options = null;
        return;
      }
      if (this.auto) {
        $('#wait-text').textContent = 'AUTO 플레이 중…';
      }
      this.options = snap.options;
      if (!this.turnTimerId) this.startTurnTimer(this.runner ? this.runner.turnSeconds : 30);
      const o = snap.options;
      const call = $('#btn-call');
      call.textContent = o.toCall > 0 ? 'CALL ' + C.fmt(o.toCall) : 'CALL';
      call.dataset.mode = o.toCall > 0 ? 'call' : 'check';
      const dis = !!you.allIn;
      $('#btn-fold').disabled = dis;
      call.disabled = dis;
      const chk = $('#btn-check');
      if (chk) chk.disabled = dis || o.toCall > 0;
      const raiseBtn = $('#btn-raise');
      raiseBtn.disabled = !o.canRaise;
      const slider = $('#raise-slider');
      slider.min = o.minTo;
      slider.max = Math.max(o.minTo, o.maxTo);
      if (+slider.value < o.minTo || +slider.value > o.maxTo) slider.value = o.minTo;
      slider.style.setProperty('--fill', ((slider.value - slider.min) / Math.max(1, slider.max - slider.min) * 100) + '%');
      $('#raise-val').textContent = C.fmt(slider.value);
      this.renderQuickBar();
      this.updateRaiseLabel();
      const disabled = !o.canRaise;
      $$('#action-bar .quick button').forEach(function (b) { b.disabled = disabled; });
      this.refreshBoostUI();
      this.updateHud();
    },

    updateRaiseLabel() {
      const o = this.options;
      if (!o) return;
      const v = +$('#raise-slider').value;
      const btn = $('#btn-raise');
      if (!o.canRaise) { btn.textContent = 'RAISE —'; return; }
      const isBet = o.currentBet === 0;
      btn.textContent = (isBet ? 'BET ' : 'RAISE ') + C.fmt(v);
    },

    quickSize(kind) {
      const o = this.options;
      if (!o) return;
      const slider = $('#raise-slider');
      const pot = o.pot;
      const base = o.thisBet + o.toCall;
      let v = o.minTo;
      if (kind === 'min') v = o.minTo;
      else if (kind === 'third') v = base + Math.round(pot / 3);
      else if (kind === 'half') v = base + Math.round(pot * 0.5);
      else if (kind === 'three4') v = base + Math.round(pot * 0.75);
      else if (kind === 'pot') v = base + pot;
      else if (kind === 'double') v = base + pot * 2;
      else if (kind === 'max') v = o.maxTo;
      v = Math.max(o.minTo, Math.min(o.maxTo, v));
      slider.value = v;
      slider.style.setProperty('--fill', ((v - slider.min) / Math.max(1, slider.max - slider.min) * 100) + '%');
      $('#raise-val').textContent = C.fmt(v);
      this.updateRaiseLabel();
    },

    heroAction(action, amountOverride) {
      if (!this.runner || !this.runner.pending) {
        // 친구방: 러너는 세션이 들고 있다 (호스트는 로컬 제출, 참가자는 전송)
        if (this.mp && this.mode && this.mode.indexOf('mp') === 0) {
          let amount = amountOverride || 0;
          if (action === 'raise' && !amount) amount = +$('#raise-slider').value;
          this.mp.sendAction(action, amount);
          if (!this.auto) this.options = null;
          return;
        }
        return;
      }
      let amount = 0;
      if (action === 'raise') amount = amountOverride || +$('#raise-slider').value;
      if (this.mode === 'mp-client') {
        this.mp.sendAction(action, amount);
        this.updateActionBar(null);
        return;
      }
      // 히어로 통계
      const o = this.options || {};
      if (this.handStats) {
        if (action === 'call' || action === 'raise') {
          if (this.engine.street === 'preflop') this.handStats.vpip = true;
          if (action === 'raise' && this.engine.street === 'preflop') this.handStats.pfr = true;
        }
        if (o.toCall > 0) {
          this.handStats.foldOpps++;
          if (action === 'fold') this.handStats.foldToBet++;
        }
      }
      Sound.tap();
      if (action === 'raise' || action === 'bet' || action === 'allin') Haptic.fire([25, 30, 45]);
      else Haptic.fire(8);
      const ok = this.runner.submitAction(0, action, amount);
      if (ok) {
        this.stopTurnTimer();
        this.options = null;
        $('#action-bar').classList.add('waiting');
        $('#wait-text').textContent = '진행 중…';
      }
    },
    async loop() {
      let guard = 0;
      while (this.running && guard++ < 500) {
        this.handStats = { vpip: false, pfr: false, foldToBet: 0, foldOpps: 0 };
        const res = await this.runner.runHand();
        if (!this.running) break;
        if (res === null || res === undefined) break;
        this.afterHand(res);
        if (!this.running) break;
        await sleep(this.runner.ms(1500, 700));
        if (!Pr.data.speed) {}
        if (this.mode === 'single' && this.heroStack() < this.engine.bb) break;
        if ((this.mode === 'headsup' || this.mode === 'ranked') && this.heroStack() < this.engine.bb) break;
      }
    },

    /* 테스트/데모용: 다음 핸드 덱 고정 (딜 순서대로) */
    rig(cards) { this._rig = cards; },

    heroStack() {
      return this.engine ? this.engine.seats[0].stack : 0;
    },

    afterHand(res) {
      this.preAction = null;
      this.renderPreRow();
      /* 부스터 정산 — 2X WIN / BLIND ALL-IN 보너스 */
      const winAmt = (res && res.results)
        ? res.results.filter(function (r) { return r.seat === 0; }).reduce(function (s, r) { return s + (r.amount || 0); }, 0)
        : 0;
      let bonus = 0;
      if (this.boostDouble && winAmt > 0) {
        bonus += winAmt;
        global.FX.banner('2X WIN!', '+' + C.fmt(winAmt), { cls: 'win', duration: 1900 });
        Sound.trophy();
      }
      if (this.blindAllInPending) {
        if (winAmt > 0) {
          const extra = Math.round(winAmt * 0.5);
          bonus += extra;
          global.FX.banner('BLIND ALL-IN!', '+' + C.fmt(extra) + ' 보너스', { cls: 'win', duration: 2000 });
        }
        this.blindAllInPending = false;
      }
      if (this.riskActive) {
        if (winAmt > 0) {
          bonus += winAmt;
          global.FX.banner('2X RISK WIN!', '+' + C.fmt(winAmt), { cls: 'win', duration: 2000 });
        } else if (this.engine) {
          const committed = Math.max(0, this.engine.seats[0].committed || 0);
          if (committed > 0) {
            this.engine.seats[0].stack = Math.max(0, this.engine.seats[0].stack - committed);
            global.FX.banner('2X RISK LOSS', '-' + C.fmt(committed), { cls: 'split', duration: 2000 });
          }
        }
        this.riskActive = false;
      }
      if (bonus > 0 && this.engine) this.engine.seats[0].stack += bonus;
      this.boostDouble = false;
      this.refreshBoostUI();
      const stack = this.heroStack();
      if (this.mode === 'single' || this.mode === 'headsup' || this.mode === 'ranked') {
        Pr.setBankroll(this.baseWallet + stack);
        // AI 리바이
        for (let i = 1; i < this.engine.seats.length; i++) {
          const s = this.engine.seats[i];
          if (s.stack < this.engine.bb && s.inHand === false) { s.stack = this.buyIn; }
        }
        const won = res && res.results && res.results.some(function (r) { return r.seat === 0 && r.amount > 0; });
        const showdown = res && res.type === 'showdown';
        let bestCat = -1, bestName = '';
        if (this.engine.seats[0].hand) { bestCat = this.engine.seats[0].hand.cat; bestName = this.engine.seats[0].hand.name; }
        Pr.recordHand({ won: won, showdown: showdown, bestCat: bestCat, bestName: bestName });
        this.heroStats.hands++;
        if (this.handStats.vpip) this.heroStats.vpip++;
        if (this.handStats.pfr) this.heroStats.pfr++;
        this.heroStats.foldToBet += this.handStats.foldToBet;
        this.heroStats.foldOpps += this.handStats.foldOpps;

        if (this.mode === 'ranked') {
          const delta = won ? (showdown ? 22 : 16) : (showdown ? -12 : -8);
          const rr = Pr.addLP(delta);
          this.renderRankChip();
          this.toast((delta > 0 ? '+' : '') + delta + ' LP · ' + rr.after.name + ' ' + rr.lp + 'LP');
          if (delta > 0 && rr.before !== rr.after) {
            Pr.addVip(50);
            global.FX.banner('RANK UP!', rr.after.name, { cls: 'win', duration: 2400 });
            global.FX.confettiBurst(innerWidth / 2, innerHeight * 0.3, 70);
            Sound.trophy();
            Haptic.fire([40, 40, 90, 40, 120]);
          }
        }
        if (this.mode === 'headsup') {
          if (won) { Pr.data.headsUpWins = (Pr.data.headsUpWins || 0) + 1; Pr.addVip(10); }
        }
        this.renderLobby();
        if (stack < this.engine.bb) {
          this.running = false;
          this.showBust();
        }
      } else if (this.mode === 'tournament') {
        this.tournament.hands++;
        const alive = this.engine.seats.filter(function (s) { return s.stack > 0; });
        if (this.engine.seats[0].stack <= 0) {
          this.running = false;
          this.tournamentEliminated();
          return;
        }
        if (alive.length === 1 && alive[0].idx === 0) {
          this.running = false;
          this.tournamentWin();
          return;
        }
        if (this.tournament.hands % 6 === 0) {
          this.tournament.level++;
          const sb = Math.round(this.tournament.baseSb * Math.pow(1.5, this.tournament.level) / 5) * 5;
          this.engine.sb = sb; this.engine.bb = sb * 2;
          this.toast('블라인드 업 · ' + sb + ' / ' + sb * 2);
          if (global.FX) {
            global.FX.banner('BLIND UP!', sb + ' / ' + sb * 2, { cls: 'win', duration: 1500 });
            global.FX.streetBanner('BLIND UP', 2);
          }
          $('#g-blinds').textContent = sb + ' / ' + sb * 2;
          $('#g-room').textContent = this.room.name + ' Lv.' + (this.tournament.level + 1);
          Sound.check(0);
        }
      }
    },

    showBust(isTournament) {
      $('#bust-title').textContent = isTournament ? '토너먼트 탈락' : '칩이 다 떨어졌어';
      $('#bust-desc').textContent = isTournament
        ? '아쉽다! 다음 토너먼트에서 다시 도전해보자.'
        : '뱅크롤이 바닥났어. 리필해서 다시 앉을까?';
      $('#bust-refill').style.display = isTournament ? 'none' : '';
      $('#modal-bust').classList.add('on');
      Sound.lose();
    },

    reenterRoom() {
      this.leaveGame(true);
      if (this.lastRoomId) this.startSingle(this.lastRoomId, this.size);
    },

    confirmLeave() {
      if (!this.running) { this.leaveGame(); return; }
      $('#modal-menu').classList.add('on');
    },

    leaveGame(silent) {
      this.running = false;
      this.stopTurnTimer();
      this.auto = false;
      this.gmPeek = false;
      if (this.runner) this.runner.stop();
      if (this.mode && this.mode.indexOf('mp') === 0 && this.mp) { this.mp.close(); this.mp = null; }
      if (this.mode === 'single' || this.mode === 'tournament' || this.mode === 'headsup' || this.mode === 'ranked') {
        // 남은 스택 정산
        if (this.engine && this.mode !== 'tournament') Pr.setBankroll(this.baseWallet + this.heroStack());
      }
      this.engine = null; this.runner = null; this.snap = null; this.options = null;
      this.mode = null;
      this.renderRankChip();
      global.FX.clear();
      $('#screen-game').classList.remove('active');
      $('#screen-lobby').classList.add('active');
      this.renderLobby();
      Sound.tap();
    },

    /* --------------------------------------------------------- 토너먼트 */
    startTournament() {
      const buyIn = 5000;
      if (Pr.data.bankroll < buyIn) { this.toast('참가비 ' + C.fmt(buyIn) + ' 부족'); return; }
      Sound.resume();
      this.mode = 'tournament';
      this.room = { name: '토너먼트', sb: 25, bb: 50 };
      this.size = 6; this.buyIn = 5000;
      this.baseWallet = Pr.data.bankroll - buyIn;
      Pr.setBankroll(this.baseWallet);
      this.tournament = { level: 0, hands: 0, baseSb: 25, prize: buyIn * 6 };
      this.heroStats = { hands: 0, vpip: 0, pfr: 0, foldToBet: 0, foldOpps: 0 };
      const players = this.makePlayers({ grades: ['beginner', 'expert', 'pro', 'beginner', 'expert'] }, 6, 5000);
      this.engine = new P.Holdem({ seatCount: 6, smallBlind: 25, bigBlind: 50, players: players });
      this.setupRunner();
      this.enterGameScreen(this.room, 6);
      this.running = true;
      this.toast('토너먼트 시작 · 6인 · 6핸드마다 블라인드 업');
      this.loop();
    },

    tournamentWin() {
      const prize = Math.round(this.tournament.prize * 0.6);
      Pr.addChips(prize);
      Pr.addVip(100);
      Pr.recordTournamentWin();
      Pr.data.tournamentBest = Math.max(Pr.data.tournamentBest || 0, 3);
      Pr.save();
      const before = Pr.data.tournamentsWon;
      Sound.trophy();
      global.FX.coinShower(innerWidth / 2, innerHeight * 0.4, innerWidth * 0.8, 60);
      global.FX.confettiBurst(innerWidth / 2, innerHeight * 0.35, 90);
      $('#victory-title').textContent = '토너먼트 우승! 🏆';
      let extra = '<br><b style="color:#7ef7ff">VIP +100P</b>';
      if (before === 1) extra += '<br><b style="color:#ffd98a">칭호 「WSOP 루키」 해금!</b>';
      if (before === 3) extra += '<br><b style="color:#ffd98a">칭호 「홀덤 황제」 해금!</b>';
      $('#victory-desc').innerHTML = '1위 · 상금 <b style="color:#ffd98a">' + C.fmt(prize) + '</b> 획득!' + extra;
      $('#modal-victory').classList.add('on');
      this.renderLobby();
    },

    /* 토너먼트 탈락 — 1~3등 상금 + VIP 포인트 */
    tournamentEliminated() {
      const othersAlive = this.engine.seats.filter(function (s) { return s.idx !== 0 && s.stack > 0; }).length;
      const place = Math.max(2, Math.min(6, othersAlive + 1));
      const pool = this.tournament ? this.tournament.prize : 0;
      const table = [0, Math.round(pool * 0.6), Math.round(pool * 0.25), Math.round(pool * 0.15)];
      const prize = place <= 3 ? table[place] : 0;
      const vip = place === 2 ? 60 : place === 3 ? 30 : 10;
      if (prize > 0) Pr.addChips(prize);
      Pr.addVip(vip);
      Pr.data.tournamentBest = Math.max(Pr.data.tournamentBest || 0, 4 - place);
      Pr.save();
      Sound.lose();
      $('#victory-title').textContent = '토너먼트 ' + place + '위';
      $('#victory-desc').innerHTML = (prize ? '상금 <b style="color:#ffd98a">' + C.fmt(prize) + '</b> 획득! · ' : '아쉽다! ') +
        '<b style="color:#7ef7ff">VIP +' + vip + 'P</b><br>다음 판에 다시 도전!';
      $('#modal-victory').classList.add('on');
      this.renderLobby();
    },

    /* --------------------------------------------------------- 튜토리얼 */
    startTutorial() {
      Sound.resume();
      const players = this.makePlayers({ grades: ['newbie', 'beginner', 'newbie', 'beginner', 'newbie'] }, 6, 2000);
      const engine = new P.Holdem({ seatCount: 6, smallBlind: 10, bigBlind: 20, players: players });
      engine.startHand();
      engine.beginNextStreet();           // 플랍까지 깔아서 화면을 풍성하게
      engine.seats[1].lastAction = 'CALL'; engine.seats[1].lastAmount = 20;
      engine.seats[2].lastAction = 'FOLD';
      this.mode = 'tutorial';
      this.engine = engine;
      this.runner = null;
      this.buyIn = 2000; this.baseWallet = Pr.data.bankroll;
      this.room = { name: '튜토리얼', sb: 10, bb: 20 };
      $('#screen-lobby').classList.remove('active');
      $('#screen-game').classList.add('active');
      $('#g-room').textContent = '튜토리얼';
      $('#g-blinds').textContent = '10 / 20';
      $('#action-bar').classList.add('waiting');
      $('#wait-text').textContent = '튜토리얼 진행 중';
      View.prev = null;
      View._sig = undefined;
      this.snap = global.Snap.build(engine, 0, {});
      View.render(this.snap);
      View.revealHeroCards(true);
      const self = this;
      setTimeout(function () {
        global.Tutorial.start(document.body, {
          onDone: function () {
            Pr.data.tutorialDone = true; Pr.save();
            self.engine = null;
            $('#screen-game').classList.remove('active');
            $('#screen-lobby').classList.add('active');
            self.renderLobby();
            self.toast('튜토리얼 완료! 뉴비방에서 바로 시작해보자');
            self.startSingle('newbie', self.size);
          }
        });
      }, 700);
    },

    /* ------------------------------------------------------------- 멀티 */
    mpCreate(sizeOverride) {
      const name = ($('#mp-name').value || Pr.data.name || '호스트').slice(0, 10);
      const size = sizeOverride || (+($('#mp-size .on') || {}).dataset ? +$('#mp-size .on').dataset.size : 6);
      const roomId = ($('#mp-blinds .on') || {}).dataset ? $('#mp-blinds .on').dataset.room : 'newbie';
      const room = Pr.room(roomId);
      const fill = $('#mp-fill .on') ? $('#mp-fill .on').dataset.grade : 'expert';
      const transport = $('#mp-transport .on') ? $('#mp-transport .on').dataset.t : 'peer';
      const code = String(Math.floor(1000 + Math.random() * 9000));
      this.openMPModal({
        host: true, code: code, size: size, room: room, fill: fill,
        transport: transport, name: name
      });
    },

    mpJoin() {
      const code = $('#mp-code').value.trim();
      if (code.length !== 4) { this.toast('4자리 코드를 입력해'); return; }
      const name = ($('#mp-name').value || Pr.data.name || '친구').slice(0, 10);
      const transport = $('#mp-transport .on') ? $('#mp-transport .on').dataset.t : 'peer';
      // 코드로 참가할 때 같은 연결 방식을 쓴다 (기본 P2P, 실패 시 탭)
      this.openMPModal({ host: false, code: code, transport: transport, name: name });
    },

    openMPModal(o) {
      const self = this;
      if (this.mp) { this.mp.close(); this.mp = null; }
      $('#mp-code').value = o.code;
      $('#mpl-code').textContent = o.code;
      $('#mpl-title').textContent = o.host ? '친구 초대' : '방 접속 중';
      $('#mpl-start').style.display = o.host ? '' : 'none';
      $('#mpl-fill-row').style.display = o.host ? '' : 'none';
      $('#mpl-status').textContent = '연결 중… (' + transportName(o.transport) + ')';
      $('#mpl-seats').innerHTML = '';
      $('#modal-mp').classList.add('on');

      this.mode = o.host ? 'mp-host' : 'mp-client';
      this.buyIn = o.host ? (o.room.bb * 100) : 0;
      this.size = o.size || 6;

      const session = new global.MPSession({
        role: o.host ? 'host' : 'client',
        code: o.code,
        name: o.name,
        title: Pr.equippedTitle() ? Pr.equippedTitle().name : null,
        account: global.HoldemAuth.syncPayload(),
        transport: o.transport,
        relayUrl: $('#mp-relay').value.trim(),
        size: o.size || 6,
        fillGrade: o.fill || 'expert',
        buyIn: o.host ? this.buyIn : 0,
        room: o.room || { sb: 25, bb: 50, name: '친구방' },
        speed: Pr.data.speed,
        heroStats: function () { return self.aiHeroStats(); },
        handlers: {
          onStatus: function (st, detail) {
            if (st === 'error') $('#mpl-status').textContent = '❌ ' + (detail || '연결 실패');
            else if (st === 'timeout') $('#mpl-status').textContent = '⚠️ P2P 응답 없음 — 연결 방식을 "같은 기기(탭)"으로 바꾸거나 릴레이 서버를 쓰자';
            else if (st === 'joining') $('#mpl-status').textContent = '방을 찾는 중…';
            else if (st === 'open') $('#mpl-status').textContent = '✅ 연결됨';
          },
          onLobby: function (st) { self.renderMPLobby(st, o.host); },
          onStart: function (msg) { self.mpStarted(msg); },
          onSnapshot: function (snap) { self.mpSnapshot(snap); },
          onMyTurn: function (opts) {
            self.options = opts;
            self.startTurnTimer(30);
            self.runPreAction(opts);
          },
          onGameOver: function () { self.toast('게임 종료'); },
          onSeatTakenOver: function (name) { self.toast(name + ' 연결 끊김 → AI가 이어받음'); },
          onClosed: function () { }
        }
      });
      this.mp = session;
      session.connect();

      if (o.host) {
        // 방 코드 안내
        $('#mpl-desc').textContent = '친구에게 이 4자리를 알려줘 · 빈 자리는 AI가 채워';
        session.broadcastLobby();
      } else {
        $('#mpl-desc').textContent = '호스트가 시작하면 자동으로 입장해';
      }
    },

    renderMPLobby(st, isHost) {
      $('#mpl-code').textContent = st.code || this.mp.code;
      const wrap = $('#mpl-seats');
      wrap.innerHTML = '';
      (st.seats || []).forEach(function (s) {
        const el = document.createElement('div');
        el.className = 'mpl-seat' + (s.ai ? ' empty' : '') + (s.host ? ' host' : '');
        el.innerHTML =
          '<span class="ms-num">' + (s.seat + 1) + '</span>' +
          '<span class="ms-name">' + (s.name || '') + (s.title ? ' · ' + s.title : '') + '</span>' +
          '<span class="ms-tag">' + (s.host ? '호스트' : s.ai ? '대기' : (s.connected ? '참가' : '연결 끊김')) + (s.account && s.account.tier ? ' · ' + s.account.tier : '') + '</span>';
        wrap.appendChild(el);
      });
      if (isHost) {
        const joined = (st.seats || []).filter(function (s) { return !s.ai && !s.host; }).length;
        $('#mpl-status').textContent = joined ? '✅ ' + joined + '명 참가 · 시작할 수 있어' : '친구를 기다리는 중… (혼자여도 AI와 시작 가능)';
      } else {
        $('#mpl-status').textContent = '✅ 방에 입장했어 · 호스트 시작 대기 중';
      }
    },

    mpStarted(msg) {
      $('#modal-mp').classList.remove('on');
      const session = this.mp;
      if (!session) return;
      const size = msg.size || session.size || 6;
      // 엔진은 호스트에만 있으므로 뷰는 스냅샷으로만 그린다
      this.engine = session.engine || null;
      this.size = size;
      $('#screen-lobby').classList.remove('active');
      $('#screen-game').classList.add('active');
      $('#g-room').textContent = (msg.room && msg.room.name) || '친구방';
      $('#g-blinds').textContent = (msg.room ? msg.room.sb + ' / ' + msg.room.bb : '');
      View.prev = null;
      View._sig = undefined;
      View.handFxDone = 0;
      global.FX.clear();
      if (global.Dealers) View.setDealer(global.Dealers.random(View.dealer ? View.dealer.id : null));
      this.mpSnapshot(msg.snapshot);
      if (this.mode === 'mp-host') {
        this.toast('친구방 시작 · 코드 ' + this.mp.code);
      }
    },

    mpSnapshot(snap) {
      if (!snap) return;
      this.snap = snap;
      View.render(snap);
      if (snap.meta && snap.meta.action) View.fxAction(snap, snap.meta);
      this.updateActionBar(snap);
      // 참가자 화면: 스냅샷으로 내 턴 진입을 감지해 미리 액션을 실행
      const isMyTurn = snap.acting != null && snap.acting === snap.you && !!snap.options && !snap.result;
      if (isMyTurn && !this._mpWasMyTurn && this.preAction) {
        this.runPreAction(snap.options);
      }
      this._mpWasMyTurn = isMyTurn;
    },
    mpLeave() {
      if (this.mp) { this.mp.close(); this.mp = null; }
      $('#modal-mp').classList.remove('on');
      this.leaveGame();
    }
  };

  function transportName(t) {
    return t === 'peer' ? '인터넷 P2P' : t === 'ws' ? '릴레이 서버' : t === 'bc' ? '같은 기기' : '자동(bc+P2P)';
  }
  function full(n) {
    return Math.round(n || 0).toLocaleString('ko-KR');
  }
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function feltBg(id) {
    if (id === 'crimson') return 'radial-gradient(circle at 50% 40%, #5c0040, #17001c 75%)';
    if (id === 'midnight') return 'radial-gradient(circle at 50% 40%, #1b2a80, #04060f 75%)';
    return 'radial-gradient(circle at 50% 40%, #2a1060, #06010f 75%)';
  }

  global.App = App;
  document.addEventListener('DOMContentLoaded', function () { App.init(); });
})(window);
