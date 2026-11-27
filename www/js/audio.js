/* =============================================================================
 *  REAL HOLDEM POKER — WebAudio 합성 사운드 (외부 음원 없음)
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------ 햅틱(진동) */
  const Haptic = {
    enabled: true,
    supported: !!(global.navigator && typeof global.navigator.vibrate === 'function'),
    fire(pattern) {
      if (!this.enabled || !this.supported) return false;
      try { return global.navigator.vibrate(pattern); } catch (e) { return false; }
    },
    setEnabled(v) { this.enabled = !!v; }
  };

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* ------------------------------------------------------- BGM 스타일 정의 */
  /* bgmStyle: 'lofi'(기본) | 'synth' | 'bossa'  — 스타일만 바꿔 갈아끼울 수 있다 */
  const BGM_STYLES = {
    /* 78 BPM 따뜻한 로파이 힙합: 로즈 코드 + 서브 베이스 + 부드러운 킥/브러시 스네어 + 바이닐 */
    lofi: {
      bpm: 78, swing: 0.17, bars: 4,
      lp: 7000, hp: 36, gain: 0.92, wet: 0.26, wobble: 0.23, wobbleDepth: 7,
      vinyl: 0.09,
      /* Em9 · Cmaj9 · G6/9 · D6/9 */
      chords: [
        [52, 55, 59, 62, 66],
        [48, 52, 55, 59, 62],
        [55, 59, 62, 64, 69],
        [50, 54, 57, 59, 64]
      ],
      bass: [40, 36, 43, 38],
      kick:  [1, 0, 0, 0, 0, 1, 0, 0],
      snare: [0, 0, 1, 0, 0, 0, 1, 0],
      hat:   [1, 0, 1, 1, 1, 0, 1, 1],
      comp:  [1, 0, 0, 0, 1, 0, 0, 1],
      compVel: [1, 0, 0, 0, 0.66, 0, 0, 0.5],
      spark: [0, 0, 0, 0, 0, 0, 0, 0]
    },
    /* 92 BPM 클린 신스: 부드러운 패드 + 통통 튀는 신스 베이스 */
    synth: {
      bpm: 92, swing: 0.05, bars: 4,
      lp: 5200, hp: 45, gain: 0.86, wet: 0.3, wobble: 0.16, wobbleDepth: 3,
      vinyl: 0.012,
      chords: [
        [57, 60, 64, 67],
        [53, 57, 60, 64],
        [55, 59, 62, 67],
        [48, 55, 60, 64]
      ],
      bass: [45, 41, 43, 36],
      kick:  [1, 0, 1, 0, 1, 0, 1, 0],
      snare: [0, 0, 1, 0, 0, 0, 1, 0],
      hat:   [0, 1, 0, 1, 0, 1, 0, 1],
      comp:  [1, 0, 1, 0, 1, 0, 1, 0],
      spark: [0, 0, 0, 1, 0, 0, 0, 0]
    },
    /* 96 BPM 보사노바: 나일론 기타 컴핑 + 셰이커 + 부드러운 리듬 */
    bossa: {
      bpm: 96, swing: 0.04, bars: 4,
      lp: 6000, hp: 50, gain: 0.9, wet: 0.2, wobble: 0, wobbleDepth: 0,
      vinyl: 0.02,
      chords: [
        [55, 59, 62, 64],
        [50, 54, 57, 60],
        [48, 52, 55, 59],
        [53, 57, 60, 64]
      ],
      bass: [43, 38, 36, 41],
      kick:  [1, 0, 0, 1, 0, 0, 1, 0],
      snare: [0, 1, 0, 0, 1, 0, 0, 1],
      hat:   [1, 1, 1, 1, 1, 1, 1, 1],
      comp:  [1, 0, 1, 0, 0, 1, 1, 0],
      spark: [0, 0, 0, 0, 0, 0, 0, 0]
    }
  };

  const Sound = {
    ctx: null,
    master: null,
    enabled: true,
    vol: 0.7,
    _noise: null,

    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.vol;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        const self = this;
        this.ctx.resume().then(function () { if (self.enabled) self.startBgm(); }).catch(function () {});
      }
      if (this.enabled && !this._bgmTimer) this.startBgm();
    },
    setEnabled(v) {
      this.enabled = !!v;
      if (this.master) this.master.gain.value = v ? this.vol : 0;
      if (this.enabled) this.startBgm(); else this.stopBgm();
    },

    /* ====================================================== BGM (배경음악) */
    bgmStyle: 'lofi',
    _bgmTimer: null,
    _bgm: null,
    _bus: null,

    bgmStyleDef() { return BGM_STYLES[this.bgmStyle] || BGM_STYLES.lofi; },

    setBgmStyle(style) {
      if (!BGM_STYLES[style] || style === this.bgmStyle) return this.bgmStyle;
      this.bgmStyle = style;
      const playing = !!this._bgmTimer;
      if (playing) { this.stopBgm(); this.startBgm(); }
      return this.bgmStyle;
    },

    startBgm() {
      if (this._bgmTimer || !this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const st = BGM_STYLES[this.bgmStyle] || BGM_STYLES.lofi;
      this._buildBus(st);
      this._bgm = { style: this.bgmStyle, step: 0, next: this.ctx.currentTime + 0.15 };
      const self = this;
      this._bgmTimer = setInterval(function () { self._bgmTick(); }, 55);
      this._bgmTick();
    },

    stopBgm() {
      if (this._bgmTimer) { clearInterval(this._bgmTimer); this._bgmTimer = null; }
      this._bgm = null;
      const stop = function (n) { if (n) { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} } };
      stop(this._vinyl); this._vinyl = null;
      stop(this._wobOsc); this._wobOsc = null;
      if (this._bus) { try { this._bus.disconnect(); } catch (e) {} this._bus = null; }
      this._wet = null; this._wob = null;
    },

    /* 마스터 버스 · 리버브 · 바이닐 · 테이프 워블 */
    _buildBus(st) {
      const ctx = this.ctx;
      if (this._bus) return;
      const bus = ctx.createGain();
      bus.gain.value = st.gain === undefined ? 0.9 : st.gain;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = st.hp || 40;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = st.lp || 4200; lp.Q.value = 0.35;
      bus.connect(hp); hp.connect(lp); lp.connect(this.master);
      this._bus = bus;

      const conv = ctx.createConvolver();
      conv.buffer = this._impulse(st.wet ? 1.8 : 1.4, 2.4);
      const wet = ctx.createGain(); wet.gain.value = st.wet === undefined ? 0.24 : st.wet;
      conv.connect(wet); wet.connect(lp);
      this._wet = conv;

      if (st.wobble) {
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = st.wobble;
        const lg = ctx.createGain(); lg.gain.value = st.wobbleDepth || 5;
        lfo.connect(lg);
        try { lfo.start(); } catch (e) {}
        this._wob = lg; this._wobOsc = lfo;
      }

      if (st.vinyl) {
        const src = ctx.createBufferSource();
        src.buffer = this._vinylBuffer(3.2);
        src.loop = true;
        const hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 900;
        const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 9000;
        const vg = ctx.createGain(); vg.gain.value = st.vinyl;
        src.connect(hp2); hp2.connect(lp2); lp2.connect(vg); vg.connect(lp);
        try { src.start(); } catch (e) {}
        this._vinyl = src;
      }
    },

    /* 리버브 임펄스(생성) */
    _impulse(sec, decay) {
      const ctx = this.ctx;
      const len = Math.max(1, Math.floor(ctx.sampleRate * sec));
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
      }
      return buf;
    },

    /* 바이닐 잡음 + 크랙클 */
    _vinylBuffer(sec) {
      const ctx = this.ctx;
      const len = Math.max(1, Math.floor(ctx.sampleRate * sec));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.03;
      const pops = Math.floor(sec * 26);
      for (let p = 0; p < pops; p++) {
        const i = Math.floor(Math.random() * (len - 8));
        const amp = 0.25 + Math.random() * 0.6;
        const w = 2 + Math.floor(Math.random() * 5);
        for (let k = 0; k < w; k++) d[i + k] += amp * (1 - k / w);
      }
      return buf;
    },

    /* 스케줄러: 8분음표 그리드를 미리 예약해 박자를 정확히 유지 */
    _bgmTick() {
      const ctx = this.ctx;
      if (!ctx || !this._bgm) return;
      const st = BGM_STYLES[this._bgm.style] || BGM_STYLES.lofi;
      if (ctx.state !== 'running' || (global.document && global.document.hidden)) {
        this._bgm.next = ctx.currentTime + 0.2;
        return;
      }
      const stepDur = 30 / st.bpm;            // 8분음표 길이(초)
      const horizon = ctx.currentTime + 0.3;
      let guard = 0;
      while (this._bgm.next < horizon && guard++ < 24) {
        this._bgmStep(st, this._bgm.step, this._bgm.next, stepDur);
        this._bgm.step++;
        this._bgm.next += stepDur;
      }
    },

    _bgmStep(st, step, t, stepDur) {
      const s = step % 8;
      const bar = Math.floor(step / 8) % st.chords.length;
      const chord = st.chords[bar];
      const root = st.bass[bar];
      const tt = t + (s % 2 === 1 ? stepDur * (st.swing || 0) : 0);

      // 드럼
      if (st.kick[s]) this._kick(tt, st.bpm < 85 ? 1 : 0.9);
      if (st.snare[s]) this._snare(tt, st.bpm < 85 ? 1 : 0.8);
      if (st.hat[s]) this._hat(tt, s === 7 ? 1.25 : 0.8, st.bpm < 85 ? 1 : 1.5);

      // 서브 베이스
      if (s === 0 || st.bass[s]) {
        this._subBass(tt, mtof(root), stepDur * (s === 0 ? 5.2 : 1.6));
      }

      // 코드 컴핑 (로즈/패드/나일론)
      if (st.comp[s]) {
        const soft = st.compVel ? st.compVel[s] : (s === 0 ? 1 : 0.72);
        const dur = stepDur * (s === 0 ? 4.4 : (s === 4 ? 2.2 : 1.5));
        this._chord(tt, chord, dur, soft, this.bgmStyle);
      }

      // 가끔 올라가는 장식음
      if (st.spark[s]) {
        this._bell(tt, chord[chord.length - 1] + 12, stepDur * 3);
      }
    },

    /* 로즈 일렉 피아노 음 */
    _rhodes(freq, t, dur, vel) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      // 다이(mallet)가 부딪는 배음 — 빠르게 사라지는 2배음 변조
      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.setValueAtTime(freq * 2.01, t);
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(freq * 1.1, t);
      modGain.gain.exponentialRampToValueAtTime(freq * 0.02, t + 0.22);
      mod.connect(modGain); modGain.connect(osc.frequency);
      // 살짝 따뜻하게
      const shaper = ctx.createBiquadFilter();
      shaper.type = 'lowpass'; shaper.frequency.value = 1900; shaper.Q.value = 0.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.008);
      g.gain.exponentialRampToValueAtTime(vel * 0.42, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(shaper); shaper.connect(g); g.connect(this._bus);
      // 한 옥타브 위 배음 — 로즈의 밝은 '팅' (중역을 채운다)
      const hi = ctx.createOscillator(); hi.type = 'sine';
      hi.frequency.setValueAtTime(freq * 2, t);
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.0001, t);
      hg.gain.exponentialRampToValueAtTime(vel * 0.34, t + 0.006);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.6);
      hi.connect(hg); hg.connect(this._bus);
      hi.start(t); hi.stop(t + dur + 0.05);
      if (this._wet) { const send = ctx.createGain(); send.gain.value = 0.4; g.connect(send); send.connect(this._wet); }
      if (this._wob) { try { this._wob.connect(osc.detune); this._wob.connect(mod.detune); } catch (e) {} }
      osc.start(t); mod.start(t);
      osc.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
    },

    /* 신스 패드 음 */
    _pad(freq, t, dur, vel) {
      const ctx = this.ctx;
      const a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.setValueAtTime(freq * 0.997, t);
      const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.setValueAtTime(freq * 1.003, t);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.linearRampToValueAtTime(2100, t + 0.25);
      lp.frequency.linearRampToValueAtTime(1100, t + dur);
      lp.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.09);
      g.gain.exponentialRampToValueAtTime(vel * 0.5, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      a.connect(lp); b.connect(lp); lp.connect(g); g.connect(this._bus);
      if (this._wet) { const send = ctx.createGain(); send.gain.value = 0.35; g.connect(send); send.connect(this._wet); }
      if (this._wob) { try { this._wob.connect(a.detune); this._wob.connect(b.detune); } catch (e) {} }
      a.start(t); b.start(t); a.stop(t + dur + 0.05); b.stop(t + dur + 0.05);
    },

    /* 나일론 기타 플럭 */
    _pluck(freq, t, dur, vel) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(freq, t);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(freq * 2, t);
      const o2g = ctx.createGain(); o2g.gain.setValueAtTime(0.35, t);
      o2g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      o.connect(g); o2.connect(o2g); o2g.connect(g); g.connect(lp); lp.connect(this._bus);
      if (this._wet) { const send = ctx.createGain(); send.gain.value = 0.3; g.connect(send); send.connect(this._wet); }
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    },

    /* 코드 한 덩어리 — 스타일별 악기 */
    _chord(t, notes, dur, vel, style) {
      for (let i = 0; i < notes.length; i++) {
        const nt = t + i * 0.014;
        const f = mtof(notes[i]);
        if (style === 'synth') this._pad(f, nt, dur, 0.045 * vel);
        else if (style === 'bossa') this._pluck(f, nt, dur * 0.9, 0.075 * vel);
        else this._rhodes(f, nt, dur, 0.165 * vel);
      }
    },

    /* 장식 벨 */
    _bell(t, midi, dur) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(mtof(midi), t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this._bus);
      o.start(t); o.stop(t + dur + 0.05);
    },

    /* 서브 베이스 */
    _subBass(t, freq, dur) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 0.995, t + dur);
      const o2 = ctx.createOscillator(); o2.type = 'triangle';
      o2.frequency.setValueAtTime(freq * 2, t);
      const g2 = ctx.createGain(); g2.gain.value = 0.06;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.058, t + dur * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(this._bus);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    },

    /* 로파이 킥 */
    _kick(t, vel) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(112, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.34 * (vel || 1), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
      o.connect(lp); lp.connect(g); g.connect(this._bus);
      o.start(t); o.stop(t + 0.36);
    },

    /* 브러시 스네어 */
    _snare(t, vel) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer();
      src.playbackRate.value = 1.1;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = 1700; bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16 * (vel || 1), t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      src.connect(bp); bp.connect(g); g.connect(this._bus);
      src.start(t); src.stop(t + 0.22);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(196, t);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.05 * (vel || 1), t + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(og); og.connect(this._bus);
      o.start(t); o.stop(t + 0.12);
    },

    /* 하이햇 */
    _hat(t, vel, rate) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer();
      src.playbackRate.value = (rate || 1.4) * 1.6;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.085 * (vel || 1), t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
      src.connect(hp); hp.connect(g); g.connect(this._bus);
      src.start(t); src.stop(t + 0.08);
    },

    noiseBuffer() {
      if (this._noise || !this.ctx) return this._noise;
      const len = this.ctx.sampleRate * 1.2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
      return buf;
    },

    _env(gainNode, t0, a, d, peak) {
      const g = gainNode.gain;
      g.cancelScheduledValues(t0);
      g.setValueAtTime(0.0001, t0);
      g.exponentialRampToValueAtTime(peak, t0 + a);
      g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    },

    /* 카드가 테이블 위를 미끄러지는 소리 */
    deal(delay) {
      if (!this.enabled) return;
      this.init(); if (!this.ctx) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer();
      src.playbackRate.value = 1.4;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.8;
      const g = this.ctx.createGain();
      this._env(g, t0, 0.006, 0.14, 0.20);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + 0.22);

      // 손끝이 카드에 닿는 톡
      const o = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(620, t0);
      o.frequency.exponentialRampToValueAtTime(300, t0 + 0.05);
      this._env(og, t0, 0.003, 0.05, 0.075);
      o.connect(og); og.connect(this.master);
      o.start(t0); o.stop(t0 + 0.08);
    },

    /* 카드 뒤집히는 '찰진' 소리 */
    flip(delay) {
      if (!this.enabled) return;
      this.init(); if (!this.ctx) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer();
      src.playbackRate.value = 2.2;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1800;
      const g = this.ctx.createGain();
      this._env(g, t0, 0.002, 0.07, 0.28);
      src.connect(hp); hp.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + 0.12);

      const o = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(1400, t0);
      o.frequency.exponentialRampToValueAtTime(520, t0 + 0.09);
      this._env(og, t0, 0.002, 0.08, 0.09);
      o.connect(og); og.connect(this.master);
      o.start(t0); o.stop(t0 + 0.1);
    },

    /* 칩 부딪히는 소리 */
    chip(delay, count) {
      if (!this.enabled) return;
      this.init(); if (!this.ctx) return;
      const n = count || 3;
      for (let i = 0; i < n; i++) {
        const t0 = this.ctx.currentTime + (delay || 0) + i * (0.026 + Math.random() * 0.03);
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        const f = 2100 + Math.random() * 1600;
        o.frequency.setValueAtTime(f, t0);
        o.frequency.exponentialRampToValueAtTime(f * 0.55, t0 + 0.045);
        this._env(g, t0, 0.001, 0.05, 0.10 + Math.random() * 0.05);
        o.connect(g); g.connect(this.master);
        o.start(t0); o.stop(t0 + 0.07);

        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer();
        src.playbackRate.value = 3;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 2;
        const ng = this.ctx.createGain();
        this._env(ng, t0, 0.001, 0.03, 0.06);
        src.connect(bp); bp.connect(ng); ng.connect(this.master);
        src.start(t0); src.stop(t0 + 0.05);
      }
    },

    /* 체크 톡톡 */
    check(delay) {
      if (!this.enabled) return;
      this.init(); if (!this.ctx) return;
      for (let i = 0; i < 2; i++) {
        const t0 = this.ctx.currentTime + (delay || 0) + i * 0.115;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(168 - i * 12, t0);
        o.frequency.exponentialRampToValueAtTime(78, t0 + 0.09);
        this._env(g, t0, 0.002, 0.1, 0.24);
        o.connect(g); g.connect(this.master);
        o.start(t0); o.stop(t0 + 0.14);
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer(); src.playbackRate.value = 1;
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
        const ng = this.ctx.createGain(); this._env(ng, t0, 0.001, 0.04, 0.1);
        src.connect(lp); lp.connect(ng); ng.connect(this.master);
        src.start(t0); src.stop(t0 + 0.06);
      }
    },

    /* 폴드 */
    fold(delay) {
      if (!this.enabled) return;
      this.init(); if (!this.ctx) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(); src.playbackRate.value = 0.7;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200;
      const g = this.ctx.createGain(); this._env(g, t0, 0.01, 0.18, 0.08);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + 0.3);
    },

    /* 올인 라이저 */
    allin(delay) {
      if (!this.enabled) return;
      this.init(); if (!this.ctx) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(160, t0);
      o.frequency.exponentialRampToValueAtTime(880, t0 + 0.5);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, t0);
      lp.frequency.exponentialRampToValueAtTime(4200, t0 + 0.5);
      this._env(g, t0, 0.02, 0.55, 0.14);
      o.connect(lp); lp.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + 0.7);
      this.chip(t0 + 0.12, 8);
    },

    /* 승리 팡파르 */
    win(delay) {
      if (!this.enabled) return;
      this.init(); if (!this.ctx) return;
      const ctx = this.ctx, master = this.master;
      const t0 = ctx.currentTime + (delay || 0);
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach(function (f, i) {
        const tt = t0 + i * 0.075;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = i === notes.length - 1 ? 'triangle' : 'sine';
        o.frequency.setValueAtTime(f, tt);
        o.frequency.exponentialRampToValueAtTime(f * 1.002, tt + 0.4);
        const a = 0.004, d = i === notes.length - 1 ? 0.75 : 0.32;
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.13, tt + a);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + a + d);
        o.connect(g); g.connect(master);
        o.start(tt); o.stop(tt + a + d + 0.05);
      });
      this.chip(t0 + 0.05, 6);
    },

    /* 큰 족보 완성 (스파클) */
    fanfare(delay) {
      if (!this.enabled) return;
      this.init(); if (!this.ctx) return;
      const ctx = this.ctx, master = this.master;
      const t0 = ctx.currentTime + (delay || 0);
      const chord = [392, 493.88, 587.33, 783.99];
      chord.forEach(function (f, i) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(f, t0 + i * 0.02);
        g.gain.setValueAtTime(0.0001, t0 + i * 0.02);
        g.gain.exponentialRampToValueAtTime(0.10, t0 + i * 0.02 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
        o.connect(g); g.connect(master);
        o.start(t0 + i * 0.02); o.stop(t0 + 1.2);
      });
      // 반짝임
      for (let i = 0; i < 9; i++) {
        const tt = t0 + 0.1 + i * 0.045;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(1800 + Math.random() * 2400, tt);
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.05, tt + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1);
        o.connect(g); g.connect(master);
        o.start(tt); o.stop(tt + 0.12);
      }
    },

    /* 나레이션/버튼 */
    tap(delay) {
      if (!this.enabled) return;
      this.init(); if (!this.ctx) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(760, t0);
      o.frequency.exponentialRampToValueAtTime(560, t0 + 0.03);
      this._env(g, t0, 0.001, 0.04, 0.05);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + 0.06);
    },

    /* 패배/토너먼트 탈락 */
    lose(delay) {
      if (!this.enabled) return;
      this.init(); if (!this.ctx) return;
      const ctx = this.ctx, master = this.master;
      const t0 = ctx.currentTime + (delay || 0);
      [440, 392, 330, 262].forEach(function (f, i) {
        const tt = t0 + i * 0.13;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(f, tt);
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.09, tt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.35);
        o.connect(g); g.connect(master);
        o.start(tt); o.stop(tt + 0.4);
      });
    },

    /* 토너먼트 우승 트로피 */
    trophy(delay) {
      this.win(delay);
      this.fanfare((delay || 0) + 0.25);
      this.chip((delay || 0) + 0.6, 10);
    }
  };

  Sound.Haptic = Haptic;
  Sound.vibrate = function (pattern) { return Haptic.fire(pattern); };
  global.Sound = Sound;
  global.Haptic = Haptic;
})(window);
