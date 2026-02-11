const mongoose = require('mongoose');

const mistakeRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' }, // 如果题目在库里
  questionContent: String, // 如果题目是 Unity 硬编码的，直接存快照
  userAnswer: String,
  correctAnswer: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MistakeRecord', mistakeRecordSchema);
