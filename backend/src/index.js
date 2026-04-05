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
const { stmts }      = require('./db/database');
const apiRouter      = require('./routes/api');
const { GameEngine } = require('./game/game-engine');

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

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, '../data') }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.use(passport.initialize());
app.use(passport.session());

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
  rooms.set(roomId, { id: roomId, name, engine, createdBy });
  console.log(`[Room ${roomId}] "${name}" created`);
  return rooms.get(roomId);
}

createRoom(1, 'Main Hall');   // permanent default lobby

app.set('io', io);
app.set('rooms', rooms);
app.set('createRoom', createRoom);

// ── Socket.io ──────────────────────────────────────────────────────────────
io.on('connection', socket => {
  const defaultRoomId = 1;
  socket.join(`table:${defaultRoomId}`);
  socket.data.roomId = defaultRoomId;
  console.log(`[Socket] ${socket.id} connected → room ${defaultRoomId} (${io.sockets.sockets.size} total)`);

  // Send current game state for the room the client joined
  const room = rooms.get(defaultRoomId);
  if (room) socket.emit('game:status', room.engine.getStatus());

  // Client asks to switch rooms
  socket.on('room:join', ({ roomId }) => {
    const target = rooms.get(roomId);
    if (!target) return socket.emit('room:error', { error: 'Room not found' });
    const prev = socket.data.roomId;
    socket.leave(`table:${prev}`);
    socket.join(`table:${roomId}`);
    socket.data.roomId = roomId;
    socket.emit('game:status', target.engine.getStatus());
    console.log(`[Socket] ${socket.id} room ${prev} → ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] ${socket.id} disconnected`);
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🦞 Lobster Poker backend running on http://localhost:${PORT}`);
  console.log(`   Frontend:  ${CLIENT_URL}`);
  console.log(`   OAuth configured: Google=${!!process.env.GOOGLE_CLIENT_ID} GitHub=${!!process.env.GITHUB_CLIENT_ID} Discord=${!!process.env.DISCORD_CLIENT_ID} Twitter=${!!process.env.TWITTER_CONSUMER_KEY}\n`);
});
