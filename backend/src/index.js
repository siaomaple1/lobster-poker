'use strict';

require('dotenv').config();

const express        = require('express');
const http           = require('http');
const cors           = require('cors');
const session        = require('express-session');
const passport       = require('passport');
const { Server }     = require('socket.io');
const SQLiteStore    = require('connect-sqlite3')(session);
const path           = require('path');
const fs             = require('fs');

const rateLimit      = require('express-rate-limit');
const { stmts }              = require('./db/database');
const apiRouter              = require('./routes/api');
const { GameEngine, AI_MODELS } = require('./game/game-engine');
const { encrypt, isEncrypted, resolveStoredSecret } = require('./utils/crypto');

const PORT       = process.env.PORT || 3001;
const BASE_URL   = process.env.BASE_URL   || `http://localhost:${PORT}`;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const SESSION_SECRET = process.env.SESSION_SECRET;

if (process.env.NODE_ENV === 'production' && !SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production');
}
if (!SESSION_SECRET) {
  console.warn('[Config] SESSION_SECRET is not set. Using a development fallback only.');
}

console.log(`[Config] BASE_URL=${BASE_URL} CLIENT_URL=${CLIENT_URL}`);
console.log(`[Config] GOOGLE_CLIENT_ID=${process.env.GOOGLE_CLIENT_ID ? 'set' : 'MISSING'}`);

// ── Passport strategies ────────────────────────────────────────────────────
const GoogleStrategy  = require('passport-google-oauth20').Strategy;
const GitHubStrategy  = require('passport-github2').Strategy;
const DiscordStrategy = require('passport-discord').Strategy;
const TwitterStrategy = require('passport-twitter').Strategy;

function makeStrategy(Strategy, provider, options, profileMapper) {
  return new Strategy(
    { ...options, callbackURL: `${BASE_URL}/auth/${provider}/callback`, passReqToCallback: false },
    (_at, _rt, profile, done) => {
      try {
        const mapped = profileMapper(profile);
        const user = stmts.upsertUser.get(mapped);
        done(null, user);
      } catch (err) {
        done(err);
      }
    }
  );
}

if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(makeStrategy(
    GoogleStrategy, 'google',
    { clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET },
    p => ({
      provider:     'google',
      provider_id:  p.id,
      username:     p.emails?.[0]?.value?.split('@')[0] || p.displayName,
      display_name: p.displayName,
      avatar:       p.photos?.[0]?.value || null,
    })
  ));
}

if (process.env.GITHUB_CLIENT_ID) {
  passport.use(makeStrategy(
    GitHubStrategy, 'github',
    { clientID: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET },
    p => ({
      provider:     'github',
      provider_id:  String(p.id),
      username:     p.username,
      display_name: p.displayName || p.username,
      avatar:       p.photos?.[0]?.value || null,
    })
  ));
}

if (process.env.DISCORD_CLIENT_ID) {
  passport.use(makeStrategy(
    DiscordStrategy, 'discord',
    { clientID: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET,
      scope: ['identify', 'email'] },
    p => ({
      provider:     'discord',
      provider_id:  p.id,
      username:     p.username,
      display_name: p.global_name || p.username,
      avatar:       p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png` : null,
    })
  ));
}

if (process.env.TWITTER_CONSUMER_KEY) {
  passport.use(makeStrategy(
    TwitterStrategy, 'twitter',
    { consumerKey: process.env.TWITTER_CONSUMER_KEY, consumerSecret: process.env.TWITTER_CONSUMER_SECRET },
    p => ({
      provider:     'twitter',
      provider_id:  p.id,
      username:     p.username,
      display_name: p.displayName,
      avatar:       p.photos?.[0]?.value?.replace('_normal', '') || null,
    })
  ));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = stmts.getUserById.get(id);
  done(null, user || false);
});

// require authRouter AFTER passport strategies are registered
const authRouter = require('./routes/auth');

// ── App ────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: CLIENT_URL, credentials: true },
});

app.set('trust proxy', 1); // Railway / reverse proxy HTTPS termination
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

// ── Rate limiting ──────────────────────────────────────────────────────────
app.use('/auth/', rateLimit({ windowMs: 60_000, max: 20,  message: { error: 'Too many requests' }, standardHeaders: true, legacyHeaders: false }));
app.use('/api/bets', rateLimit({ windowMs: 60_000, max: 30,  message: { error: 'Too many requests' }, standardHeaders: true, legacyHeaders: false }));
app.use('/api/',     rateLimit({ windowMs: 60_000, max: 200, message: { error: 'Too many requests' }, standardHeaders: true, legacyHeaders: false }));

// Ensure session store directory exists
fs.mkdirSync(path.join(__dirname, '../data'), { recursive: true });

const sessionMiddleware = session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, '../data') }),
  secret: SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// Share session + passport with Socket.io so socket.request.user is available
io.engine.use(sessionMiddleware);
io.engine.use(passport.initialize());
io.engine.use(passport.session());

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/api', apiRouter);

app.get('/health', (_, res) => res.json({ ok: true }));

// ── Serve frontend build (production) ──────────────────────────────────────
const publicDir = path.join(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (_, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

// ── Rooms ──────────────────────────────────────────────────────────────────
const rooms = new Map();

function createRoom(roomId, name, createdBy = null) {
  const engine = new GameEngine(io, roomId);
  rooms.set(roomId, { id: roomId, name, engine, createdBy, lobby: new Map() });
  console.log(`[Room ${roomId}] "${name}" created`);
  return rooms.get(roomId);
}

// ── Lobby helpers ───────────────────────────────────────────────────────────
function buildUserKeys(userId) {
  const rows = stmts.getAllApiKeys.all(userId);
  const keys = {};
  for (const row of rows) {
    const plain = resolveStoredSecret(row.api_key);
    if (plain) keys[row.model] = plain;
  }
  return keys;
}

function removeFromLobby(room, socketId) {
  for (const [userId, entry] of room.lobby) {
    if (entry.socketId === socketId) {
      clearTimeout(entry.timer);
      room.lobby.delete(userId);
      return;
    }
  }
}

function lobbySnapshot(room) {
  return [...room.lobby.values()].map(e => ({
    id:       e.user.id,
    username: e.user.lobster_name || e.user.display_name || e.user.username,
    avatar:   e.user.avatar,
    ready:    e.ready,
    joinedAt: e.joinedAt,
    models:   Object.keys(e.keys),
  }));
}

function emitLobby(room) {
  io.to(`table:${room.id}`).emit('room:lobby', { players: lobbySnapshot(room) });
}

function hasReadyOpenClaw(room, readyEntries) {
  const agentUserId = room?.engine?.agentSocket?.data?.agentUser?.id;
  return Boolean(room?.engine?.agentSocket?.connected && agentUserId && readyEntries.some((entry) => entry.user.id === agentUserId));
}

function checkAutoStart(room) {
  if (room.engine.running) return;
  const readyEntries = [...room.lobby.values()].filter(e => e.ready);
  console.log(`[Room ${room.id}] checkAutoStart: ${readyEntries.length} ready entries`);
  if (readyEntries.length < 2) return;

  // Build seat pool from ready players' keys.
  // Each player contributes their own seat slots. Same model across players
  // gets unique seat IDs: deepseek, deepseek_2, deepseek_3 ...
  const seatKeys     = {}; // { seatId: apiKey }
  const seatOwnerMap = {}; // { seatId: ownerName }  (#7)
  const modelCount   = {}; // { baseModel: occurrences }

  for (const entry of readyEntries) {
    const ownerName = entry.user.display_name || entry.user.username;
    for (const [model, key] of Object.entries(entry.keys)) {
      modelCount[model] = (modelCount[model] || 0) + 1;
      const seatId = modelCount[model] === 1 ? model : `${model}_${modelCount[model]}`;
      seatKeys[seatId]     = key;
      seatOwnerMap[seatId] = ownerName;
    }
  }

  const seatIds = Object.keys(seatKeys);
  const effectiveSeatCount = seatIds.length + (hasReadyOpenClaw(room, readyEntries) ? 1 : 0);
  console.log(`[Room ${room.id}] checkAutoStart: ${effectiveSeatCount} playable seats:`, seatIds);

  if (effectiveSeatCount < 2) {
    io.to(`table:${room.id}`).emit('room:lobby_error', {
      error: 'Not enough playable seats. Add model keys, connect OpenClaw, or use Test Mode.',
    });
    return;
    io.to(`table:${room.id}`).emit('room:lobby_error', {
      error: 'Not enough API keys — add at least 2 AI model keys in Settings to start.',
    });
    return;
  }

  // Save player IDs for auto-requeue after game ends (#4)
  const readyUserIds = readyEntries.map(e => e.user.id);

  const createdBy = readyEntries[0].user.id;
  for (const entry of room.lobby.values()) clearTimeout(entry.timer);
  room.lobby.clear();
  io.to(`table:${room.id}`).emit('room:lobby', { players: [] });

  room.engine.apiKeys = seatKeys;
  room.engine.start(createdBy, seatIds, seatOwnerMap)
    .then(() => rebuildLobby(room, readyUserIds))
    .catch(err => {
      console.error(`[Room ${room.id}] Engine error:`, err);
      io.to(`table:${room.id}`).emit('room:lobby_error', { error: 'Failed to start game. Please try again.' });
      emitLobby(room);
    });
}

// After game ends: re-seat players who were in the previous game + re-seat agent (#1 #4)
function rebuildLobby(room, requeueUserIds = []) {
  if (requeueUserIds.length > 0) {
    const socketsInRoom = io.sockets.adapter.rooms.get(`table:${room.id}`);
    if (socketsInRoom) {
      for (const socketId of socketsInRoom) {
        const s = io.sockets.sockets.get(socketId);
        if (!s?.request.user) continue;
        if (!requeueUserIds.includes(s.request.user.id)) continue;
        const u = s.request.user;
        const keys = buildUserKeys(u.id);
        if (Object.keys(keys).length === 0) continue;
        room.lobby.set(u.id, {
          user: u, ready: true, keys, timer: null,
          socketId: s.id, joinedAt: Date.now(),
        });
      }
    }
  }
  // Re-seat OpenClaw agent if still connected (#1)
  if (room.engine.agentSocket?.connected) {
    const u = room.engine.agentSocket.data?.agentUser;
    if (u) {
      const keys = buildUserKeys(u.id);
      room.lobby.set(u.id, {
        user: u, ready: true, keys, timer: null,
        socketId: room.engine.agentSocket.id, joinedAt: Date.now(),
      });
    }
  }
  emitLobby(room);
}

createRoom(1, 'Main Hall');   // permanent default lobby

app.set('io', io);
app.set('rooms', rooms);
app.set('createRoom', createRoom);

function parseAgentToken(socket) {
  const token = socket.handshake.auth?.agentToken;
  if (typeof token !== 'string') return null;
  return token.trim() || null;
}

function validateIncomingAgentAction(payload) {
  const action = String(payload?.action || '').trim().toLowerCase();
  const result = { action };
  if (payload?.raiseTotal !== undefined) {
    result.raiseTotal = Math.floor(Number(payload.raiseTotal));
  }
  return result;
}

// ── Agent sockets: token-based auth bypass ─────────────────────────────────
// Agent sockets identify via auth.agentToken instead of session cookie
io.use((socket, next) => {
  const token = parseAgentToken(socket);
  if (!token) return next(); // regular browser client — session auth applies
  const user = stmts.getUserByAgentToken.get(token);
  if (!user) return next(new Error('Invalid agent token'));
  socket.data.agentUser = user;
  socket.data.isAgent   = true;
  next();
});

function emitOnlineCount() {
  io.emit('server:online', { count: io.sockets.sockets.size });
}

// ── Socket.io ──────────────────────────────────────────────────────────────
io.on('connection', socket => {
  const defaultRoomId = 1;
  socket.join(`table:${defaultRoomId}`);
  socket.data.roomId = defaultRoomId;
  console.log(`[Socket] ${socket.id} connected → room ${defaultRoomId} (${io.sockets.sockets.size} total)`);
  emitOnlineCount();

  // Send current game state for the room the client joined
  const room = rooms.get(defaultRoomId);
  if (room) {
    socket.emit('game:status', room.engine.getStatus());
    socket.emit('room:lobby', { players: lobbySnapshot(room) });
  }

  // ── Agent: sit at table ───────────────────────────────────────────────────
  if (socket.data.isAgent) {
    console.log(`[Agent] ${socket.data.agentUser.username} connected`);
    socket.on('agent:sit', ({ roomId = 1 } = {}) => {
      const r = rooms.get(roomId);
      if (!r) return socket.emit('agent:error', { error: 'Room not found' });
      if (r.engine.running) return socket.emit('agent:error', { error: 'Game already running' });
      const prevRoom = rooms.get(socket.data.roomId);
      if (prevRoom && prevRoom.id !== roomId) {
        if (prevRoom.engine.agentSocket?.id === socket.id) prevRoom.engine.agentSocket = null;
        removeFromLobby(prevRoom, socket.id);
        socket.leave(`table:${prevRoom.id}`);
        emitLobby(prevRoom);
      }
      const previousAgentSocket = r.engine.agentSocket;
      if (previousAgentSocket?.id && previousAgentSocket.id !== socket.id) {
        previousAgentSocket.emit('agent:error', { error: 'This agent session was replaced by a newer connection.' });
        previousAgentSocket.disconnect(true);
      }
      socket.join(`table:${roomId}`);
      socket.data.roomId = roomId;
      r.engine.agentSocket = socket;
      socket.emit('agent:seated', { roomId, username: socket.data.agentUser.username });
      socket.emit('game:status', r.engine.getStatus());
      socket.emit('room:lobby', { players: lobbySnapshot(r) });
      // Add to lobby as ready
      const u = socket.data.agentUser;
      const keys = buildUserKeys(u.id);
      if (r.lobby.has(u.id)) clearTimeout(r.lobby.get(u.id).timer);
      r.lobby.set(u.id, { user: u, ready: true, keys, timer: null, socketId: socket.id, joinedAt: Date.now() });
      emitLobby(r);
      checkAutoStart(r);
    });
    socket.on('agent:action', ({ action, raiseTotal }) => {
      const r = rooms.get(socket.data.roomId || 1);
      if (!r?.engine?.pendingAgentResolve) return;
      if (r.engine.agentSocket?.id !== socket.id) {
        return socket.emit('agent:error', { error: 'This connection is not the active OpenClaw seat.' });
      }
      r.engine.pendingAgentResolve(validateIncomingAgentAction({ action, raiseTotal }));
      r.engine.pendingAgentResolve = null;
    });
    socket.on('disconnect', () => {
      const r = rooms.get(socket.data.roomId);
      if (r) {
        if (r.engine.agentSocket?.id === socket.id) r.engine.agentSocket = null;
        removeFromLobby(r, socket.id);
        emitLobby(r);
      }
      emitOnlineCount();
      console.log(`[Agent] ${socket.data.agentUser.username} disconnected`);
    });
    return; // agent sockets don't go through the normal flow below
  }

  // Client asks to switch rooms
  socket.on('room:join', ({ roomId }) => {
    const target = rooms.get(roomId);
    if (!target) return socket.emit('room:error', { error: 'Room not found' });
    const prev = socket.data.roomId;

    // Remove from old room lobby
    const prevRoom = rooms.get(prev);
    if (prevRoom && prev !== roomId) {
      removeFromLobby(prevRoom, socket.id);
      emitLobby(prevRoom);
    }

    socket.leave(`table:${prev}`);
    socket.join(`table:${roomId}`);
    socket.data.roomId = roomId;
    socket.emit('game:status', target.engine.getStatus());
    emitLobby(target);
    console.log(`[Socket] ${socket.id} room ${prev} → ${roomId}`);
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  socket.on('chat:send', ({ message }) => {
    const user = socket.request.user;
    if (!user || !message?.trim()) return;
    const msg = {
      userId:   user.id,
      username: user.display_name || user.username,
      avatar:   user.avatar || null,
      message:  message.trim().slice(0, 300),
      ts:       Date.now(),
    };
    io.to(`table:${socket.data.roomId}`).emit('chat:message', msg);
  });

  // Player explicitly takes a seat
  socket.on('seat:take', () => {
    const r = rooms.get(socket.data.roomId);
    if (!r || r.engine.running) return;
    const u = socket.request.user;
    if (!u) return socket.emit('seat:error', { error: 'Please sign in first' });

    const keys = buildUserKeys(u.id);
    if (Object.keys(keys).length === 0) {
      return socket.emit('seat:error', { error: 'Please go to Settings and add your API key first' });
    }

    if (r.lobby.has(u.id)) {
      const entry = r.lobby.get(u.id);
      clearTimeout(entry.timer);
      entry.ready = true;
      entry.keys = keys; // refresh keys in case user added new API keys since joining
    } else {
      r.lobby.set(u.id, { user: u, ready: true, keys, timer: null, socketId: socket.id, joinedAt: Date.now() });
    }
    emitLobby(r);
    checkAutoStart(r);
  });

  // Player leaves their seat
  socket.on('seat:leave', () => {
    const r = rooms.get(socket.data.roomId);
    if (!r || r.engine.running) return;
    const u = socket.request.user;
    if (!u) return;
    const entry = r.lobby.get(u.id);
    if (entry) { clearTimeout(entry.timer); r.lobby.delete(u.id); emitLobby(r); }
  });

  socket.on('disconnect', () => {
    const r = rooms.get(socket.data.roomId);
    if (r) { removeFromLobby(r, socket.id); emitLobby(r); }
    emitOnlineCount();
    console.log(`[Socket] ${socket.id} disconnected`);
  });
});

// ── Migrate plaintext API keys → encrypted ─────────────────────────────────
(function migrateApiKeys() {
  try {
    const { db } = require('./db/database');
    const allKeys = db.prepare('SELECT id, api_key FROM user_api_keys').all();
    const update  = db.prepare('UPDATE user_api_keys SET api_key = ? WHERE id = ?');
    let migrated = 0;
    for (const row of allKeys) {
      if (!isEncrypted(row.api_key)) {
        update.run(encrypt(row.api_key), row.id);
        migrated++;
      }
    }
    if (migrated > 0) console.log(`[Crypto] Migrated ${migrated} plaintext API key(s) → encrypted`);
  } catch (e) {
    console.error('[Crypto] Migration error:', e.message);
  }
})();

// ── Start ──────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🦞 Lobster Poker backend running on http://localhost:${PORT}`);
  console.log(`   Frontend:  ${CLIENT_URL}`);
  console.log(`   OAuth configured: Google=${!!process.env.GOOGLE_CLIENT_ID} GitHub=${!!process.env.GITHUB_CLIENT_ID} Discord=${!!process.env.DISCORD_CLIENT_ID} Twitter=${!!process.env.TWITTER_CONSUMER_KEY}\n`);
});
