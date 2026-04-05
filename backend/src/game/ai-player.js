'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const ACTION_TIMEOUT_MS = 15000;

// ── Test Mode ──────────────────────────────────────────────────────────────
const TEST_KEY = '__TEST__';

// Per-model aggression (0 = passive, 1 = very aggressive)
const PERSONALITY = {
  claude:   0.50,
  gpt:      0.65,
  deepseek: 0.35,
  gemini:   0.55,
  grok:     0.80,
  qwen:     0.30,
  mistral:  0.50,
  cohere:   0.25,
  groq:     0.70,
};

function rankVal(card) {
  const r = (card || '')[0]?.toUpperCase();
  if (r === 'A') return 14; if (r === 'K') return 13;
  if (r === 'Q') return 12; if (r === 'J') return 11;
  if (r === 'T') return 10;
  return parseInt(r, 10) || 2;
}

function holeScore(hole) {
  if (!hole || hole.length < 2) return 0.35;
  const [a, b] = [rankVal(hole[0]), rankVal(hole[1])];
  const [hi, lo] = [Math.max(a, b), Math.min(a, b)];
  let s = (hi - 2) / 12 * 0.45 + (lo - 2) / 12 * 0.20;
  if (a === b) s += 0.30;                          // pair bonus
  if (hole[0][1] === hole[1][1]) s += 0.05;        // suited bonus
  if (Math.abs(a - b) <= 2) s += 0.05;             // connected bonus
  return Math.min(s, 1);
}

function testAction(modelId, gameState, base = modelId) {
  const me     = gameState.players.find(p => p.id === modelId);
  const toCall = Math.max(0, gameState.maxBet - (me.bet || 0));
  const aggr   = PERSONALITY[base] ?? 0.5;
  const str    = holeScore(me.hole);
  const rand   = Math.random();

  if (toCall === 0) {
    // Check or raise for free
    if (rand < str * aggr) {
      const raiseTotal = gameState.maxBet + 100 + Math.floor(Math.random() * gameState.pot * 0.5 * aggr);
      return { action: 'raise', raiseTotal };
    }
    return { action: 'check' };
  }

  // Simple pot-odds model
  const potOdds = toCall / (gameState.pot + toCall);
  const equity  = str * 0.65 + aggr * 0.35;

  if (equity < potOdds * 0.75) return { action: 'fold' };
  if (equity > 0.60 && rand < aggr * 0.65) {
    const raiseTotal = gameState.maxBet + 100 + Math.floor(Math.random() * gameState.pot * 0.4);
    return { action: 'raise', raiseTotal };
  }
  return { action: 'call' };
}

// ── Prompt Builder ─────────────────────────────────────────────────────────
function buildPrompt(modelId, base, gameState, handHistory, lobsterConfig = null) {
  const me = gameState.players.find(p => p.id === modelId);
  const others = gameState.players.filter(p => p.id !== modelId);
  const toCall = Math.max(0, gameState.maxBet - (me.bet || 0));
  const minRaise = gameState.maxBet + 100;

  const boardStr = gameState.board.length > 0
    ? `Community cards: ${gameState.board.join(' ')}`
    : 'No community cards yet (pre-flop)';

  const othersStr = others.map(p =>
    `  ${p.id}: ${p.chips} chips${p.folded ? ' [FOLDED]' : p.allIn ? ' [ALL-IN]' : ''}`
  ).join('\n');

  const recentActions = (handHistory || [])
    .filter(e => e.type === 'action')
    .slice(-6)
    .map(e => `  ${e.playerId} ${e.action}${e.detail ? ` ${e.detail}` : ''}`)
    .join('\n');

  return `You are ${base} playing Texas Hold'em poker. Respond with ONLY one line:
- FOLD
- CALL  (costs you ${toCall} chips)
- CHECK  (only if to-call = 0)
- RAISE <total_amount>  (minimum raise total: ${minRaise})

Your situation:
  Stage: ${gameState.stage}
  Your hole cards: ${me.hole ? me.hole.join(' ') : '??'}
  ${boardStr}
  Pot: ${gameState.pot} chips
  Your chips: ${me.chips} chips (already bet this street: ${me.bet || 0})
  To call: ${toCall} chips
  Other players:
${othersStr}

Recent actions:
${recentActions || '  (none yet)'}

${lobsterConfig?.prompt ? `Your personality and strategy: ${lobsterConfig.prompt}
Stay in character. Let your personality influence your betting decisions, not just your trash talk.

` : ''}${lobsterConfig
  ? `Your decision (three lines):
Line 1 — THINK: <poker reasoning in 1-2 sentences>
Line 2 — TRASH: <trash talk directed at opponents, 1 funny sentence>
Line 3 — DECIDE: FOLD / CALL / CHECK / RAISE <amount>`
  : `Your decision (two lines):
Line 1 — THINK: <your reasoning in 1-2 sentences>
Line 2 — DECIDE: FOLD / CALL / CHECK / RAISE <amount>`}`;
}

// ── Timeout Wrapper ────────────────────────────────────────────────────────
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), ms)),
  ]);
}

// ── Response Parser ────────────────────────────────────────────────────────
function parseAction(text, gameState, modelId, isLobster = false) {
  const me = gameState.players.find(p => p.id === modelId);
  const toCall = Math.max(0, gameState.maxBet - (me.bet || 0));

  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);

  // Extract thought from THINK line
  const thinkLine = lines.find(l => l.toUpperCase().includes('THINK:'));
  const thought = thinkLine
    ? thinkLine.replace(/^.*THINK:\s*/i, '').trim()
    : null;

  // Extract trash talk (lobster only)
  const trashLine = isLobster ? lines.find(l => l.toUpperCase().includes('TRASH:')) : null;
  const trash = trashLine ? trashLine.replace(/^.*TRASH:\s*/i, '').trim() : null;

  // Extract decision from DECIDE line, fall back to first line
  const decideLine = lines.find(l => l.toUpperCase().includes('DECIDE:')) || lines[0] || '';
  const decision = decideLine.replace(/^.*DECIDE:\s*/i, '').trim().toUpperCase();

  let action, raiseTotal;

  if (decision.startsWith('FOLD')) {
    action = 'fold';
  } else if (decision.startsWith('CHECK') && toCall === 0) {
    action = 'check';
  } else if (decision.startsWith('CALL') || (decision.startsWith('CHECK') && toCall > 0)) {
    action = 'call';
  } else if (decision.startsWith('RAISE')) {
    const parts = decision.split(/\s+/);
    const amount = parseInt(parts[1], 10);
    action = 'raise';
    raiseTotal = (!isNaN(amount) && amount > gameState.maxBet)
      ? amount
      : gameState.maxBet * 2 + 100;
  } else {
    // Unrecognized → call if possible, else check
    action = toCall > 0 ? 'call' : 'check';
  }

  return { action, raiseTotal, thought, trash };
}

// ── AI Adapters ────────────────────────────────────────────────────────────
async function callClaude(apiKey, prompt, maxTokens = 80) {
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

async function callGPT(apiKey, prompt, maxTokens = 80) {
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices[0].message.content;
}

async function callDeepSeek(apiKey, prompt, maxTokens = 80) {
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
  const res = await client.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices[0].message.content;
}

async function callGemini(apiKey, prompt, maxTokens = 80) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } });
  return result.response.text();
}

async function callGrok(apiKey, prompt, maxTokens = 80) {
  const client = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
  const res = await client.chat.completions.create({
    model: 'grok-3',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices[0].message.content;
}

async function callQwen(apiKey, prompt, maxTokens = 80) {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  });
  const res = await client.chat.completions.create({
    model: 'qwen-max',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices[0].message.content;
}

async function callMistral(apiKey, prompt, maxTokens = 80) {
  const res = await axios.post(
    'https://api.mistral.ai/v1/chat/completions',
    { model: 'mistral-large-latest', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return res.data.choices[0].message.content;
}

async function callCohere(apiKey, prompt, maxTokens = 80) {
  const res = await axios.post(
    'https://api.cohere.ai/v2/chat',
    { model: 'command-r-plus', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return res.data.message.content[0].text;
}

async function callGroq(apiKey, prompt, maxTokens = 80) {
  const client = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
  const res = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices[0].message.content;
}

const ADAPTERS = {
  claude:   callClaude,
  gpt:      callGPT,
  deepseek: callDeepSeek,
  gemini:   callGemini,
  grok:     callGrok,
  qwen:     callQwen,
  mistral:  callMistral,
  cohere:   callCohere,
  groq:     callGroq,
};

// Strip _2, _3 ... suffix to get the base model name (e.g. "deepseek_2" → "deepseek")
function baseModelId(id) {
  return id.replace(/_\d+$/, '');
}

// ── Main: Get AI Action ────────────────────────────────────────────────────
// lobsterConfig: { model, prompt, apiKey } — passed only for lobster seat
async function getAIAction(modelId, apiKeys, gameState, handHistory, lobsterConfig = null) {
  const isLobster = !!lobsterConfig;
  const base    = isLobster ? lobsterConfig.model : baseModelId(modelId);
  const apiKey  = isLobster ? lobsterConfig.apiKey : (apiKeys[modelId] || process.env[`${base.toUpperCase()}_API_KEY`]);
  const adapter = ADAPTERS[base];

  // Test mode: skip real API call
  if (apiKey === TEST_KEY) {
    const result = testAction(modelId, gameState, base);
    console.log(`[AI] ${modelId} [TEST] → ${result.action}${result.raiseTotal ? ` ${result.raiseTotal}` : ''}`);
    return { ...result, trash: isLobster ? 'You all play like NPCs!' : undefined };
  }

  if (!apiKey || !adapter) {
    console.warn(`[AI] No API key or adapter for ${modelId} (base: ${base}), using fallback`);
    return fallbackAction(gameState, modelId);
  }

  const prompt    = buildPrompt(modelId, base, gameState, handHistory, lobsterConfig);
  const maxTokens = isLobster ? 200 : 80;

  try {
    const text   = await withTimeout(adapter(apiKey, prompt, maxTokens), ACTION_TIMEOUT_MS);
    const parsed = parseAction(text, gameState, modelId, isLobster);
    console.log(`[AI] ${modelId}${isLobster ? ' [🦞]' : ''} → ${parsed.action}${parsed.raiseTotal ? ` ${parsed.raiseTotal}` : ''}`);
    return parsed;
  } catch (err) {
    console.error(`[AI] ${modelId} error: ${err.message}`);
    return fallbackAction(gameState, modelId);
  }
}

function fallbackAction(gameState, modelId) {
  const me = gameState.players.find(p => p.id === modelId);
  const toCall = Math.max(0, gameState.maxBet - (me.bet || 0));
  // Fallback: call if cheap (<= 200), else fold
  if (toCall === 0) return { action: 'check' };
  if (toCall <= 200) return { action: 'call' };
  return { action: 'fold' };
}

module.exports = { getAIAction, buildPrompt, TEST_KEY };
