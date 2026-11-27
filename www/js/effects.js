/* =============================================================================
 *  REAL HOLDEM POKER — 화려한 이펙트 (캔버스 파티클 · 칩 샤워 · 족보 배너)
 * ========================================================================== */
(function (global) {
  'use strict';

  const FX = {
    bannerDuration: 2400,
    maxParts: 280,
    canvas: null, ctx: null, dpr: 1, parts: [], raf: 0, layer: null,

    init(canvas, layer) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.layer = layer;
      this.resize();
      const self = this;
      global.addEventListener('resize', function () { self.resize(); });
    },

    resize() {
      if (!this.canvas) return;
      this.dpr = Math.min(2.5, global.devicePixelRatio || 1);
      const w = global.innerWidth, h = global.innerHeight;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    },

    loop() {
      const c = this.ctx;
      c.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
      const parts = this.parts;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= 1;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.vy += p.g;
        p.vx *= p.drag; p.vy *= p.drag;
        p.x += p.vx; p.y += p.vy;
        p.rot += p.vr;
        const t = p.life / p.maxLife;
        c.save();
        c.globalAlpha = Math.max(0, Math.min(1, t * 1.4));
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        if (p.type === 'spark') {
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = p.color;
          if (parts.length < 90) { c.shadowColor = p.color; c.shadowBlur = 8; }
          c.beginPath(); c.arc(0, 0, p.r * (0.4 + t * 0.8), 0, Math.PI * 2); c.fill();
        } else if (p.type === 'star') {
          c.fillStyle = p.color;
          if (parts.length < 90) { c.shadowColor = p.color; c.shadowBlur = 10; }
          c.beginPath();
          for (let k = 0; k < 8; k++) {
            const r = k % 2 === 0 ? p.r * (0.5 + t) : p.r * 0.32 * (0.5 + t);
            const a = (k / 8) * Math.PI * 2;
            c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          c.closePath(); c.fill();
        } else if (p.type === 'coin') {
          c.fillStyle = '#f6d36b';
          c.strokeStyle = '#a97d20'; c.lineWidth = 1;
          c.beginPath(); c.ellipse(0, 0, p.r, p.r * Math.abs(Math.cos(p.rot)) * 0.9 + p.r * 0.12, 0, 0, Math.PI * 2);
          c.fill(); c.stroke();
          c.fillStyle = '#fff2c0';
          c.beginPath(); c.ellipse(-p.r * 0.25, -p.r * 0.3, p.r * 0.35, p.r * 0.22, 0, 0, Math.PI * 2); c.fill();
        } else if (p.type === 'shard') {
          c.fillStyle = p.color;
          c.fillRect(-p.r, -p.r * 0.35, p.r * 2, p.r * 0.7);
        } else if (p.type === 'ring') {
          c.strokeStyle = p.color; c.lineWidth = 3 * t + 0.5;
          c.beginPath(); c.arc(0, 0, p.r * (1 + (1 - t) * 3.4), 0, Math.PI * 2); c.stroke();
        } else if (p.type === 'glow') {
          const g = c.createRadialGradient(0, 0, 0, 0, 0, p.r * (1 + (1 - t) * 1.5));
          g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = g;
          c.beginPath(); c.arc(0, 0, p.r * (1 + (1 - t) * 1.5), 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }
      if (parts.length) this.raf = requestAnimationFrame(this.loop.bind(this));
      else { this.raf = 0; c.clearRect(0, 0, this.canvas.width, this.canvas.height); }
    },

    kick() { if (!this.raf) this.raf = requestAnimationFrame(this.loop.bind(this)); },

    add(p) {
      if (this.parts.length > this.maxParts) return;
      p.maxLife = p.life;
      if (p.vr === undefined) p.vr = 0;
      if (p.drag === undefined) p.drag = 0.985;
      if (p.g === undefined) p.g = 0.12;
      this.parts.push(p);
      this.kick();
    },

    /* 기본 스파크 버스트 */
    spark(x, y, n, opts) {
      opts = opts || {};
      const colors = opts.colors || ['#ffe9a8', '#ffd166', '#fff6de', '#ffb703'];
      for (let i = 0; i < (n || 18); i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (opts.speed || 3.6) * (0.35 + Math.random());
        this.add({
          type: 'spark', x: x, y: y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 0),
          g: opts.g === undefined ? 0.16 : opts.g,
          r: (opts.size || 2.2) * (0.5 + Math.random()),
          color: colors[(Math.random() * colors.length) | 0],
          rot: 0, life: 30 + Math.random() * 28
        });
      }
    },

    starBurst(x, y, n) {
      for (let i = 0; i < (n || 10); i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.6 + Math.random() * 3.4;
        this.add({
          type: 'star', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          g: 0.02, drag: 0.96, r: 5 + Math.random() * 7,
          color: ['#fff3c4', '#ffd166', '#8ef6ff'][(Math.random() * 3) | 0],
          rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, life: 40 + Math.random() * 30
        });
      }
    },

    coinShower(cx, cy, w, n) {
      for (let i = 0; i < (n || 40); i++) {
        this.add({
          type: 'coin', x: cx + (Math.random() - 0.5) * (w || 240), y: cy - 40 - Math.random() * 200,
          vx: (Math.random() - 0.5) * 1.6, vy: -2 - Math.random() * 3.4,
          g: 0.34, drag: 0.995, r: 4 + Math.random() * 5,
          color: '#f6d36b', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
          life: 90 + Math.random() * 40
        });
      }
    },

    ring(x, y, color, radius) {
      this.add({ type: 'ring', x: x, y: y, vx: 0, vy: 0, g: 0, drag: 1, r: radius || 40, color: color || 'rgba(255,215,120,0.9)', rot: 0, life: 26 });
    },

    glow(x, y, color, r) {
      this.add({ type: 'glow', x: x, y: y, vx: 0, vy: 0, g: 0, drag: 1, r: r || 60, color: color || 'rgba(255,214,102,0.55)', rot: 0, life: 34 });
    },

    confettiBurst(x, y, n) {
      const colors = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#fff3c4'];
      for (let i = 0; i < (n || 60); i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const sp = 4 + Math.random() * 7;
        this.add({
          type: 'shard', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          g: 0.22, drag: 0.985, r: 3 + Math.random() * 4,
          color: colors[(Math.random() * colors.length) | 0],
          rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.6, life: 70 + Math.random() * 60
        });
      }
    },

    /* 화면 전체 골드 스윕 (족보 완성) */
    fullGoldFlash() {
      const w = global.innerWidth;
      for (let i = 0; i < 26; i++) {
        this.add({
          type: 'spark', x: Math.random() * w, y: -20 - Math.random() * 60,
          vx: (Math.random() - 0.5) * 1.2, vy: 2 + Math.random() * 3,
          g: 0.02, drag: 0.999, r: 1.4 + Math.random() * 2.4,
          color: '#ffe9a8', rot: 0, life: 90 + Math.random() * 50
        });
      }
    },

    /* 팟 → 승자 칩 폭포 (DOM 칩) */
    chipFly(from, to, count, chipCls) {
      if (!this.layer) return;
      const n = count || 18;
      for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = 'fly-chip ' + (chipCls || 'c25');
        el.style.left = from.x + 'px';
        el.style.top = from.y + 'px';
        el.style.animationDelay = (i * 26) + 'ms';
        const dx = (to.x - from.x) + (Math.random() - 0.5) * 40;
        const dy = (to.y - from.y) + (Math.random() - 0.5) * 30;
        const midX = dx * (0.35 + Math.random() * 0.3);
        const midY = dy * 0.15 - (90 + Math.random() * 130);
        el.style.setProperty('--dx', dx + 'px');
        el.style.setProperty('--dy', dy + 'px');
        el.style.setProperty('--mx', midX + 'px');
        el.style.setProperty('--my', midY + 'px');
        this.layer.appendChild(el);
        setTimeout(function () { el.remove(); }, 1500 + i * 26);
      }
    },

    /* 중앙 대형 족보 배너 */
    banner(main, sub, opts) {
      opts = opts || {};
      const host = document.getElementById('fx-layer') || this.layer;
      if (!host) return;
      // 이전 배너 제거 (겹침 방지)
      Array.prototype.slice.call(host.querySelectorAll('.hand-banner')).forEach(function (b) { b.remove(); });
      const el = document.createElement('div');
      el.className = 'hand-banner ' + (opts.cls || '');
      el.innerHTML =
        '<div class="hb-glow"></div>' +
        '<div class="hb-inner">' +
          '<div class="hb-sub">' + (sub || '') + '</div>' +
          '<div class="hb-main">' + main + '</div>' +
          (opts.note ? '<div class="hb-note">' + opts.note + '</div>' : '') +
        '</div>';
      host.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('show'); });
      setTimeout(function () {
        el.classList.add('hide');
        setTimeout(function () { el.remove(); }, 520);
      }, opts.duration || this.bannerDuration || 2400);
    },

    /* 스트리트 배너 — 플랍/턴/리버가 깔릴 때 테이블 위에 네온 라벨 */
    streetBanner(label, level) {
      const host = document.getElementById('table-area');
      if (!host) return;
      Array.prototype.slice.call(host.querySelectorAll('.street-banner')).forEach(function (b) { b.remove(); });
      const el = document.createElement('div');
      el.className = 'street-banner lv' + (level || 1);
      el.innerHTML = '<span class="sb-zap">⚡</span><span class="sb-txt">' + label + '</span>';
      host.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('on'); });
      setTimeout(function () { el.remove(); }, 1400);
    },

    /* 카드 요소에 금빛 스윕 + 스파크 */
    cardReveal(cardEl, color) {
      if (!cardEl) return;
      cardEl.classList.add('revealing');
      setTimeout(function () { cardEl.classList.remove('revealing'); }, 1400);
      const r = cardEl.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      this.glow(cx, cy, 'rgba(255,214,102,0.42)', Math.max(r.width, r.height) * 0.7);
      this.spark(cx, cy, 16, { speed: 3.2, size: 2, colors: color || ['#ffe9a8', '#ffd166', '#fff'] });
    },

    /* 족보 완성: 카드 5장 글로우 + 링 + 스타 */
    handComplete(cardEls, label) {
      const self = this;
      let cx = 0, cy = 0, n = 0;
      (cardEls || []).forEach(function (el, i) {
        if (!el) return;
        el.classList.add('glow-win');
        setTimeout(function () { el.classList.add('glow-pulse'); }, 60 * i);
        const r = el.getBoundingClientRect();
        cx += r.left + r.width / 2; cy += r.top + r.height / 2; n++;
        setTimeout(function () {
          self.spark(r.left + r.width / 2, r.top + r.height / 2, 10,
            { speed: 2.4, size: 1.8, colors: ['#fff6d8', '#ffd166', '#9ef7ff'] });
        }, 90 * i);
      });
      if (n) {
        cx /= n; cy /= n;
        this.ring(cx, cy, 'rgba(255,214,102,0.95)', 70);
        this.starBurst(cx, cy, 14);
      }
      this.fullGoldFlash();
    },

    shake(el, ms) {
      if (!el) return;
      el.classList.add('shake');
      setTimeout(function () { el.classList.remove('shake'); }, ms || 380);
    },

    clear() {
      this.parts.length = 0;
      if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  };

  global.FX = FX;
})(window);
