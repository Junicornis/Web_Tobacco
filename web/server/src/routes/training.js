const express = require('express');
const router = express.Router();
const trainingController = require('../controllers/trainingController');

router.post('/start', trainingController.startTraining);
router.post('/answer', trainingController.submitAnswer);
router.put('/progress', trainingController.updateProgress);
router.post('/end', trainingController.endTraining);
router.get('/history', trainingController.getHistory);
router.get('/my-history', trainingController.getMyHistory);

module.exports = router;
