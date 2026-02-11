import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

// Layouts & Pages
import MainLayout from './layouts/MainLayout';
import AdminTaskCreate from './pages/AdminTaskCreate';
import AdminTaskMonitor from './pages/AdminTaskMonitor';
import AdminUserList from './pages/AdminUserList';
import AdminTrainingRecords from './pages/AdminTrainingRecords';
import AdminQuestionManage from './pages/AdminQuestionManage';
import AdminStatistics from './pages/AdminStatistics';
import UserTaskList from './pages/UserTaskList';
import UserInbox from './pages/UserInbox';
import UserHistory from './pages/UserHistory';
import UserMistakes from './pages/UserMistakes';
import UserProfile from './pages/UserProfile';

// Login Component (Internal)
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';

const Login = ({ onLogin }) => {
    const onFinish = async (values) => {
        try {
            const res = await axios.post('/api/auth/login', values);
            if (res.data.success) {
                message.success('登录成功');
                onLogin(res.data.user);
            }
        } catch (err) {
            message.error('登录失败: ' + (err.response?.data?.message || err.message));
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
            <Card style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <div style={{ textAlign: 'center', marginBottom: 30 }}>
                    <Typography.Title level={2} style={{ color: '#1890ff' }}>Safety Training</Typography.Title>
                    <Typography.Text type="secondary">安全培训系统</Typography.Text>
                </div>
                <Form
                    name="login"
                    initialValues={{ remember: true }}
                    onFinish={onFinish}
                    size="large"
                >
                    <Form.Item
                        name="username"
                        rules={[{ required: true, message: '请输入用户名!' }]}
                    >
                        <Input prefix={<UserOutlined />} placeholder="用户名 (admin / user)" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: '请输入密码!' }]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" block>
                            登录
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

function App() {
    const [user, setUser] = useState(null);

    const handleLogout = () => {
        setUser(null);
        message.info('已退出登录');
    };

    return (
        <ConfigProvider locale={zhCN}>
            <Router>
                <Routes>
                    <Route path="/login" element={!user ? <Login onLogin={setUser} /> : <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/user/tasks'} />} />

                    {/* Admin Routes */}
                    <Route path="/admin/*" element={
                        user && user.role === 'admin' ? (
                            <MainLayout role="admin" username={user.username} onLogout={handleLogout}>
                                <Routes>
                                    <Route path="dashboard" element={<AdminTaskCreate />} />
                                    <Route path="monitor" element={<AdminTaskMonitor />} />
                                    <Route path="users" element={<AdminUserList />} />
                                    <Route path="records" element={<AdminTrainingRecords />} />
                                    <Route path="questions" element={<AdminQuestionManage />} />
                                    <Route path="statistics" element={<AdminStatistics />} />
                                    <Route path="*" element={<Navigate to="dashboard" />} />
                                </Routes>
                            </MainLayout>
                        ) : <Navigate to="/login" />
                    } />

                    {/* User Routes */}
                    <Route path="/user/*" element={
                        user && user.role === 'user' ? (
                            <MainLayout role="user" username={user.username} onLogout={handleLogout}>
                                <Routes>
                                    <Route path="tasks" element={<UserTaskList user={user} />} />
                                    <Route path="inbox" element={<UserInbox user={user} />} />
                                    <Route path="history" element={<UserHistory user={user} />} />
                                    <Route path="mistakes" element={<UserMistakes user={user} />} />
                                    <Route path="profile" element={<UserProfile user={user} />} />
                                    <Route path="*" element={<Navigate to="tasks" />} />
                                </Routes>
                            </MainLayout>
                        ) : <Navigate to="/login" />
                    } />

                    <Route path="*" element={<Navigate to="/login" />} />
                </Routes>
            </Router>
        </ConfigProvider>
    );
}

export default App;
