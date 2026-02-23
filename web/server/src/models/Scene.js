const mongoose = require('mongoose');

const sceneSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  exePath: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Scene', sceneSchema);
