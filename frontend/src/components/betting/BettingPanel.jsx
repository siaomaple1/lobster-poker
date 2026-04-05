import { useState, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore.js';
import { useAuthStore } from '../../store/authStore.js';
import { AI_MODELS } from '../../utils/constants.js';
import { formatCoins } from '../../utils/format.js';
import { placeBet, getCoins } from '../../utils/api.js';

const QUICK_BETS = [1000, 5000, 10000, 50000, 100000];

export default function BettingPanel() {
  const { bettingOpen, bettingEndsAt, handNumber } = useGameStore();
  const { user } = useAuthStore();

  const [selected, setSelected] = useState(null);
  const [amount, setAmount]     = useState(1000);
  const [coins, setCoins]       = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [placing, setPlacing]   = useState(false);
  const [result, setResult]     = useState(null); // 'ok' | 'error'
  const [hasBet, setHasBet]     = useState(false);

  // Fetch coins
  useEffect(() => {
    if (user) getCoins().then(d => setCoins(d.coins)).catch(() => {});
  }, [user, bettingOpen]);

  // Countdown timer
  useEffect(() => {
    if (!bettingOpen || !bettingEndsAt) { setTimeLeft(0); return; }
    setHasBet(false);
    setResult(null);
    setSelected(null);

    const tick = () => setTimeLeft(Math.max(0, Math.ceil((bettingEndsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [bettingOpen, bettingEndsAt]);

  const handleBet = async () => {
    if (!selected || amount < 1 || !user || hasBet) return;
    setPlacing(true);
    try {
      await placeBet(selected, amount);
      setHasBet(true);
      setResult('ok');
      setCoins(c => c - amount);
    } catch (e) {
      setResult('error');
    }
    setPlacing(false);
  };

  if (!bettingOpen) {
    return (
      <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-4 text-center">
        <div className="text-gray-500 text-sm">Betting opens at the start of each hand</div>
      </div>
    );
  }

  const pct = bettingEndsAt ? Math.max(0, (bettingEndsAt - Date.now()) / 15000) : 0;
  const barColor = timeLeft <= 5 ? 'bg-red-500' : timeLeft <= 10 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-4 space-y-4">
      {/* Header + timer */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-white">Hand #{handNumber} — Place Your Bet</span>
          <span className={`font-mono font-bold text-lg ${timeLeft <= 5 ? 'text-red-400' : 'text-gold'}`}>
            {timeLeft}s
          </span>
        </div>
        <div className="h-2 bg-[#333] rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-200 rounded-full`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      </div>

      {!user ? (
        <div className="text-center text-gray-400 text-sm py-4">
          <a href="/login" className="text-lobster hover:underline">Sign in</a> to place bets
        </div>
      ) : hasBet ? (
        <div className="text-center py-6">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-green-400 font-semibold">Bet placed on {selected}!</div>
          <div className="text-gray-400 text-sm mt-1">{formatCoins(amount)} coins wagered</div>
        </div>
      ) : (
        <>
          {/* AI Model selector */}
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Pick your champion</div>
            <div className="grid grid-cols-3 gap-2">
              {AI_MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-xs
                    ${selected === m.id
                      ? 'border-gold bg-[#2a1a00] text-gold'
                      : 'border-[#333] hover:border-[#555] text-gray-400 hover:text-white'}`}
                >
                  <span className="text-lg">{m.emoji}</span>
                  <span className="font-medium">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
              Bet amount · Balance: {formatCoins(coins)} 🪙
            </div>
            <div className="flex gap-2 flex-wrap mb-2">
              {QUICK_BETS.map(b => (
                <button
                  key={b}
                  onClick={() => setAmount(Math.min(b, coins))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all
                    ${amount === b
                      ? 'bg-felt border-green-600 text-white'
                      : 'bg-[#2a2a2a] border-[#444] text-gray-400 hover:text-white'}`}
                >
                  {formatCoins(b)}
                </button>
              ))}
              <button
                onClick={() => setAmount(coins)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono border border-lobster text-lobster hover:bg-lobster hover:text-white transition-all"
              >
                All-In
              </button>
            </div>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(Math.min(Math.max(1, parseInt(e.target.value) || 0), coins))}
              className="w-full bg-[#2a2a2a] border border-[#444] rounded-lg px-3 py-2 text-white font-mono text-sm
                focus:outline-none focus:border-gold"
            />
          </div>

          {/* Place bet button */}
          <button
            onClick={handleBet}
            disabled={!selected || amount < 1 || placing || coins < amount}
            className="w-full bg-lobster hover:bg-red-700 disabled:bg-[#333] disabled:text-gray-600
              text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {placing ? 'Placing...' : selected
              ? `Bet ${formatCoins(amount)} on ${AI_MODELS.find(m=>m.id===selected)?.label}`
              : 'Select a model first'}
          </button>

          {result === 'error' && (
            <div className="text-red-400 text-sm text-center">Failed to place bet. Try again.</div>
          )}
        </>
      )}
    </div>
  );
}
