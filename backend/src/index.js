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

const PORT       = process.env.PORT || 3001;
const BASE_URL   = process.env.BASE_URL   || `http://localhost:${PORT}`;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

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
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
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
  for (const row of rows) keys[row.model] = row.api_key;
  for (const m of AI_MODELS) {
    if (!keys[m] && process.env[`${m.toUpperCase()}_API_KEY`]) {
      keys[m] = process.env[`${m.toUpperCase()}_API_KEY`];
    }
  }
  return keys;
}

function addToLobby(room, socket, user) {
  const keys = buildUserKeys(user.id);
  // Only seat users who have at least one API key — others are spectators
  if (Object.keys(keys).length === 0) return;
  if (room.lobby.has(user.id)) clearTimeout(room.lobby.get(user.id).timer);
  const joinedAt = Date.now();
  const timer = setTimeout(() => {
    const entry = room.lobby.get(user.id);
    if (entry && !entry.ready) {
      entry.ready = true;
      emitLobby(room);
      checkAutoStart(room);
    }
  }, 8000);
  room.lobby.set(user.id, { user, ready: false, keys, timer, socketId: socket.id, joinedAt });
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
    username: e.user.display_name || e.user.username,
    avatar:   e.user.avatar,
    ready:    e.ready,
    joinedAt: e.joinedAt,
    models:   Object.keys(e.keys),
  }));
}

function emitLobby(room) {
  io.to(`table:${room.id}`).emit('room:lobby', { players: lobbySnapshot(room) });
}

function checkAutoStart(room) {
  if (room.engine.running) return;
  const readyEntries = [...room.lobby.values()].filter(e => e.ready);
  if (readyEntries.length < 2) return;

  const mergedKeys = {};
  for (const entry of readyEntries) {
    for (const [model, key] of Object.entries(entry.keys)) {
      if (!mergedKeys[model]) mergedKeys[model] = key;
    }
  }
  const activeModels = AI_MODELS.filter(m => mergedKeys[m]);
  if (activeModels.length < 2) {
    io.to(`table:${room.id}`).emit('room:lobby_error', { error: 'Not enough AI API keys between ready players (need 2+ models)' });
    return;
  }

  const createdBy = readyEntries[0].user.id;
  for (const entry of room.lobby.values()) clearTimeout(entry.timer);
  room.lobby.clear();
  io.to(`table:${room.id}`).emit('room:lobby', { players: [] });

  room.engine.apiKeys = mergedKeys;
  room.engine.start(createdBy, activeModels)
    .then(() => rebuildLobby(room))
    .catch(err => console.error(`[Room ${room.id}] Engine error:`, err));
}

function rebuildLobby(room) {
  const socketsInRoom = io.sockets.adapter.rooms.get(`table:${room.id}`);
  if (!socketsInRoom) return;
  for (const socketId of socketsInRoom) {
    const s = io.sockets.sockets.get(socketId);
    if (s?.request.user) addToLobby(room, s, s.request.user);
  }
  emitLobby(room);
}

createRoom(1, 'Main Hall');   // permanent default lobby

app.set('io', io);
app.set('rooms', rooms);
app.set('createRoom', createRoom);

// ── Agent sockets: token-based auth bypass ─────────────────────────────────
// Agent sockets identify via ?agentToken= query param instead of session cookie
io.use((socket, next) => {
  const token = socket.handshake.auth?.agentToken || socket.handshake.query?.agentToken;
  if (!token) return next(); // regular browser client — session auth applies
  const user = stmts.getUserByAgentToken.get(token);
  if (!user) return next(new Error('Invalid agent token'));
  socket.data.agentUser = user;
  socket.data.isAgent   = true;
  next();
});

// ── Socket.io ──────────────────────────────────────────────────────────────
io.on('connection', socket => {
  const defaultRoomId = 1;
  socket.join(`table:${defaultRoomId}`);
  socket.data.roomId = defaultRoomId;
  console.log(`[Socket] ${socket.id} connected → room ${defaultRoomId} (${io.sockets.sockets.size} total)`);

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
      if (r?.engine?.pendingAgentResolve) {
        r.engine.pendingAgentResolve({ action, raiseTotal });
        r.engine.pendingAgentResolve = null;
      }
    });
    socket.on('disconnect', () => {
      const r = rooms.get(socket.data.roomId);
      if (r) {
        if (r.engine.agentSocket?.id === socket.id) r.engine.agentSocket = null;
        removeFromLobby(r, socket.id);
        emitLobby(r);
      }
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

    // Add to new room lobby if authenticated and game not running
    const user = socket.request.user;
    if (user && !target.engine.running) {
      addToLobby(target, socket, user);
    }
    emitLobby(target);
    console.log(`[Socket] ${socket.id} room ${prev} → ${roomId}`);
  });

  // Client signals ready
  socket.on('room:ready', () => {
    const r = rooms.get(socket.data.roomId);
    if (!r || r.engine.running) return;
    const u = socket.request.user;
    if (!u) return;
    const entry = r.lobby.get(u.id);
    if (!entry || entry.ready) return;
    clearTimeout(entry.timer);
    entry.ready = true;
    emitLobby(r);
    checkAutoStart(r);
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
    if (!u) return socket.emit('seat:error', { error: '请先登录' });

    const keys = buildUserKeys(u.id);
    if (Object.keys(keys).length === 0) {
      return socket.emit('seat:error', { error: '请先去 Settings 页面填入你的 API Key' });
    }

    if (r.lobby.has(u.id)) {
      const entry = r.lobby.get(u.id);
      clearTimeout(entry.timer);
      entry.ready = true;
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
    console.log(`[Socket] ${socket.id} disconnected`);
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🦞 Lobster Poker backend running on http://localhost:${PORT}`);
  console.log(`   Frontend:  ${CLIENT_URL}`);
  console.log(`   OAuth configured: Google=${!!process.env.GOOGLE_CLIENT_ID} GitHub=${!!process.env.GITHUB_CLIENT_ID} Discord=${!!process.env.DISCORD_CLIENT_ID} Twitter=${!!process.env.TWITTER_CONSUMER_KEY}\n`);
});
