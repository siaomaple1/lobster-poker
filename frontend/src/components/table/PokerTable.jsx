import { useEffect } from 'react';
import { useGameStore } from '../../store/gameStore.js';
import { useAuthStore } from '../../store/authStore.js';
import { AI_MODELS, MODEL_MAP } from '../../utils/constants.js';
import { getSocket } from '../../hooks/useSocket.js';
import PlayerSeat from './PlayerSeat.jsx';
import CommunityCards from './CommunityCards.jsx';

const LOBSTER_MODEL = { id: 'lobster', label: '🦞 Lobster', color: '#e53e3e', emoji: '🦞' };
const MAX_LOBBY_SEATS = 6;

// Seat positions around an oval (9 + optional lobster at position 9)
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
  { top: '85%', left: '75%',  transform: 'translate(-50%,-50%)' }, // bottom right (9 — lobster)
];

export default function PokerTable() {
  const { seats, players, actorId, stage, pot, board, running, lobbyPlayers } = useGameStore();
  const { user } = useAuthStore();

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
            {running && stage && (
              <div className="text-xs text-[#a8d4a8] uppercase tracking-widest mb-1 font-mono">
                {stage}
              </div>
            )}
            {running && pot > 0 && (
              <div className="text-gold font-display text-lg font-bold">
                🪙 {pot.toLocaleString()}
              </div>
            )}
            {!running && (
              <div className="text-gray-500 text-xs text-center px-4">
                {lobbyPlayers.length === 0
                  ? '选择座位入座'
                  : `${lobbyPlayers.length} 人已入座，凑够 2 人自动开始`}
              </div>
            )}
            {running && <CommunityCards cards={board} />}
          </div>

          {/* Pre-game seat UI */}
          {!running && <TableLobby lobbyPlayers={lobbyPlayers} user={user} />}

          {/* AI Seats (only during game) */}
          {running && AI_MODELS.map((model, i) => {
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

          {/* Lobster seat (10th, user-controlled, only during game) */}
          {running && seatMap['lobster'] && (() => {
            const pos = SEAT_POSITIONS[9];
            return (
              <div className="absolute" style={{ top: pos.top, left: pos.left, transform: pos.transform }}>
                <PlayerSeat
                  model={LOBSTER_MODEL}
                  chips={seatMap['lobster'].chips}
                  player={playerMap['lobster'] || null}
                  isActor={actorId === 'lobster'}
                  isBust={seatMap['lobster'].chips <= 0 && running}
                />
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function TableLobby({ lobbyPlayers, user }) {
  const isSitting = user ? lobbyPlayers.some(p => p.id === user.id) : false;

  useEffect(() => {
    const s = getSocket();
    const handler = (data) => alert(data.error);
    s.on('seat:error', handler);
    return () => s.off('seat:error', handler);
  }, []);

  return (
    <>
      {SEAT_POSITIONS.slice(0, MAX_LOBBY_SEATS).map((pos, i) => {
        const player = lobbyPlayers[i];
        const isMe = player && user && player.id === user.id;

        return (
          <div key={i} className="absolute" style={{ top: pos.top, left: pos.left, transform: pos.transform }}>
            {player ? (
              <div className="flex flex-col items-center gap-0.5">
                {player.avatar
                  ? <img src={player.avatar} className="w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-green-500 shadow-lg" alt="" />
                  : <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#2a2a2a] border-2 border-green-500 flex items-center justify-center text-sm font-bold text-green-400">
                      {player.username[0]?.toUpperCase()}
                    </div>
                }
                <span className="text-[10px] md:text-xs text-green-400 font-semibold whitespace-nowrap max-w-[72px] truncate drop-shadow">
                  {player.username}
                </span>
                {isMe && (
                  <button
                    onClick={() => getSocket().emit('seat:leave')}
                    className="text-[9px] text-red-400 hover:text-red-300 underline leading-none"
                  >
                    离座
                  </button>
                )}
              </div>
            ) : !isSitting ? (
              <button
                onClick={() => getSocket().emit('seat:take')}
                className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-black/30 border-2 border-dashed border-white/20 hover:border-green-400 hover:bg-green-900/30 text-white/30 hover:text-green-400 font-bold text-xl transition-all flex items-center justify-center"
                title="入座"
              >
                +
              </button>
            ) : (
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-black/20 border-2 border-dashed border-white/10 flex items-center justify-center text-white/20 text-xs">
                空
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
