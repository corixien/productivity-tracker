const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');

router.delete('/raw-delete/:id', testController.rawDeleteAndCheck);

module.exports = router;
