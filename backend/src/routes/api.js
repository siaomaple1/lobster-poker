'use strict';

const express = require('express');
const crypto  = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { stmts, getCoinsForUser, secondsUntilReset } = require('../db/database');
const { AI_MODELS } = require('../game/game-engine');
const { TEST_KEY } = require('../game/ai-player');
const { encrypt, decrypt } = require('../utils/crypto');

const router = express.Router();

// ── Coins ──────────────────────────────────────────────────────────────────
router.get('/coins', requireAuth, (req, res) => {
  const coins = getCoinsForUser(req.user.id);
  const secs  = secondsUntilReset(req.user.id);
  res.json({ coins, secondsUntilReset: secs });
});

// ── API Keys ───────────────────────────────────────────────────────────────
router.get('/api-keys', requireAuth, (req, res) => {
  const rows = stmts.getAllApiKeys.all(req.user.id);
  // Return masked keys
  const result = {};
  for (const row of rows) {
    const k = row.api_key;
    result[row.model] = k.length > 8
      ? k.slice(0, 4) + '••••' + k.slice(-4)
      : '••••••••';
  }
  // Also show which models have NO key set
  for (const m of AI_MODELS) {
    if (!(m in result)) result[m] = null;
  }
  res.json(result);
});

router.put('/api-keys/:model', requireAuth, (req, res) => {
  const { model } = req.params;
  const { apiKey } = req.body;

  if (!AI_MODELS.includes(model)) {
    return res.status(400).json({ error: 'Unknown model' });
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    return res.status(400).json({ error: 'Invalid API key' });
  }

  stmts.upsertApiKey.run(req.user.id, model, encrypt(apiKey.trim()));
  res.json({ ok: true });
});

router.delete('/api-keys/:model', requireAuth, (req, res) => {
  const { model } = req.params;
  stmts.deleteApiKey.run(req.user.id, model);
  res.json({ ok: true });
});

// ── Lobster ────────────────────────────────────────────────────────────────
router.get('/lobster', requireAuth, (req, res) => {
  const row = stmts.getLobster.get(req.user.id);
  res.json(row || { lobster_name: null, lobster_prompt: null, lobster_model: null });
});

router.post('/lobster', requireAuth, (req, res) => {
  const { lobster_name, lobster_prompt, lobster_model } = req.body;
  if (lobster_model && !AI_MODELS.includes(lobster_model)) {
    return res.status(400).json({ error: 'Unknown model' });
  }
  if (lobster_name && lobster_name.trim().length > 20) {
    return res.status(400).json({ error: 'Lobster name must be 20 characters or less' });
  }
  if (lobster_prompt && lobster_prompt.trim().length > 200) {
    return res.status(400).json({ error: 'Personality prompt must be 200 characters or less' });
  }
  stmts.saveLobster.run({
    lobster_name:   lobster_name?.trim()   || null,
    lobster_prompt: lobster_prompt?.trim() || null,
    lobster_model:  lobster_model          || null,
    id: req.user.id,
  });
  res.json({ ok: true });
});

// ── Agent Token ────────────────────────────────────────────────────────────
router.get('/agent-token', requireAuth, (req, res) => {
  const user = stmts.getUserById.get(req.user.id);
  if (user.agent_token) return res.json({ token: user.agent_token });
  const token = crypto.randomBytes(32).toString('hex');
  stmts.setAgentToken.run(token, req.user.id);
  res.json({ token });
});

router.post('/agent-token/refresh', requireAuth, (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  stmts.setAgentToken.run(token, req.user.id);
  res.json({ token });
});

// ── Bets ───────────────────────────────────────────────────────────────────
// gameEngine is injected at app startup (see index.js)
router.post('/bets', requireAuth, (req, res) => {
  const engine = req.app.get('gameEngine');
  if (!engine || !engine.running) {
    return res.status(400).json({ error: 'No active game' });
  }

  const { model, amount } = req.body;
  if (!AI_MODELS.includes(model)) {
    return res.status(400).json({ error: 'Unknown model' });
  }

  const betAmount = Math.floor(Number(amount));
  if (!betAmount || betAmount < 1 || betAmount > 1_000_000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const coins = getCoinsForUser(req.user.id);
  if (coins < betAmount) {
    return res.status(400).json({ error: 'Insufficient coins' });
  }

  // Deduct coins
  const changed = stmts.spendCoins.run(betAmount, req.user.id, betAmount);
  if (changed.changes === 0) {
    return res.status(400).json({ error: 'Insufficient coins' });
  }

  stmts.placeBet.run(req.user.id, engine.gameId, engine.handNumber, model, betAmount);

  res.json({ ok: true, newBalance: coins - betAmount });
});

router.get('/bets/me', requireAuth, (req, res) => {
  const bets = stmts.getUserBets.all(req.user.id);
  res.json(bets);
});

// ── Leaderboard ────────────────────────────────────────────────────────────
router.get('/leaderboard', (req, res) => {
  const rows = stmts.getLeaderboard.all();
  // Ensure all 9 models appear even if they have no stats yet
  const map = Object.fromEntries(rows.map(r => [r.model, r]));
  const result = AI_MODELS.map(m => map[m] || {
    model: m, total_hands: 0, hands_won: 0, win_rate: 0,
  });
  res.json(result);
});

// ── Bug Reports ────────────────────────────────────────────────────────────
router.post('/bug-reports', (req, res) => {
  const { roomId, handNumber, browser, whatHappened, expected } = req.body;
  if (!whatHappened || typeof whatHappened !== 'string' || !whatHappened.trim()) {
    return res.status(400).json({ error: 'Please describe what happened' });
  }
  stmts.insertBugReport.run({
    user_id:       req.user?.id || null,
    username:      req.user?.username || null,
    room_id:       roomId   || null,
    hand_number:   handNumber || null,
    browser:       browser   ? String(browser).slice(0, 300) : null,
    what_happened: String(whatHappened).trim().slice(0, 2000),
    expected:      expected ? String(expected).trim().slice(0, 2000) : null,
  });
  res.json({ ok: true });
});

// ── Rooms ──────────────────────────────────────────────────────────────────
const MAX_ROOMS = 5;

router.get('/rooms', (req, res) => {
  const rooms = req.app.get('rooms');
  const io    = req.app.get('io');
  const list  = [];
  for (const [id, room] of rooms) {
    const watcherCount = io.sockets.adapter.rooms.get(`table:${id}`)?.size || 0;
    list.push({
      id,
      name:         room.name,
      running:      room.engine.running,
      handNumber:   room.engine.handNumber,
      watcherCount,
    });
  }
  res.json(list);
});

router.post('/rooms', requireAuth, (req, res) => {
  const rooms = req.app.get('rooms');
  if (rooms.size >= MAX_ROOMS) {
    return res.status(400).json({ error: `Maximum ${MAX_ROOMS} rooms allowed` });
  }
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Room name required' });
  }
  const roomId     = Math.max(...rooms.keys()) + 1;
  const createRoom = req.app.get('createRoom');
  const room       = createRoom(roomId, name.trim(), req.user.id);
  res.json({ id: room.id, name: room.name });
});

// Shared helper: build API key map for a user
function buildKeys(userId, testMode) {
  const rows = stmts.getAllApiKeys.all(userId);
  const keys = {};
  for (const row of rows) {
    const plain = decrypt(row.api_key) ?? row.api_key; // fallback: plaintext (pre-migration)
    keys[row.model] = plain;
  }
  for (const m of AI_MODELS) {
    if (!keys[m] && process.env[`${m.toUpperCase()}_API_KEY`]) {
      keys[m] = process.env[`${m.toUpperCase()}_API_KEY`];
    }
  }
  if (testMode) {
    for (const m of AI_MODELS) {
      if (!keys[m]) keys[m] = TEST_KEY;
    }
  }
  return keys;
}

router.post('/rooms/:roomId/start', requireAuth, (req, res) => {
  const rooms  = req.app.get('rooms');
  const roomId = parseInt(req.params.roomId, 10);
  const room   = rooms.get(roomId);
  if (!room)               return res.status(404).json({ error: 'Room not found' });
  if (room.engine.running) return res.status(400).json({ error: 'Game already running' });

  const { testMode } = req.body;
  const keys         = buildKeys(req.user.id, testMode);

  // Only seat AI models that have a key; require at least 2
  const activeModels = AI_MODELS.filter(m => keys[m]);
  if (activeModels.length < 2) {
    return res.status(400).json({
      error: 'At least 2 AI models need API keys to start. Add keys in Settings or use Test Mode.',
    });
  }

  room.engine.apiKeys  = keys;
  room.engine.testMode = !!testMode;
  room.engine.start(req.user.id, activeModels)
    .catch(err => console.error(`[Room ${roomId}] Engine error:`, err));

  res.json({ ok: true, testMode: !!testMode, models: activeModels });
});

router.post('/rooms/:roomId/stop', requireAuth, (req, res) => {
  const rooms  = req.app.get('rooms');
  const roomId = parseInt(req.params.roomId, 10);
  const room   = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  room.engine.stop();
  res.json({ ok: true });
});

module.exports = router;
