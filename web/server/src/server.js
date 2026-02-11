require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db'); // 引入新的 DB 模块

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const trainingRoutes = require('./routes/training');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 数据库连接
connectDB();

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/training', trainingRoutes);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Temp Token Dir: ${process.env.TEMP_TOKEN_DIR || 'default'}`);
});
