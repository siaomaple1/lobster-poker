'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
const HAND_NAMES = ['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'];

// ── Deck ───────────────────────────────────────────────────────────────────
function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ rank, suit, value: RANK_VALUE[rank] });
  return deck;
}

function shuffle(arr) {
  const d = [...arr];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardString(card) {
  return `${card.rank}${card.suit}`;
}

// ── Hand Evaluator ─────────────────────────────────────────────────────────
function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...getCombinations(rest, k - 1).map(c => [first, ...c]),
    ...getCombinations(rest, k),
  ];
}

function evaluate5(cards) {
  const vals = cards.map(c => c.value).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  // Build value frequency map
  const freq = {};
  for (const v of vals) freq[v] = (freq[v] || 0) + 1;
  const groups = Object.entries(freq)
    .map(([v, c]) => ({ v: +v, c }))
    .sort((a, b) => b.c - a.c || b.v - a.v);
  const counts = groups.map(g => g.c);
  const gVals  = groups.map(g => g.v);

  // Straight detection
  let isStraight = false;
  let straightHigh = 0;
  if (new Set(vals).size === 5) {
    if (vals[0] - vals[4] === 4) {
      isStraight = true;
      straightHigh = vals[0];
    } else if (vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
      isStraight = true;
      straightHigh = 5; // wheel
    }
  }

  let rank, score;
  const S = (r, ...ks) => r * 1e12 + ks.reduce((acc, k, i) => acc + k * Math.pow(100, 6 - i), 0);

  if (isFlush && isStraight)      { rank = 8; score = S(8, straightHigh); }
  else if (counts[0] === 4)       { rank = 7; score = S(7, gVals[0], gVals[1]); }
  else if (counts[0]===3 && counts[1]===2) { rank = 6; score = S(6, gVals[0], gVals[1]); }
  else if (isFlush)               { rank = 5; score = S(5, ...vals); }
  else if (isStraight)            { rank = 4; score = S(4, straightHigh); }
  else if (counts[0] === 3)       { rank = 3; score = S(3, gVals[0], gVals[1], gVals[2]); }
  else if (counts[0]===2 && counts[1]===2) { rank = 2; score = S(2, gVals[0], gVals[1], gVals[2]); }
  else if (counts[0] === 2)       { rank = 1; score = S(1, gVals[0], gVals[1], gVals[2], gVals[3]); }
  else                            { rank = 0; score = S(0, ...vals); }

  return { rank, score, name: HAND_NAMES[rank] };
}

function evaluateBestHand(cards) {
  // cards: 5-7 card objects
  if (cards.length === 5) return evaluate5(cards);
  return getCombinations(cards, 5)
    .map(evaluate5)
    .reduce((best, h) => h.score > best.score ? h : best);
}

// ── Game State ─────────────────────────────────────────────────────────────
const SMALL_BLIND = 50;
const BIG_BLIND   = 100;

class PokerHand {
  constructor(players) {
    // players: [{id, chips}]  — must be >= 2, chips > 0
    this.players = players.map(p => ({
      id:     p.id,
      chips:  p.chips,
      hole:   [],
      folded: false,
      allIn:  false,
    }));

    this.deck             = shuffle(createDeck());
    this.board            = [];
    this.pot              = 0;
    this.roundBets        = {};  // chips committed this betting street
    this.totalContributed = {};  // cumulative chips put into pot per player (for side pots)
    this.maxBet           = 0;
    this.lastRaiseAmount  = BIG_BLIND;  // size of the last raise increment (for min-raise rule)
    this.acted            = new Set();
    this.stage            = 'pre-flop';
    this.log              = [];

    // Dealer is index 0; heads-up rule: dealer posts SB and acts first pre-flop
    this.dealerIdx = 0;
    const n = this.players.length;
    if (n === 2) {
      this.sbIdx = 0;  // dealer is SB in heads-up
      this.bbIdx = 1;
    } else {
      this.sbIdx = 1 % n;
      this.bbIdx = 2 % n;
    }

    // Deal hole cards
    for (const p of this.players) {
      p.hole = [this.deck.pop(), this.deck.pop()];
    }

    // Post blinds
    this._postBlind(this.sbIdx, SMALL_BLIND);
    this._postBlind(this.bbIdx, BIG_BLIND);
    this.maxBet = BIG_BLIND;

    // First to act pre-flop: after BB
    this.actorIdx = (this.bbIdx + 1) % n;
    this._addLog('deal', null, null, `Hand started. Dealer: ${this.players[this.dealerIdx].id}`);
  }

  _postBlind(idx, amount) {
    const p = this.players[idx];
    const actual = Math.min(amount, p.chips);
    p.chips -= actual;
    this.pot += actual;
    this.roundBets[p.id]        = (this.roundBets[p.id]        || 0) + actual;
    this.totalContributed[p.id] = (this.totalContributed[p.id] || 0) + actual;
    if (p.chips === 0) p.allIn = true;
  }

  _addLog(type, playerId, action, detail) {
    this.log.push({ type, playerId, action, detail, stage: this.stage });
  }

  getActorId() {
    return this.players[this.actorIdx].id;
  }

  // Returns the call amount for the current actor
  callAmount() {
    const actor = this.players[this.actorIdx];
    return Math.min(this.maxBet - (this.roundBets[actor.id] || 0), actor.chips);
  }

  // Process an action from the current actor
  // action: 'fold' | 'call' | 'check' | 'raise'
  // raiseTotal: total amount actor wants to have bet this street (only for raise)
  processAction(action, raiseTotal) {
    const actor = this.players[this.actorIdx];
    const currentBet = this.roundBets[actor.id] || 0;
    const toCall = this.maxBet - currentBet;

    switch (action) {
      case 'fold':
        actor.folded = true;
        this.acted.add(actor.id);
        this._addLog('action', actor.id, 'fold', null);
        break;

      case 'check':
        this.acted.add(actor.id);
        this._addLog('action', actor.id, 'check', null);
        break;

      case 'call': {
        const pay = Math.min(toCall, actor.chips);
        actor.chips -= pay;
        this.pot += pay;
        this.roundBets[actor.id]        = currentBet + pay;
        this.totalContributed[actor.id] = (this.totalContributed[actor.id] || 0) + pay;
        if (actor.chips === 0) actor.allIn = true;
        this.acted.add(actor.id);
        this._addLog('action', actor.id, 'call', pay);
        break;
      }

      case 'raise': {
        // Bug 6 fix: min-raise = last raise increment, not always BIG_BLIND
        const minRaise = this.maxBet + (this.lastRaiseAmount || BIG_BLIND);
        const target   = Math.max(raiseTotal || 0, minRaise);
        const diff     = target - currentBet;
        const pay      = Math.min(diff, actor.chips);
        actor.chips -= pay;
        this.pot += pay;
        this.roundBets[actor.id]        = currentBet + pay;
        this.totalContributed[actor.id] = (this.totalContributed[actor.id] || 0) + pay;
        const newMax = currentBet + pay;
        // Bug 6: track raise increment for next min-raise calculation
        this.lastRaiseAmount = Math.max(BIG_BLIND, newMax - this.maxBet);
        // Bug 1 fix: never let maxBet decrease (e.g. when actor can't cover the raise)
        this.maxBet = Math.max(this.maxBet, newMax);
        if (actor.chips === 0) actor.allIn = true;
        // Raise: everyone else must act again
        this.acted.clear();
        this.acted.add(actor.id);
        this._addLog('action', actor.id, 'raise', currentBet + pay);
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return this._advance();
  }

  _advance() {
    // If only one non-folded player → they win
    const alive = this.players.filter(p => !p.folded);
    if (alive.length === 1) return this._showdown();

    // Check if betting round is over
    const canAct = this.players.filter(p => !p.folded && !p.allIn);
    const allActed   = canAct.every(p => this.acted.has(p.id));
    const allMatched = canAct.every(p => (this.roundBets[p.id] || 0) >= this.maxBet);

    if (allActed && allMatched) return this._nextStreet();

    // Find next player to act (skip folded / all-in / already-acted-and-matched)
    const n = this.players.length;
    let idx = (this.actorIdx + 1) % n;
    for (let i = 0; i < n; i++) {
      const p = this.players[idx];
      if (!p.folded && !p.allIn &&
          (!this.acted.has(p.id) || (this.roundBets[p.id] || 0) < this.maxBet)) {
        this.actorIdx = idx;
        return { status: 'action', actorId: p.id, state: this.getPublicState() };
      }
      idx = (idx + 1) % n;
    }

    return this._nextStreet();
  }

  _nextStreet() {
    // Carry over bets into pot (already done), reset round tracking
    this.roundBets       = {};
    this.maxBet          = 0;
    this.lastRaiseAmount = BIG_BLIND;
    this.acted.clear();

    // Find first active player clockwise from dealer
    const n = this.players.length;
    let idx = (this.dealerIdx + 1) % n;
    for (let i = 0; i < n; i++) {
      if (!this.players[idx].folded && !this.players[idx].allIn) {
        this.actorIdx = idx;
        break;
      }
      idx = (idx + 1) % n;
    }

    switch (this.stage) {
      case 'pre-flop':
        this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
        this.stage = 'flop';
        this._addLog('deal', null, null, `Flop: ${this.board.map(cardString).join(' ')}`);
        break;
      case 'flop':
        this.board.push(this.deck.pop());
        this.stage = 'turn';
        this._addLog('deal', null, null, `Turn: ${cardString(this.board[3])}`);
        break;
      case 'turn':
        this.board.push(this.deck.pop());
        this.stage = 'river';
        this._addLog('deal', null, null, `River: ${cardString(this.board[4])}`);
        break;
      case 'river':
        return this._showdown();
    }

    // If all remaining players are all-in, run the board automatically
    const canAct = this.players.filter(p => !p.folded && !p.allIn);
    if (canAct.length <= 1) return this._nextStreet();

    return { status: 'action', actorId: this.players[this.actorIdx].id, state: this.getPublicState() };
  }

  _showdown() {
    this.stage = 'showdown';
    const alive = this.players.filter(p => !p.folded);

    // Single survivor — wins without hand comparison
    if (alive.length === 1) {
      alive[0].chips += this.pot;
      this._addLog('showdown', alive[0].id, 'win', `Won ${this.pot} chips (others folded)`);
      return {
        status:     'showdown',
        winnerId:   alive[0].id,
        winnerHand: null,
        pot:        this.pot,
        state:      this.getPublicState(true),
        log:        this.log,
      };
    }

    // Evaluate all surviving hands once
    const evals = new Map(
      alive.map(p => [p.id, evaluateBestHand([...p.hole, ...this.board])])
    );

    // Bug 2 fix: distribute side pots correctly
    // Bug 3 fix: split pot evenly among tied winners
    let mainWinnerId   = null;
    let mainWinnerHand = null;

    for (const { size, eligible } of this._buildSidePots()) {
      if (size === 0 || eligible.length === 0) continue;

      const ranked = eligible
        .map(id => ({ id, hand: evals.get(id) }))
        .sort((a, b) => b.hand.score - a.hand.score);

      const topScore = ranked[0].hand.score;
      const winners  = ranked.filter(e => e.hand.score === topScore);
      const share    = Math.floor(size / winners.length);
      const rem      = size - share * winners.length;

      for (const w of winners) {
        this.players.find(p => p.id === w.id).chips += share;
      }
      // Odd chip goes to first winner in seat order (closest to dealer)
      if (rem > 0) this.players.find(p => p.id === ranked[0].id).chips += rem;

      // Record the main pot winner for display
      if (mainWinnerId === null) {
        mainWinnerId   = ranked[0].id;
        mainWinnerHand = ranked[0].hand;
      }
    }

    this._addLog('showdown', mainWinnerId, 'win',
      `Won with ${mainWinnerHand?.name}`);

    return {
      status:     'showdown',
      winnerId:   mainWinnerId,
      winnerHand: mainWinnerHand
        ? { name: mainWinnerHand.name, rank: mainWinnerHand.rank }
        : null,
      pot:   this.pot,
      state: this.getPublicState(true),
      log:   this.log,
    };
  }

  // Build ordered list of {size, eligible[]} pots from per-player total contributions.
  // Each pot covers one contribution level; folded players fund pots but can't win them.
  _buildSidePots() {
    const contribs = this.players.map(p => ({
      id:     p.id,
      total:  this.totalContributed[p.id] || 0,
      folded: p.folded,
    }));

    const levels = [...new Set(contribs.map(c => c.total))]
      .filter(v => v > 0)
      .sort((a, b) => a - b);

    const pots = [];
    let prev = 0;

    for (const level of levels) {
      const increment    = level - prev;
      const contributors = contribs.filter(c => c.total >= level);
      const eligible     = contributors.filter(c => !c.folded).map(c => c.id);
      pots.push({ size: increment * contributors.length, eligible });
      prev = level;
    }

    return pots;
  }

  // Returns game state safe to broadcast to all spectators
  getPublicState(revealCards = false) {
    return {
      stage: this.stage,
      board: this.board.map(cardString),
      pot: this.pot,
      maxBet: this.maxBet,
      actorIdx: this.actorIdx,
      players: this.players.map(p => ({
        id:     p.id,
        chips:  p.chips,
        folded: p.folded,
        allIn:  p.allIn,
        bet:    this.roundBets[p.id] || 0,
        // Hole cards only visible at showdown or to the player themselves
        hole: revealCards && !p.folded ? p.hole.map(cardString) : null,
      })),
    };
  }

  // Returns the game state for a specific AI player (includes their hole cards)
  getStateForPlayer(playerId) {
    const state = this.getPublicState(false);
    const me = state.players.find(p => p.id === playerId);
    if (me) {
      const actual = this.players.find(p => p.id === playerId);
      me.hole = actual.hole.map(cardString);
    }
    return state;
  }
}

module.exports = { PokerHand, evaluateBestHand, cardString, SMALL_BLIND, BIG_BLIND };
