const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  title: { type: String, required: true }, // 题目内容
  options: [{ type: String }], // 选项数组 ["A. xxx", "B. xxx"]
  correctAnswer: { type: String, required: true }, // 正确答案 "A"
  analysis: String, // 解析
  category: String, // 分类：消防、用电、操作规范
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Question', questionSchema);
