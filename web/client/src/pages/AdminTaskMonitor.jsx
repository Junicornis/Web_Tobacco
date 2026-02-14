import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, Modal, Input, message, Tooltip, Space, Progress, List } from 'antd';
import { StopOutlined, InfoCircleOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const AdminTaskMonitor = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 撤销任务状态
  const [revokeModalVisible, setRevokeModalVisible] = useState(false);
  const [currentTask, setCurrentTask] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await axios.get('/api/admin/tasks');
      if (res.data.success) setTasks(res.data.tasks);
    } catch (err) {
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
      if (!revokeReason) return message.warning('请输入撤销原因');
      try {
          await axios.put(`/api/admin/tasks/${currentTask._id}/revoke`, { reason: revokeReason });
          message.success('任务已撤销');
          setRevokeModalVisible(false);
          setRevokeReason('');
          fetchTasks();
      } catch (err) {
          message.error('撤销失败');
      }
  };

  const columns = [
    { title: '任务标题', dataIndex: 'title', key: 'title', width: 200 },
    { 
        title: '状态', 
        dataIndex: 'status', 
        key: 'status',
        width: 120,
        render: (status, record) => {
            let color = 'green';
            let text = '进行中';
            if (status === 'revoked') { color = 'red'; text = '已撤销'; }
            if (status === 'archived') { color = 'default'; text = '已归档'; }
            
            return (
                <Space>
                    <Tag color={color}>{text}</Tag>
                    {status === 'revoked' && (
                        <Tooltip title={`撤销原因: ${record.revokedReason}`}>
                            <InfoCircleOutlined style={{ color: '#999' }} />
                        </Tooltip>
                    )}
                </Space>
            );
        }
    },
    { 
        title: '进度', 
        key: 'progress',
        width: 200,
        render: (_, record) => {
            const { completed, total } = record.stats || { completed: 0, total: 0 };
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
            return (
                <Tooltip title={`${completed}/${total} 已完成`}>
                    <Progress percent={percent} size="small" status={record.status === 'revoked' ? 'exception' : 'active'} />
                </Tooltip>
            );
        }
    },
    { 
        title: '截止时间', 
        dataIndex: 'deadline', 
        key: 'deadline',
        render: d => new Date(d).toLocaleDateString()
    },
    {
        title: '操作',
        key: 'action',
        render: (_, record) => (
            <Space>
                {record.status === 'active' && (
                    <>
                        <Button 
                            size="small" 
                            danger 
                            icon={<StopOutlined />} 
                            onClick={() => { setCurrentTask(record); setRevokeModalVisible(true); }}
                        >
                            撤销
                        </Button>
                    </>
                )}
            </Space>
        )
    }
  ];

  // 扩展行：显示人员详情
  const expandedRowRender = (record) => {
      const userDetails = record.stats?.userDetails || [];
      
      return (
          <div style={{ padding: '0 20px', background: '#fafafa' }}>
              <h4>学习情况详情 ({userDetails.length}人)</h4>
              <List
                grid={{ gutter: 16, column: 4 }}
                dataSource={userDetails}
                renderItem={user => (
                    <List.Item>
                        <Card size="small" bordered={false} style={{ background: user.isCompleted ? '#f6ffed' : '#fff1f0', border: '1px solid #eee' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{user.username} <Tag>{user.department}</Tag></div>
                                    <div style={{ fontSize: '12px', marginTop: 5 }}>
                                        {user.isCompleted ? (
                                            <Space>
                                                <CheckCircleOutlined style={{ color: 'green' }} />
                                                <span style={{ color: 'green' }}>已完成 ({user.score}分)</span>
                                            </Space>
                                        ) : (
                                            <Space>
                                                <CloseCircleOutlined style={{ color: 'red' }} />
                                                <span style={{ color: 'red' }}>未完成</span>
                                            </Space>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </List.Item>
                )}
              />
          </div>
      );
  };

  return (
    <Card title="任务监控中心" bordered={false}>
      <Table 
        columns={columns} 
        dataSource={tasks} 
        rowKey="_id" 
        loading={loading}
        expandable={{ expandedRowRender }}
      />

      {/* 撤销弹窗 */}
      <Modal 
        title="撤销任务" 
        open={revokeModalVisible} 
        onOk={handleRevoke} 
        onCancel={() => setRevokeModalVisible(false)}
      >
          <p>您确定要撤销任务 <b>{currentTask?.title}</b> 吗？</p>
          <Input.TextArea 
            rows={3} 
            placeholder="请输入撤销原因" 
            value={revokeReason}
            onChange={e => setRevokeReason(e.target.value)}
          />
      </Modal>
    </Card>
  );
};

export default AdminTaskMonitor;
