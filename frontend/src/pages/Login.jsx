import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useT } from '../utils/i18n.js';

const PROVIDERS = [
  { id: 'google',  label: 'Google',      icon: '🔵', color: 'hover:bg-blue-600' },
  { id: 'twitter', label: 'X / Twitter', icon: '⬛', color: 'hover:bg-slate-600' },
];

// Detect in-app / WebView browsers that block Google OAuth
function detectWebView() {
  const ua = navigator.userAgent;
  // Android WebView
  if (/Android/.test(ua) && /wv\b/.test(ua)) return true;
  // iOS in-app browser: has iPhone/iPad but no standalone Safari
  if (/iPhone|iPad|iPod/.test(ua) && !/Safari/.test(ua)) return true;
  // Common in-app browsers
  if (/(FBAN|FBAV|Instagram|MicroMessenger|Line\/|Snapchat|TikTok|Twitter\/|WhatsApp)/.test(ua)) return true;
  return false;
}

export default function Login() {
  const { user } = useAuthStore();
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const loginError = params.get('error');
  const [copied, setCopied] = useState(false);
  const inWebView = detectWebView();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user]);

  const login = (provider) => {
    window.location.href = `/auth/${provider}`;
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-8xl mb-4">🦞</div>
          <h1 className="font-display text-4xl text-gold font-bold mb-2">Lobster Poker</h1>
          <p className="text-gray-400 text-lg">{t.login.subtitle}</p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {[t.login.pill1, t.login.pill2, t.login.pill3, t.login.pill4].map(f => (
            <span key={f} className="bg-[#2a2a2a] border border-[#444] text-gray-300 text-sm px-3 py-1 rounded-full">
              {f}
            </span>
          ))}
        </div>

        {/* Description */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-6 mb-6">
          <p className="text-gray-300 text-center leading-relaxed"
            dangerouslySetInnerHTML={{ __html: t.login.description }} />
        </div>

        {/* WebView warning — shown when inside an in-app browser */}
        {inWebView && (
          <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-2xl p-4 mb-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-xl flex-shrink-0">⚠️</span>
              <div>
                <p className="text-yellow-300 font-semibold text-sm">{t.webView.warning}</p>
                <p className="text-yellow-500 text-xs mt-1">{t.webView.instruction}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <code className="flex-1 bg-[#111] border border-[#333] rounded-lg px-2 py-1.5 text-xs font-mono text-gray-400 truncate">
                {window.location.href}
              </code>
              <button
                onClick={copyLink}
                className="shrink-0 bg-yellow-700 hover:bg-yellow-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                {copied ? t.webView.copied : t.webView.copyLink}
              </button>
            </div>
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-yellow-400 hover:text-yellow-300 underline"
            >
              {t.webView.openInBrowser} →
            </a>
          </div>
        )}

        {/* Error message */}
        {loginError && (
          <div className="bg-red-900/30 border border-red-700/50 text-red-400 text-sm rounded-xl px-4 py-3 mb-4 text-center">
            {t.login.loginError}
          </div>
        )}

        {/* Auth buttons */}
        <div className="space-y-3">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => login(p.id)}
              className={`w-full flex items-center gap-4 bg-[#2a2a2a] border border-[#444]
                text-white px-6 py-4 rounded-xl font-medium text-base transition-colors ${p.color}`}
            >
              <span className="text-2xl">{p.icon}</span>
              <span>{t.login.continueWith(p.label)}</span>
            </button>
          ))}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          {t.login.footer}
        </p>
      </div>
    </div>
  );
}
