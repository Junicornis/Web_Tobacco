import React, { useState, useEffect } from 'react';
import { Form, Input, DatePicker, Button, Select, Checkbox, message, Card, Typography } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

const unityProjects = [
  { label: '消防培训', value: '' }, // 留空则使用 .env 默认值
  { label: '机房安全培训', value: 'D:/proj/Hu_tobacco/Web_Tobacco/unity/Build/Release/Safety-Training.exe' },
  { label: '机房安全培训第二期', value: 'D:/proj/Hu_tobacco/Web_Tobacco/unity/Build/Release/Safety-Training.exe' },
  { label: '烟草车间安全演示', value: 'D:/proj/Hu_tobacco/Web_Tobacco/unity/Build/Release/Safety-Training.exe' }, // 这里暂时指向同一个，实际可改
  { label: '物流中心应急演练', value: 'D:/proj/Hu_tobacco/Web_Tobacco/unity/Build/Release/Safety-Training.exe' }
];

const AdminTaskCreate = () => {
  const [form] = Form.useForm();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/admin/users');
      if (res.data.success) setUsers(res.data.users);
    } catch (err) {
      message.error('获取用户列表失败');
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        deadline: values.deadline.format('YYYY-MM-DD'),
        notifyUsers: values.notifyUsers || false
      };

      const res = await axios.post('/api/admin/create', payload);
      if (res.data.success) {
        message.success('任务下发成功！');
        form.resetFields();
      } else {
        message.error(res.data.message);
      }
    } catch (err) {
      message.error('请求失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="下发新培训任务" variant="borderless">
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ notifyUsers: true, unityPath: '' }}
      >
        <Form.Item
          name="title"
          label="任务标题"
          rules={[{ required: true, message: '请输入任务标题' }]}
        >
          <Input placeholder="例如：2024第一季度消防演练" />
        </Form.Item>

        <Form.Item
          name="description"
          label="任务简介与要求"
          rules={[{ required: true, message: '请输入任务描述' }]}
        >
          <Input.TextArea rows={4} placeholder="请输入详细的培训要求..." />
        </Form.Item>

        <Form.Item
          name="unityPath"
          label="关联 Unity 项目"
          rules={[{ required: true, message: '请选择培训项目' }]}
        >
          <Select placeholder="请选择要启动的 Unity 场景">
            {unityProjects.map(p => (
              <Option key={p.value} value={p.value}>{p.label}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="deadline"
          label="截止时间"
          rules={[{ required: true, message: '请选择截止时间' }]}
        >
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="assignedUserIds"
          label="指派员工"
          rules={[{ required: true, message: '请至少选择一名员工' }]}
        >
          <Select
            mode="multiple"
            placeholder="选择员工"
            style={{ width: '100%' }}
            optionFilterProp="children"
          >
            {users.map(u => (
              <Option key={u._id} value={u._id}>{u.username} ({u.department})</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="notifyUsers" valuePropName="checked">
          <Checkbox>同时发送站内信通知</Checkbox>
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            确认下发任务
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default AdminTaskCreate;
