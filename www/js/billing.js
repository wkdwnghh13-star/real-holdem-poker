/* =============================================================================
 *  REAL HOLDEM POKER — 칩 현금 충전 (window.HoldemBilling)
 *  실제 Google Play Billing / PG 결제는 스토어 심사 + 가맹점 키가 필요하다.
 *  그래서 이 파일은 '결제 훅'만 노출하고, 지금은 테스트 샌드박스로 충전된다.
 *
 *  ▸ 연동 방법
 *    - Google Play: window.HoldemPlayBilling = { purchase(sku) -> Promise<{ok, token}> }
 *                   (네이티브 Capacitor 플러그인에서 주입)
 *    - PG        : window.HoldemPG = { purchase(order) -> Promise<{ok, tid}> }
 *  위 훅이 없으면 자동으로 샌드박스(즉시 충전 · 영수증 기록)로 동작한다.
 * ========================================================================== */
(function (global) {
  'use strict';

  const PACKAGES = [
    { id: 'chip_1100', price: 1100, chips: 11000, bonus: 0, tag: '스타터', desc: '가볍게 한 판' },
    { id: 'chip_5500', price: 5500, chips: 60000, bonus: 10, tag: '인기', desc: '+10% 보너스' },
    { id: 'chip_11000', price: 11000, chips: 130000, bonus: 18, tag: '추천', desc: '+18% 보너스' },
    { id: 'chip_33000', price: 33000, chips: 420000, bonus: 27, tag: '하이롤러', desc: '+27% 보너스' },
    { id: 'chip_55000', price: 55000, chips: 750000, bonus: 36, tag: 'VIP', desc: '+36% 보너스' }
  ];

  const FIRST_BONUS = 100;   // 첫 충전 +100%

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function orderId() {
    return 'R' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  const Billing = {
    provider: 'sandbox',        // sandbox | google_play | pg
    packages: PACKAGES,
    firstBonus: FIRST_BONUS,
    lastError: '',

    setProvider(p) {
      if (['sandbox', 'google_play', 'pg'].indexOf(p) < 0) return this.provider;
      this.provider = p;
      return p;
    },

    /* 현재 환경에서 실제 결제가 가능한지 */
    isRealProvider() {
      return this.provider === 'google_play' ? !!global.HoldemPlayBilling
        : this.provider === 'pg' ? !!global.HoldemPG : false;
    },

    providerLabel() {
      if (this.provider === 'google_play') return this.isRealProvider() ? 'Google Play 결제' : 'Google Play (키 미설정)';
      if (this.provider === 'pg') return this.isRealProvider() ? 'PG 카드 결제' : 'PG (가맹점 키 미설정)';
      return '테스트 샌드박스';
    },

    isFirstCharge() {
      const P = global.Progress;
      return !(P && P.data && P.data.firstCharge);
    },

    /* 패키지의 실제 지급 칩 (첫 충전 보너스 포함) */
    quote(pkgId) {
      const pkg = PACKAGES.filter(function (p) { return p.id === pkgId; })[0];
      if (!pkg) return null;
      const base = pkg.chips;
      const pkgBonus = Math.round(base * (pkg.bonus / 100));
      const first = this.isFirstCharge();
      const firstBonus = first ? Math.round((base + pkgBonus) * (FIRST_BONUS / 100)) : 0;
      return {
        pkg: pkg, price: pkg.price, base: base, pkgBonus: pkgBonus,
        firstBonus: firstBonus, total: base + pkgBonus + firstBonus, first: first
      };
    },

    /* --------------------------------------------------------------- 결제 */
    async purchase(pkgId, opts) {
      opts = opts || {};
      const q = this.quote(pkgId);
      if (!q) return { ok: false, error: '없는 상품' };
      this.lastError = '';

      let provider = this.provider;
      let paid = false;
      let token = '';

      try {
        if (provider === 'google_play' && global.HoldemPlayBilling) {
          const r = await global.HoldemPlayBilling.purchase({ sku: q.pkg.id, price: q.price });
          paid = !!(r && r.ok); token = (r && r.token) || '';
        } else if (provider === 'pg' && global.HoldemPG) {
          const r = await global.HoldemPG.purchase({ orderId: orderId(), amount: q.price, name: q.pkg.id });
          paid = !!(r && r.ok); token = (r && r.tid) || '';
        } else {
          /* 샌드박스: 실제 돈이 나가지 않는다 */
          provider = 'sandbox';
          await delay(opts.instant ? 0 : 620);
          paid = true;
          token = 'SBX-' + orderId();
        }
      } catch (e) {
        this.lastError = (e && e.message) || '결제 실패';
        return { ok: false, error: this.lastError };
      }

      if (!paid) {
        this.lastError = '결제가 취소되었거나 실패했어';
        return { ok: false, error: this.lastError };
      }

      const receipt = {
        id: orderId(), pkgId: q.pkg.id, name: q.pkg.tag + ' · ' + q.pkg.chips.toLocaleString('ko-KR') + '칩',
        price: q.price, base: q.base, pkgBonus: q.pkgBonus, firstBonus: q.firstBonus,
        chips: q.total, provider: provider, token: token, status: 'paid',
        at: new Date().toISOString(),
        account: (global.HoldemAuth && global.HoldemAuth.current()) ? global.HoldemAuth.current().id : null
      };

      /* 칩 지급 + 영수증 기록 */
      const P = global.Progress;
      if (P) {
        P.data.bankroll = Math.max(0, Math.round(P.data.bankroll + q.total));
        if (P.data.bankroll > P.data.peak) P.data.peak = P.data.bankroll;
        P.data.firstCharge = true;
        P.data.totalCharged = (P.data.totalCharged || 0) + q.price;
        P.save();
      }
      if (global.HoldemAuth) global.HoldemAuth.addReceipt(receipt);

      return { ok: true, receipt: receipt, chips: q.total, quote: q };
    },

    /* ------------------------------------------------- 프리미엄 시즌패스 해금 */
    async purchasePremiumPass() {
      if (global.Progress && global.Progress.data.passPremium) {
        return { ok: false, error: '이미 프리미엄 패스 보유 중' };
      }
      const price = 11000;
      let provider = this.provider, paid = false, token = '';
      try {
        if (provider === 'google_play' && global.HoldemPlayBilling) {
          const r = await global.HoldemPlayBilling.purchase({ sku: 'pass_premium', price: price });
          paid = !!(r && r.ok); token = (r && r.token) || '';
        } else if (provider === 'pg' && global.HoldemPG) {
          const r = await global.HoldemPG.purchase({ orderId: orderId(), amount: price, name: 'premium_pass' });
          paid = !!(r && r.ok); token = (r && r.tid) || '';
        } else {
          provider = 'sandbox';
          await delay(620);
          paid = true;
          token = 'SBX-' + orderId();
        }
      } catch (e) {
        this.lastError = (e && e.message) || '결제 실패';
        return { ok: false, error: this.lastError };
      }
      if (!paid) return { ok: false, error: '결제가 취소되었거나 실패했어' };
      const receipt = {
        id: orderId(), pkgId: 'pass_premium', name: '프리미엄 시즌패스', price: price,
        base: 0, pkgBonus: 0, firstBonus: 0, chips: 0, provider: provider, token: token,
        status: 'paid', at: new Date().toISOString(),
        account: (global.HoldemAuth && global.HoldemAuth.current()) ? global.HoldemAuth.current().id : null
      };
      const P = global.Progress;
      if (P) { P.data.passPremium = true; P.save(); }
      if (global.HoldemAuth) global.HoldemAuth.addReceipt(receipt);
      return { ok: true, receipt: receipt };
    },

    /* 스토어 복원(영수증 재검증) — 실제 스토어에서는 서버 검증이 필요하다 */
    async restore() {
      const list = global.HoldemAuth ? global.HoldemAuth.receipts() : [];
      return { ok: true, receipts: list, count: list.length };
    }
  };

  global.HoldemBilling = Billing;
})(window);
