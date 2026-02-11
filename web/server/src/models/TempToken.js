const mongoose = require('mongoose');

const tempTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: String, // 冗余字段，方便快速读取
  createdAt: { type: Date, default: Date.now },
  expireAt: { type: Date, required: true } // TTL索引依据
});

// 设置 TTL 索引，让 MongoDB 自动清理过期数据
tempTokenSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TempToken', tempTokenSchema);
