const express = require('express');
const router = express.Router();
const trainingController = require('../controllers/trainingController');

router.post('/answer', trainingController.submitAnswer);
router.post('/mistake', trainingController.submitMistake);
router.get('/my-mistakes', trainingController.getMyMistakes);
router.get('/my-history', trainingController.getMyHistory);

module.exports = router;
