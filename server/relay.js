/**
 * REAL HOLDEM POKER — 초경량 WebSocket 릴레이 서버
 * 외부 패키지 의존성 없음 (Node 18+). 방 코드 단위로 메시지를 중계만 한다.
 *
 *   node server/relay.js            # 기본 8080
 *   PORT=9000 node server/relay.js
 *
 * 접속:  wss://도메인/?room=1234&id=abcd&role=host|client&name=이름
 * 메시지: { "to": "host"|"*"|"<peerId>", "msg": {...} }
 *         서버가 { "from": "<peerId>", "msg": {...} } 로 감싸 전달한다.
 *         제어 메시지는 { "from": "server", "msg": { "t": "peerJoin" | "peerLeave" | "error" } }
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_FRAME = 2 * 1024 * 1024;

/** code -> { host: Conn, clients: Map<id, Conn> } */
const rooms = new Map();

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

function frame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let head;
  if (len < 126) {
    head = Buffer.alloc(2);
    head[0] = 0x81; head[1] = len;
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81; head[1] = 126; head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81; head[1] = 127;
    head.writeUInt32BE(Math.floor(len / 4294967296), 2);
    head.writeUInt32BE(len >>> 0, 6);
  }
  return Buffer.concat([head, payload]);
}

function Conn(socket, meta) {
  this.socket = socket;
  this.meta = meta;              // {room, id, role, name}
  this.buf = Buffer.alloc(0);
  this.frag = [];
  this.fragOp = 0;
  this.alive = true;
  this.lastPong = Date.now();
}

Conn.prototype.sendJSON = function (obj) {
  if (!this.alive || this.socket.destroyed) return;
  try { this.socket.write(frame(JSON.stringify(obj))); } catch (e) { this.close(); }
};

Conn.prototype.ctrl = function (msg) {
  this.sendJSON({ from: 'server', msg: msg });
};

Conn.prototype.close = function () {
  this.alive = false;
  try { this.socket.end(); } catch (e) {}
  detach(this);
};

/* ------------------------------------------------------------- 프레임 파서 */

function parseFrames(conn) {
  let buf = conn.buf;
  for (;;) {
    if (buf.length < 2) break;
    const b0 = buf[0], b1 = buf[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) break;
      len = buf.readUInt16BE(2); offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) break;
      const hi = buf.readUInt32BE(2), lo = buf.readUInt32BE(6);
      len = hi * 4294967296 + lo; offset = 10;
    }
    if (len > MAX_FRAME) { conn.close(); return; }
    const maskKey = masked ? buf.slice(offset, offset + 4) : null;
    if (masked) offset += 4;
    if (buf.length < offset + len) break;
    const data = Buffer.from(buf.slice(offset, offset + len));
    if (masked) for (let i = 0; i < data.length; i++) data[i] ^= maskKey[i % 4];
    buf = buf.slice(offset + len);

    if (opcode === 0x8) { conn.close(); return; }
    if (opcode === 0x9) {
      try {
        const pong = Buffer.from([0x8a, data.length]);
        conn.socket.write(Buffer.concat([pong, data]));
      } catch (e) {}
      continue;
    }
    if (opcode === 0xa) { conn.lastPong = Date.now(); continue; }

    if (opcode === 0x0) {
      conn.frag.push(data);
      if (fin) {
        const full = Buffer.concat(conn.frag).toString('utf8');
        conn.frag = [];
        handleText(conn, full);
      }
      continue;
    }
    if (opcode === 0x1) {
      if (!fin) { conn.frag = [data]; continue; }
      handleText(conn, data.toString('utf8'));
    }
  }
  conn.buf = buf;
}

function handleText(conn, text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return; }
  if (!m || typeof m !== 'object') return;
  const room = rooms.get(conn.meta.room);
  if (!room) return;

  /* 계정 프로필 동기화 — 방 단위 명부(roster)에 보관하고 전원에게 브로드캐스트.
     (영속 저장은 각 기기의 localStorage, 릴레이는 세션 중 공유만 담당) */
  if (m.msg && m.msg.t === 'accountSync') {
    room.roster = room.roster || new Map();
    const p = m.msg.profile || {};
    room.roster.set(conn.meta.id, {
      id: conn.meta.id, name: conn.meta.name,
      nick: p.nick || conn.meta.name, tier: p.tier || null,
      chips: Number(p.chips || 0), hands: Number(p.hands || 0), wins: Number(p.wins || 0),
      role: p.role || 'user', at: Date.now()
    });
    const outR = { from: 'server', msg: { t: 'accountSync', roster: [...room.roster.values()] } };
    if (room.host && room.host.alive) room.host.sendJSON(outR);
    room.clients.forEach((c) => c.sendJSON(outR));
    return;
  }

  const to = m.to;
  const out = { from: conn.meta.id, msg: m.msg };

  if (conn.meta.role === 'host') {
    if (to === '*' || to === null || to === undefined) {
      room.clients.forEach((c) => c.sendJSON(out));
    } else {
      const c = room.clients.get(to);
      if (c) c.sendJSON(out);
    }
    return;
  }
  // 클라이언트 → 호스트
  if (room.host && room.host.alive) room.host.sendJSON(out);
}

/* ---------------------------------------------------------------- 방 관리 */

function attach(conn) {
  const { room: code, role, id } = conn.meta;
  let room = rooms.get(code);
  if (!room) { room = { host: null, clients: new Map() }; rooms.set(code, room); }

  if (role === 'host') {
    if (room.host && room.host.alive && room.host.meta.id !== id) {
      conn.ctrl({ t: 'error', message: '이미 같은 코드의 방이 열려 있습니다' });
      try { conn.socket.destroy(); } catch (e) {}
      return;
    }
    room.host = conn;
    conn.ctrl({ t: 'peers', list: [...room.clients.entries()].map(([cid, c]) => ({ id: cid, info: { name: c.meta.name } })) });
  } else {
    room.clients.set(id, conn);
    if (room.host && room.host.alive) {
      room.host.sendJSON({ from: 'server', msg: { t: 'peerJoin', id: id, info: { name: conn.meta.name } } });
    }
    conn.ctrl({ t: 'peers', list: [] });
  }
}

function detach(conn) {
  const { room: code, role, id } = conn.meta;
  const room = rooms.get(code);
  if (!room) return;
  if (role === 'host') {
    if (room.host === conn) {
      room.host = null;
      room.clients.forEach((c) => c.sendJSON({ from: 'server', msg: { t: 'error', message: '호스트가 나갔습니다' } }));
      if (room.clients.size === 0) rooms.delete(code);
    }
  } else {
    if (room.clients.get(id) === conn) room.clients.delete(id);
    if (room.host && room.host.alive) {
      room.host.sendJSON({ from: 'server', msg: { t: 'peerLeave', id: id } });
    }
    if (!room.host && room.clients.size === 0) rooms.delete(code);
  }
}

/* ------------------------------------------------------------------ 서버 */

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (u.pathname === '/roster') {
    const code = (u.searchParams.get('room') || '').slice(0, 8);
    const room = rooms.get(code);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, room: code, roster: room && room.roster ? [...room.roster.values()] : [] }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('REAL HOLDEM relay is running.\nWebSocket: wss://이주소/?room=1234&id=..&role=host\n');
});

server.on('upgrade', (req, socket) => {
  const u = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const room = (u.searchParams.get('room') || '').slice(0, 8);
  const id = (u.searchParams.get('id') || crypto.randomBytes(4).toString('hex')).slice(0, 24);
  const role = u.searchParams.get('role') === 'host' ? 'host' : 'client';
  const name = (u.searchParams.get('name') || 'player').slice(0, 16);
  if (!room) { socket.destroy(); return; }

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n'
  );
  socket.setNoDelay(true);

  const conn = new Conn(socket, { room: room, id: id, role: role, name: name });
  socket.on('data', (d) => {
    conn.buf = Buffer.concat([conn.buf, d]);
    parseFrames(conn);
  });
  socket.on('error', () => conn.close());
  socket.on('close', () => conn.close());
  attach(conn);
});

// 좀비 연결 정리
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room) => {
    const all = [];
    if (room.host) all.push(room.host);
    room.clients.forEach((c) => all.push(c));
    all.forEach((c) => {
      if (now - c.lastPong > 70000) {
        try { c.socket.write(Buffer.from([0x89, 0])); } catch (e) {}
        if (now - c.lastPong > 140000) c.close();
      }
    });
  });
}, 30000).unref();

server.listen(PORT, HOST, () => {
  console.log('REAL HOLDEM relay listening on http://' + HOST + ':' + PORT);
});
