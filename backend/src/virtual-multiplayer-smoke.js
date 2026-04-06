'use strict';

const assert = require('assert');

const { GameEngine } = require('./game/game-engine');
const { stmts } = require('./db/database');
const { TEST_KEY } = require('./game/ai-player');

const realSetTimeout = global.setTimeout;
const realConsoleLog = console.log;

function fastTimers() {
  global.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, Math.min(ms, 20), ...args);
}

function restoreTimers() {
  global.setTimeout = realSetTimeout;
}

function quietLogs() {
  console.log = (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[AI]')) return;
    realConsoleLog(...args);
  };
}

function restoreLogs() {
  console.log = realConsoleLog;
}

function createFakeIO(onEmit = null) {
  const events = [];
  return {
    events,
    to(room) {
      return {
        emit(event, data) {
          events.push({ room, event, data });
          if (onEmit) onEmit(event, data);
        },
      };
    },
  };
}

function patchDb(fakeUsers, betProvider = () => []) {
  const originals = {
    createGameGet: stmts.createGame.get,
    insertSeatRun: stmts.insertSeat.run,
    ensureAiStatsRun: stmts.ensureAiStats.run,
    getUserByIdGet: stmts.getUserById.get,
    updateSeatRun: stmts.updateSeat.run,
    recordHandResultRun: stmts.recordHandResult.run,
    recordWinRun: stmts.recordWin.run,
    insertHandGet: stmts.insertHand.get,
    getBetsForHandAll: stmts.getBetsForHand.all,
    eliminateSeatRun: stmts.eliminateSeat.run,
    endGameRun: stmts.endGame.run,
    incrementHandRun: stmts.incrementHand.run,
    addCoinsRun: stmts.addCoins.run,
    settleBetRun: stmts.settleBet.run,
  };

  let nextGameId = 1000;
  const writes = {
    games: [],
    hands: [],
    seats: [],
    payouts: [],
  };

  stmts.createGame.get = (createdBy, roomId) => {
    const id = nextGameId++;
    writes.games.push({ id, createdBy, roomId });
    return { id };
  };
  stmts.insertSeat.run = (gameId, model) => writes.seats.push({ gameId, model });
  stmts.ensureAiStats.run = () => {};
  stmts.getUserById.get = (id) => fakeUsers[id] || null;
  stmts.updateSeat.run = () => {};
  stmts.recordHandResult.run = () => {};
  stmts.recordWin.run = () => {};
  stmts.insertHand.get = (hand) => {
    writes.hands.push(hand);
    return { id: writes.hands.length };
  };
  stmts.getBetsForHand.all = (gameId, handNumber) => betProvider(gameId, handNumber);
  stmts.eliminateSeat.run = () => {};
  stmts.endGame.run = () => {};
  stmts.incrementHand.run = () => {};
  stmts.addCoins.run = (amount, userId) => writes.payouts.push({ amount, userId });
  stmts.settleBet.run = () => {};

  return {
    writes,
    restore() {
      stmts.createGame.get = originals.createGameGet;
      stmts.insertSeat.run = originals.insertSeatRun;
      stmts.ensureAiStats.run = originals.ensureAiStatsRun;
      stmts.getUserById.get = originals.getUserByIdGet;
      stmts.updateSeat.run = originals.updateSeatRun;
      stmts.recordHandResult.run = originals.recordHandResultRun;
      stmts.recordWin.run = originals.recordWinRun;
      stmts.insertHand.get = originals.insertHandGet;
      stmts.getBetsForHand.all = originals.getBetsForHandAll;
      stmts.eliminateSeat.run = originals.eliminateSeatRun;
      stmts.endGame.run = originals.endGameRun;
      stmts.incrementHand.run = originals.incrementHandRun;
      stmts.addCoins.run = originals.addCoinsRun;
      stmts.settleBet.run = originals.settleBetRun;
    },
  };
}

async function runDuplicateModelScenario() {
  const dbPatch = patchDb({
    1: { id: 1, username: 'owner-one', display_name: 'Owner One', lobster_model: null },
  });

  let engine;
  const io = createFakeIO((event) => {
    if (event === 'game:hand_end') {
      realSetTimeout(() => engine.stop(), 1);
    }
  });
  engine = new GameEngine(io, 11);
  engine.apiKeys = {
    deepseek: TEST_KEY,
    deepseek_2: TEST_KEY,
  };

  await engine.start(1, ['deepseek', 'deepseek_2'], {
    deepseek: 'Owner One',
    deepseek_2: 'Owner Two',
  });

  const gameStart = io.events.find((evt) => evt.event === 'game:start');
  const gameEnd = io.events.find((evt) => evt.event === 'game:end');
  const bettingWindow = io.events.find((evt) => evt.event === 'game:betting_window');

  assert(gameStart, 'duplicate-model scenario should emit game:start');
  assert(gameEnd, 'duplicate-model scenario should emit game:end');
  assert(bettingWindow, 'duplicate-model scenario should open betting');
  assert.deepStrictEqual(
    gameStart.data.seats.map((seat) => seat.id).sort(),
    ['deepseek', 'deepseek_2'].sort(),
    'duplicate-model scenario should keep unique seat ids'
  );
  assert.strictEqual(bettingWindow.data.handNumber, 1, 'first hand should start at hand #1');

  dbPatch.restore();
  return {
    totalEvents: io.events.length,
    winner: gameEnd.data.winner,
    handsRecorded: dbPatch.writes.hands.length,
  };
}

async function runOpenClawScenario() {
  const dbPatch = patchDb({
    1: { id: 1, username: 'owner-two', display_name: 'Owner Two', lobster_model: null },
    2: { id: 2, username: 'agent-user', display_name: 'Agent User', lobster_model: null },
  });

  let engine;
  const io = createFakeIO((event) => {
    if (event === 'game:hand_end') {
      realSetTimeout(() => engine.stop(), 1);
    }
  });
  engine = new GameEngine(io, 12);
  engine.apiKeys = {
    deepseek: TEST_KEY,
  };
  engine.agentSocket = {
    connected: true,
    data: { agentUser: { id: 2, username: 'agent-user', display_name: 'Agent User' } },
    emit(event, payload) {
      if (event !== 'agent:decide') return;
      realSetTimeout(() => {
        if (!engine.pendingAgentResolve) return;
        const openclaw = payload.gameState.players.find((p) => p.id === 'openclaw');
        const toCall = Math.max(0, payload.gameState.maxBet - (openclaw?.bet || 0));
        engine.pendingAgentResolve(toCall > 0 ? { action: 'call' } : { action: 'check' });
        engine.pendingAgentResolve = null;
      }, 5);
    },
  };

  await engine.start(1, ['deepseek'], {
    deepseek: 'Owner Two',
  });

  const gameStart = io.events.find((evt) => evt.event === 'game:start');
  const gameEnd = io.events.find((evt) => evt.event === 'game:end');
  const agentThink = io.events.find((evt) => evt.event === 'game:thinking' && evt.data.actorId === 'openclaw');

  assert(gameStart, 'openclaw scenario should emit game:start');
  assert(gameEnd, 'openclaw scenario should emit game:end');
  assert(
    gameStart.data.seats.some((seat) => seat.id === 'openclaw'),
    'openclaw scenario should seat the agent'
  );
  assert(agentThink, 'openclaw scenario should give the agent at least one action');

  dbPatch.restore();
  return {
    totalEvents: io.events.length,
    winner: gameEnd.data.winner,
    handsRecorded: dbPatch.writes.hands.length,
  };
}

async function runSequentialResetScenario() {
  const dbPatch = patchDb({
    1: { id: 1, username: 'owner-three', display_name: 'Owner Three', lobster_model: null },
  });

  let engine;
  const io = createFakeIO((event) => {
    if (event === 'game:hand_end') {
      realSetTimeout(() => engine.stop(), 1);
    }
  });
  engine = new GameEngine(io, 13);
  engine.apiKeys = {
    deepseek: TEST_KEY,
    qwen: TEST_KEY,
  };

  await engine.start(1, ['deepseek', 'qwen']);
  const firstEnd = io.events.find((evt) => evt.event === 'game:end');
  assert(firstEnd, 'first sequential game should finish');

  const beforeSecond = io.events.length;
  await engine.start(1, ['deepseek', 'qwen']);
  const secondWindow = io.events.slice(beforeSecond).find((evt) => evt.event === 'game:betting_window');

  assert(secondWindow, 'second sequential game should open betting');
  assert.strictEqual(secondWindow.data.handNumber, 1, 'second sequential game should reset hand number to 1');

  dbPatch.restore();
  return {
    totalEvents: io.events.length,
    handsRecorded: dbPatch.writes.hands.length,
  };
}

async function main() {
  fastTimers();
  quietLogs();
  try {
    const duplicate = await runDuplicateModelScenario();
    const openclaw = await runOpenClawScenario();
    const sequential = await runSequentialResetScenario();

    console.log('virtual-multiplayer-smoke: PASS');
    console.log(JSON.stringify({ duplicate, openclaw, sequential }, null, 2));
  } finally {
    restoreTimers();
    restoreLogs();
  }
}

main().catch((err) => {
  restoreTimers();
  restoreLogs();
  console.error('virtual-multiplayer-smoke: FAIL');
  console.error(err);
  process.exitCode = 1;
});
