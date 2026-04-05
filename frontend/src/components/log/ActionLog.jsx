import { useGameStore } from '../../store/gameStore.js';
import { MODEL_MAP } from '../../utils/constants.js';
import { formatCoins } from '../../utils/format.js';
import { useRef, useEffect } from 'react';

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
  const { log } = useGameStore();
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl flex flex-col h-64">
      <div className="px-4 py-3 border-b border-[#333] flex items-center justify-between">
        <span className="font-semibold text-sm text-gray-300">Action Log</span>
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs">
        {log.length === 0 && (
          <div className="text-gray-600 text-center pt-4">Waiting for game...</div>
        )}
        {log.map((entry, i) => (
          <LogEntry key={i} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>
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
    const model = MODEL_MAP[entry.actorId];
    const color = ACTION_COLORS[entry.action] || 'text-gray-400';
    const icon  = ACTION_ICONS[entry.action] || '•';
    return (
      <div>
        <div className="flex items-center gap-2">
          <span style={{ color: model?.color }}>
            {model?.emoji} {model?.label || entry.actorId}
            {entry.ownerName ? <span className="text-gray-600"> ({entry.ownerName})</span> : null}
          </span>
          <span className={`${color} flex-1`}>
            {icon} {entry.action}
            {entry.action === 'raise' && entry.amount ? ` → ${formatCoins(entry.amount)}` : ''}
            {entry.action === 'call' && entry.amount ? ` ${formatCoins(entry.amount)}` : ''}
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
