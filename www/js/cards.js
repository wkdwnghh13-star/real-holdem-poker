/* =============================================================================
 *  REAL HOLDEM POKER — 카드 · 칩 그래픽 레이어
 *  실사풍 카드(페이퍼 질감, 핍 배치, 코트 카드, 금박) / 칩 스택 / 카드 뒷면 스킨
 * ========================================================================== */
(function (global) {
  'use strict';
  const P = global.Poker;

  const SUIT_PATH = {
    0: '<path d="M12 2.4C12 2.4 3.6 9.3 3.6 14c0 2.7 2.1 4.8 4.8 4.8 1.1 0 2.1-.35 2.9-.95-.3 1.9-1.1 3.4-2.5 4.45h6.4c-1.4-1.05-2.2-2.55-2.5-4.45.8.6 1.8.95 2.9.95 2.7 0 4.8-2.1 4.8-4.8C20.4 9.3 12 2.4 12 2.4z"/>',
    1: '<path d="M12 21.15l-1.48-1.35C5.42 15.1 2 12.02 2 8.24 2 5.16 4.42 2.74 7.5 2.74c1.74 0 3.41.81 4.5 2.09C13.09 3.55 14.76 2.74 16.5 2.74 19.58 2.74 22 5.16 22 8.24c0 3.78-3.42 6.86-8.52 11.56L12 21.15z"/>',
    2: '<path d="M12 1.9l7.2 10.1-7.2 10.1L4.8 12z"/>',
    3: '<circle cx="12" cy="7.2" r="3.95"/><circle cx="7.05" cy="13.85" r="3.95"/><circle cx="16.95" cy="13.85" r="3.95"/><path d="M12 12.1c.62 3.2-.26 5.96-2.2 7.95h4.4c-1.94-1.99-2.82-4.75-2.2-7.95z"/>'
  };

  const R = P.RANK_STR;

  /* --------------------------------------------------------------- 핍 배치 (실제 포커 카드 비율) */
  const Y0 = 13, Y1 = 31, Y2 = 38, Y3 = 50, Y4 = 62, Y5 = 69, Y6 = 87;
  const Y15 = 25, Y45 = 75;
  const X_L = 24, X_C = 50, X_R = 76;
  const PIPS = {
    2: [[X_C, Y0], [X_C, Y6]],
    3: [[X_C, Y0], [X_C, Y3], [X_C, Y6]],
    4: [[X_L, Y0], [X_R, Y0], [X_L, Y6], [X_R, Y6]],
    5: [[X_L, Y0], [X_R, Y0], [X_C, Y3], [X_L, Y6], [X_R, Y6]],
    6: [[X_L, Y0], [X_R, Y0], [X_L, Y3], [X_R, Y3], [X_L, Y6], [X_R, Y6]],
    7: [[X_L, Y0], [X_R, Y0], [X_C, Y1], [X_L, Y3], [X_R, Y3], [X_L, Y6], [X_R, Y6]],
    8: [[X_L, Y0], [X_R, Y0], [X_C, Y1], [X_L, Y3], [X_R, Y3], [X_C, Y5], [X_L, Y6], [X_R, Y6]],
    9: [[X_L, Y0], [X_R, Y0], [X_L, Y2], [X_R, Y2], [X_C, Y3], [X_L, Y4], [X_R, Y4], [X_L, Y6], [X_R, Y6]],
    10: [[X_L, Y0], [X_R, Y0], [X_C, Y15], [X_L, Y2], [X_R, Y2], [X_L, Y4], [X_R, Y4], [X_C, Y45], [X_L, Y6], [X_R, Y6]]
  };

  function suitSVG(s, extra) {
    return '<svg class="suit ' + (extra || '') + '" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor">' + SUIT_PATH[s] + '</g></svg>';
  }

  function pipHTML(rank, s) {
    const list = PIPS[rank];
    if (!list) return '';
    let h = '';
    for (let i = 0; i < list.length; i++) {
      const x = list[i][0], y = list[i][1];
      const flip = y > 50 ? ' flip' : '';
      h += '<span class="pip' + flip + '" style="left:' + x + '%;top:' + y + '%">' + suitSVG(s) + '</span>';
    }
    return h;
  }

  /* 실제 트럼프 카드 상하 대칭 코트 카드 일러스트 (J / Q / K) */
  function courtHalfSVG(rank, s) {
    const robe = rank === 13 ? '#b81d24' : (rank === 12 ? '#9e1932' : '#1d4e89');
    const trim = '#d9a441';
    const navy = '#1b2b4b';
    const hat = rank === 13
      ? '<path d="M22 25 L26 12 L34 19 L40 9 L46 19 L54 12 L58 25 Z" fill="' + trim + '" stroke="#1a1a1a" stroke-width="1.4"/>' +
        '<circle cx="40" cy="8" r="2.3" fill="' + robe + '"/>'
      : rank === 12
        ? '<path d="M24 25 L28 14 L35 20 L40 11 L45 20 L52 14 L56 25 Z" fill="' + trim + '" stroke="#1a1a1a" stroke-width="1.3"/>' +
          '<path d="M25 25 Q22 36 25 46 L30 46 L30 28 Z" fill="' + robe + '"/>' +
          '<path d="M55 25 Q58 36 55 46 L50 46 L50 28 Z" fill="' + robe + '"/>'
        : '<path d="M24 26 Q40 13 56 26 L53 31 L27 31 Z" fill="' + navy + '" stroke="' + trim + '" stroke-width="1.5"/>' +
          '<path d="M26 24 L36 17 L40 22 L44 17 L54 24" fill="none" stroke="' + trim + '" stroke-width="1.6"/>';
    const weapon = rank === 13
      ? '<rect x="13" y="18" width="3" height="32" rx="1.2" fill="#cfd6df" stroke="#1a1a1a" stroke-width="1"/><path d="M10 42 L19 42" stroke="' + trim + '" stroke-width="2.4"/>'
      : rank === 12
        ? '<line x1="65" y1="22" x2="65" y2="50" stroke="#2d6a4f" stroke-width="1.8"/><circle cx="65" cy="19" r="4.2" fill="' + robe + '" stroke="' + trim + '" stroke-width="1.2"/>'
        : '<line x1="15" y1="18" x2="15" y2="50" stroke="' + trim + '" stroke-width="2"/><polygon points="15,11 19,19 11,19" fill="#cfd6df" stroke="#1a1a1a" stroke-width="1"/>';
    return '<svg class="court-half-svg" viewBox="0 0 80 54">' +
      '<rect x="2" y="2" width="76" height="52" fill="#f7f2e4" rx="2"/>' +
      weapon +
      hat +
      '<ellipse cx="40" cy="34" rx="8.5" ry="9.5" fill="#f4cfa8" stroke="#1a1a1a" stroke-width="1.2"/>' +
      '<circle cx="37" cy="33" r="1.1" fill="#1a1a1a"/><circle cx="43" cy="33" r="1.1" fill="#1a1a1a"/>' +
      '<path d="M37 38 Q40 40 43 38" fill="none" stroke="#8a4b32" stroke-width="1.1"/>' +
      (rank === 13 ? '<path d="M32 37 Q40 46 48 37 L46 44 L34 44 Z" fill="#d8dde4" stroke="#1a1a1a" stroke-width="1"/>' : '') +
      '<path d="M20 54 L25 44 L55 44 L60 54 Z" fill="' + robe + '" stroke="#1a1a1a" stroke-width="1.2"/>' +
      '<path d="M31 44 L40 54 L49 44" fill="' + trim + '" stroke="#1a1a1a" stroke-width="1"/>' +
      '<path d="M24 54 L32 45 M56 54 L48 45" stroke="' + navy + '" stroke-width="2.4"/>' +
      '</svg>';
  }

  function courtHTML(rank, s) {
    const half = courtHalfSVG(rank, s);
    return '' +
      '<div class="court">' +
        '<div class="court-suit-tl">' + suitSVG(s) + '</div>' +
        '<div class="court-half top">' + half + '</div>' +
        '<div class="court-divider"></div>' +
        '<div class="court-half bot">' + half + '</div>' +
        '<div class="court-suit-br">' + suitSVG(s) + '</div>' +
        '<div class="court-frame"></div>' +
      '</div>';
  }

  function aceHTML(s) {
    return '<div class="ace-art">' + suitSVG(s) + '<span class="ace-label">REAL HOLDEM</span></div>';
  }

  /**
   * 카드 DOM 생성
   * @param {object} card {r,s} | null(뒷면 고정)
   * @param {object} opt {faceDown:boolean, skin:string, idx:number}
   */
  function cardEl(card, opt) {
    opt = opt || {};
    const el = document.createElement('div');
    el.className = 'card';
    if (opt.skin) el.dataset.skin = opt.skin;
    if (!card) {
      el.classList.add('card-empty');
      return el;
    }
    const red = (card.s === 1 || card.s === 2);
    el.dataset.suit = 'shdc'[card.s];
    el.dataset.rank = R[card.r];
    el.classList.add(red ? 'is-red' : 'is-black');
    if (opt.faceDown) el.classList.add('is-down');

    const corner = '<span class="corner"><b>' + R[card.r] + '</b>' + suitSVG(card.s) + '</span>';
    let inner = '';
    if (card.r === 14) inner = aceHTML(card.s);
    else if (card.r >= 11) inner = courtHTML(card.r, card.s);
    else inner = '<div class="pip-field">' + pipHTML(card.r, card.s) + '</div>';

    el.innerHTML =
      '<div class="card-body">' +
        '<div class="paper"></div>' +
        '<div class="card-edge"></div>' +
        corner +
        '<span class="corner br"><b>' + R[card.r] + '</b>' + suitSVG(card.s) + '</span>' +
        inner +
        '<div class="card-gloss"></div>' +
      '</div>' +
      '<div class="card-lid"><div class="lid-art"></div></div>';
    return el;
  }

  /* ------------------------------------------------------------------ 칩 */

  const CHIP_DENOMS = [500, 100, 25, 5, 1];
  const CHIP_CLASS = { 1: 'c1', 5: 'c5', 25: 'c25', 100: 'c100', 500: 'c500' };

  function chipEl(denom, size) {
    const d = document.createElement('div');
    d.className = 'chip ' + (CHIP_CLASS[denom] || 'c1');
    d.style.setProperty('--sz', (size || 26) + 'px');
    d.innerHTML = '<span>' + (denom >= 1000 ? (denom / 1000) + 'K' : denom) + '</span>';
    return d;
  }

  /** 금액을 칩 스택 DOM 으로 (최대 8개) */
  function chipStack(amount, size) {
    const wrap = document.createElement('div');
    wrap.className = 'chip-stack';
    wrap.style.setProperty('--sz', (size || 24) + 'px');
    let left = amount, count = 0;
    const fly = document.createElement('div');
    fly.className = 'chip-fly';
    for (let i = 0; i < CHIP_DENOMS.length && left > 0 && count < 8; i++) {
      const den = CHIP_DENOMS[i];
      const n = Math.min(Math.floor(left / den), 3);
      for (let k = 0; k < n && count < 8; k++) {
        const c = chipEl(den, size || 24);
        c.style.setProperty('--i', count);
        c.classList.add('stacked');
        c.style.bottom = (count * 3.2) + 'px';
        c.style.left = (Math.random() * 3 - 1.5) + 'px';
        fly.appendChild(c);
        count++;
      }
      left -= n * den;
    }
    if (count === 0) { const c = chipEl(1, size || 24); c.style.bottom = '0'; fly.appendChild(c); }
    wrap.appendChild(fly);
    const lab = document.createElement('div');
    lab.className = 'chip-label';
    lab.textContent = fmt(amount);
    wrap.appendChild(lab);
    return wrap;
  }

  function fmt(n) {
    n = Math.round(n || 0);
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
    if (Math.abs(n) >= 10000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
    return n.toLocaleString('ko-KR');
  }

  global.Cards = {
    cardEl: cardEl, chipEl: chipEl, chipStack: chipStack, fmt: fmt,
    suitSVG: suitSVG, SUIT_PATH: SUIT_PATH, CHIP_DENOMS: CHIP_DENOMS
  };
})(window);
