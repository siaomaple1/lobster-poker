export function formatCoins(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function formatTimer(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function cardSuit(card) {
  return card ? card.slice(-1) : '';
}

export function cardRank(card) {
  return card ? card.slice(0, -1) : '';
}

export function isRedCard(card) {
  const suit = cardSuit(card);
  return suit === '♥' || suit === '♦';
}

export function timeAgo(unixSecs) {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
