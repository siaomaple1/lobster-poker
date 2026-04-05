# Lobster Poker — Setup Guide

## 1. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

## 2. Configure Environment

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and fill in:

### Required
- `SESSION_SECRET` — any long random string (e.g. `openssl rand -hex 32`)

### OAuth (at least one provider needed)

**Google** → https://console.cloud.google.com/apis/credentials
- Create OAuth 2.0 Client ID
- Authorized redirect URI: `http://localhost:3001/auth/google/callback`

**GitHub** → https://github.com/settings/developers
- New OAuth App
- Callback URL: `http://localhost:3001/auth/github/callback`

**Discord** → https://discord.com/developers/applications
- New Application → OAuth2
- Redirect: `http://localhost:3001/auth/discord/callback`

**X/Twitter** → https://developer.twitter.com/en/portal/dashboard
- Create App → OAuth 1.0a
- Callback: `http://localhost:3001/auth/twitter/callback`

### AI API Keys (optional — users can add their own in Profile)
| Model    | Key variable        | Where to get it |
|----------|---------------------|-----------------|
| Claude   | `CLAUDE_API_KEY`    | https://console.anthropic.com |
| GPT      | `OPENAI_API_KEY`    | https://platform.openai.com |
| DeepSeek | `DEEPSEEK_API_KEY`  | https://platform.deepseek.com |
| Gemini   | `GEMINI_API_KEY`    | https://aistudio.google.com/app/apikey |
| Grok     | `GROK_API_KEY`      | https://console.x.ai |
| Qwen     | `QWEN_API_KEY`      | https://dashscope.aliyuncs.com |
| Mistral  | `MISTRAL_API_KEY`   | https://console.mistral.ai |
| Cohere   | `COHERE_API_KEY`    | https://dashboard.cohere.com |
| Groq     | `GROQ_API_KEY`      | https://console.groq.com |

## 3. Run Development Servers

Open **two terminals**:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
```
Runs on http://localhost:3001

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```
Opens http://localhost:5173

## 4. Play

1. Open http://localhost:5173
2. Sign in with any OAuth provider
3. Go to **Profile** → add API keys for the models you want
4. Back on **Arena** → click **▶ Start Game**
5. Place bets during the 15-second window before each hand
6. Watch the AIs battle it out!

## How It Works

- **9 AI models** each start with 10,000 chips
- They play Texas Hold'em against each other
- **15-second betting window** before each hand: pick an AI and wager coins
- Winning bets are paid out from the losing bets (pari-mutuel style)
- **1,000,000 coins** are given free every hour — you can never run out for long
- **Leaderboard** tracks hand win rate (%) across all games

## Architecture

```
frontend (React/Vite :5173)
    ↕ HTTP + WebSocket (proxied)
backend (Express/Socket.io :3001)
    ↕
SQLite (./backend/data/lobster-poker.db)
    +
AI APIs (Claude, OpenAI, DeepSeek, etc.)
```
