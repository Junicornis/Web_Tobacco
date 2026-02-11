import React, { useState, useEffect } from 'react';
import { List, Card, Button, Tag, message, Typography, Badge } from 'antd';
import { PlayCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

const UserTaskList = ({ user }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [launchStatus, setLaunchStatus] = useState('');

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
      message.error('启动过程出错: ' + err.message);
    }
  };

  return (
    <div>
      <Title level={3}>我的培训任务</Title>
      <List
        grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 3, xl: 3, xxl: 4 }}
        dataSource={tasks}
        loading={loading}
        renderItem={item => (
          <List.Item>
            <Card 
                title={item.title} 
                extra={<Tag color="blue">{item.status === 'active' ? '进行中' : '已归档'}</Tag>}
                actions={[
                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => startTraining(item)} block>
                        开始培训
                    </Button>
                ]}
            >
              <p style={{ height: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.description}
              </p>
              <div style={{ marginTop: '10px', color: '#888' }}>
                  <ClockCircleOutlined /> 截止日期: {new Date(item.deadline).toLocaleDateString()}
              </div>
            </Card>
          </List.Item>
        )}
      />
    </div>
  );
};

export default UserTaskList;
