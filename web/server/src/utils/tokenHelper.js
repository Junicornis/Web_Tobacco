const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const TempToken = require('../models/TempToken');

// 内存中存储有效的 Token，用于验证 (作为一级缓存)
// Key: token, Value: { userId, username, expireAt }
const tokenStore = new Map();

// 自动清理过期 Token (内存)
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of tokenStore.entries()) {
        if (data.expireAt < now) {
            tokenStore.delete(token);
        }
    }
}, 60 * 1000);

const TEMP_DIR = process.env.TEMP_TOKEN_DIR
    ? path.resolve(__dirname, '../../', process.env.TEMP_TOKEN_DIR)
    : path.join(__dirname, '../../../../temp');

// 确保临时目录存在
if (!fs.existsSync(TEMP_DIR)) {
    try {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    } catch (err) {
        console.error("Failed to create temp directory:", err);
    }
}

const TOKEN_FILE_NAME = 'auth_token.json';

/**
 * 生成临时 Token 并写入文件 + 数据库
 */
exports.generateAndWriteToken = async (user) => {
    const token = uuidv4();
    const now = Date.now();
    const expireAt = new Date(now + 5 * 60 * 1000); // 5分钟有效期

    const tokenData = {
        token,
        userId: user.id,
        username: user.username,
        timestamp: now,
        expireAt: expireAt.getTime()
    };

    // 1. 存入内存 (一级缓存)
    tokenStore.set(token, tokenData);

    // 2. 存入 MongoDB (持久化)
    try {
        await new TempToken({
            token,
            userId: user.id,
            username: user.username,
            expireAt
        }).save();
    } catch (err) {
        console.error('Failed to save token to MongoDB:', err);
        // 不阻断流程，继续写入文件
    }

    // 3. 写入文件 (供 Unity 读取)
    const filePath = path.join(TEMP_DIR, TOKEN_FILE_NAME);
    try {
        fs.writeFileSync(filePath, JSON.stringify(tokenData, null, 2), { encoding: 'utf8', flag: 'w' });
        console.log(`Token written to ${filePath}`);
        return token;
    } catch (error) {
        console.error('Error writing token file:', error);
        throw new Error('Failed to write token file');
    }
};

/**
 * 验证 Token
 */
exports.verifyToken = async (token) => {
    // 1. 先查内存
    const memData = tokenStore.get(token);
    if (memData) {
        if (memData.expireAt < Date.now()) {
            tokenStore.delete(token);
            return null;
        }
        return memData;
    }

    // 2. 内存没有，查数据库 (防止重启后内存丢失但 Token 其实还未过期)
    try {
        const dbToken = await TempToken.findOne({ token });
        if (dbToken) {
            // 检查是否过期 (虽然 MongoDB 有 TTL，但可能有延迟)
            if (dbToken.expireAt < new Date()) {
                return null;
            }

            // 重新回填到内存，减少后续查库
            const data = {
                token: dbToken.token,
                userId: dbToken.userId.toString(),
                username: dbToken.username,
                expireAt: dbToken.expireAt.getTime()
            };
            tokenStore.set(token, data);
            return data;
        }
    } catch (err) {
        console.error('Error querying token from DB:', err);
    }

    return null;
};

/**
 * 清除 Token 文件 (可选)
 */
exports.clearTokenFile = () => {
    const filePath = path.join(TEMP_DIR, TOKEN_FILE_NAME);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            console.warn('Failed to delete token file:', e);
        }
    }
};
