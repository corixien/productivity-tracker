const express = require('express');
const router = express.Router();
const goalController = require('../controllers/goalController');
const { authenticate } = require('../middleware/auth');
const { validateGoalCreate, validateGoalUpdate } = require('../middleware/validation');

router.use(authenticate);

router.get('/', goalController.getGoals);
router.get('/count', goalController.getGoalsCount);
router.post('/', validateGoalCreate, goalController.createGoal);
router.put('/:id', validateGoalUpdate, goalController.updateGoal);
router.delete('/:id', goalController.deleteGoal);

module.exports = router;
