import React from 'react';
import { Card, Form, Input, Button, message, Descriptions } from 'antd';
import axios from 'axios';

const UserProfile = ({ user }) => {
  const [form] = Form.useForm();

  const onFinish = async (values) => {
    try {
        const payload = { userId: user.id, ...values };
        const res = await axios.put('/api/auth/profile', payload);
        if (res.data.success) {
            message.success('资料更新成功');
        }
    } catch (err) {
        message.error('更新失败');
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <Card title="个人信息" style={{ marginBottom: 20 }}>
            <Descriptions bordered column={1}>
                <Descriptions.Item label="用户名">{user.username}</Descriptions.Item>
                <Descriptions.Item label="角色">{user.role === 'admin' ? '管理员' : '普通员工'}</Descriptions.Item>
                <Descriptions.Item label="部门">{user.department || '未分配'}</Descriptions.Item>
            </Descriptions>
        </Card>

        <Card title="修改资料">
            <Form form={form} layout="vertical" onFinish={onFinish}>
                <Form.Item name="department" label="所属部门">
                    <Input placeholder={user.department} />
                </Form.Item>
                <Form.Item name="password" label="新密码" help="留空则不修改">
                    <Input.Password />
                </Form.Item>
                <Button type="primary" htmlType="submit">保存修改</Button>
            </Form>
        </Card>
    </div>
  );
};

export default UserProfile;
