const express = require('express');
const router = express.Router();
const trainingController = require('../controllers/trainingController');

router.post('/answer', trainingController.submitAnswer);
router.get('/my-history', trainingController.getMyHistory);

module.exports = router;
