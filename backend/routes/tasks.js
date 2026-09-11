const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticate } = require('../middleware/auth');
const { validateTaskCreate, validateTaskUpdate } = require('../middleware/validation');

router.use(authenticate);

router.get('/', taskController.getTasks);
router.post('/', validateTaskCreate, taskController.createTask);
router.put('/:id', validateTaskUpdate, taskController.updateTask);
router.post('/:id/complete', taskController.completeTask);
router.delete('/:id', taskController.deleteTask);

module.exports = router;
