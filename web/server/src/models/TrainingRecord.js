const mongoose = require('mongoose');

const trainingRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingTask' }, // 可选，关联的任务
  taskName: { type: String, required: true }, // 任务名称快照
  score: { type: Number, required: true },
  duration: { type: Number, default: 0 }, // 耗时(秒)
  completedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['completed', 'failed'], default: 'completed' }
});

module.exports = mongoose.model('TrainingRecord', trainingRecordSchema);
