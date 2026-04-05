import { formatCoins } from '../../utils/format.js';

export default function PlayerSeat({ model, chips, player, isActor, isBust }) {
  const folded   = player?.folded;
  const allIn    = player?.allIn;
  const bet      = player?.bet || 0;
  const hasCards = player?.hole || (!folded && chips > 0);

  return (
    <div className={`flex flex-col items-center gap-1 transition-opacity
      ${isBust ? 'opacity-30' : folded ? 'opacity-50' : 'opacity-100'}`}
    >
      {/* Avatar ring + emoji */}
      <div className={`relative w-12 h-12 rounded-full flex items-center justify-center text-2xl
        border-2 transition-all duration-300
        ${isActor
          ? 'border-gold animate-pulse-ring bg-[#2a1a00]'
          : 'border-[#555] bg-[#222]'}
        ${folded ? 'grayscale' : ''}`}
        style={{ borderColor: !isActor ? model.color : undefined }}
      >
        {model.emoji}
        {isActor && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-gold rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-[#111] rounded-full animate-pulse" />
          </div>
        )}
        {allIn && (
          <div className="absolute -bottom-1 text-xs bg-red-600 text-white px-1 rounded">ALL-IN</div>
        )}
      </div>

      {/* Name */}
      <div className="text-xs font-semibold text-center leading-tight"
        style={{ color: model.color }}>
        {model.label}
      </div>

      {/* Chips */}
      <div className="text-xs font-mono text-gray-300">
        🪙 {formatCoins(chips)}
      </div>

      {/* Current bet this street */}
      {bet > 0 && (
        <div className="text-xs font-mono text-gold animate-chip-fly">
          +{formatCoins(bet)}
        </div>
      )}

      {/* Status */}
      {folded && <div className="text-xs text-gray-500">Folded</div>}

      {/* Hole cards (face-down unless revealed) */}
      {hasCards && !folded && !isBust && (
        <div className="flex gap-0.5">
          {player?.hole ? (
            player.hole.map((card, i) => (
              <CardChip key={i} card={card} />
            ))
          ) : (
            <>
              <CardBack />
              <CardBack />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CardChip({ card }) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const isRed = suit === '♥' || suit === '♦';
  return (
    <div className={`w-7 h-10 bg-white rounded text-[10px] font-bold flex flex-col items-center justify-center
      leading-none border border-gray-300 ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
      <span>{rank}</span>
      <span>{suit}</span>
    </div>
  );
}

function CardBack() {
  return (
    <div className="w-7 h-10 bg-gradient-to-br from-blue-900 to-blue-800 rounded border border-blue-700
      flex items-center justify-center text-xs text-blue-400">
      🦞
    </div>
  );
}
