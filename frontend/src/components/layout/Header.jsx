import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore.js';
import { formatCoins } from '../../utils/format.js';
import { useEffect, useState } from 'react';
import { getCoins } from '../../utils/api.js';

export default function Header() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [coins, setCoins] = useState(null);

  useEffect(() => {
    if (user) {
      getCoins().then(d => setCoins(d.coins)).catch(() => {});
    }
  }, [user]);

  const nav = [
    { to: '/', label: '🎰 Arena' },
    { to: '/leaderboard', label: '🏆 Leaderboard' },
    { to: '/settings', label: '🔑 API Keys' },
    { to: '/profile', label: '👤 Profile' },
  ];

  return (
    <header className="bg-[#1a1a1a] border-b border-[#333] px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2">
        <span className="text-3xl">🦞</span>
        <span className="font-display text-xl text-gold font-bold tracking-wide hidden sm:block">
          Lobster Poker
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex gap-1">
        {nav.map(n => (
          <Link
            key={n.to}
            to={n.to}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${location.pathname === n.to
                ? 'bg-felt text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="flex items-center gap-3">
        {user ? (
          <>
            {coins !== null && (
              <div className="flex items-center gap-1 bg-[#2a2a2a] px-3 py-1.5 rounded-full">
                <span className="text-gold text-sm font-mono font-bold">
                  🪙 {formatCoins(coins)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              {user.avatar && (
                <img src={user.avatar} alt={user.username}
                  className="w-8 h-8 rounded-full border-2 border-[#444]" />
              )}
              <span className="text-sm text-gray-300 hidden sm:block">{user.display_name || user.username}</span>
            </div>
            <button
              onClick={logout}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Logout
            </button>
          </>
        ) : (
          <Link to="/login"
            className="bg-lobster hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}
