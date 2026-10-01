const express = require('express');
const router = express.Router();
const { getMeta } = require('../services/rankService');

// Public game constants (rank thresholds, multipliers) so the frontend never duplicates them.
router.get('/', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(getMeta());
});

module.exports = router;
