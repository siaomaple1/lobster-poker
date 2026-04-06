import { cardRank, cardSuit, isRedCard } from '../../utils/format.js';

export default function CommunityCards({ cards = [] }) {
  if (!cards.length) return null;

  return (
    <div className="flex gap-2 mt-2">
      {cards.map((card, i) => {
        const rank = cardRank(card);
        const suit = cardSuit(card);
        const isRed = isRedCard(card);
        return (
          <div
            key={i}
            className={`w-10 h-14 bg-white rounded-lg flex flex-col items-center justify-center
              text-sm font-bold leading-none border-2 border-gray-200 shadow-lg animate-deal
              ${isRed ? 'text-red-600' : 'text-gray-900'}`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span className="text-base">{rank}</span>
            <span>{suit}</span>
          </div>
        );
      })}
      {Array.from({ length: Math.max(0, 5 - cards.length) }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="w-10 h-14 rounded-lg border-2 border-dashed border-[#3a6a3a] opacity-40"
        />
      ))}
    </div>
  );
}
