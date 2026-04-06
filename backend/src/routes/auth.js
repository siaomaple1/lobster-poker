'use strict';

const express = require('express');
const passport = require('passport');
const router = express.Router();

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const enabledProviders = [];

function makeOAuthRoutes(provider, scope) {
  enabledProviders.push(provider);
  router.get(`/${provider}`, passport.authenticate(provider, { scope }));
  router.get(
    `/${provider}/callback`,
    passport.authenticate(provider, { failureRedirect: `${CLIENT_URL}/login?error=1` }),
    (req, res) => res.redirect(CLIENT_URL),
  );
}

if (process.env.GOOGLE_CLIENT_ID) makeOAuthRoutes('google', ['profile', 'email']);
if (process.env.GITHUB_CLIENT_ID) makeOAuthRoutes('github', ['user:email']);
if (process.env.DISCORD_CLIENT_ID) makeOAuthRoutes('discord', ['identify', 'email']);

if (process.env.TWITTER_CONSUMER_KEY) {
  enabledProviders.push('twitter');
  router.get('/twitter', passport.authenticate('twitter'));
  router.get(
    '/twitter/callback',
    passport.authenticate('twitter', { failureRedirect: `${CLIENT_URL}/login?error=1` }),
    (req, res) => res.redirect(CLIENT_URL),
  );
}

router.get('/providers', (_req, res) => {
  res.json({ providers: enabledProviders });
});

router.post('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json(null);
  const { id, username, display_name, avatar, coins, coins_reset_at } = req.user;
  res.json({ id, username, display_name, avatar, coins, coins_reset_at });
});

module.exports = router;
