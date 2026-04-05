import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { AI_MODELS } from '../utils/constants.js';
import { getApiKeys, saveApiKey, deleteApiKey } from '../utils/api.js';

const MODEL_META = {
  claude:   { hint: 'sk-ant-api03-...' },
  gpt:      { hint: 'sk-proj-...' },
  deepseek: { hint: 'sk-...' },
  gemini:   { hint: 'AIzaSy...' },
  grok:     { hint: 'xai-...' },
  qwen:     { hint: 'sk-...' },
  mistral:  { hint: '...' },
  cohere:   { hint: '...' },
  groq:     { hint: 'gsk_...' },
};

export default function Settings() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;

  const [keys, setKeys]       = useState({});
  const [editing, setEditing] = useState(null);
  const [inputVal, setInputVal] = useState('');
  const [showKey, setShowKey] = useState({});
  const [saving, setSaving]   = useState(false);
  const [status, setStatus]   = useState({});

  useEffect(() => {
    getApiKeys().then(setKeys).catch(() => {});
  }, []);

  const startEdit = (id) => {
    setEditing(id);
    setInputVal('');
    setStatus(s => ({ ...s, [id]: null }));
  };

  const cancelEdit = () => { setEditing(null); setInputVal(''); };

  const handleSave = async (id) => {
    if (inputVal.trim().length < 8) return;
    setSaving(true);
    try {
      await saveApiKey(id, inputVal.trim());
      setKeys(k => ({ ...k, [id]: inputVal.trim().slice(0, 4) + '••••' + inputVal.trim().slice(-4) }));
      setStatus(s => ({ ...s, [id]: 'saved' }));
      setEditing(null);
      setInputVal('');
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Unknown error';
      console.error('[saveApiKey]', e.response?.status, msg);
      setStatus(s => ({ ...s, [id]: msg }));
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await deleteApiKey(id);
      setKeys(k => ({ ...k, [id]: null }));
      setStatus(s => ({ ...s, [id]: null }));
    } catch {}
  };

  const onKeyDown = (e, id) => {
    if (e.key === 'Enter')  handleSave(id);
    if (e.key === 'Escape') cancelEdit();
  };

  const keyCount = AI_MODELS.filter(m => keys[m.id]).length;

  return (
    <div className="max-w-2xl mx-auto p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🔑 API Keys</h1>
          <p className="text-gray-400 text-sm mt-1">
            Add your AI provider keys so each model can play poker.
          </p>
        </div>
        <div className="text-sm text-gray-500 shrink-0">
          <span className="text-white font-bold">{keyCount}</span> / {AI_MODELS.length} set
        </div>
      </div>

      {/* Security notice */}
      <div className="bg-[#1a2a1a] border border-green-800/50 rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
          🔒 关于 API Key 安全
        </div>
        <ul className="space-y-2 text-sm text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5 shrink-0">✓</span>
            <span>你的 key <strong className="text-white">只在游戏期间</strong>用于调用对应 AI 模型的 API，不会用于其他任何用途。</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5 shrink-0">✓</span>
            <span>Key 加密存储在服务器数据库中，查询接口只返回脱敏版本（如 <span className="font-mono text-gray-400 text-xs">sk-a••••xyz</span>），原始 key 不会通过任何接口返回。</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-400 mt-0.5 shrink-0">💡</span>
            <span>建议在 AI 平台为本站<strong className="text-white">单独创建一个新 key</strong>，并设置消费限额（如 $5/月），这样即使出现意外也不会影响你的主要账户。</span>
          </li>
        </ul>
      </div>

      {/* Model list */}
      <div className="space-y-3">
        {AI_MODELS.map(m => {
          const meta      = MODEL_META[m.id] || {};
          const hasKey    = !!keys[m.id];
          const isEditing = editing === m.id;
          const isVisible = !!showKey[m.id];

          return (
            <div
              key={m.id}
              className={`bg-[#1e1e1e] border rounded-2xl p-4 transition-colors
                ${isEditing ? 'border-gold/50' : hasKey ? 'border-green-800/40' : 'border-[#333]'}`}
            >
              <div className="flex items-center gap-3">
                {/* Emoji + status dot */}
                <div className="relative shrink-0">
                  <span className="text-2xl w-9 text-center block">{m.emoji}</span>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1e1e1e]
                    ${hasKey ? 'bg-green-500' : 'bg-[#444]'}`} />
                </div>

                {/* Name + key field */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">{m.label}</span>
                    {hasKey && !isEditing && (
                      <span className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full border border-green-800/40">
                        ✓ Active
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-2 relative">
                      <input
                        autoFocus
                        type={isVisible ? 'text' : 'password'}
                        value={inputVal}
                        onChange={e => setInputVal(e.target.value)}
                        onKeyDown={e => onKeyDown(e, m.id)}
                        placeholder={meta.hint || 'Paste your API key...'}
                        className="w-full bg-[#2a2a2a] border border-[#555] rounded-lg px-3 py-2 text-white text-sm
                          focus:outline-none focus:border-gold font-mono pr-10 placeholder:text-gray-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(s => ({ ...s, [m.id]: !s[m.id] }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm"
                        tabIndex={-1}
                      >
                        {isVisible ? '🙈' : '👁️'}
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs font-mono mt-0.5 truncate">
                      {hasKey
                        ? <span className="text-gray-400">{keys[m.id]}</span>
                        : <span className="text-gray-600">{meta.hint}</span>
                      }
                    </div>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-1.5 shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleSave(m.id)}
                        disabled={saving || inputVal.trim().length < 8}
                        className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white
                          text-xs px-3 py-1.5 rounded-lg transition-colors font-medium"
                      >
                        {saving ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="bg-[#333] hover:bg-[#444] text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(m.id)}
                        className="bg-[#2a2a2a] hover:bg-[#333] text-gray-300 text-xs px-3 py-1.5
                          rounded-lg transition-colors border border-[#3a3a3a]"
                      >
                        {hasKey ? 'Edit' : 'Add'}
                      </button>
                      {hasKey && (
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="bg-[#2a2a2a] hover:bg-red-950 text-gray-500 hover:text-red-400
                            text-xs px-2.5 py-1.5 rounded-lg transition-colors border border-[#3a3a3a]"
                        >
                          ✕
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Inline feedback */}
              {status[m.id] === 'saved' && !isEditing && (
                <p className="text-green-400 text-xs mt-2 pl-12">Saved successfully</p>
              )}
              {status[m.id] && status[m.id] !== 'saved' && (
                <p className="text-red-400 text-xs mt-2 pl-12">Error: {status[m.id]}</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-600 text-center pb-4">
        Keys are only used to make API calls during poker games and are never shared.
        Press Enter to save, Escape to cancel.
      </p>
    </div>
  );
}
