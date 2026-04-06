'use strict';

const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { stmts, getCoinsForUser, secondsUntilReset } = require('../db/database');
const { AI_MODELS } = require('../game/game-engine');
const { TEST_KEY } = require('../game/ai-player');
const { encrypt, resolveStoredSecret } = require('../utils/crypto');

const router = express.Router();
const BANNED_PROMPT_TERMS = [
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'motherfucker',
  '傻逼', '傻比', '弱智', '智障', '他妈', '妈的', '操你', '去死',
];

function validateLobsterPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;

  const trimmed = prompt.trim();
  if (!trimmed) return null;
  if (trimmed.length > 200) return 'Personality prompt must be 200 characters or less';
  if (trimmed.length < 12) return 'Personality prompt is too short. Add some strategy or style guidance.';

  const lettersOnly = trimmed.toLowerCase().replace(/[^a-z\u4e00-\u9fff]/g, '');
  if (lettersOnly && new Set(lettersOnly).size <= 3) {
    return 'Personality prompt is too repetitive. Add clearer strategy or personality guidance.';
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && trimmed.length < 20) {
    return 'Personality prompt is too vague. Describe play style, reasoning, or table talk.';
  }

  const lower = trimmed.toLowerCase();
  const badHits = BANNED_PROMPT_TERMS.filter((term) => lower.includes(term));
  if (badHits.length > 0) {
    const scrubbed = trimmed
      .replace(/[^a-zA-Z\u4e00-\u9fff\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (scrubbed.length <= badHits.length + 2) {
      return 'Personality prompt cannot be mostly profanity. Add real strategy or personality guidance.';
    }
  }

  return null;
}

router.get('/coins', requireAuth, (req, res) => {
  const coins = getCoinsForUser(req.user.id);
  const secs = secondsUntilReset(req.user.id);
  res.json({ coins, secondsUntilReset: secs });
});

router.get('/api-keys', requireAuth, (req, res) => {
  const rows = stmts.getAllApiKeys.all(req.user.id);
  const result = {};
  for (const row of rows) {
    const plain = resolveStoredSecret(row.api_key);
    if (!plain) continue;
    result[row.model] = plain.length > 8
      ? `${plain.slice(0, 4)}****${plain.slice(-4)}`
      : '********';
  }
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
  const promptError = validateLobsterPrompt(lobster_prompt);
  if (promptError) {
    return res.status(400).json({ error: promptError });
  }
  stmts.saveLobster.run({
    lobster_name: lobster_name?.trim() || null,
    lobster_prompt: lobster_prompt?.trim() || null,
    lobster_model: lobster_model || null,
    id: req.user.id,
  });
  res.json({ ok: true });
});

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

router.post('/bets', requireAuth, (req, res) => {
  const rooms = req.app.get('rooms');
  const roomId = Number(req.body.roomId);
  const room = rooms.get(roomId);
  const engine = room?.engine;
  if (!room || !engine || !engine.running) {
    return res.status(400).json({ error: 'No active game' });
  }
  if (!engine.bettingOpen) {
    return res.status(400).json({ error: 'Betting is closed for this hand' });
  }

  const { model, amount } = req.body;
  const activeSeatIds = new Set((engine.seats || []).map(seat => seat.id));
  if (!activeSeatIds.has(model)) {
    return res.status(400).json({ error: 'Unknown model' });
  }

  const existingBet = stmts.getUserBetForHand.get(req.user.id, engine.gameId, engine.handNumber);
  if (existingBet) {
    return res.status(400).json({ error: 'You have already placed a bet for this hand' });
  }

  const betAmount = Math.floor(Number(amount));
  if (!betAmount || betAmount < 1 || betAmount > 1_000_000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const coins = getCoinsForUser(req.user.id);
  if (coins < betAmount) {
    return res.status(400).json({ error: 'Insufficient coins' });
  }

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

router.get('/leaderboard', (req, res) => {
  const rows = stmts.getLeaderboard.all();
  const map = Object.fromEntries(rows.map(r => [r.model, r]));
  const result = AI_MODELS.map(m => map[m] || {
    model: m, total_hands: 0, hands_won: 0, win_rate: 0,
  });
  res.json(result);
});

router.post('/bug-reports', (req, res) => {
  const { roomId, handNumber, browser, whatHappened, expected } = req.body;
  if (!whatHappened || typeof whatHappened !== 'string' || !whatHappened.trim()) {
    return res.status(400).json({ error: 'Please describe what happened' });
  }
  stmts.insertBugReport.run({
    user_id: req.user?.id || null,
    username: req.user?.username || null,
    room_id: roomId || null,
    hand_number: handNumber || null,
    browser: browser ? String(browser).slice(0, 300) : null,
    what_happened: String(whatHappened).trim().slice(0, 2000),
    expected: expected ? String(expected).trim().slice(0, 2000) : null,
  });
  res.json({ ok: true });
});

const MAX_ROOMS = 5;

router.get('/rooms', (req, res) => {
  const rooms = req.app.get('rooms');
  const io = req.app.get('io');
  const list = [];
  for (const [id, room] of rooms) {
    const watcherCount = io.sockets.adapter.rooms.get(`table:${id}`)?.size || 0;
    list.push({
      id,
      name: room.name,
      running: room.engine.running,
      handNumber: room.engine.handNumber,
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
  const roomId = Math.max(...rooms.keys()) + 1;
  const createRoom = req.app.get('createRoom');
  const room = createRoom(roomId, name.trim(), req.user.id);
  res.json({ id: room.id, name: room.name });
});

function buildKeys(userId, testMode) {
  const rows = stmts.getAllApiKeys.all(userId);
  const keys = {};
  for (const row of rows) {
    const plain = resolveStoredSecret(row.api_key);
    if (plain) keys[row.model] = plain;
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

function hasActiveAgentSeat(room, readyEntries = []) {
  const agentUserId = room?.engine?.agentSocket?.data?.agentUser?.id;
  return Boolean(room?.engine?.agentSocket?.connected && agentUserId && readyEntries.some((entry) => entry.user.id === agentUserId));
}

function buildSeatPool(room, fallbackUserId, testMode) {
  const readyEntries = [...(room?.lobby?.values?.() || [])].filter((entry) => entry.ready);
  if (readyEntries.length >= 2) {
    const seatKeys = {};
    const seatOwnerMap = {};
    const modelCount = {};

    for (const entry of readyEntries) {
      const ownerName = entry.user.display_name || entry.user.username;
      const freshKeys = buildKeys(entry.user.id, testMode);
      for (const [model, key] of Object.entries(freshKeys)) {
        modelCount[model] = (modelCount[model] || 0) + 1;
        const seatId = modelCount[model] === 1 ? model : `${model}_${modelCount[model]}`;
        seatKeys[seatId] = key;
        seatOwnerMap[seatId] = ownerName;
      }
    }

    const effectiveSeatCount = Object.keys(seatKeys).length + (hasActiveAgentSeat(room, readyEntries) ? 1 : 0);
    return {
      createdBy: fallbackUserId,
      seatKeys,
      seatOwnerMap,
      seatIds: Object.keys(seatKeys),
      effectiveSeatCount,
      source: 'lobby',
    };
  }

  const seatKeys = buildKeys(fallbackUserId, testMode);
  const seatIds = AI_MODELS.filter((m) => seatKeys[m]);
  return {
    createdBy: fallbackUserId,
    seatKeys,
    seatOwnerMap: null,
    seatIds,
    effectiveSeatCount: seatIds.length + (room?.engine?.agentSocket?.connected ? 1 : 0),
    source: 'user',
  };
}

router.post('/rooms/:roomId/start', requireAuth, (req, res) => {
  const rooms = req.app.get('rooms');
  const roomId = parseInt(req.params.roomId, 10);
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.engine.running) return res.status(400).json({ error: 'Game already running' });

  const { testMode } = req.body;
  const seatPool = buildSeatPool(room, req.user.id, testMode);
  if (seatPool.effectiveSeatCount < 2) {
    return res.status(400).json({
      error: 'At least 2 playable seats are required to start. Add model keys, connect OpenClaw, or use Test Mode.',
    });
  }

  room.engine.apiKeys = seatPool.seatKeys;
  room.engine.testMode = !!testMode;
  room.engine.start(seatPool.createdBy, seatPool.seatIds, seatPool.seatOwnerMap)
    .catch(err => console.error(`[Room ${roomId}] Engine error:`, err));

  res.json({
    ok: true,
    testMode: !!testMode,
    models: seatPool.seatIds,
    source: seatPool.source,
  });
});

router.post('/rooms/:roomId/stop', requireAuth, (req, res) => {
  const rooms = req.app.get('rooms');
  const roomId = parseInt(req.params.roomId, 10);
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  room.engine.stop();
  res.json({ ok: true });
});

module.exports = router;
