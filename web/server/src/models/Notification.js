const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: String,
  content: String,
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  type: { type: String, enum: ['training_assigned', 'system'], default: 'system' },
  relatedTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingTask' }
});

module.exports = mongoose.model('Notification', notificationSchema);
