import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useT } from '../utils/i18n.js';
import { getCoins, getMyBets, getLobster, saveLobster, getApiKeys, getAgentToken, refreshAgentToken } from '../utils/api.js';
import { formatCoins, formatTimer } from '../utils/format.js';
import { AI_MODELS, MODEL_MAP } from '../utils/constants.js';

const PROMPT_PRESETS = [
  { label: 'Aggro', text: 'Play aggressively, pressure medium stacks, and bluff when action checks to you.' },
  { label: 'Nit', text: 'Play tight, avoid marginal calls, and only build big pots with strong value.' },
  { label: 'Trash Talk', text: 'Use short, funny trash talk, but keep it playful instead of toxic.' },
  { label: 'Math', text: 'Talk about pot odds, stack pressure, blockers, and board texture in your reasoning.' },
  { label: 'Showman', text: 'Act dramatic, confident, and theatrical when you win or bluff.' },
];

const BANNED_PROMPT_TERMS = [
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'motherfucker',
  '傻逼', '傻比', '弱智', '智障', '他妈', '妈的', '操你', '去死',
];

function validatePrompt(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > 200) return 'Prompt must be 200 characters or less.';
  if (trimmed.length < 12) return 'Prompt is too short. Give at least a little strategy or style guidance.';

  const lettersOnly = trimmed.toLowerCase().replace(/[^a-z\u4e00-\u9fff]/g, '');
  const uniqueChars = new Set(lettersOnly);
  if (lettersOnly && uniqueChars.size <= 3) {
    return 'Prompt looks too repetitive. Add real strategy or personality guidance.';
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && trimmed.length < 20) {
    return 'Prompt is too vague. Try describing play style, reasoning, or table talk.';
  }

  const lower = trimmed.toLowerCase();
  const badHits = BANNED_PROMPT_TERMS.filter((term) => lower.includes(term));
  if (badHits.length > 0) {
    const scrubbed = trimmed
      .replace(/[^a-zA-Z\u4e00-\u9fff\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (scrubbed.length <= badHits.length + 2) {
      return 'Prompt is mostly profanity right now. Add actual strategy or personality guidance.';
    }
  }

  return '';
}

export default function Profile() {
  const { user } = useAuthStore();
  const t = useT();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="max-w-2xl mx-auto p-4 lg:p-8 space-y-6">
      <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-6 flex items-center gap-4">
        {user.avatar && (
          <img src={user.avatar} alt={user.username} className="w-16 h-16 rounded-full border-2 border-[#444]" />
        )}
        <div>
          <h2 className="text-xl font-bold text-white">{user.display_name || user.username}</h2>
          <p className="text-gray-400 text-sm">@{user.username}</p>
        </div>
      </div>

      <CoinsCard t={t} />
      <MyLobsterCard user={user} t={t} />
      <Link
        to="/settings"
        className="block bg-[#1e1e1e] border border-[#333] hover:border-gold/40 rounded-2xl p-5 transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">{t.profile.apiKeysTitle}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t.profile.apiKeysDesc}</p>
          </div>
          <span className="text-gray-600 group-hover:text-gold transition-colors text-lg">→</span>
        </div>
      </Link>
      <AgentTokenCard t={t} />
      <BetHistory t={t} />
    </div>
  );
}

function CoinsCard({ t }) {
  const [coins, setCoins] = useState(null);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    getCoins().then(d => {
      setCoins(d.coins);
      setSecs(d.secondsUntilReset);
    }).catch(() => {});
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-6">
      <h3 className="font-semibold text-gray-300 mb-4">{t.profile.coinBalance}</h3>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-4xl font-display font-bold text-gold">
            {coins !== null ? formatCoins(coins) : '...'}
          </div>
          <div className="text-gray-500 text-sm mt-1">{t.profile.coins}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-1">{t.profile.resetsIn}</div>
          <div className="font-mono text-lg text-gray-300">{formatTimer(secs)}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-600">
        {t.profile.coinDesc}
      </div>
    </div>
  );
}

function MyLobsterCard({ user, t }) {
  const defaultName = `${user.display_name || user.username}'s Lobster`;
  const [name, setName] = useState(defaultName);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [promptError, setPromptError] = useState('');

  useEffect(() => {
    getLobster().then(data => {
      if (data.lobster_name) setName(data.lobster_name);
      if (data.lobster_prompt) setPrompt(data.lobster_prompt);
      if (data.lobster_model) setModel(data.lobster_model);
    }).catch(() => {});

    getApiKeys().then(keys => {
      const available = AI_MODELS.filter(m => keys[m.id] !== null);
      setAvailableModels(available);
    }).catch(() => {});
  }, []);

  const addPromptPreset = (text) => {
    setPrompt((current) => {
      const next = current.trim() ? `${current.trim()} ${text}` : text;
      return next.slice(0, 200);
    });
    setPromptError('');
  };

  const handleSave = async () => {
    const error = validatePrompt(prompt);
    setPromptError(error);
    if (error) return;

    setSaving(true);
    try {
      await saveLobster({ lobster_name: name, lobster_prompt: prompt, lobster_model: model });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save');
    }
    setSaving(false);
  };

  const inputCls = 'w-full bg-[#2a2a2a] border border-[#444] rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-lobster';

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-white text-lg">{t.profile.myLobster}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{t.profile.lobsterDesc}</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">{t.profile.lobsterName}</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={defaultName}
            maxLength={20}
            className={inputCls}
          />
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1 block">{t.profile.personalityPrompt}</label>
          <textarea
            value={prompt}
            onChange={e => {
              const next = e.target.value;
              setPrompt(next);
              if (promptError) setPromptError(validatePrompt(next));
            }}
            placeholder={t.profile.personalityPlaceholder}
            rows={3}
            maxLength={200}
            className={`${inputCls} resize-none ${promptError ? 'border-red-500 focus:border-red-500' : ''}`}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {PROMPT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => addPromptPreset(preset.text)}
                className="rounded-full border border-[#444] bg-[#252525] px-2.5 py-1 text-[11px] text-gray-300 transition-colors hover:border-lobster hover:text-white"
              >
                + {preset.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
            <p className="text-gray-500">
              Best results come from style and strategy guidance, not long roleplay. Example: "Play loose-aggressive, explain pot odds clearly, and keep trash talk short."
            </p>
            <span className={`shrink-0 font-mono ${prompt.length > 180 ? 'text-yellow-500' : 'text-gray-600'}`}>
              {prompt.length}/200
            </span>
          </div>
          {promptError && (
            <p className="mt-2 text-xs text-red-400">{promptError}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1 block">{t.profile.modelLabel}</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className={`${inputCls} cursor-pointer`}
          >
            <option value="">{t.profile.disableLobster}</option>
            {availableModels.map(m => (
              <option key={m.id} value={m.id}>{m.emoji} {m.label}</option>
            ))}
          </select>
          {availableModels.length === 0 && (
            <p className="text-xs text-yellow-600 mt-1">
              {t.profile.noKeys}{' '}
              <Link to="/settings" className="underline">{t.profile.addKeys}</Link>
            </p>
          )}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-lobster hover:bg-red-700 text-white px-5 py-2 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
      >
        {saving ? t.profile.saving : saved ? t.profile.saved : t.profile.saveLobster}
      </button>
    </div>
  );
}

function AgentTokenCard({ t }) {
  const [token, setToken] = useState(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    getAgentToken().then(d => setToken(d.token)).catch(() => {});
  }, []);

  const handleCopy = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRotate = async () => {
    if (!window.confirm(t.profile.rotateConfirm)) return;
    setRotating(true);
    try {
      setToken((await refreshAgentToken()).token);
      setVisible(false);
    } catch {}
    setRotating(false);
  };

  const maskedToken = '********************************';

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-6 space-y-3">
      <div>
        <h3 className="font-semibold text-white text-lg">{t.profile.agentTitle}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{t.profile.agentDesc}</p>
      </div>

      {token ? (
        <>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-xs font-mono text-gray-300 truncate">
              {visible ? token : maskedToken}
            </code>
            <button
              onClick={() => setVisible(v => !v)}
              className="shrink-0 bg-[#2a2a2a] hover:bg-[#333] border border-[#444] text-gray-400 text-xs px-3 py-2 rounded-lg transition-colors"
              title={visible ? t.profile.hide : t.profile.show}
            >
              {visible ? '🙈' : '👁️'}
            </button>
            <button
              onClick={handleCopy}
              className="shrink-0 bg-[#2a2a2a] hover:bg-[#333] border border-[#444] text-gray-300 text-xs px-3 py-2 rounded-lg transition-colors"
            >
              {copied ? t.profile.copied : t.profile.copy}
            </button>
          </div>
          <div className="bg-[#1a1a2a] border border-blue-900/40 rounded-xl p-3 text-xs text-gray-400 space-y-1">
            <div className="text-blue-400 font-semibold mb-1">{t.profile.agentHowTo}</div>
            <div>{t.profile.agentStep1} <code className="text-gray-300">/skill install lobster-poker</code></div>
            <div>{t.profile.agentStep2} <code className="text-gray-300">/lobster-poker setup {token.slice(0, 8)}...</code></div>
            <div>{t.profile.agentStep3} <code className="text-gray-300">/lobster-poker join</code></div>
          </div>
          <button
            onClick={handleRotate}
            disabled={rotating}
            className="text-xs text-gray-500 hover:text-red-400 underline transition-colors disabled:opacity-50"
          >
            {rotating ? t.profile.regenerating : t.profile.rotateToken}
          </button>
        </>
      ) : (
        <div className="text-gray-600 text-sm">{t.profile.loading}</div>
      )}
    </div>
  );
}

function BetHistory({ t }) {
  const [bets, setBets] = useState([]);

  useEffect(() => {
    getMyBets().then(setBets).catch(() => {});
  }, []);

  if (bets.length === 0) return null;

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-6">
      <h3 className="font-semibold text-gray-300 mb-4">{t.profile.recentBets}</h3>
      <div className="space-y-2">
        {bets.slice(0, 20).map(b => (
          <div key={b.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-[#2a2a2a]">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Hand #{b.hand_number}</span>
              <span className="font-medium text-white">{MODEL_MAP[b.model]?.label || b.model}</span>
              <span className="text-gray-500">·</span>
              <span className="font-mono text-gray-400">{formatCoins(b.amount)} bet</span>
            </div>
            {b.settled ? (
              <span className={b.payout > 0 ? 'text-green-400 font-mono' : 'text-red-400 font-mono'}>
                {b.payout > 0 ? `+${formatCoins(b.payout)}` : `-${formatCoins(b.amount)}`}
              </span>
            ) : (
              <span className="text-yellow-500 text-xs">{t.profile.pending}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
