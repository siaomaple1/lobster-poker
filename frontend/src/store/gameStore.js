import { create } from 'zustand';

export const useGameStore = create((set, get) => ({
  // ── Room state ────────────────────────────────────────────────────────────
  currentRoomId: 1,
  setCurrentRoomId(roomId) {
    set({
      currentRoomId: roomId,
      running: false, gameId: null, handNumber: 0, seats: [],
      stage: null, board: [], pot: 0, maxBet: 0, actorId: null, players: [],
      bettingOpen: false, bettingEndsAt: null, log: [], chatMessages: [],
      lastWinner: null, lastWinHand: null, lobbyPlayers: [], lobbyError: null,
      lobsterName: null,
    });
  },

  // ── Server state ──────────────────────────────────────────────────────────
  running:     false,
  gameId:      null,
  handNumber:  0,
  seats:       [],     // [{ id, chips }]
  stage:       null,
  board:       [],
  pot:         0,
  maxBet:      0,
  actorId:     null,
  players:     [],     // per-hand player state from PokerHand

  // ── Betting window ────────────────────────────────────────────────────────
  bettingOpen:   false,
  bettingEndsAt: null,

  // ── Action log ────────────────────────────────────────────────────────────
  log: [],

  // ── Chat ─────────────────────────────────────────────────────────────────
  chatMessages: [],
  addChatMessage(msg) {
    set(s => ({ chatMessages: [...s.chatMessages.slice(-49), msg] }));
  },

  // ── Lobby ─────────────────────────────────────────────────────────────────
  lobbyPlayers: [],
  lobbyError: null,
  handleLobbyUpdate(data) {
    set({ lobbyPlayers: data.players || [] });
  },
  handleLobbyError(data) {
    set({ lobbyError: data.error });
    setTimeout(() => set({ lobbyError: null }), 5000);
  },

  // ── Last hand result ─────────────────────────────────────────────────────
  lastWinner:   null,
  lastWinHand:  null,

  // ── Lobster name (set when a game starts with a user lobster seat) ────────
  lobsterName: null,

  // ── Online count ──────────────────────────────────────────────────────────
  onlineCount: 0,
  setOnlineCount(count) { set({ onlineCount: count }); },

  // ── Socket event handlers ─────────────────────────────────────────────────
  handleStatus(data) {
    set({ running: data.running, gameId: data.gameId, handNumber: data.handNumber, seats: data.seats });
  },

  handleGameStart(data) {
    set({
      running: true, gameId: data.gameId,
      seats: data.seats, board: [], pot: 0, stage: null,
      lobsterName: data.lobsterName || null,
      log: [{ type: 'system', msg: '🦞 New game started!' }],
    });
  },

  handleBettingWindow(data) {
    set({
      bettingOpen: true,
      bettingEndsAt: Date.now() + data.duration,
      handNumber: data.handNumber,
      board: [],
      pot: 0,
      players: [],
      lastWinner: null,
      lastWinHand: null,
    });
    get().pushLog({ type: 'system', msg: `✋ Hand #${data.handNumber} — Place your bets!` });
  },

  handleBettingClosed() {
    set({ bettingOpen: false, bettingEndsAt: null });
    get().pushLog({ type: 'system', msg: '🃏 Betting closed. Dealing...' });
  },

  handleHandStart(data) {
    set({
      stage: data.state.stage,
      board: data.state.board,
      pot:   data.state.pot,
      players: data.state.players,
      actorId: null,
    });
    get().pushLog({ type: 'system', msg: `Dealer: ${data.dealer}` });
  },

  handleThinking(data) {
    set({ actorId: data.actorId, stage: data.state.stage, board: data.state.board,
          pot: data.state.pot, players: data.state.players });
  },

  handleAction(data) {
    const { actorId, action, raiseTotal, thought, trash, ownerName, state } = data;
    set({ stage: state.stage, board: state.board, pot: state.pot,
          players: state.players, actorId: null });
    get().pushLog({ type: 'action', actorId, action, amount: raiseTotal, thought, trash, ownerName });
  },

  handleShowdown(data) {
    set({
      stage: 'showdown',
      players: data.state.players,
      board: data.state.board,
      lastWinner: data.winnerId,
      lastWinHand: data.winnerHand,
    });
    get().pushLog({
      type: 'winner',
      msg: `🏆 ${data.winnerId} wins ${data.pot.toLocaleString()} chips${data.winnerHand ? ` with ${data.winnerHand.name}` : ''}!`,
    });
  },

  handleHandEnd(data) {
    set({ seats: data.seats, handNumber: data.handNumber });
  },

  handleGameEnd(data) {
    set({ running: false, seats: data.seats });
    get().pushLog({ type: 'system', msg: `🦞 Game over! Winner: ${data.winner || 'TBD'}` });
  },

  handlePayouts(data) {
    get().pushLog({
      type: 'payout',
      msg: `💰 Payouts settled for hand #${data.handNumber}`,
    });
  },

  pushLog(entry) {
    set(s => ({ log: [...s.log.slice(-100), { ...entry, ts: Date.now() }] }));
  },
}));
