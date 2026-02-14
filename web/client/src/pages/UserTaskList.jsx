import React, { useState, useEffect } from 'react';
import { Card, List, Button, Tag, message, Typography, Space, Segmented } from 'antd';
import { PlayCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

const UserTaskList = ({ user }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await axios.get(`/api/admin/my-tasks?userId=${user.id}`);
      if (res.data.success) setTasks(res.data.tasks);
    } catch (err) {
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const startTraining = async (task) => {
    const hide = message.loading(`正在启动: ${task.title}...`, 0);
    try {
      const tokenRes = await axios.post('/api/auth/token', { userId: user.id, username: user.username });
      if (tokenRes.data.success) {
        message.info('Token已生成，正在唤醒客户端...', 2);

        // 传递任务指定的 unityPath
        const launchRes = await axios.post('/api/auth/launch-unity', {
          unityPath: task.unityPath
        });

        hide();
        if (launchRes.data.success) {
          message.success('Unity 客户端已启动！请在弹出的窗口中进行操作。');
        } else {
          message.error('启动失败: ' + launchRes.data.message);
        }
      }
    } catch (err) {
      hide();
      const serverMessage = err?.response?.data?.message;
      message.error('启动失败: ' + (serverMessage || err.message));
    }
  };

  const viewScore = (task) => {
    const params = new URLSearchParams();
    params.set('taskId', task._id);
    params.set('taskTitle', task.title);
    navigate(`/user/profile?${params.toString()}`);
  };

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return t.status === 'active';
    return t.status !== 'active';
  });

  return (
    <Card
      title="我的任务"
      extra={
        <Segmented
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { label: '全部', value: 'all' },
            { label: '进行中', value: 'active' },
            { label: '已归档', value: 'archived' }
          ]}
        />
      }
    >
      <List
        dataSource={filteredTasks}
        loading={loading}
        renderItem={item => (
          <List.Item
            actions={item.status === 'active'
              ? [
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => startTraining(item)}>
                  开始学习
                </Button>
              ]
              : [
                <Button type="primary" onClick={() => viewScore(item)} style={{ background: '#faad14', borderColor: '#faad14' }}>
                  查看成绩
                </Button>,
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => startTraining(item)}>
                  重新学习
                </Button>
              ]
            }
          >
            <List.Item.Meta
              title={
                <Space size={8} wrap>
                  <span>{item.title}</span>
                  <Tag color={item.status === 'active' ? 'blue' : 'default'}>
                    {item.status === 'active' ? '进行中' : '已归档'}
                  </Tag>
                </Space>
              }
              description={
                <div>
                  <Text type="secondary">{item.description}</Text>
                  <div style={{ marginTop: 8, color: '#888' }}>
                    <ClockCircleOutlined /> 截止日期: {new Date(item.deadline).toLocaleDateString()}
                  </div>
                </div>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};

export default UserTaskList;
