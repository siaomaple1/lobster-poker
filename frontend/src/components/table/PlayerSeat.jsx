import { formatCoins, cardRank, cardSuit, isRedCard } from '../../utils/format.js';

export default function PlayerSeat({ model, chips, player, isActor, isBust }) {
  const folded = player?.folded;
  const allIn = player?.allIn;
  const bet = player?.bet || 0;
  const hasCards = player?.hole || (!folded && chips > 0);

  return (
    <div className={`flex flex-col items-center gap-0.5 md:gap-1 transition-opacity
      ${isBust ? 'opacity-30' : folded ? 'opacity-50' : 'opacity-100'}`}
    >
      <div className={`relative w-8 h-8 md:w-12 md:h-12 rounded-full flex items-center justify-center text-lg md:text-2xl
        border-2 transition-all duration-300
        ${isActor
          ? 'border-gold animate-pulse-ring bg-[#2a1a00]'
          : 'border-[#555] bg-[#222]'}
        ${folded ? 'grayscale' : ''}`}
        style={{ borderColor: !isActor ? model.color : undefined }}
      >
        {model.emoji}
        {isActor && (
          <div className="absolute -top-1 -right-1 w-3 h-3 md:w-4 md:h-4 bg-gold rounded-full flex items-center justify-center">
            <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-[#111] rounded-full animate-pulse" />
          </div>
        )}
        {allIn && (
          <div className="absolute -bottom-1 text-[8px] md:text-xs bg-red-600 text-white px-0.5 md:px-1 rounded">ALL-IN</div>
        )}
      </div>

      <div className="text-[9px] md:text-xs font-semibold text-center leading-tight" style={{ color: model.color }}>
        {model.label}
      </div>

      <div className="text-[9px] md:text-xs font-mono text-gray-300">
        Chips {formatCoins(chips)}
      </div>

      {bet > 0 && (
        <div className="text-[9px] md:text-xs font-mono text-gold animate-chip-fly">
          +{formatCoins(bet)}
        </div>
      )}

      {folded && <div className="text-[9px] md:text-xs text-gray-500">Folded</div>}

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
  const rank = cardRank(card);
  const suit = cardSuit(card);
  const isRed = isRedCard(card);
  return (
    <div className={`w-5 h-7 md:w-7 md:h-10 bg-white rounded text-[8px] md:text-[10px] font-bold flex flex-col items-center justify-center
      leading-none border border-gray-300 ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
      <span>{rank}</span>
      <span>{suit}</span>
    </div>
  );
}

function CardBack() {
  return (
    <div className="w-5 h-7 md:w-7 md:h-10 bg-gradient-to-br from-blue-900 to-blue-800 rounded border border-blue-700
      flex items-center justify-center text-[8px] md:text-xs text-blue-400">
      ♣
    </div>
  );
}
