'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/lobster-poker.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migrate existing databases
try { db.exec(`ALTER TABLE games ADD COLUMN room_id INTEGER NOT NULL DEFAULT 1`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN lobster_name TEXT`);   } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN lobster_prompt TEXT`);  } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN lobster_model TEXT`);   } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN agent_token TEXT UNIQUE`); } catch (_) {}

// ── Schema ─────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    provider        TEXT NOT NULL,
    provider_id     TEXT NOT NULL,
    username        TEXT NOT NULL,
    display_name    TEXT,
    avatar          TEXT,
    coins           INTEGER NOT NULL DEFAULT 1000000,
    coins_reset_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(provider, provider_id)
  );

  CREATE TABLE IF NOT EXISTS user_api_keys (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model      TEXT NOT NULL,
    api_key    TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, model)
  );

  CREATE TABLE IF NOT EXISTS games (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    status       TEXT NOT NULL DEFAULT 'playing',
    created_by   INTEGER REFERENCES users(id),
    room_id      INTEGER NOT NULL DEFAULT 1,
    hand_number  INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    ended_at     INTEGER
  );

  CREATE TABLE IF NOT EXISTS game_seats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     INTEGER NOT NULL REFERENCES games(id),
    model       TEXT NOT NULL,
    chips       INTEGER NOT NULL DEFAULT 10000,
    hands_won   INTEGER NOT NULL DEFAULT 0,
    hands_played INTEGER NOT NULL DEFAULT 0,
    eliminated  INTEGER NOT NULL DEFAULT 0,
    UNIQUE(game_id, model)
  );

  CREATE TABLE IF NOT EXISTS hands (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id      INTEGER NOT NULL REFERENCES games(id),
    hand_number  INTEGER NOT NULL,
    winner_model TEXT,
    pot          INTEGER NOT NULL DEFAULT 0,
    community    TEXT,
    log          TEXT,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS user_bets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    game_id     INTEGER NOT NULL REFERENCES games(id),
    hand_number INTEGER NOT NULL,
    model       TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    settled     INTEGER NOT NULL DEFAULT 0,
    payout      INTEGER NOT NULL DEFAULT 0,
    placed_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS ai_stats (
    model        TEXT PRIMARY KEY,
    total_games  INTEGER NOT NULL DEFAULT 0,
    games_won    INTEGER NOT NULL DEFAULT 0,
    total_hands  INTEGER NOT NULL DEFAULT 0,
    hands_won    INTEGER NOT NULL DEFAULT 0
  );
`);

// ── Prepared Statements ────────────────────────────────────────────────────
const stmts = {
  // Users
  upsertUser: db.prepare(`
    INSERT INTO users (provider, provider_id, username, display_name, avatar)
    VALUES (@provider, @provider_id, @username, @display_name, @avatar)
    ON CONFLICT(provider, provider_id) DO UPDATE SET
      username     = excluded.username,
      display_name = excluded.display_name,
      avatar       = excluded.avatar
    RETURNING *
  `),
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByAgentToken: db.prepare('SELECT * FROM users WHERE agent_token = ?'),
  setAgentToken: db.prepare('UPDATE users SET agent_token = ? WHERE id = ?'),

  // Coins — reset to 1M if last reset was > 1 hour ago
  getCoins: db.prepare(`
    SELECT coins, coins_reset_at,
           CASE WHEN strftime('%s','now') - coins_reset_at > 3600 THEN 1 ELSE 0 END as needs_reset
    FROM users WHERE id = ?
  `),
  resetCoins: db.prepare(`
    UPDATE users SET coins = 1000000, coins_reset_at = strftime('%s','now') WHERE id = ?
  `),
  spendCoins: db.prepare('UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?'),
  addCoins: db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?'),

  // Lobster
  getLobster: db.prepare(`SELECT lobster_name, lobster_prompt, lobster_model FROM users WHERE id = ?`),
  saveLobster: db.prepare(`UPDATE users SET lobster_name = @lobster_name, lobster_prompt = @lobster_prompt, lobster_model = @lobster_model WHERE id = @id`),

  // API Keys
  getApiKey: db.prepare('SELECT api_key FROM user_api_keys WHERE user_id = ? AND model = ?'),
  getAllApiKeys: db.prepare('SELECT model, api_key FROM user_api_keys WHERE user_id = ?'),
  upsertApiKey: db.prepare(`
    INSERT INTO user_api_keys (user_id, model, api_key, updated_at)
    VALUES (?, ?, ?, strftime('%s','now'))
    ON CONFLICT(user_id, model) DO UPDATE SET api_key = excluded.api_key, updated_at = excluded.updated_at
  `),
  deleteApiKey: db.prepare('DELETE FROM user_api_keys WHERE user_id = ? AND model = ?'),

  // Games
  createGame: db.prepare(`INSERT INTO games (created_by, room_id) VALUES (?, ?) RETURNING id`),
  getActiveGame: db.prepare(`SELECT * FROM games WHERE status = 'playing' ORDER BY created_at DESC LIMIT 1`),
  endGame: db.prepare(`UPDATE games SET status = 'finished', ended_at = strftime('%s','now') WHERE id = ?`),
  incrementHand: db.prepare(`UPDATE games SET hand_number = hand_number + 1 WHERE id = ?`),

  // Seats
  insertSeat: db.prepare(`INSERT OR IGNORE INTO game_seats (game_id, model, chips) VALUES (?, ?, 10000)`),
  getSeats: db.prepare(`SELECT * FROM game_seats WHERE game_id = ?`),
  updateSeat: db.prepare(`UPDATE game_seats SET chips = ?, hands_played = hands_played + 1 WHERE game_id = ? AND model = ?`),
  recordWin: db.prepare(`UPDATE game_seats SET hands_won = hands_won + 1 WHERE game_id = ? AND model = ?`),
  eliminateSeat: db.prepare(`UPDATE game_seats SET eliminated = 1, chips = 0 WHERE game_id = ? AND model = ?`),

  // Hands
  insertHand: db.prepare(`
    INSERT INTO hands (game_id, hand_number, winner_model, pot, community, log)
    VALUES (@game_id, @hand_number, @winner_model, @pot, @community, @log)
    RETURNING id
  `),

  // User Bets
  placeBet: db.prepare(`
    INSERT INTO user_bets (user_id, game_id, hand_number, model, amount) VALUES (?, ?, ?, ?, ?)
  `),
  getBetsForHand: db.prepare(`SELECT * FROM user_bets WHERE game_id = ? AND hand_number = ?`),
  settleBet: db.prepare(`UPDATE user_bets SET settled = 1, payout = ? WHERE id = ?`),
  getUserBets: db.prepare(`SELECT * FROM user_bets WHERE user_id = ? ORDER BY placed_at DESC LIMIT 50`),

  // AI Stats
  ensureAiStats: db.prepare(`INSERT OR IGNORE INTO ai_stats (model) VALUES (?)`),
  recordHandResult: db.prepare(`
    UPDATE ai_stats SET
      total_hands = total_hands + 1,
      hands_won = hands_won + CASE WHEN ? THEN 1 ELSE 0 END
    WHERE model = ?
  `),
  getLeaderboard: db.prepare(`
    SELECT model,
           total_hands,
           hands_won,
           CASE WHEN total_hands > 0
                THEN ROUND(100.0 * hands_won / total_hands, 1)
                ELSE 0 END as win_rate
    FROM ai_stats
    ORDER BY
      CASE WHEN total_hands = 0 THEN 1 ELSE 0 END,
      win_rate DESC,
      hands_won DESC
  `),
};

// Helper: auto-reset coins if stale
function getCoinsForUser(userId) {
  const row = stmts.getCoins.get(userId);
  if (!row) return 0;
  if (row.needs_reset) {
    stmts.resetCoins.run(userId);
    return 1000000;
  }
  return row.coins;
}

// Helper: seconds until next coin reset
function secondsUntilReset(userId) {
  const row = stmts.getCoins.get(userId);
  if (!row) return 0;
  const elapsed = Math.floor(Date.now() / 1000) - row.coins_reset_at;
  return Math.max(0, 3600 - elapsed);
}

module.exports = { db, stmts, getCoinsForUser, secondsUntilReset };
