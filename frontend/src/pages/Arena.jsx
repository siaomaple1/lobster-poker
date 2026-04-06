import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';
import { useT } from '../utils/i18n.js';
import { stopGame, getRooms, createRoom } from '../utils/api.js';
import { getSocket } from '../hooks/useSocket.js';
import PokerTable from '../components/table/PokerTable.jsx';
import BettingPanel from '../components/betting/BettingPanel.jsx';
import ActionLog from '../components/log/ActionLog.jsx';

export default function Arena() {
  const { running, gameId, handNumber, seats, currentRoomId, setCurrentRoomId } = useGameStore();
  const { user } = useAuthStore();
  const t = useT();
  const [rooms, setRooms] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchRooms = useCallback(async () => {
    try { setRooms(await getRooms()); } catch { }
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  const handleSwitchRoom = (roomId) => {
    setCurrentRoomId(roomId);
  };

  const handleStop = async () => {
    try { await stopGame(currentRoomId); } catch { }
    fetchRooms();
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    setCreating(true);
    try {
      const room = await createRoom(newRoomName.trim());
      await fetchRooms();
      setShowCreateModal(false);
      setNewRoomName('');
      handleSwitchRoom(room.id);
    } catch (e) {
      alert(e.response?.data?.error || t.arena.failedCreate);
    }
    setCreating(false);
  };

  const currentRoom = rooms.find(r => r.id === currentRoomId);

  return (
    <div className="max-w-[1400px] mx-auto p-3 md:p-4 lg:p-6">

      {/* ── Mobile: room selector dropdown ─────────────────────────────── */}
      <div className="md:hidden mb-3">
        <select
          value={currentRoomId}
          onChange={e => handleSwitchRoom(Number(e.target.value))}
          className="w-full bg-[#1e1e1e] border border-[#444] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-lobster"
        >
          {rooms.map(room => (
            <option key={room.id} value={room.id}>
              {room.name} {room.running ? `🔴 ${t.arena.live}` : `⬜ ${t.arena.wait}`} · 👁 {room.watcherCount}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-4">
        {/* ── Room list panel — desktop only ─────────────────────────────── */}
        <div className="hidden md:block w-52 flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t.arena.rooms}</span>
            {user && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-xs text-lobster hover:text-red-400 font-semibold"
                title={t.arena.createRoom}
              >
                {t.arena.newRoom}
              </button>
            )}
          </div>

          {rooms.map(room => (
            <button
              key={room.id}
              onClick={() => handleSwitchRoom(room.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                room.id === currentRoomId
                  ? 'bg-[#2a1515] border-lobster text-white'
                  : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-[#555] hover:text-gray-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-semibold text-sm truncate">{room.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  room.running ? 'bg-green-900 text-green-400' : 'bg-[#333] text-gray-500'
                }`}>
                  {room.running ? t.arena.live : t.arena.wait}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                {room.running && <span>{t.arena.hand(room.handNumber)}</span>}
                <span>👁 {room.watcherCount}</span>
              </div>
            </button>
          ))}
        </div>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <div>
              <h2 className="text-base md:text-xl font-display font-bold text-white">
                {currentRoom?.name || 'Arena'}
                {running && (
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    {t.arena.aiCount(seats.filter(s => s.chips > 0).length, handNumber)}
                  </span>
                )}
              </h2>
              {gameId && <div className="text-xs text-gray-500">{t.arena.gameId(gameId)}</div>}
            </div>
            <div className="flex gap-2">
              {user && running && (
                <button
                  onClick={handleStop}
                  className="bg-[#333] hover:bg-[#444] text-gray-300 px-5 py-2 rounded-xl font-semibold transition-colors"
                >
                  {t.arena.stop}
                </button>
              )}
              {!user && (
                <a href="/login"
                  className="bg-[#2a2a2a] border border-[#444] text-gray-300 hover:text-white px-5 py-2 rounded-xl font-semibold transition-colors text-sm">
                  {t.arena.signInToPlay}
                </a>
              )}
            </div>
          </div>

          {/* Lobby */}
          {!running && <LobbyPanel user={user} t={t} />}
          {!running && <OnboardingPanel user={user} lobbyRooms={rooms} currentRoom={currentRoom} />}

          {/* Main layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 md:gap-4">
            <div className="space-y-4">
              <PokerTable />
              <ActionLog />
            </div>
            <div className="space-y-4">
              <BettingPanel />
              <ChipLeaderboard seats={seats} label={t.arena.chipCounts} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Create Room Modal ──────────────────────────────────────────────── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div className="bg-[#1e1e1e] border border-[#444] rounded-2xl p-6 w-80 space-y-4">
            <h3 className="font-bold text-white text-lg">{t.arena.createRoom}</h3>
            <input
              autoFocus
              value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateRoom(); if (e.key === 'Escape') setShowCreateModal(false); }}
              placeholder={t.arena.roomNamePlaceholder}
              maxLength={40}
              className="w-full bg-[#2a2a2a] border border-[#444] rounded-xl px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-lobster"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl bg-[#2a2a2a] text-gray-400 hover:text-white text-sm"
              >
                {t.arena.cancel}
              </button>
              <button
                onClick={handleCreateRoom}
                disabled={creating || !newRoomName.trim()}
                className="px-4 py-2 rounded-xl bg-lobster hover:bg-red-700 text-white font-semibold text-sm disabled:opacity-50"
              >
                {creating ? t.arena.creating : t.arena.create}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LobbyPanel({ user, t }) {
  const { lobbyPlayers, lobbyError } = useGameStore();

  const myEntry = user ? lobbyPlayers.find(p => p.id === user.id) : null;
  const isReady = myEntry?.ready ?? false;

  const readyCount = lobbyPlayers.filter(p => p.ready).length;

  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-4 mb-3 md:mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-300">
          {t.arena.lobbyTitle(readyCount, lobbyPlayers.length)}
        </span>
        <span className="text-xs text-gray-500">{t.arena.lobbyNeed}</span>
      </div>

      {lobbyPlayers.length === 0 ? (
        <div className="text-xs text-gray-600 text-center py-1">
          {user ? t.arena.lobbyEmpty : t.arena.lobbySignIn}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {lobbyPlayers.map(p => (
            <div key={p.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border
              ${p.ready ? 'bg-green-900/30 border-green-700 text-green-400' : 'bg-[#2a2a2a] border-[#444] text-gray-400'}`}>
              {p.avatar
                ? <img src={p.avatar} className="w-4 h-4 rounded-full" alt="" />
                : <div className="w-4 h-4 rounded-full bg-[#555] flex items-center justify-center text-[8px]">{p.username[0]}</div>
              }
              <span>{p.username}</span>
              <span className="font-bold">{p.ready ? '✓' : '…'}</span>
            </div>
          ))}
        </div>
      )}

      {user && myEntry && isReady && (
        <div className="w-full bg-green-900/40 border border-green-700/50 text-green-400 py-2 rounded-xl font-semibold text-sm text-center">
          {t.arena.readyWaiting}
        </div>
      )}
      {!user && (
        <a href="/login" className="block text-center text-xs text-lobster hover:underline">
          {t.arena.signInLobby}
        </a>
      )}
      {lobbyError && (
        <div className="text-red-400 text-xs text-center bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
          ⚠️ {lobbyError}
        </div>
      )}
    </div>
  );
}

function OnboardingPanel({ user, lobbyRooms, currentRoom }) {
  const liveRooms = lobbyRooms.filter((room) => room.running).length;

  if (!user) {
    return (
      <div className="bg-[#151515] border border-[#2d2d2d] rounded-2xl p-4 mb-3 md:mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Start here</h3>
            <p className="text-xs text-gray-500 mt-1">
              Sign in first, then add at least one model key in Profile so you can join a lobby or watch a live room.
            </p>
          </div>
          <span className="text-[11px] px-2 py-1 rounded-full bg-[#262626] text-gray-400">
            {liveRooms} live
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/login"
            className="rounded-xl bg-lobster hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            Sign in
          </a>
          <a
            href="/leaderboard"
            className="rounded-xl bg-[#232323] hover:bg-[#2c2c2c] text-gray-200 px-4 py-2 text-sm transition-colors"
          >
            View leaderboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#151515] border border-[#2d2d2d] rounded-2xl p-4 mb-3 md:mb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Quick start</h3>
          <p className="text-xs text-gray-500 mt-1">
            Join the current room, make sure at least two ready players have usable model seats, then watch the Action Log during each hand.
          </p>
        </div>
        <span className="text-[11px] px-2 py-1 rounded-full bg-[#262626] text-gray-400">
          {currentRoom?.name || 'Room'}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <GuideStep
          title="1. Configure"
          body="Add model keys and tune your Lobster prompt in Profile."
          href="/profile"
          cta="Open profile"
        />
        <GuideStep
          title="2. Fill the room"
          body="Rooms start best when two or more ready participants contribute usable model seats."
        />
        <GuideStep
          title="3. Bet or spectate"
          body="Bet during the window, then use the Action Log to follow each hand."
        />
      </div>
    </div>
  );
}

function GuideStep({ title, body, href, cta }) {
  return (
    <div className="rounded-xl border border-[#2b2b2b] bg-[#1b1b1b] px-3 py-3">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-gray-500">{body}</div>
      {href && cta && (
        <a href={href} className="inline-block mt-3 text-xs font-semibold text-lobster hover:text-red-400">
          {cta}
        </a>
      )}
    </div>
  );
}

function ChipLeaderboard({ seats, label }) {
  if (!seats || seats.length === 0) return null;
  const sorted = [...seats].sort((a, b) => b.chips - a.chips);
  const max = sorted[0]?.chips || 1;

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-4">
      <h3 className="font-semibold text-sm text-gray-300 mb-3">{label}</h3>
      <div className="space-y-2">
        {sorted.map((s, i) => {
          const pct = (s.chips / max) * 100;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4">#{i+1}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className={s.chips <= 0 ? 'text-gray-600' : 'text-gray-300'}>{s.id}</span>
                  <span className="font-mono text-gold">{(s.chips/1000).toFixed(1)}K</span>
                </div>
                <div className="h-1.5 bg-[#333] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
