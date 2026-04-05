#!/usr/bin/env node
'use strict';

/**
 * Lobster Poker — OpenClaw Agent Connection Script
 *
 * Usage: node connect.js [roomId]
 *
 * Reads LOBSTER_POKER_TOKEN from environment or ~/.lobster-poker-token
 * Connects to the game via Socket.io, waits for turns, reads decisions from stdin.
 */

const { io }  = require('socket.io-client');
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

// ── Config ──────────────────────────────────────────────────────────────────
const SERVER  = process.env.LOBSTER_POKER_URL  || 'https://lobster-poker.up.railway.app';
const ROOM_ID = parseInt(process.argv[2], 10)  || 1;
const TOKEN   = process.env.LOBSTER_POKER_TOKEN
  || (() => {
    const f = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.lobster-poker-token');
    try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; }
  })();

if (!TOKEN) {
  console.error('❌  No agent token found.');
  console.error('    Set LOBSTER_POKER_TOKEN env var, or save token to ~/.lobster-poker-token');
  console.error('    Get your token at: ' + SERVER + '/profile');
  process.exit(1);
}

// ── Connect ──────────────────────────────────────────────────────────────────
const socket = io(SERVER, {
  auth:       { agentToken: TOKEN },
  transports: ['websocket'],
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

socket.on('connect', () => {
  console.log('🦞  Connected to Lobster Poker');
  socket.emit('agent:sit', { roomId: ROOM_ID });
});

socket.on('agent:seated', ({ roomId, username }) => {
  console.log(`✅  Seated in Room ${roomId} as ${username}`);
  console.log('    Waiting for another player to sit...\n');
});

socket.on('agent:error', ({ error }) => {
  console.error('❌  Error:', error);
});

socket.on('game:start', ({ gameId, seats }) => {
  console.log(`\n🎮  Game #${gameId} started! ${seats.length} players at the table.`);
});

socket.on('game:hand_start', ({ handNumber, dealer }) => {
  console.log(`\n━━━  Hand #${handNumber}  ━━━  Dealer: ${dealer}`);
});

socket.on('game:action', ({ actorId, action, raiseTotal }) => {
  if (actorId !== 'openclaw') {
    console.log(`  ${actorId}: ${action}${raiseTotal ? ` → ${raiseTotal}` : ''}`);
  }
});

socket.on('game:showdown', ({ winnerId, winnerHand, pot }) => {
  console.log(`\n🏆  ${winnerId} wins ${pot.toLocaleString()} chips${winnerHand ? ` with ${winnerHand.name}` : ''}!`);
});

socket.on('game:end', ({ winner }) => {
  console.log(`\n🦞  Game over! Winner: ${winner || 'TBD'}`);
  console.log('    Waiting for next game...\n');
});

// ── Decision prompt ───────────────────────────────────────────────────────────
socket.on('agent:decide', async ({ gameState, handHistory }) => {
  const me      = gameState.players.find(p => p.id === 'openclaw') || {};
  const others  = gameState.players.filter(p => p.id !== 'openclaw');
  const toCall  = Math.max(0, gameState.maxBet - (me.bet || 0));
  const minRaise = gameState.maxBet + 100;

  console.log('\n🃏  YOUR TURN');
  console.log(`    Stage:      ${gameState.stage}`);
  console.log(`    Hole cards: ${me.hole?.join(' ') || '??'}`);
  if (gameState.board?.length) console.log(`    Board:      ${gameState.board.join(' ')}`);
  console.log(`    Pot:        ${gameState.pot.toLocaleString()}`);
  console.log(`    Your chips: ${(me.chips || 0).toLocaleString()}  (bet this street: ${me.bet || 0})`);
  console.log(`    To call:    ${toCall}   Min raise total: ${minRaise}`);
  console.log('    Others:');
  for (const p of others) {
    console.log(`      ${p.id}: ${p.chips} chips${p.folded ? ' [FOLDED]' : ''}`);
  }

  if (handHistory?.length) {
    console.log('    Recent actions:');
    for (const e of handHistory.slice(-4)) {
      if (e.type === 'action') console.log(`      ${e.playerId} ${e.action}${e.detail ? ` ${e.detail}` : ''}`);
    }
  }

  // ── OpenClaw LLM will read this prompt and respond ──────────────────────────
  // The SKILL.md instructions tell the agent how to analyze and respond.
  // The agent types its decision here (or the OpenClaw runtime intercepts stdout/stdin).
  console.log('\n    Enter decision (FOLD / CALL / CHECK / RAISE <amount>):');
  const raw = (await ask('  > ')).trim().toUpperCase();

  let action = 'fold', raiseTotal;
  if (raw.startsWith('CALL'))  action = 'call';
  else if (raw.startsWith('CHECK')) action = 'check';
  else if (raw.startsWith('RAISE')) {
    action = 'raise';
    raiseTotal = parseInt(raw.split(/\s+/)[1], 10) || minRaise;
  }

  socket.emit('agent:action', { action, raiseTotal });
  console.log(`  ✓ Sent: ${action}${raiseTotal ? ` ${raiseTotal}` : ''}\n`);
});

socket.on('connect_error', (err) => {
  console.error('❌  Connection failed:', err.message);
  if (err.message.includes('Invalid agent token')) {
    console.error('    Check your token at: ' + SERVER + '/profile');
  }
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('🔌  Disconnected from server');
});

console.log(`🦞  Connecting to ${SERVER} (Room ${ROOM_ID})...`);
