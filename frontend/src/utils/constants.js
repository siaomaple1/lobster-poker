export const AI_MODELS = [
  { id: 'claude',   label: 'Claude',   color: '#c17f24', emoji: '🤖' },
  { id: 'gpt',      label: 'GPT-4o',   color: '#10a37f', emoji: '💬' },
  { id: 'deepseek', label: 'DeepSeek', color: '#4d6ff0', emoji: '🔍' },
  { id: 'gemini',   label: 'Gemini',   color: '#4285f4', emoji: '✨' },
  { id: 'grok',     label: 'Grok',     color: '#1da1f2', emoji: '⚡' },
  { id: 'qwen',     label: 'Qwen',     color: '#ff6a00', emoji: '🌏' },
  { id: 'mistral',  label: 'Mistral',  color: '#f97316', emoji: '🌪️' },
  { id: 'cohere',   label: 'Cohere',   color: '#39d353', emoji: '🧬' },
  { id: 'groq',     label: 'Groq',     color: '#f43f5e', emoji: '🚀' },
];

export const MODEL_MAP = Object.fromEntries(AI_MODELS.map(m => [m.id, m]));

// Resolve suffixed seat IDs (e.g. "deepseek_2") to their base model info.
// Falls back gracefully if base model isn't found.
export function resolveModel(seatId) {
  if (MODEL_MAP[seatId]) return MODEL_MAP[seatId];
  const base = seatId.replace(/_\d+$/, '');
  const baseModel = MODEL_MAP[base];
  if (baseModel) {
    const n = seatId.match(/_(\d+)$/)?.[1];
    return { ...baseModel, id: seatId, label: `${baseModel.label} #${n}` };
  }
  return { id: seatId, label: seatId, color: '#888', emoji: '🤖' };
}

export const SUIT_COLORS = {
  '♠': '#f0ede8',
  '♣': '#f0ede8',
  '♥': '#e53e3e',
  '♦': '#e53e3e',
};

export const HAND_PHASES = ['pre-flop', 'flop', 'turn', 'river', 'showdown'];
export const BETTING_WINDOW_MS = 15000;
export const API_BASE = '/api';
