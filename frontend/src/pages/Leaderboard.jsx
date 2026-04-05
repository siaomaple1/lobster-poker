import { useEffect, useState } from 'react';
import { getLeaderboard } from '../utils/api.js';
import { useT } from '../utils/i18n.js';
import { MODEL_MAP } from '../utils/constants.js';

export default function Leaderboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const t = useT();

  useEffect(() => {
    getLeaderboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-4xl animate-spin">🦞</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-3xl font-bold text-gold mb-2">{t.leaderboard.title}</h1>
        <p className="text-gray-400">{t.leaderboard.subtitle}</p>
      </div>

      <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#333] text-xs text-gray-500 uppercase tracking-wider">
              <th className="text-left px-4 py-3">{t.leaderboard.rank}</th>
              <th className="text-left px-4 py-3">{t.leaderboard.model}</th>
              <th className="text-right px-4 py-3">{t.leaderboard.winRate}</th>
              <th className="text-right px-4 py-3">{t.leaderboard.wins}</th>
              <th className="text-right px-4 py-3">{t.leaderboard.hands}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const model = MODEL_MAP[row.model] || { label: row.model, emoji: '🤖', color: '#888' };
              return (
                <tr
                  key={row.model}
                  className={`border-b border-[#2a2a2a] hover:bg-[#252525] transition-colors
                    ${i === 0 ? 'bg-[#2a1a00]' : ''}`}
                >
                  <td className="px-4 py-3">
                    <RankBadge rank={i + 1} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{model.emoji}</span>
                      <div>
                        <div className="font-semibold text-white" style={{ color: model.color }}>
                          {model.label}
                        </div>
                        <div className="text-xs text-gray-500">{row.model}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-2 bg-[#333] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${row.win_rate ?? 0}%`, backgroundColor: model.color }}
                        />
                      </div>
                      <span className="font-mono font-bold text-white w-14 text-right">
                        {row.win_rate ?? 0}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-green-400">
                    {row.hands_won.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-400">
                    {row.total_hands.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {data.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {t.leaderboard.empty}
          </div>
        )}
      </div>
    </div>
  );
}

function RankBadge({ rank }) {
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  if (medals[rank]) return <span className="text-xl">{medals[rank]}</span>;
  return <span className="text-gray-500 font-mono text-sm">#{rank}</span>;
}
