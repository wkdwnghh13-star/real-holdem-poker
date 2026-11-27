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

  const AI_NAMES = ['카드샤크', '럭키제이', '벳사이즈', '리버퀸', '올인맥스', '타이트준', '슬로우플레이', '포커페이스'];
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
    gmUnlocked: false,
    gmPeek: false,
    gmBoard: false,
    preAction: null,

    /* ---------------------------------------------------------------- init */
    init() {
      Pr.load();
      View.init({
        tableArea: $('#table-area'), seats: $('#seats'), board: $('#board'), pot: $('#pot'),
        heroPanel: $('#hero-panel'), heroCards: $('#hero-cards'),
        fxCanvas: $('#fx-canvas'), fxLayer: $('#fx-layer')
      }, { cardSkin: Pr.data.card, feltSkin: Pr.data.felt });
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
      this.buildRankTable();
      this.applySpeedUI();
      this.applySoundUI();
      this.applyHapticUI();
      this.renderPreRow();

      if (!Pr.data.tutorialDone) {
        setTimeout(function () { App.toast('튜토리얼로 3분만에 감 잡기 — 로비 아래 🎓 버튼'); }, 900);
      }
      // 첫 제스처에 오디오 활성화
      const wake = function () { Sound.resume(); document.removeEventListener('pointerdown', wake); };
      document.addEventListener('pointerdown', wake);
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

      // GM (기본 숨김 — 로비 브랜드 또는 게임 방 제목 5번 연속 탭으로 PIN 인증 후 표시)
      $('#btn-gm').addEventListener('click', function () { self.gmOpen(); });
      $('#btn-gm-lobby').addEventListener('click', function () { self.gmOpen(); });
      $('#gm-pin-ok').addEventListener('click', function () { self.gmTryUnlock(); });
      $('#gm-pin').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') self.gmTryUnlock();
      });
      var gmTapCount = 0, gmTapTimer = null;
      function bindSecretGm(el) {
        if (!el) return;
        el.addEventListener('click', function () {
          gmTapCount++;
          clearTimeout(gmTapTimer);
          gmTapTimer = setTimeout(function () { gmTapCount = 0; }, 1400);
          if (gmTapCount >= 5) {
            gmTapCount = 0;
            self.gmOpen();
          }
        });
      }
      bindSecretGm($('.brand'));
      bindSecretGm($('#g-room'));
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
        self.gmUnlocked = false;
        self.gmPeek = false;
        self.gmBoard = false;
        self.auto = false;
        document.body.classList.remove('gm-visible');
        $('#btn-gm').classList.remove('on');
        $('#modal-gm').classList.remove('on');
        if (self.snap) self.refreshView();
        self.toast('운영자 모드 OFF (제목 5번 탭으로 다시 켜기)');
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

      this.renderRooms();
      this.renderShop();
      this.renderTournamentCard();
      this.renderCfg();
      View.setSkins(d.card, d.felt);
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
      const locked = Pr.tierIndex() < 1;
      card.classList.toggle('locked', locked);
      $('.tour-btn', card).textContent = locked ? '실버 필요' : '참가';
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

      const tc = $('#shop-titles');
      tc.innerHTML = '';
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

    /* --------------------------------------------------------------- GM */
    gmOpen() {
      if (this.gmUnlocked) { this.renderGm(); $('#modal-gm').classList.add('on'); return; }
      $('#gm-pin').value = '';
      $('#gm-pin-err').textContent = '';
      $('#modal-gm-pin').classList.add('on');
      setTimeout(function () { const el = $('#gm-pin'); if (el) el.focus(); }, 200);
    },

    gmTryUnlock() {
      const v = ($('#gm-pin').value || '').trim();
      if (v === (Pr.data.gmPin || '7073')) {
        this.gmUnlocked = true;
        document.body.classList.add('gm-visible');
        $('#modal-gm-pin').classList.remove('on');
        $('#btn-gm').classList.add('on');
        Sound.fanfare(0);
        this.renderGm();
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
      this.updateActionBar(snap);
      $('#g-blinds').textContent = this.engine.sb + ' / ' + this.engine.bb;
      if (this.mode === 'tournament') {
        $('#g-room').textContent = this.room.name + ' Lv.' + (this.tournament.level + 1);
      }
    },

    onHumanTurn(options) {
      this.options = options;
      const snap = this.snap;
      if (snap && !View.heroRevealed) setTimeout(function () { View.revealHeroCards(true); }, 120);
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
      call.textContent = o.toCall > 0 ? '콜 ' + C.fmt(o.toCall) : '체크';
      const dis = !!you.allIn;
      $('#btn-fold').disabled = dis;
      call.disabled = dis;
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
    },

    updateRaiseLabel() {
      const o = this.options;
      if (!o) return;
      const v = +$('#raise-slider').value;
      const btn = $('#btn-raise');
      if (!o.canRaise) { btn.textContent = '레이즈 불가'; return; }
      const isBet = o.currentBet === 0;
      btn.textContent = (isBet ? '벳 ' : '레이즈 ') + C.fmt(v);
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
      const stack = this.heroStack();
      if (this.mode === 'single') {
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
          this.showBust(true);
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
      if (this.mode === 'single' || this.mode === 'tournament') {
        // 남은 스택 정산
        if (this.engine && this.mode === 'single') Pr.setBankroll(this.baseWallet + this.heroStack());
      }
      this.engine = null; this.runner = null; this.snap = null; this.options = null;
      this.mode = null;
      global.FX.clear();
      $('#screen-game').classList.remove('active');
      $('#screen-lobby').classList.add('active');
      this.renderLobby();
      Sound.tap();
    },

    /* --------------------------------------------------------- 토너먼트 */
    startTournament() {
      if (Pr.tierIndex() < 1) { this.toast('토너먼트는 실버 등급부터 참가 가능'); Sound.fold(); return; }
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
      const prize = this.tournament.prize;
      Pr.addChips(prize);
      Pr.recordTournamentWin();
      const before = Pr.data.tournamentsWon;
      Sound.trophy();
      global.FX.coinShower(innerWidth / 2, innerHeight * 0.4, innerWidth * 0.8, 60);
      global.FX.confettiBurst(innerWidth / 2, innerHeight * 0.35, 90);
      $('#victory-title').textContent = '토너먼트 우승! 🏆';
      let extra = '';
      if (before === 1) extra = '<br><b style="color:#ffd98a">칭호 「WSOP 루키」 해금!</b>';
      if (before === 3) extra = '<br><b style="color:#ffd98a">칭호 「홀덤 황제」 해금!</b>';
      $('#victory-desc').innerHTML = '상금 <b style="color:#ffd98a">' + C.fmt(prize) + '</b> 획득!' + extra;
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
    mpCreate() {
      const name = ($('#mp-name').value || Pr.data.name || '호스트').slice(0, 10);
      const size = +($('#mp-size .on') || {}).dataset ? +$('#mp-size .on').dataset.size : 6;
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
          '<span class="ms-tag">' + (s.host ? '호스트' : s.ai ? ('AI ' + (global.PokerAI.GRADE_KO[s.grade] || '')) : (s.connected ? '참가' : '연결 끊김')) + '</span>';
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
    if (id === 'crimson') return 'radial-gradient(circle at 50% 40%, #8c1730, #40060f 75%)';
    if (id === 'midnight') return 'radial-gradient(circle at 50% 40%, #22386b, #070c1c 75%)';
    return 'radial-gradient(circle at 50% 40%, #127d55, #063726 75%)';
  }

  global.App = App;
  document.addEventListener('DOMContentLoaded', function () { App.init(); });
})(window);
