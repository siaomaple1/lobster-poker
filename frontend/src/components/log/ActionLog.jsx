import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore.js';
import { useAuthStore } from '../../store/authStore.js';
import { useT } from '../../utils/i18n.js';
import { getSocket } from '../../hooks/useSocket.js';
import { MODEL_MAP } from '../../utils/constants.js';
import { formatCoins } from '../../utils/format.js';

const ACTION_COLORS = {
  fold:  'text-gray-500',
  call:  'text-blue-400',
  check: 'text-gray-300',
  raise: 'text-yellow-400',
};

const ACTION_ICONS = {
  fold:  '🏳️',
  call:  '📞',
  check: '✔️',
  raise: '📈',
};

export default function ActionLog() {
  const [tab, setTab] = useState('log');
  const t = useT();

  const tabBtn = (id, label) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2
        ${tab === id
          ? 'text-white border-lobster'
          : 'text-gray-500 hover:text-gray-300 border-transparent'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl flex flex-col h-64">
      <div className="flex border-b border-[#333] flex-shrink-0">
        {tabBtn('log',  t.log.logTab)}
        {tabBtn('chat', t.log.chatTab)}
      </div>
      {tab === 'log' ? <LogPanel /> : <ChatPanel />}
    </div>
  );
}

function LogPanel() {
  const { log } = useGameStore();
  const t = useT();
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs">
      {log.length === 0 && (
        <div className="text-gray-600 text-center pt-4">{t.log.waitingGame}</div>
      )}
      {log.map((entry, i) => <LogEntry key={i} entry={entry} />)}
      <div ref={bottomRef} />
    </div>
  );
}

function LogEntry({ entry }) {
  if (entry.type === 'system') {
    return <div className="text-gray-500 text-center py-0.5">{entry.msg}</div>;
  }
  if (entry.type === 'winner') {
    return (
      <div className="text-gold font-bold text-center py-1 bg-[#2a1a00] rounded px-2">
        {entry.msg}
      </div>
    );
  }
  if (entry.type === 'payout') {
    return <div className="text-green-400 text-center">{entry.msg}</div>;
  }
  if (entry.type === 'action') {
    const model = MODEL_MAP[entry.actorId] || { id: entry.actorId, label: entry.actorId, color: '#e53e3e', emoji: '🦞' };
    const color = ACTION_COLORS[entry.action] || 'text-gray-400';
    const icon  = ACTION_ICONS[entry.action] || '•';
    return (
      <div>
        <div className="flex items-center gap-2">
          <span style={{ color: model.color }}>
            {model.emoji} {model.label}
            {entry.ownerName ? <span className="text-gray-600"> ({entry.ownerName})</span> : null}
          </span>
          <span className={`${color} flex-1`}>
            {icon} {entry.action}
            {entry.action === 'raise' && entry.amount ? ` → ${formatCoins(entry.amount)}` : ''}
            {entry.action === 'call'  && entry.amount ? ` ${formatCoins(entry.amount)}`  : ''}
          </span>
        </div>
        {entry.trash && (
          <div className="text-red-400 italic text-[10px] pl-6">💬 "{entry.trash}"</div>
        )}
        {!entry.trash && entry.thought && (
          <div className="text-gray-500 italic text-[10px] pl-6">💭 {entry.thought}</div>
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
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = () => {
    const msg = text.trim();
    if (!msg || !user) return;
    getSocket().emit('chat:send', { message: msg });
    setText('');
  };

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
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
            onChange={e => setText(e.target.value)}
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
        <div className={`px-2 py-1 rounded-lg text-white break-words
          ${isMe ? 'bg-lobster/70 rounded-tr-none' : 'bg-[#2a2a2a] rounded-tl-none'}`}>
          {msg.message}
        </div>
      </div>
    </div>
  );
}
