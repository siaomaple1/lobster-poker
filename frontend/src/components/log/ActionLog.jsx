import { useMemo, useRef, useState, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore.js';
import { useAuthStore } from '../../store/authStore.js';
import { useT } from '../../utils/i18n.js';
import { useToastStore } from '../../store/toastStore.js';
import { getSocket } from '../../hooks/useSocket.js';
import { resolveModel } from '../../utils/constants.js';
import { formatCoins } from '../../utils/format.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'action', label: 'Actions' },
  { id: 'system', label: 'System' },
  { id: 'winner', label: 'Wins' },
];

const ACTION_STYLE = {
  fold: { label: 'Fold', tone: 'text-gray-400', badge: 'bg-gray-800 text-gray-200' },
  call: { label: 'Call', tone: 'text-sky-300', badge: 'bg-sky-500/15 text-sky-200' },
  check: { label: 'Check', tone: 'text-gray-100', badge: 'bg-white/10 text-gray-100' },
  raise: { label: 'Raise', tone: 'text-amber-300', badge: 'bg-amber-500/15 text-amber-200' },
  bet: { label: 'Bet', tone: 'text-emerald-300', badge: 'bg-emerald-500/15 text-emerald-200' },
  allin: { label: 'All-in', tone: 'text-fuchsia-300', badge: 'bg-fuchsia-500/15 text-fuchsia-200' },
};

export default function ActionLog() {
  const [tab, setTab] = useState('log');
  const t = useT();

  const tabBtn = (id, label) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
        tab === id
          ? 'text-white border-lobster'
          : 'text-gray-500 hover:text-gray-300 border-transparent'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl flex flex-col h-80">
      <div className="flex border-b border-[#333] flex-shrink-0">
        {tabBtn('log', t.log.logTab)}
        {tabBtn('chat', t.log.chatTab)}
      </div>
      {tab === 'log' ? <LogPanel /> : <ChatPanel />}
    </div>
  );
}

function LogPanel() {
  const { log, handNumber, stage, pot, actorId } = useGameStore();
  const [filter, setFilter] = useState('all');
  const bottomRef = useRef(null);

  const visibleLog = useMemo(() => {
    if (filter === 'all') return log;
    if (filter === 'winner') {
      return log.filter((entry) => entry.type === 'winner' || entry.type === 'payout');
    }
    return log.filter((entry) => entry.type === filter);
  }, [filter, log]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleLog]);

  const actor = actorId ? resolveModel(actorId) : null;
  const recentActions = log.filter((entry) => entry.type === 'action').length;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 pt-3 pb-2 border-b border-[#2b2b2b] space-y-2">
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <SummaryCard label="Hand" value={handNumber ? `#${handNumber}` : '--'} />
          <SummaryCard label="Stage" value={formatStage(stage)} />
          <SummaryCard label="Pot" value={pot > 0 ? formatCoins(pot) : '--'} />
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="text-gray-400">
            {actor
              ? (
                <>
                  <span className="text-white">{actor.label}</span>
                  {' '}is thinking
                </>
              )
              : 'Waiting for next event'}
          </div>
          <div className="text-gray-500">{recentActions} actions</div>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-colors ${
                filter === item.id
                  ? 'bg-lobster text-white'
                  : 'bg-[#252525] text-gray-400 hover:text-gray-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
        {visibleLog.length === 0 && (
          <div className="text-gray-600 text-center pt-6">No matching events yet.</div>
        )}

        {visibleLog.map((entry, index) => {
          const prev = visibleLog[index - 1];
          const showDivider = entry.handNumber && entry.handNumber !== prev?.handNumber;
          return (
            <div key={entry.ts || index} className="space-y-2">
              {showDivider && (
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gray-500">
                  <div className="h-px flex-1 bg-[#303030]" />
                  <span>Hand #{entry.handNumber}</span>
                  <div className="h-px flex-1 bg-[#303030]" />
                </div>
              )}
              <LogEntry entry={entry} />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl bg-[#232323] border border-[#303030] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-white truncate">{value}</div>
    </div>
  );
}

function LogEntry({ entry }) {
  const stamp = formatTimestamp(entry.ts);

  if (entry.type === 'system') {
    return (
      <div className="rounded-xl border border-[#2d2d2d] bg-[#202020] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">System</span>
          <span className="text-[10px] text-gray-600">{stamp}</span>
        </div>
        <div className="mt-1 text-gray-200">{entry.msg}</div>
      </div>
    );
  }

  if (entry.type === 'winner') {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-amber-300">Winner</span>
          <span className="text-[10px] text-amber-200/70">{stamp}</span>
        </div>
        <div className="mt-1 font-semibold text-amber-100">{entry.msg}</div>
      </div>
    );
  }

  if (entry.type === 'payout') {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-emerald-300">Payout</span>
          <span className="text-[10px] text-emerald-200/70">{stamp}</span>
        </div>
        <div className="mt-1 text-emerald-100">{entry.msg}</div>
      </div>
    );
  }

  if (entry.type === 'action') {
    const model = resolveModel(entry.actorId);
    const actionMeta = ACTION_STYLE[normalizeAction(entry.action)] || ACTION_STYLE.check;
    const details = describeAction(entry, actionMeta.label);

    return (
      <div className="rounded-xl border border-[#303030] bg-[#1d1d1d] px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate" style={{ color: model.color }}>
                {model.label}
              </span>
              {entry.ownerName && (
                <span className="text-[10px] text-gray-500">({entry.ownerName})</span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${actionMeta.badge}`}>
                {actionMeta.label}
              </span>
            </div>
            <div className={`mt-1 ${actionMeta.tone}`}>{details}</div>
          </div>
          <span className="text-[10px] text-gray-600 shrink-0">{stamp}</span>
        </div>

        {entry.thought && (
          <div className="mt-2 rounded-lg bg-white/5 px-2.5 py-2 text-[11px] text-gray-300">
            Thinks: {entry.thought}
          </div>
        )}

        {entry.trash && (
          <div className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-2 text-[11px] italic text-red-200">
            Says: "{entry.trash}"
          </div>
        )}
      </div>
    );
  }

  return null;
}

function ChatPanel() {
  const { chatMessages } = useGameStore();
  const { user } = useAuthStore();
  const t = useT();
  const { show: showToast } = useToastStore();
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = () => {
    const msg = text.trim();
    if (!msg || !user) return;
    const s = getSocket();
    if (!s.connected) {
      showToast(t.toast.chatFailed, 'error');
      return;
    }
    s.emit('chat:send', { message: msg });
    setText('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 text-xs">
        {chatMessages.length === 0 && (
          <div className="text-gray-600 text-center pt-4">
            {user ? t.log.firstMessage : t.log.signInChat}
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <ChatMessage key={i} msg={msg} isMe={user?.id === msg.userId} />
        ))}
        <div ref={bottomRef} />
      </div>

      {user ? (
        <div className="flex gap-2 p-2 border-t border-[#333] flex-shrink-0">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t.log.chatPlaceholder}
            maxLength={300}
            className="flex-1 bg-[#2a2a2a] border border-[#444] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-lobster"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="bg-lobster hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors"
          >
            {t.log.send}
          </button>
        </div>
      ) : (
        <div className="p-2 border-t border-[#333] text-center text-xs text-gray-600 flex-shrink-0">
          <a href="/login" className="text-lobster hover:underline">{t.log.signIn}</a>{' '}
          {t.log.toChat}
        </div>
      )}
    </div>
  );
}

function ChatMessage({ msg, isMe }) {
  return (
    <div className={`flex items-start gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
      {msg.avatar ? (
        <img src={msg.avatar} alt={msg.username} className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5" />
      ) : (
        <div className="w-5 h-5 rounded-full bg-[#444] flex-shrink-0 mt-0.5 flex items-center justify-center text-[8px] text-gray-400">
          {msg.username?.[0]?.toUpperCase()}
        </div>
      )}
      <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        <span className={`text-[10px] text-gray-500 ${isMe ? 'text-right' : ''}`}>{msg.username}</span>
        <div
          className={`px-2 py-1 rounded-lg text-white break-words ${
            isMe ? 'bg-lobster/70 rounded-tr-none' : 'bg-[#2a2a2a] rounded-tl-none'
          }`}
        >
          {msg.message}
        </div>
      </div>
    </div>
  );
}

function normalizeAction(action) {
  return String(action || '').toLowerCase().replace(/\s+/g, '');
}

function describeAction(entry, fallback) {
  const label = fallback || entry.action || 'Move';
  const amount = entry.amount ? ` ${formatCoins(entry.amount)}` : '';
  if (normalizeAction(entry.action) === 'raise') return `${label} to${amount}`;
  if (normalizeAction(entry.action) === 'call') return `${label}${amount}`;
  if (normalizeAction(entry.action) === 'bet') return `${label}${amount}`;
  return label;
}

function formatStage(stage) {
  if (!stage) return '--';
  return String(stage)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTimestamp(ts) {
  if (!ts) return '--:--:--';
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
