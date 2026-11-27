/* =============================================================================
 *  REAL HOLDEM POKER — 네온 번개(라이트닝) 엔진
 *  플랍 · 턴 · 리버 단계별로 세기가 다른 전기 방전을 캔버스에 그린다.
 *   1) FLOP  : 카드 좌우에서 모여드는 가는 시안/퍼플 아크 + 치지직 스파크
 *   2) TURN  : 테이블 위에서 내리꽂히는 굵은 아크 + 테이블 림 플래시
 *   3) RIVER : 화면을 가로지르는 대형 다중 분기 시안·마젠타 번개 + 임팩트 플래시
 * ========================================================================== */
(function (global) {
  'use strict';

  const LEVELS = {
    1: { colors: ['#00f5ff', '#8ef9ff', '#b06bff'], width: 1.25, branches: 2, life: 460, glow: 14 },
    2: { colors: ['#00f5ff', '#c86bff', '#ff2bd6'], width: 1.65, branches: 3, life: 600, glow: 19 },
    3: { colors: ['#ffffff', '#bdf9ff', '#00f5ff', '#ff2bd6'], width: 2.0, branches: 6, life: 780, glow: 24 }
  };

  /* 번개 이펙트 스킨 — 상점에서 장착 */
  const THEMES = {
    bolt_cyan: { 1: ['#00f5ff', '#8ef9ff', '#b06bff'], 2: ['#00f5ff', '#c86bff', '#ff2bd6'], 3: ['#00f5ff', '#ff2bd6', '#bdf9ff', '#00f5ff', '#ff2bd6', '#ffffff'] },
    bolt_magenta: { 1: ['#ff2bd6', '#ff9de8', '#b06bff'], 2: ['#ff2bd6', '#ffa8ef', '#7b2bff'], 3: ['#ff2bd6', '#ff8ae0', '#b06bff', '#ff2bd6', '#ffd6f6', '#ffffff'] },
    bolt_galaxy: { 1: ['#8b5cff', '#33e0ff', '#c9a6ff'], 2: ['#8b5cff', '#33e0ff', '#ff2bd6'], 3: ['#8b5cff', '#33e0ff', '#c9b8ff', '#8b5cff', '#33e0ff', '#ffffff'] },
    bolt_gold: { 1: ['#ffe27a', '#fff3c0', '#ff9a00'], 2: ['#ffe27a', '#ffc233', '#ff8a00'], 3: ['#ffe27a', '#ffb020', '#fff3c0', '#ffe27a', '#ff8a00', '#ffffff'] }
  };

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  /* 시작점 → 끝점을 중점 변위(midpoint displacement)로 쪼개 실제 번개 줄기를 만든다 */
  function boltPoints(x1, y1, x2, y2, chaos, iters) {
    let pts = [[x1, y1], [x2, y2]];
    let disp = Math.hypot(x2 - x1, y2 - y1) * (chaos || 0.1);
    const n = iters || 3;
    for (let it = 0; it < n; it++) {
      const next = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const off = (Math.random() - 0.5) * disp;
        next.push(a, [mx + (-dy / len) * off, my + (dx / len) * off]);
      }
      next.push(pts[pts.length - 1]);
      pts = next;
      disp *= 0.56;
    }
    return pts;
  }

  const Lightning = {
    canvas: null,
    ctx: null,
    flashHost: null,
    dpr: 1,
    W: 0,
    H: 0,
    bolts: [],
    raf: 0,
    last: 0,
    theme: 'bolt_cyan',

    setTheme(id) {
      if (THEMES[id]) this.theme = id;
      return this.theme;
    },

    colorsFor(level) {
      const t = THEMES[this.theme] || THEMES.bolt_cyan;
      return t[level] || t[1];
    },

    init(canvas, flashHost) {
      if (!canvas) return;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.flashHost = flashHost || null;
      this.resize();
      const self = this;
      global.addEventListener('resize', function () { self.resize(); });
    },

    resize() {
      if (!this.canvas) return;
      this.dpr = Math.min(2.5, global.devicePixelRatio || 1);
      const w = this.canvas.clientWidth || global.innerWidth;
      const h = this.canvas.clientHeight || global.innerHeight;
      this.W = w; this.H = h;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    },

    /* ------------------------------------------------------------ 줄기 생성 */
    addBolt(x1, y1, x2, y2, cfg, iters, heavy) {
      const pts = boltPoints(x1, y1, x2, y2, heavy ? 0.13 : 0.095, iters || 3);
      const branches = [];
      const count = cfg.branches + (heavy ? 2 : 0);
      for (let i = 0; i < count; i++) {
        const idx = 2 + ((Math.random() * Math.max(1, pts.length - 5)) | 0);
        const base = pts[Math.min(pts.length - 2, idx)];
        if (!base) continue;
        const ang = rnd(0, Math.PI * 2);
        const len = rnd(20, heavy ? 130 : 74);
        branches.push(boltPoints(base[0], base[1],
          base[0] + Math.cos(ang) * len, base[1] + Math.sin(ang) * len, 0.2, 2));
      }
      const life = cfg.life * rnd(0.86, 1.16);
      this.bolts.push({
        pts: pts, branches: branches,
        color: pick(cfg.colors),
        width: cfg.width * rnd(0.72, 1.18),
        glow: cfg.glow,
        life: life, maxLife: life, seed: Math.random() * 100
      });
      if (this.bolts.length > 16) this.bolts.shift();
    },

    /* --------------------------------------------------------------- 발동 */
    /* level 1|2|3, target = 카드 엘리먼트의 getBoundingClientRect() 값 */
    strike(level, target) {
      if (!this.canvas || !this.ctx) return;
      const lv = Math.max(1, Math.min(3, level || 1));
      const cfg = Object.assign({}, LEVELS[lv], { colors: this.colorsFor(lv) });
      const W = this.W || global.innerWidth, H = this.H || global.innerHeight;
      const box = this.canvas ? this.canvas.getBoundingClientRect() : { left: 0, top: 0 };
      const t0 = target || { x: W / 2 - 20, y: H * 0.42, w: 40, h: 56 };
      /* 캔버스는 테이블 영역 안에 있으므로 좌표를 로컬로 변환 */
      const t = { x: t0.x - box.left, y: t0.y - box.top, w: t0.w, h: t0.h };
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;

      if (lv === 1) {
        /* 플랍: 새 카드 테두리를 감싸며 튀는 가는 스파크 + 짧은 분기 전류 */
        this.addBolt(cx - t.w * 0.55, cy - t.h * 0.58, cx - t.w * 0.52, cy + t.h * 0.55, cfg, 2, false);
        this.addBolt(cx + t.w * 0.55, cy - t.h * 0.55, cx + t.w * 0.5, cy + t.h * 0.58, cfg, 2, false);
        this.addBolt(cx - t.w * 0.7, cy - t.h * 0.2, cx - t.w * 0.45, cy - t.h * 0.66, cfg, 2, false);
        this.addBolt(cx + t.w * 0.7, cy + t.h * 0.15, cx + t.w * 0.45, cy + t.h * 0.6, cfg, 2, false);
      } else if (lv === 2) {
        /* 턴: 림 좌우에서 4번째 카드로 꽂히는 날카로운 듀얼 아크 + 카드 오라 */
        this.addBolt(-30, cy - t.h * 0.6, cx - t.w * 0.3, cy - t.h * 0.05, cfg, 3, true);
        this.addBolt(W + 30, cy - t.h * 0.45, cx + t.w * 0.3, cy - t.h * 0.02, cfg, 3, true);
        this.addBolt(cx + rnd(-8, 8), Math.max(2, t.y - 170), cx, cy - t.h * 0.2, cfg, 3, false);
        this.addBolt(cx - t.w * 0.75, cy + t.h * 0.5, cx - t.w * 0.35, cy + t.h * 0.15, cfg, 2, false);
      } else {
        /* 리버: 카드를 가리지 않게 위·좌우에서 감싸며 터지는 다중 분기 */
        this.addBolt(cx - W * 0.42, cy - t.h * 1.1, cx - t.w * 0.2, cy - t.h * 0.55, cfg, 3, true);
        this.addBolt(cx + W * 0.42, cy - t.h * 0.95, cx + t.w * 0.2, cy - t.h * 0.55, cfg, 3, true);
        this.addBolt(cx + rnd(-14, 14), Math.max(2, t.y - 200), cx, cy - t.h * 0.55, cfg, 3, true);
        this.addBolt(-30, cy + t.h * 0.5, cx - t.w * 0.45, cy + t.h * 0.1, cfg, 2, false);
        this.addBolt(W + 30, cy + t.h * 0.35, cx + t.w * 0.45, cy + t.h * 0.05, cfg, 2, false);
        this.addBolt(cx - W * 0.18, cy - t.h * 1.5, cx - W * 0.2, cy - t.h * 0.95, cfg, 2, false);
        this.addBolt(cx + W * 0.2, cy - t.h * 1.45, cx + W * 0.22, cy - t.h * 0.95, cfg, 2, false);
        this.addBolt(-40, cy - t.h * 0.15, cx - t.w * 0.6, cy - t.h * 0.2, cfg, 3, true);
        this.addBolt(W + 40, cy - t.h * 0.05, cx + t.w * 0.6, cy - t.h * 0.15, cfg, 3, true);
        this.addBolt(cx - W * 0.3, cy + t.h * 1.25, cx - W * 0.34, cy + t.h * 0.5, cfg, 2, false);
      }

      this.flash(lv);
      this.kick();
    },

    /* 화면 임팩트 플래시 (리버에서 강하게) */
    flash(level) {
      const host = this.flashHost || document.getElementById('impact-layer');
      if (!host || level < 2) return;
      const el = document.createElement('div');
      el.className = 'impact-flash lv' + Math.min(3, level);
      host.appendChild(el);
      setTimeout(function () { el.remove(); }, level >= 3 ? 900 : 620);
    },

    kick() {
      if (this.raf) return;
      this.last = 0;
      this.raf = global.requestAnimationFrame(this.frame.bind(this));
    },

    frame(now) {
      const ctx = this.ctx;
      if (!ctx) { this.raf = 0; return; }
      if (!this.last) this.last = now;
      const dt = Math.min(60, now - this.last);
      this.last = now;
      ctx.clearRect(0, 0, this.W, this.H);

      const list = this.bolts;
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        b.life -= dt;
        if (b.life <= 0) { list.splice(i, 1); continue; }
        const t = Math.max(0, Math.min(1, b.life / b.maxLife));
        /* 잔상이 남는 동안 계속 지지직거리도록 프레임마다 흔들림을 준다 */
        const flick = 0.62 + 0.38 * Math.abs(Math.sin(now * 0.045 + b.seed));
        const alpha = Math.min(1, t * 1.7) * flick;
        this.drawPath(ctx, b.pts, b.color, b.width, alpha, b.glow, b.seed);
        for (let k = 0; k < b.branches.length; k++) {
          this.drawPath(ctx, b.branches[k], b.color, Math.max(1, b.width * 0.42), alpha * 0.8, b.glow * 0.6, b.seed + k);
        }
        /* 임팩트 지점 글로우 */
        const end = b.pts[b.pts.length - 1];
        const g = ctx.createRadialGradient(end[0], end[1], 0, end[0], end[1], 26);
        g.addColorStop(0, 'rgba(255,255,255,' + (0.4 * alpha).toFixed(3) + ')');
        g.addColorStop(0.4, 'rgba(120,245,255,' + (0.22 * alpha).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(end[0], end[1], 26, 0, Math.PI * 2);
        ctx.fill();
      }

      if (list.length) {
        this.raf = global.requestAnimationFrame(this.frame.bind(this));
      } else {
        this.raf = 0;
        ctx.clearRect(0, 0, this.W, this.H);
      }
    },

    drawPath(ctx, pts, color, width, alpha, glow, seed) {
      if (!pts || pts.length < 2) return;
      const j = 1.15;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = alpha;

      /* 1) 바깥 네온 글로우 */
      ctx.strokeStyle = color;
      ctx.lineWidth = width * 2.1;
      ctx.shadowColor = color;
      ctx.shadowBlur = glow * 2.1;
      ctx.globalAlpha = alpha * 0.36;
      this.trace(ctx, pts, j * 1.7);
      ctx.stroke();

      /* 2) 본체 */
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.shadowBlur = glow;
      this.trace(ctx, pts, j);
      ctx.stroke();

      /* 3) 흰 코어 (얇게) */
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.5, width * 0.24);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = glow * 0.4;
      ctx.globalAlpha = alpha * 0.45;
      this.trace(ctx, pts, j * 0.55);
      ctx.stroke();
      ctx.restore();
    },

    trace(ctx, pts, jitter) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        ctx.lineTo(p[0] + (Math.random() - 0.5) * jitter, p[1] + (Math.random() - 0.5) * jitter);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);
    },

    clear() {
      this.bolts.length = 0;
      if (this.ctx) this.ctx.clearRect(0, 0, this.W, this.H);
    }
  };

  global.Lightning = Lightning;
})(window);
