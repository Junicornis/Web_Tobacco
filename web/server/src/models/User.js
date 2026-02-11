const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // 实际项目中建议加密

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' }, // 区分角色
    department: String,
    createdAt: { type: Date, default: Date.now }
});

// 简单的密码验证方法
userSchema.methods.comparePassword = function (candidatePassword) {
    // 这里的实现假设密码是明文存储，实际生产环境必须使用 bcrypt.compare
    return this.password === candidatePassword;
};

module.exports = mongoose.model('User', userSchema);
