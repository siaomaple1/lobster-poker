import { useGameStore } from '../../store/gameStore.js';
import { useAuthStore } from '../../store/authStore.js';
import { useT } from '../../utils/i18n.js';
import { MODEL_MAP, resolveModel } from '../../utils/constants.js';
import { getSocket } from '../../hooks/useSocket.js';
import PlayerSeat from './PlayerSeat.jsx';
import CommunityCards from './CommunityCards.jsx';

const LOBSTER_MODEL = { id: 'lobster', label: '🦞 Bot-Lobster', color: '#e53e3e', emoji: '🦞' };
const MAX_LOBBY_SEATS = 6;

const SEAT_POSITIONS = [
  { top: '75%', left: '50%', transform: 'translate(-50%,-50%)' },
  { top: '85%', left: '25%', transform: 'translate(-50%,-50%)' },
  { top: '65%', left: '8%', transform: 'translate(0,-50%)' },
  { top: '35%', left: '8%', transform: 'translate(0,-50%)' },
  { top: '15%', left: '25%', transform: 'translate(-50%,-50%)' },
  { top: '15%', left: '50%', transform: 'translate(-50%,-50%)' },
  { top: '15%', left: '75%', transform: 'translate(-50%,-50%)' },
  { top: '35%', left: '88%', transform: 'translate(-100%,-50%)' },
  { top: '65%', left: '88%', transform: 'translate(-100%,-50%)' },
  { top: '85%', left: '75%', transform: 'translate(-50%,-50%)' },
];

export default function PokerTable() {
  const { seats, players, actorId, stage, pot, board, running, lobbyPlayers, lobsterName } = useGameStore();
  const { user } = useAuthStore();
  const t = useT();

  const playerMap = Object.fromEntries((players || []).map(p => [p.id, p]));

  const lobsterModel = lobsterName
    ? { id: 'lobster', label: lobsterName, color: '#e53e3e', emoji: '🦞' }
    : LOBSTER_MODEL;

  return (
    <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="relative w-full h-full felt-bg rounded-[50%] border-4 border-[#8b6914] shadow-2xl"
          style={{ boxShadow: '0 0 60px rgba(0,0,0,0.8), inset 0 0 40px rgba(0,0,0,0.4)' }}
        >
          <div className="absolute inset-4 rounded-[50%] border-2 border-[#6b4f10] opacity-50" />

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {running && stage && (
              <div className="text-xs text-[#a8d4a8] uppercase tracking-widest mb-1 font-mono">
                {stage}
              </div>
            )}
            {running && pot > 0 && (
              <div className="text-gold font-display text-lg font-bold">
                Chips {pot.toLocaleString()}
              </div>
            )}
            {!running && (
              <div className="text-gray-500 text-xs text-center px-4">
                {lobbyPlayers.length === 0
                  ? t.table.selectSeat
                  : t.table.seated(lobbyPlayers.length)}
              </div>
            )}
            {running && <CommunityCards cards={board} />}
          </div>

          {!running && <TableLobby lobbyPlayers={lobbyPlayers} user={user} t={t} />}

          {running && seats.map((seat, i) => {
            const player = playerMap[seat.id] || null;
            const pos = SEAT_POSITIONS[i % SEAT_POSITIONS.length];
            const isActor = actorId === seat.id;
            const isBust = seat.chips <= 0;
            const model = seat.id === 'lobster'
              ? lobsterModel
              : resolveModel(seat.id);

            return (
              <div
                key={seat.id}
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

function TableLobby({ lobbyPlayers, user, t }) {
  const isSitting = user ? lobbyPlayers.some(p => p.id === user.id) : false;

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
                {player.models?.length > 0 && (
                  <span className="text-[9px] text-gray-400 whitespace-nowrap max-w-[80px] truncate" title={player.models.map(id => MODEL_MAP[id]?.label || id).join(', ')}>
                    {player.models.map(id => MODEL_MAP[id]?.emoji || '🤖').join('')}
                    {' '}
                    {player.models.length === 1
                      ? MODEL_MAP[player.models[0]]?.label || player.models[0]
                      : t.table.models(player.models.length)}
                  </span>
                )}
                {isMe && (
                  <button
                    onClick={() => getSocket().emit('seat:leave')}
                    className="text-[9px] text-red-400 hover:text-red-300 underline leading-none"
                  >
                    {t.table.leave}
                  </button>
                )}
              </div>
            ) : !isSitting ? (
              <button
                onClick={() => getSocket().emit('seat:take')}
                className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-black/30 border-2 border-dashed border-white/20 hover:border-green-400 hover:bg-green-900/30 text-white/30 hover:text-green-400 font-bold text-xl transition-all flex items-center justify-center"
                title={t.table.takeSeat}
              >
                +
              </button>
            ) : (
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-black/20 border-2 border-dashed border-white/10 flex items-center justify-center text-white/20 text-xs">
                -
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
