'use strict';

const { PokerHand } = require('./poker');
const { getAIAction } = require('./ai-player');
const { stmts } = require('../db/database');

const BETTING_WINDOW_MS = 15000;  // 15s for users to place bets
const ACTION_DELAY_MS   = 1500;   // delay between AI actions for readability
const HAND_END_DELAY_MS = 4000;   // pause after showdown before next hand

const AI_MODELS = ['claude', 'gpt', 'deepseek', 'gemini', 'grok', 'qwen', 'mistral', 'cohere', 'groq'];
const STARTING_CHIPS = 10000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class GameEngine {
  constructor(io, roomId = 1) {
    this.io      = io;           // Socket.io server instance
    this.roomId  = roomId;       // which room this engine belongs to
    this.apiKeys = {};           // { claude: 'sk-...', gpt: '...', ... }
    this.lobsterConfig = null;   // { model, prompt, apiKey, name } if a user lobster is seated
    this.running = false;
    this.gameId = null;
    this.handNumber = 0;
    this.seats = [];             // [{ id: 'claude', chips: 10000 }]
    this.currentHand = null;
    this.dealerId = null;        // ID of current dealer (null = first hand, start at index 0)
    this.agentSocket = null;     // OpenClaw agent socket reference
    this.pendingAgentResolve = null; // resolve fn for current agent action
  }

  emit(event, data) {
    this.io.to(`table:${this.roomId}`).emit(event, data);
  }

  // ── Start a new game ────────────────────────────────────────────────────
  async start(createdBy = null, models = AI_MODELS) {
    if (this.running) return;
    this.running = true;

    try {
      // Create DB record
      const { id } = stmts.createGame.get(createdBy, this.roomId);
      this.gameId = id;

      // Track who started the game
      this.seatOwners = {};
      const user = createdBy ? stmts.getUserById.get(createdBy) : null;
      const name = user?.display_name || user?.username || 'Unknown';
      for (const m of models) { this.seatOwners[m] = name; }

      // Init seats — only the models that have keys
      this.seats = models.map(model => {
        stmts.insertSeat.run(id, model);
        stmts.ensureAiStats.run(model);
        return { id: model, chips: STARTING_CHIPS };
      });

      // Add lobster seat if user has one configured
      const userRow = createdBy ? stmts.getUserById.get(createdBy) : null;
      if (userRow?.lobster_model && this.apiKeys[userRow.lobster_model]) {
        const lobsterName = userRow.lobster_name || `${userRow.display_name || userRow.username}'s Lobster`;
        this.lobsterConfig = {
          model:  userRow.lobster_model,
          prompt: userRow.lobster_prompt || '',
          apiKey: this.apiKeys[userRow.lobster_model],
          name:   lobsterName,
        };
        this.seats.push({ id: 'lobster', chips: STARTING_CHIPS });
        stmts.insertSeat.run(id, 'lobster');
        stmts.ensureAiStats.run('lobster');
        this.seatOwners['lobster'] = userRow.lobster_name || userRow.display_name || userRow.username;
        console.log(`[Game ${id}] Lobster seat: "${lobsterName}" (${userRow.lobster_model})`);
      }

      // Add openclaw seat if an agent is connected
      if (this.agentSocket?.connected) {
        const agentUser = this.agentSocket.data?.agentUser;
        this.seats.push({ id: 'openclaw', chips: STARTING_CHIPS });
        stmts.insertSeat.run(id, 'openclaw');
        stmts.ensureAiStats.run('openclaw');
        if (agentUser) this.seatOwners['openclaw'] = agentUser.display_name || agentUser.username;
        console.log(`[Game ${id}] OpenClaw agent seated: ${agentUser?.username || 'unknown'}`);
      }

      console.log(`[Game ${id}] Started`);
      this.emit('game:start', { gameId: id, seats: this.seats, lobsterName: this.lobsterConfig?.name || null });

      while (this.running && this.activePlayers().length > 1) {
        await this.runHand();
      }

      this.finish();
    } catch (err) {
      this.running = false;
      throw err;
    }
  }

  activePlayers() {
    return this.seats.filter(s => s.chips > 0);
  }

  // ── Single Hand ─────────────────────────────────────────────────────────
  async runHand() {
    this.handNumber++;
    stmts.incrementHand.run(this.gameId);

    const active = this.activePlayers();
    if (active.length < 2) return;

    // Find current dealer by ID (survives player eliminations cleanly)
    let dealerPos = 0;
    if (this.dealerId !== null) {
      const found = active.findIndex(s => s.id === this.dealerId);
      dealerPos = found >= 0 ? found : 0;
    }
    const rotated = [
      ...active.slice(dealerPos),
      ...active.slice(0, dealerPos),
    ];
    // Advance dealer to next alive player for next hand
    this.dealerId = active[(dealerPos + 1) % active.length].id;

    // ── Betting Window ─────────────────────────────────────────────────
    this.emit('game:betting_window', {
      gameId:     this.gameId,
      handNumber: this.handNumber,
      duration:   BETTING_WINDOW_MS,
      models:     active.map(s => s.id),
    });
    await sleep(BETTING_WINDOW_MS);
    this.emit('game:betting_closed', { handNumber: this.handNumber });

    // ── Deal ───────────────────────────────────────────────────────────
    const hand = new PokerHand(rotated.map(s => ({ id: s.id, chips: s.chips })));
    this.currentHand = hand;

    this.emit('game:hand_start', {
      handNumber: this.handNumber,
      state:      hand.getPublicState(),
      dealer:     rotated[0].id,
    });

    // ── Action Loop ────────────────────────────────────────────────────
    let result = { status: 'action', actorId: hand.getActorId(), state: hand.getPublicState() };

    while (result.status === 'action') {
      const actorId = result.actorId;
      this.emit('game:thinking', { actorId, state: result.state });

      // Get AI decision
      const gameStateForAI = hand.getStateForPlayer(actorId);
      const lobsterCfg = (actorId === 'lobster') ? this.lobsterConfig : null;
      const { action, raiseTotal, thought, trash } = actorId === 'openclaw'
        ? await this._getAgentAction(gameStateForAI, hand.log)
        : await getAIAction(actorId, this.apiKeys, gameStateForAI, hand.log, lobsterCfg);

      await sleep(ACTION_DELAY_MS);

      result = hand.processAction(action, raiseTotal);

      this.emit('game:action', {
        actorId,
        action,
        raiseTotal:  raiseTotal || null,
        thought:     thought    || null,
        trash:       trash      || null,
        ownerName:   this.seatOwners?.[actorId] || null,
        state:       result.state || hand.getPublicState(),
      });

      await sleep(500);
    }

    // ── Showdown ───────────────────────────────────────────────────────
    const { winnerId, winnerHand, pot, state, log } = result;

    this.emit('game:showdown', { winnerId, winnerHand, pot, state });
    await sleep(HAND_END_DELAY_MS);

    // ── Update state from hand ─────────────────────────────────────────
    for (const hp of hand.players) {
      const seat = this.seats.find(s => s.id === hp.id);
      if (seat) seat.chips = hp.chips;
    }

    // DB updates
    for (const hp of hand.players) {
      stmts.updateSeat.run(hp.chips, this.gameId, hp.id);
      stmts.recordHandResult.run(hp.id === winnerId ? 1 : 0, hp.id);
    }
    stmts.recordWin.run(this.gameId, winnerId);

    // Save hand to DB
    stmts.insertHand.get({
      game_id:      this.gameId,
      hand_number:  this.handNumber,
      winner_model: winnerId,
      pot,
      community:    JSON.stringify(hand.board.map(c => `${c.rank}${c.suit}`)),
      log:          JSON.stringify(log),
    });

    // ── Settle user bets ───────────────────────────────────────────────
    this._settleBets(winnerId);

    // Eliminate bust players
    for (const seat of this.seats) {
      if (seat.chips <= 0) {
        stmts.eliminateSeat.run(this.gameId, seat.id);
      }
    }

    this.emit('game:hand_end', {
      handNumber:  this.handNumber,
      winnerId,
      winnerHand,
      pot,
      seats:       this.seats,
    });
  }

  _settleBets(winnerId) {
    const bets = stmts.getBetsForHand.all(this.gameId, this.handNumber);
    if (!bets.length) return;

    const totalPool   = bets.reduce((s, b) => s + b.amount, 0);
    const winnerBets  = bets.filter(b => b.model === winnerId);
    const winnerPool  = winnerBets.reduce((s, b) => s + b.amount, 0);

    for (const bet of bets) {
      let payout = 0;
      if (bet.model === winnerId && winnerPool > 0) {
        payout = Math.floor((bet.amount / winnerPool) * totalPool);
        stmts.addCoins.run(payout, bet.user_id);
      }
      stmts.settleBet.run(payout, bet.id);
    }

    this.emit('game:payouts', {
      handNumber: this.handNumber,
      winnerId,
      payouts: bets.map(b => ({
        userId: b.user_id,
        model:  b.model,
        bet:    b.amount,
        payout: b.model === winnerId ? Math.floor((b.amount / (winnerPool || 1)) * totalPool) : 0,
      })),
    });
  }

  // Ask the connected OpenClaw agent for its action
  _getAgentAction(gameState, handHistory) {
    const AGENT_TIMEOUT_MS = 30000;
    return new Promise((resolve, reject) => {
      if (!this.agentSocket || !this.agentSocket.connected) {
        console.warn('[Agent] No agent connected — falling back');
        const me = gameState.players.find(p => p.id === 'openclaw');
        const toCall = Math.max(0, gameState.maxBet - (me?.bet || 0));
        return resolve(toCall <= 200 ? { action: 'call' } : { action: 'fold' });
      }
      const timer = setTimeout(() => {
        this.pendingAgentResolve = null;
        console.warn('[Agent] Timed out — falling back');
        resolve({ action: 'fold' });
      }, AGENT_TIMEOUT_MS);

      this.pendingAgentResolve = (result) => {
        clearTimeout(timer);
        resolve(result);
      };
      this.agentSocket.emit('agent:decide', {
        gameState,
        handHistory: (handHistory || []).slice(-6),
      });
    });
  }

  finish() {
    const alive = this.activePlayers();
    let finalWinner = null;
    if (alive.length === 1) {
      finalWinner = alive[0].id;
    } else if (alive.length > 1) {
      // Stopped early — pick the player with the most chips
      finalWinner = alive.reduce((a, b) => (b.chips > a.chips ? b : a)).id;
    }

    stmts.endGame.run(this.gameId);
    this.running = false;
    this.currentHand = null;

    this.emit('game:end', {
      gameId: this.gameId,
      winner: finalWinner,
      seats:  this.seats,
    });

    console.log(`[Game ${this.gameId}] Ended. Winner: ${finalWinner}`);
  }

  stop() {
    this.running = false;
  }

  getStatus() {
    return {
      roomId:     this.roomId,
      running:    this.running,
      gameId:     this.gameId,
      handNumber: this.handNumber,
      seats:      this.seats,
      stage:      this.currentHand?.stage || null,
    };
  }
}

module.exports = { GameEngine, AI_MODELS };
