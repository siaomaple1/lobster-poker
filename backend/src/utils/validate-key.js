'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const axios = require('axios');

const TIMEOUT_MS = 10000;

// ── Format patterns (cheap pre-check before hitting the network) ─────────────
const KEY_FORMATS = {
  claude:   { pattern: /^sk-ant-/, hint: 'Claude keys start with "sk-ant-"' },
  gpt:      { pattern: /^sk-/,     hint: 'OpenAI keys start with "sk-"' },
  deepseek: { pattern: /^sk-/,     hint: 'DeepSeek keys start with "sk-"' },
  gemini:   { pattern: /^AIza/,    hint: 'Gemini keys start with "AIza"' },
  grok:     { pattern: /^xai-/,    hint: 'Grok keys start with "xai-"' },
  qwen:     { pattern: /^sk-/,     hint: 'Qwen keys start with "sk-"' },
  mistral:  null,                  // no stable public format
  cohere:   null,                  // no stable public format
  groq:     { pattern: /^gsk_/,    hint: 'Groq keys start with "gsk_"' },
};

// ── Live validators ───────────────────────────────────────────────────────────
async function checkClaude(apiKey) {
  const client = new Anthropic({ apiKey });
  await client.models.list();
}

async function checkOpenAICompat(apiKey, baseURL) {
  const opts = { apiKey };
  if (baseURL) opts.baseURL = baseURL;
  const client = new OpenAI(opts);
  await client.models.list();
}

async function checkGemini(apiKey) {
  // REST endpoint — free, no generation charge
  await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
    params: { key: apiKey },
    timeout: TIMEOUT_MS,
  });
}

async function checkMistral(apiKey) {
  await axios.get('https://api.mistral.ai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: TIMEOUT_MS,
  });
}

async function checkCohere(apiKey) {
  await axios.get('https://api.cohere.ai/v2/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: TIMEOUT_MS,
  });
}

const LIVE_CHECKS = {
  claude:   (k) => checkClaude(k),
  gpt:      (k) => checkOpenAICompat(k, null),
  deepseek: (k) => checkOpenAICompat(k, 'https://api.deepseek.com'),
  gemini:   (k) => checkGemini(k),
  grok:     (k) => checkOpenAICompat(k, 'https://api.x.ai/v1'),
  qwen:     (k) => checkOpenAICompat(k, 'https://dashscope.aliyuncs.com/compatible-mode/v1'),
  mistral:  (k) => checkMistral(k),
  cohere:   (k) => checkCohere(k),
  groq:     (k) => checkOpenAICompat(k, 'https://api.groq.com/openai/v1'),
};

// ── Error normalizer ──────────────────────────────────────────────────────────
function toUserError(model, err) {
  // axios HTTP error
  if (err.response) {
    const status = err.response.status;
    // 400 covers Gemini "API key not valid" which returns 400
    if ([400, 401, 403].includes(status)) return 'Invalid API key — authentication failed';
    if (status === 429) return 'Key is valid but rate-limited (quota exceeded)';
    return `Provider returned HTTP ${status} — check your key and try again`;
  }
  // OpenAI / Anthropic SDK auth errors
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('auth') || msg.includes('api key') || msg.includes('incorrect') ||
      msg.includes('invalid') || msg.includes('unauthorized')) {
    return 'Invalid API key — authentication failed';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || err.code === 'ECONNABORTED') {
    return 'Validation timed out — provider may be slow, please try again';
  }
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    return 'Could not reach the provider — check your internet connection';
  }
  return `Validation failed: ${err.message || 'unknown error'}`;
}

// ── Public entry point ────────────────────────────────────────────────────────
async function validateApiKey(model, apiKey) {
  // 1. Format check (instant, no network)
  const fmt = KEY_FORMATS[model];
  if (fmt && !fmt.pattern.test(apiKey)) {
    return { valid: false, error: `Wrong key format — ${fmt.hint}` };
  }

  // 2. Live API check
  const check = LIVE_CHECKS[model];
  if (!check) return { valid: true }; // safety fallback, shouldn't happen

  try {
    await Promise.race([
      check(apiKey),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Validation timed out')), TIMEOUT_MS)
      ),
    ]);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: toUserError(model, err) };
  }
}

module.exports = { validateApiKey };
