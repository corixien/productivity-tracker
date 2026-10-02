const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

router.get('/tables', adminController.listTables);
router.get('/tables/:table', adminController.getRows);
router.patch('/tables/:table/:key', adminController.updateCell);
router.delete('/tables/:table/:key', adminController.deleteRow);
router.get('/storage', adminController.listAvatars);
router.delete('/storage/:userId', adminController.removeAvatar);
router.get('/logs', adminController.getLogs);
router.get('/analytics', adminController.getAnalytics);

module.exports = router;
