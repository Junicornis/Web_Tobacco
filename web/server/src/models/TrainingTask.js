const mongoose = require('mongoose');

const trainingTaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // 分配给哪些用户
  deadline: Date,
  unityPath: { type: String, default: '' }, // 关联的 Unity 项目 exe 路径
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'archived', 'revoked'], default: 'active' }, // 增加 'revoked'
  revokedAt: Date, // 撤销时间
  revokedReason: String // 撤销原因
});

module.exports = mongoose.model('TrainingTask', trainingTaskSchema);
