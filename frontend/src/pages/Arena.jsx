import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';
import { startGame, stopGame, getRooms, createRoom } from '../utils/api.js';
import PokerTable from '../components/table/PokerTable.jsx';
import BettingPanel from '../components/betting/BettingPanel.jsx';
import ActionLog from '../components/log/ActionLog.jsx';

export default function Arena() {
  const { running, gameId, handNumber, seats, currentRoomId, setCurrentRoomId } = useGameStore();
  const { user } = useAuthStore();
  const [starting, setStarting] = useState(false);
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
    // useSocket watches currentRoomId and emits room:join automatically
  };

  const handleStart = async (testMode = false) => {
    setStarting(true);
    try {
      await startGame(currentRoomId, testMode);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to start');
    }
    setStarting(false);
    fetchRooms();
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
      alert(e.response?.data?.error || 'Failed to create room');
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
              {room.name} {room.running ? '🔴 LIVE' : '⬜ WAITING'} · 👁 {room.watcherCount}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-4">
        {/* ── Room list panel — desktop only ─────────────────────────────── */}
        <div className="hidden md:block w-52 flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Rooms</span>
            {user && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-xs text-lobster hover:text-red-400 font-semibold"
                title="Create Room"
              >
                + New
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
                  {room.running ? 'LIVE' : 'WAIT'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                {room.running && <span>Hand #{room.handNumber}</span>}
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
                    — Hand #{handNumber} · {seats.filter(s => s.chips > 0).length} AIs
                  </span>
                )}
              </h2>
              {gameId && <div className="text-xs text-gray-500">Game #{gameId}</div>}
            </div>
            <div className="flex gap-2">
              {user && !running && (
                <>
                  <button
                    onClick={() => handleStart(true)}
                    disabled={starting}
                    title="No API keys needed — AI uses local rule-based decisions"
                    className="bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-[#555] text-gray-300 px-2 md:px-4 py-2 rounded-xl font-semibold transition-colors disabled:opacity-50 text-xs md:text-sm"
                  >
                    {starting ? '...' : '🧪 Test'}
                  </button>
                  <button
                    onClick={() => handleStart(false)}
                    disabled={starting}
                    className="bg-lobster hover:bg-red-700 text-white px-3 md:px-5 py-2 rounded-xl font-semibold transition-colors disabled:opacity-50 text-sm"
                  >
                    {starting ? 'Starting...' : '▶ Start'}
                  </button>
                </>
              )}
              {user && running && (
                <button
                  onClick={handleStop}
                  className="bg-[#333] hover:bg-[#444] text-gray-300 px-5 py-2 rounded-xl font-semibold transition-colors"
                >
                  ⏹ Stop
                </button>
              )}
              {!user && (
                <a href="/login"
                  className="bg-[#2a2a2a] border border-[#444] text-gray-300 hover:text-white px-5 py-2 rounded-xl font-semibold transition-colors text-sm">
                  Sign in to play
                </a>
              )}
            </div>
          </div>

          {/* Main layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 md:gap-4">
            <div className="space-y-4">
              <PokerTable />
              <ActionLog />
            </div>
            <div className="space-y-4">
              <BettingPanel />
              <ChipLeaderboard seats={seats} />
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
            <h3 className="font-bold text-white text-lg">Create Room</h3>
            <input
              autoFocus
              value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateRoom(); if (e.key === 'Escape') setShowCreateModal(false); }}
              placeholder="Room name..."
              maxLength={40}
              className="w-full bg-[#2a2a2a] border border-[#444] rounded-xl px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-lobster"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl bg-[#2a2a2a] text-gray-400 hover:text-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRoom}
                disabled={creating || !newRoomName.trim()}
                className="px-4 py-2 rounded-xl bg-lobster hover:bg-red-700 text-white font-semibold text-sm disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChipLeaderboard({ seats }) {
  if (!seats || seats.length === 0) return null;
  const sorted = [...seats].sort((a, b) => b.chips - a.chips);
  const max = sorted[0]?.chips || 1;

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-4">
      <h3 className="font-semibold text-sm text-gray-300 mb-3">Chip Counts</h3>
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
