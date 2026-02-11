const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const users = [
  { username: 'user01', password: 'password', role: 'user', department: '生产部' },
  { username: 'user02', password: 'password', role: 'user', department: '质检部' },
  { username: 'user03', password: 'password', role: 'user', department: '物流部' },
  { username: 'zhangsan', password: 'password', role: 'user', department: '安保部' },
  { username: 'lisi', password: 'password', role: 'user', department: '行政部' }
];

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('MongoDB Connected');
    for (const u of users) {
      const exists = await User.findOne({ username: u.username });
      if (!exists) {
        await new User(u).save();
        console.log(`Created user: ${u.username}`);
      }
    }
    console.log('Seeding completed');
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
