// ═══════════════════════════════════════════════════
//  SECTOR 7 — Multiplayer WebSocket Server
// ═══════════════════════════════════════════════════

const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;

// HTTP server (Railway needs this)
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    game: 'SECTOR 7',
    rooms: Object.keys(rooms).length,
    players: Object.values(rooms).reduce((sum, r) => sum + Object.keys(r.players).length, 0),
  }));
});

const wss = new WebSocket.Server({ server: httpServer });

// rooms[code] = { players: { id: playerState } }
const rooms = {};

function genId() {
  return Math.random().toString(36).substr(2, 9);
}

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(room, msg, excludeId = null) {
  const data = JSON.stringify(msg);
  for (const [id, p] of Object.entries(room.players)) {
    if (id !== excludeId && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(data);
    }
  }
}

wss.on('connection', (ws) => {
  let playerId = null;
  let roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    switch (msg.type) {

      // ── Player joins a room ──────────────────────────
      case 'join': {
        playerId = genId();
        roomCode = (msg.room || 'global').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'global';

        if (!rooms[roomCode]) rooms[roomCode] = { players: {} };
        const room = rooms[roomCode];

        // Limit room to 8 players
        if (Object.keys(room.players).length >= 8) {
          send(ws, { type: 'error', message: 'Room is full (max 8 players)' });
          ws.close();
          return;
        }

        const spawnX = (Math.random() - 0.5) * 10;
        const spawnZ = 24 + (Math.random() - 0.5) * 6;

        // Tell this player their ID and all existing players
        const existing = Object.entries(room.players).map(([id, p]) => ({
          id, name: p.name, x: p.x, y: p.y, z: p.z, ry: p.ry, rx: p.rx, hp: p.hp,
        }));
        send(ws, { type: 'welcome', id: playerId, room: roomCode, players: existing, spawnX, spawnZ });

        // Add player to room
        room.players[playerId] = {
          ws, name: msg.name || 'Soldier',
          x: spawnX, y: 1.7, z: spawnZ,
          ry: 0, rx: 0, hp: 100,
        };

        // Tell others a new player arrived
        broadcast(room, {
          type: 'player_join',
          id: playerId, name: msg.name || 'Soldier',
          x: spawnX, y: 1.7, z: spawnZ,
        }, playerId);

        console.log(`[+] ${msg.name || 'Soldier'} joined room "${roomCode}" (${Object.keys(room.players).length} players)`);
        break;
      }

      // ── Position update ──────────────────────────────
      case 'move': {
        if (!playerId || !roomCode || !rooms[roomCode]) return;
        const p = rooms[roomCode].players[playerId];
        if (!p) return;
        p.x = msg.x; p.y = msg.y; p.z = msg.z;
        p.ry = msg.ry; p.rx = msg.rx;
        // Forward to all others in room
        broadcast(rooms[roomCode], {
          type: 'player_move',
          id: playerId, x: msg.x, y: msg.y, z: msg.z, ry: msg.ry, rx: msg.rx,
        }, playerId);
        break;
      }

      // ── Shoot event (for bullet visuals on other clients) ─
      case 'shoot': {
        if (!playerId || !roomCode || !rooms[roomCode]) return;
        broadcast(rooms[roomCode], {
          type: 'player_shoot',
          id: playerId,
          ox: msg.ox, oy: msg.oy, oz: msg.oz,
          dx: msg.dx, dy: msg.dy, dz: msg.dz,
        }, playerId);
        break;
      }

      // ── Hit another player ───────────────────────────
      case 'hit': {
        if (!playerId || !roomCode || !rooms[roomCode]) return;
        const room = rooms[roomCode];
        const target = room.players[msg.targetId];
        if (!target) return;

        const dmg = Math.min(Math.max(msg.dmg || 0, 0), 100); // clamp 0-100
        target.hp = Math.max(0, target.hp - dmg);

        // Tell the target they were hit
        send(target.ws, { type: 'you_hit', byId: playerId, dmg, hp: target.hp });

        // Tell everyone the player's new HP
        broadcast(room, { type: 'player_hp', id: msg.targetId, hp: target.hp });

        // Handle death
        if (target.hp <= 0) {
          broadcast(room, { type: 'player_die', id: msg.targetId, byId: playerId });
          console.log(`[x] ${target.name} killed by ${room.players[playerId]?.name || '?'}`);

          // Respawn after 5 seconds
          setTimeout(() => {
            if (!rooms[roomCode] || !rooms[roomCode].players[msg.targetId]) return;
            const rx = (Math.random() - 0.5) * 10;
            const rz = 24 + (Math.random() - 0.5) * 6;
            rooms[roomCode].players[msg.targetId].hp = 100;
            rooms[roomCode].players[msg.targetId].x = rx;
            rooms[roomCode].players[msg.targetId].z = rz;
            broadcast(rooms[roomCode], { type: 'player_respawn', id: msg.targetId, x: rx, y: 1.7, z: rz });
          }, 5000);
        }
        break;
      }

      // ── Kill confirmed (score update) ────────────────
      case 'kill': {
        if (!playerId || !roomCode || !rooms[roomCode]) return;
        broadcast(rooms[roomCode], {
          type: 'player_kill', killerId: playerId,
          killerName: rooms[roomCode].players[playerId]?.name || '?',
          victimId: msg.victimId,
          victimName: rooms[roomCode].players[msg.victimId]?.name || '?',
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!playerId || !roomCode || !rooms[roomCode]) return;
    const name = rooms[roomCode].players[playerId]?.name || 'Soldier';
    delete rooms[roomCode].players[playerId];
    broadcast(rooms[roomCode], { type: 'player_leave', id: playerId });
    if (Object.keys(rooms[roomCode].players).length === 0) {
      delete rooms[roomCode];
      console.log(`[-] Room "${roomCode}" closed (empty)`);
    } else {
      console.log(`[-] ${name} left room "${roomCode}" (${Object.keys(rooms[roomCode].players).length} remaining)`);
    }
  });

  ws.on('error', () => {});
});

httpServer.listen(PORT, () => {
  console.log(`SECTOR 7 server running on port ${PORT}`);
});
