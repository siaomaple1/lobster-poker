import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { getCoins, getMyBets } from '../utils/api.js';
import { formatCoins, formatTimer } from '../utils/format.js';

export default function Profile() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="max-w-2xl mx-auto p-4 lg:p-8 space-y-6">
      {/* User card */}
      <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-6 flex items-center gap-4">
        {user.avatar && (
          <img src={user.avatar} alt={user.username} className="w-16 h-16 rounded-full border-2 border-[#444]" />
        )}
        <div>
          <h2 className="text-xl font-bold text-white">{user.display_name || user.username}</h2>
          <p className="text-gray-400 text-sm">@{user.username}</p>
        </div>
      </div>

      <CoinsCard />
      <Link to="/settings"
        className="block bg-[#1e1e1e] border border-[#333] hover:border-gold/40 rounded-2xl p-5 transition-colors group">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">🔑 API Keys</h3>
            <p className="text-xs text-gray-500 mt-0.5">Manage your AI provider keys</p>
          </div>
          <span className="text-gray-600 group-hover:text-gold transition-colors text-lg">→</span>
        </div>
      </Link>
      <BetHistory />
    </div>
  );
}

function CoinsCard() {
  const [coins, setCoins] = useState(null);
  const [secs, setSecs]   = useState(0);

  useEffect(() => {
    getCoins().then(d => { setCoins(d.coins); setSecs(d.secondsUntilReset); }).catch(() => {});
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-6">
      <h3 className="font-semibold text-gray-300 mb-4">💰 Coin Balance</h3>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-4xl font-display font-bold text-gold">
            {coins !== null ? formatCoins(coins) : '...'}
          </div>
          <div className="text-gray-500 text-sm mt-1">coins</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-1">Resets in</div>
          <div className="font-mono text-lg text-gray-300">{formatTimer(secs)}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-600">
        1,000,000 coins are given free every hour. Use them to bet on AI poker matches!
      </div>
    </div>
  );
}


function BetHistory() {
  const [bets, setBets] = useState([]);

  useEffect(() => {
    getMyBets().then(setBets).catch(() => {});
  }, []);

  if (bets.length === 0) return null;

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-6">
      <h3 className="font-semibold text-gray-300 mb-4">📋 Recent Bets</h3>
      <div className="space-y-2">
        {bets.slice(0, 20).map(b => (
          <div key={b.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-[#2a2a2a]">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Hand #{b.hand_number}</span>
              <span className="font-medium text-white">{b.model}</span>
              <span className="text-gray-500">·</span>
              <span className="font-mono text-gray-400">{formatCoins(b.amount)} bet</span>
            </div>
            {b.settled ? (
              <span className={b.payout > 0 ? 'text-green-400 font-mono' : 'text-red-400 font-mono'}>
                {b.payout > 0 ? `+${formatCoins(b.payout)}` : '-' + formatCoins(b.amount)}
              </span>
            ) : (
              <span className="text-yellow-500 text-xs">Pending</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
