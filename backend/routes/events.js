const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const events = require('../utils/events');

// Server-sent events stream: `sync` / `revoked` for the signed-in user, plus `log` / `db` for admins.
router.get('/', authenticate, (req, res) => events.subscribe(req, res, req.user));

module.exports = router;
