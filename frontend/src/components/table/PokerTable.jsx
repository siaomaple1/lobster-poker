import { useGameStore } from '../../store/gameStore.js';
import { AI_MODELS, MODEL_MAP } from '../../utils/constants.js';
import PlayerSeat from './PlayerSeat.jsx';
import CommunityCards from './CommunityCards.jsx';

// Seat positions around an oval (9 seats)
const SEAT_POSITIONS = [
  { top: '75%', left: '50%',  transform: 'translate(-50%,-50%)' }, // bottom center (0)
  { top: '85%', left: '25%',  transform: 'translate(-50%,-50%)' }, // bottom left (1)
  { top: '65%', left: '8%',   transform: 'translate(0,-50%)' },    // mid left (2)
  { top: '35%', left: '8%',   transform: 'translate(0,-50%)' },    // upper left (3)
  { top: '15%', left: '25%',  transform: 'translate(-50%,-50%)' }, // top left (4)
  { top: '15%', left: '50%',  transform: 'translate(-50%,-50%)' }, // top center (5)
  { top: '15%', left: '75%',  transform: 'translate(-50%,-50%)' }, // top right (6)
  { top: '35%', left: '88%',  transform: 'translate(-100%,-50%)' }, // upper right (7)
  { top: '65%', left: '88%',  transform: 'translate(-100%,-50%)' }, // mid right (8)
];

export default function PokerTable() {
  const { seats, players, actorId, stage, pot, board, running } = useGameStore();

  // Merge seat data (chips over the game) with hand data (current bet, folded, etc.)
  const seatMap = Object.fromEntries((seats || []).map(s => [s.id, s]));
  const playerMap = Object.fromEntries((players || []).map(p => [p.id, p]));

  return (
    <div className="relative w-full" style={{ paddingBottom: '56.25%' /* 16:9 */ }}>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        {/* Oval felt table */}
        <div
          className="relative w-full h-full felt-bg rounded-[50%] border-4 border-[#8b6914] shadow-2xl"
          style={{ boxShadow: '0 0 60px rgba(0,0,0,0.8), inset 0 0 40px rgba(0,0,0,0.4)' }}
        >
          {/* Inner border */}
          <div className="absolute inset-4 rounded-[50%] border-2 border-[#6b4f10] opacity-50" />

          {/* Center info */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {stage && (
              <div className="text-xs text-[#a8d4a8] uppercase tracking-widest mb-1 font-mono">
                {stage}
              </div>
            )}
            {pot > 0 && (
              <div className="text-gold font-display text-lg font-bold">
                🪙 {pot.toLocaleString()}
              </div>
            )}
            {!running && (
              <div className="text-gray-400 text-sm text-center px-4">
                Waiting for game to start...
              </div>
            )}
            <CommunityCards cards={board} />
          </div>

          {/* AI Seats */}
          {AI_MODELS.map((model, i) => {
            const seat   = seatMap[model.id] || { id: model.id, chips: 0 };
            const player = playerMap[model.id] || null;
            const pos    = SEAT_POSITIONS[i];
            const isActor = actorId === model.id;
            const isBust  = seat.chips <= 0 && running;

            return (
              <div
                key={model.id}
                className="absolute"
                style={{ top: pos.top, left: pos.left, transform: pos.transform }}
              >
                <PlayerSeat
                  model={model}
                  chips={seat.chips}
                  player={player}
                  isActor={isActor}
                  isBust={isBust}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
