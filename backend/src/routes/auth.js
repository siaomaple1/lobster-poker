'use strict';

const express  = require('express');
const passport = require('passport');
const router   = express.Router();

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function makeOAuthRoutes(provider, scope) {
  router.get(`/${provider}`, passport.authenticate(provider, { scope }));
  router.get(`/${provider}/callback`,
    passport.authenticate(provider, { failureRedirect: `${CLIENT_URL}/login?error=1` }),
    (req, res) => res.redirect(CLIENT_URL)
  );
}

makeOAuthRoutes('google',  ['profile', 'email']);
makeOAuthRoutes('github',  ['user:email']);
makeOAuthRoutes('discord', ['identify', 'email']);

// Twitter uses OAuth 1.0a — different flow
router.get('/twitter', passport.authenticate('twitter'));
router.get('/twitter/callback',
  passport.authenticate('twitter', { failureRedirect: `${CLIENT_URL}/login?error=1` }),
  (req, res) => res.redirect(CLIENT_URL)
);

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
