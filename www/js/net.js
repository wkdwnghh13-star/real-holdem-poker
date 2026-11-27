/* =============================================================================
 *  REAL HOLDEM POKER — 네트워크 전송 계층
 *  1) BroadcastChannel  : 같은 브라우저 탭끼리 (테스트/같은 기기)
 *  2) PeerJS(WebRTC)    : 인터넷 P2P, 공용 브로커 (기본)
 *  3) WebSocket 릴레이  : 직접 띄운 server/relay.js 로 우회
 *  모든 어댑터는 동일한 인터페이스:
 *    send(peerId|null, msg) / close()
 *    handlers: onMessage(from, msg) onPeer(id, info) onPeerLeave(id) onStatus(state, detail)
 * ========================================================================== */
(function (global) {
  'use strict';

  function makeId() {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-2);
  }

  /* ------------------------------------------------------- BroadcastChannel */
  function BCAdapter(o) {
    const self = this;
    this.role = o.role; this.id = o.id; this.code = o.code; this.h = o.handlers;
    this.name = o.name || ''; this.title = o.title || null;
    this.alive = true;
    try {
      this.ch = new BroadcastChannel('rholdem-room-' + o.code);
    } catch (e) {
      o.handlers.onStatus('error', 'BroadcastChannel 미지원');
      return;
    }
    this.ch.onmessage = function (ev) {
      const m = ev.data;
      if (!m || m.from === self.id) return;
      if (self.role === 'host') {
        if (m.to !== 'host') return;
        self.h.onMessage(m.from, m.msg, m.meta);
      } else {
        if (m.to !== self.id && m.to !== '*') return;
        if (m.to === '*' && (!m.msg || m.msg.t !== 'hostPing')) return;
        if (!self.seenHost) { self.seenHost = true; self.h.onStatus('open'); }
        self.h.onMessage(m.from, m.msg, m.meta);
      }
    };
    if (this.role === 'client') {
      this.ping();
      this.timer = setInterval(function () { if (self.alive && !self.joined) self.ping(); }, 900);
      o.handlers.onStatus('connecting');
    } else {
      this.timer = setInterval(function () { if (self.alive) self.post('*', { t: 'hostPing', code: self.code }); }, 1000);
      o.handlers.onStatus('open');
      setTimeout(function () { self.post('*', { t: 'hostPing' }); }, 50);
    }
  }
  BCAdapter.prototype.post = function (to, msg) {
    if (!this.ch) return;
    this.ch.postMessage({ from: this.id, to: to, msg: msg });
  };
  BCAdapter.prototype.ping = function () {
    this.post('host', { t: 'joinReq', name: this.name, title: this.title });
  };
  BCAdapter.prototype.send = function (peer, msg) {
    if (this.role === 'host') this.post(peer === null ? '*' : peer, msg);
    else this.post('host', msg);
  };
  BCAdapter.prototype.close = function () {
    this.alive = false;
    clearInterval(this.timer);
    try { this.ch.close(); } catch (e) {}
  };

  /* -------------------------------------------------------------- WebSocket */
  function WSAdapter(o) {
    const self = this;
    this.role = o.role; this.id = o.id; this.code = o.code; this.h = o.handlers;
    const base = (o.url || '').replace(/\/+$/, '');
    const qs = '?room=' + encodeURIComponent(o.code) + '&id=' + encodeURIComponent(o.id) +
      '&role=' + o.role + '&name=' + encodeURIComponent(o.name || '');
    o.handlers.onStatus('connecting');
    try { this.ws = new WebSocket(base + '/' + qs); }
    catch (e) { o.handlers.onStatus('error', 'URL 오류'); return; }
    this.ws.onopen = function () { self.h.onStatus('open'); };
    this.ws.onerror = function () { self.h.onStatus('error', 'relay 연결 실패'); };
    this.ws.onclose = function () { self.h.onStatus('closed'); };
    this.ws.onmessage = function (ev) {
      let d;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (!d) return;
      if (d.from === 'server') {
        const m = d.msg || {};
        if (m.t === 'peerJoin') self.h.onPeer(m.id, m.info || {});
        else if (m.t === 'peerLeave') self.h.onPeerLeave(m.id);
        else if (m.t === 'error') self.h.onStatus('error', m.message || 'server error');
        else if (m.t === 'peers') (m.list || []).forEach(function (p) { self.h.onPeer(p.id, p.info || {}); });
        return;
      }
      self.h.onMessage(d.from, d.msg, d.meta);
    };
  }
  WSAdapter.prototype.send = function (peer, msg) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ to: peer === null ? '*' : peer, msg: msg }));
  };
  WSAdapter.prototype.close = function () { try { this.ws.close(); } catch (e) {} };

  /* ----------------------------------------------------------------- PeerJS */
  function PeerAdapter(o) {
    const self = this;
    this.role = o.role; this.id = o.id; this.code = o.code; this.h = o.handlers;
    this.conns = {};
    if (!global.Peer) { o.handlers.onStatus('error', 'PeerJS 라이브러리 없음'); return; }
    const roomId = 'rholdem-v1-' + String(o.code).toLowerCase();
    o.handlers.onStatus('connecting');

    if (o.role === 'host') {
      this.peer = new global.Peer(roomId, { debug: 0 });
      this.peer.on('open', function () { self.h.onStatus('open', roomId); });
      this.peer.on('error', function (e) {
        if (e && e.type === 'unavailable-id') self.h.onStatus('error', '이미 같은 코드의 방이 열려 있습니다');
        else self.h.onStatus('error', (e && e.type) || 'peer error');
      });
      this.peer.on('connection', function (conn) {
        conn.on('open', function () {
          self.conns[conn.peer] = conn;
          self.h.onPeer(conn.peer, conn.metadata || {});
          self.h.onStatus('open', roomId);
        });
        conn.on('data', function (d) { self.h.onMessage(conn.peer, d); });
        conn.on('close', function () { delete self.conns[conn.peer]; self.h.onPeerLeave(conn.peer); });
        conn.on('error', function () { delete self.conns[conn.peer]; self.h.onPeerLeave(conn.peer); });
      });
    } else {
      this.peer = new global.Peer(undefined, { debug: 0 });
      this.peer.on('error', function (e) {
        self.h.onStatus('error', (e && e.type) || 'peer error');
      });
      this.peer.on('open', function () {
        const conn = self.peer.connect(roomId, { reliable: true, metadata: { name: o.name || '' } });
        self.conn = conn;
        conn.on('open', function () { self.h.onStatus('open', roomId); });
        conn.on('data', function (d) { self.h.onMessage('host', d); });
        conn.on('close', function () { self.h.onStatus('closed'); });
        conn.on('error', function () { self.h.onStatus('error', '연결 오류'); });
      });
    }
    // PeerJS 서버가 응답 없으면 시간 초과
    setTimeout(function () {
      if (!self.peer || self.peer.destroyed) return;
      if (!self.peer.open) {
        try { self.peer.destroy(); } catch (e) {}
        self.h.onStatus('timeout', 'PeerJS 응답 없음');
      }
    }, 9000);
  }
  PeerAdapter.prototype.send = function (peer, msg) {
    if (this.role === 'host') {
      if (peer === null) {
        const conns = this.conns;
        Object.keys(conns).forEach(function (k) { try { conns[k].send(msg); } catch (e) {} });
      } else if (this.conns[peer]) {
        try { this.conns[peer].send(msg); } catch (e) {}
      }
    } else if (this.conn) {
      try { this.conn.send(msg); } catch (e) {}
    }
  };
  PeerAdapter.prototype.close = function () {
    try { Object.keys(this.conns).forEach(function (k) { this.conns[k].close(); }, this); } catch (e) {}
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
  };

  /* ------------------------------------------------------------ 팩토리 */

  function MultiAdapter() { this.list = []; }
  MultiAdapter.prototype.add = function (a) { if (a) this.list.push(a); return a; };
  MultiAdapter.prototype.send = function (peer, msg) {
    this.list.forEach(function (a) { try { a.send(peer, msg); } catch (e) {} });
  };
  MultiAdapter.prototype.close = function () {
    this.list.forEach(function (a) { try { a.close(); } catch (e) {} });
    this.list = [];
  };

  function create(o) {
    // o: {role, code, id, name, transport:'auto'|'bc'|'peer'|'ws', relayUrl, handlers}
    if (o.transport === 'ws') return new WSAdapter(o);
    if (o.transport === 'peer') return new PeerAdapter(o);
    return new BCAdapter(o);
  }

  global.Net = { create: create, makeId: makeId, MultiAdapter: MultiAdapter };
})(window);
