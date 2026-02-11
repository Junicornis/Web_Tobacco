const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.post('/token', authController.generateToken);
router.get('/verify', authController.verifyToken);
router.put('/profile', authController.updateProfile);
router.post('/launch-unity', authController.launchUnity);

module.exports = router;
