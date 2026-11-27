/* =============================================================================
 *  REAL HOLDEM POKER — 초보자 튜토리얼 (스킵 가능 · 테이블 위 말풍선 하이라이트)
 * ========================================================================== */
(function (global) {
  'use strict';

  const STEPS = [
    {
      target: '#table-area', pos: 'center', title: '홀덤 테이블에 온 걸 환영해!',
      body: '테이블은 이렇게 생겼어. 가운데 초록 펠트에 <b>커뮤니티 카드 5장</b>이 깔리고, ' +
        '각 자리에 앉은 플레이어가 자기 카드 2장 + 커뮤니티 카드로 <b>최고의 5장</b>을 만드는 게임이야.'
    },
    {
      target: '#board', pos: 'top', title: '① 프리플랍 → ② 플랍 → ③ 턴 → ④ 리버',
      body: '카드는 <b>4단계</b>로 깔려.<br>' +
        '<b>프리플랍</b> 내 카드 2장만 받은 상태 (첫 베팅)<br>' +
        '<b>플랍</b> 커뮤니티 3장 공개<br>' +
        '<b>턴</b> 4번째 카드 · <b>리버</b> 5번째 카드<br>' +
        '매 단계마다 베팅 라운드가 한 번씩 돌아가.'
    },
    {
      target: '#seats', pos: 'bottom', title: '블라인드: SB · BB',
      body: '딜러(D) 왼쪽부터 <b>스몰 블라인드(SB)</b>, 그다음이 <b>빅 블라인드(BB)</b>야. ' +
        '이 두 명이 판돈을 먼저 내서 팟을 만들어줘. 그래서 모두 폴드하면 BB가 그냥 이겨.'
    },
    {
      target: '#hero-cards', pos: 'top', title: '내 카드는 탭해서 오픈!',
      body: '카드를 <b>탭</b>하면 시원하게 뒤집히고, <b>위로 쓸어 올리면</b> 모서리만 살짝 쪼아볼 수 있어(스퀴즈).' +
        ' 내 카드 아래에는 지금 내 최고 족보가 실시간으로 표시돼.'
    },
    {
      target: '#action-bar', pos: 'top', title: '베팅 용어 5개만 알면 끝',
      body: '<b>체크</b> = 베팅 없이 넘기기 · <b>콜</b> = 상대가 건 만큼 맞추기 · ' +
        '<b>레이즈</b> = 더 크게 걸기 · <b>폴드</b> = 이번 판 포기 · <b>올인</b> = 가진 칩 전부.<br>' +
        '레이즈는 슬라이더나 <b>1/2팟 · 팟 · 올인</b> 버튼으로 금방 정할 수 있어.'
    },
    {
      target: '#pot', pos: 'bottom', title: '팟(Pot) = 지금 걸린 판돈',
      body: '모두가 낸 칩이 여기 쌓여. 쇼다운에서 이기면 <b>팟 전부</b>를 가져가. ' +
        '상대가 폴드하면 남은 사람이 바로 팟을 가져가고.'
    },
    {
      target: '#table-area', pos: 'center', title: '족보 순서 (강한 순)',
      body: 'RANK_TABLE'
    }
  ];

  const RANK_ROWS = [
    ['로열 플러시', 'A K Q J 10 같은 무늬', '#ffd166'],
    ['스트레이트 플러시', '같은 무늬 5장 연속', '#ffd166'],
    ['포 카드', '같은 숫자 4장', '#ff9f6b'],
    ['풀 하우스', '트리플 + 원 페어', '#c58cff'],
    ['플러시', '같은 무늬 5장', '#6fc3ff'],
    ['스트레이트', '숫자 5개 연속', '#7bd88f'],
    ['트립스', '같은 숫자 3장', '#a0e07d'],
    ['투 페어', '페어 2개', '#d7e0ea'],
    ['원 페어', '같은 숫자 2장', '#b9c2cc'],
    ['하이 카드', '아무것도 없음', '#8b95a1']
  ];

  const Tutorial = {
    layer: null, steps: [], idx: 0, onDone: null, root: null,

    start(root, opts) {
      this.root = root || document.body;
      this.steps = STEPS;
      this.idx = 0;
      this.onDone = (opts && opts.onDone) || function () {};
      if (!this.layer) this.build();
      this.layer.classList.add('on');
      document.body.classList.add('tut-mode');
      this.show(0);
    },

    build() {
      const l = document.createElement('div');
      l.id = 'tut-layer';
      l.innerHTML =
        '<div class="tut-hole"></div>' +
        '<div class="tut-bubble">' +
          '<div class="tut-step"></div>' +
          '<h4></h4>' +
          '<p></p>' +
          '<div class="tut-actions">' +
            '<button class="tut-skip" type="button">건너뛰기 (Skip)</button>' +
            '<button class="tut-next" type="button">다음 →</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(l);
      this.layer = l;
      const self = this;
      l.querySelector('.tut-next').addEventListener('click', function () { self.next(); });
      l.querySelector('.tut-skip').addEventListener('click', function () { self.finish(); });
      global.addEventListener('resize', function () { if (self.layer.classList.contains('on')) self.position(); });
    },

    show(i) {
      this.idx = i;
      const st = this.steps[i];
      const l = this.layer;
      const bubble = l.querySelector('.tut-bubble');
      const hole = l.querySelector('.tut-hole');
      l.querySelector('.tut-step').textContent = (i + 1) + ' / ' + this.steps.length;
      l.querySelector('h4').textContent = st.title;
      const p = l.querySelector('p');
      if (st.body === 'RANK_TABLE') {
        p.innerHTML = '<div class="rank-table">' + RANK_ROWS.map(function (r) {
          return '<div class="rank-row"><span class="rk" style="color:' + r[2] + '">' + r[0] + '</span><span class="rd">' + r[1] + '</span></div>';
        }).join('') + '</div>';
        bubble.classList.add('wide');
      } else {
        p.innerHTML = st.body;
        bubble.classList.remove('wide');
      }
      l.querySelector('.tut-next').textContent = (i === this.steps.length - 1) ? '시작하기 →' : '다음 →';
      this._st = st;
      this.position();
      global.Sound.tap();
    },

    position() {
      const st = this._st;
      if (!st) return;
      const l = this.layer;
      const bubble = l.querySelector('.tut-bubble');
      const hole = l.querySelector('.tut-hole');
      const target = st.target ? document.querySelector(st.target) : null;
      if (!target) {
        hole.style.width = '0px'; hole.style.height = '0px'; hole.style.opacity = '0';
        bubble.style.left = '50%'; bubble.style.top = '40%';
        bubble.style.transform = 'translate(-50%,-50%)';
        return;
      }
      const r = target.getBoundingClientRect();
      const pad = 8;
      hole.style.opacity = '1';
      hole.style.left = (r.left - pad) + 'px';
      hole.style.top = (r.top - pad) + 'px';
      hole.style.width = (r.width + pad * 2) + 'px';
      hole.style.height = (r.height + pad * 2) + 'px';
      hole.style.borderRadius = st.pos === 'center' ? '24px' : '14px';

      bubble.style.transform = 'none';
      const bw = Math.min(global.innerWidth - 32, 420);
      bubble.style.width = bw + 'px';
      const bh = bubble.offsetHeight || 220;
      let left, top;
      if (st.pos === 'center') {
        left = (global.innerWidth - bw) / 2;
        top = Math.max(20, global.innerHeight * 0.5 - bh / 2);
      } else if (st.pos === 'top') {
        left = Math.max(12, Math.min(global.innerWidth - bw - 12, r.left + r.width / 2 - bw / 2));
        top = r.top - bh - 18;
        if (top < 12) top = Math.min(global.innerHeight - bh - 12, r.bottom + 18);
      } else {
        left = Math.max(12, Math.min(global.innerWidth - bw - 12, r.left + r.width / 2 - bw / 2));
        top = r.bottom + 18;
        if (top + bh > global.innerHeight - 12) top = Math.max(12, r.top - bh - 18);
      }
      bubble.style.left = left + 'px';
      bubble.style.top = top + 'px';
    },

    next() {
      if (this.idx >= this.steps.length - 1) { this.finish(); return; }
      this.show(this.idx + 1);
    },

    finish() {
      if (!this.layer) return;
      this.layer.classList.remove('on');
      document.body.classList.remove('tut-mode');
      const done = this.onDone;
      this.onDone = null;
      global.Sound.tap();
      if (done) done();
    },

    isOn() { return this.layer && this.layer.classList.contains('on'); }
  };

  global.Tutorial = Tutorial;
  global.TUT_RANK_ROWS = RANK_ROWS;
})(window);
