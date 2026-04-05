import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore.js';
import { useLangStore } from '../../store/langStore.js';
import { useT } from '../../utils/i18n.js';
import { formatCoins } from '../../utils/format.js';
import { useEffect, useState } from 'react';
import { getCoins } from '../../utils/api.js';
import ReportBug from '../ReportBug.jsx';

export default function Header() {
  const { user, logout } = useAuthStore();
  const { lang, toggle } = useLangStore();
  const t = useT();
  const location = useLocation();
  const [coins, setCoins] = useState(null);

  useEffect(() => {
    if (user) {
      getCoins().then(d => setCoins(d.coins)).catch(() => {});
    }
  }, [user]);

  const nav = [
    { to: '/',            emoji: '🎰', label: t.nav.arena },
    { to: '/leaderboard', emoji: '🏆', label: t.nav.leaderboard },
    { to: '/settings',    emoji: '🔑', label: t.nav.apiKeys },
    { to: '/profile',     emoji: '👤', label: t.nav.profile },
  ];

  return (
    <header className="bg-[#1a1a1a] border-b border-[#333] px-3 md:px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 flex-shrink-0">
        <span className="text-2xl md:text-3xl">🦞</span>
        <span className="font-display text-lg md:text-xl text-gold font-bold tracking-wide hidden sm:block">
          Lobster Poker
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex gap-0.5 md:gap-1">
        {nav.map(n => (
          <Link
            key={n.to}
            to={n.to}
            className={`px-2 md:px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${location.pathname === n.to
                ? 'bg-felt text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'}`}
          >
            <span className="md:hidden text-base">{n.emoji}</span>
            <span className="hidden md:inline">{n.emoji} {n.label}</span>
          </Link>
        ))}
      </nav>

      {/* Right side: coins + lang toggle + user */}
      <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
        {/* Bug report */}
        <ReportBug />

        {/* Language toggle */}
        <button
          onClick={toggle}
          className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-[#444] text-gray-400 hover:text-white hover:border-[#666] transition-colors bg-[#1e1e1e] hover:bg-[#2a2a2a]"
          title={lang === 'en' ? '切换到中文' : 'Switch to English'}
        >
          {lang === 'en' ? '中文' : 'EN'}
        </button>

        {user ? (
          <>
            {coins !== null && (
              <div className="flex items-center gap-1 bg-[#2a2a2a] px-2 md:px-3 py-1.5 rounded-full">
                <span className="text-gold text-xs md:text-sm font-mono font-bold">
                  🪙 {formatCoins(coins)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              {user.avatar && (
                <img src={user.avatar} alt={user.username}
                  className="w-7 h-7 md:w-8 md:h-8 rounded-full border-2 border-[#444]" />
              )}
              <span className="text-sm text-gray-300 hidden sm:block">{user.display_name || user.username}</span>
            </div>
            <button
              onClick={logout}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors hidden sm:block"
            >
              {t.nav.logout}
            </button>
          </>
        ) : (
          <Link to="/login"
            className="bg-lobster hover:bg-red-700 text-white px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {t.nav.signIn}
          </Link>
        )}
      </div>
    </header>
  );
}
