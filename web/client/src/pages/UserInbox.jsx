import React, { useState, useEffect } from 'react';
import { List, Card, Typography, Empty, Badge, Button, Modal, message, Space } from 'antd';
import { BellOutlined, CheckOutlined, ReadOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title } = Typography;

const UserInbox = ({ user, onReadUpdate }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 详情弹窗
  const [modalVisible, setModalVisible] = useState(false);
  const [currentNote, setCurrentNote] = useState(null);

  useEffect(() => {
    fetchNotifications();
  }, [user.id]);

  const fetchNotifications = async () => {
    try {
      const res = await axios.get(`/api/admin/my-notifications?userId=${user.id}`);
      if (res.data.success) {
          setNotifications(res.data.notifications);
          // 通知父组件更新红点
          if (onReadUpdate) onReadUpdate(res.data.unreadCount);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReadAll = async () => {
      try {
          await axios.put('/api/admin/notifications/read-all', { userId: user.id });
          message.success('全部标记为已读');
          fetchNotifications();
      } catch (err) {
          message.error('操作失败');
      }
  };

  const handleClickNote = async (note) => {
      setCurrentNote(note);
      setModalVisible(true);
      
      // 如果未读，标记为已读
      if (!note.isRead) {
          try {
              await axios.put(`/api/admin/notifications/${note._id}/read`);
              // 更新本地状态
              const newNotes = notifications.map(n => 
                  n._id === note._id ? { ...n, isRead: true } : n
              );
              setNotifications(newNotes);
              // 计算新的未读数并通知父组件
              const newUnreadCount = newNotes.filter(n => !n.isRead).length;
              if (onReadUpdate) onReadUpdate(newUnreadCount);
          } catch (err) {
              console.error(err);
          }
      }
  };

  return (
    <Card 
        title={<><BellOutlined /> 消息信箱</>} 
        bordered={false}
        extra={
            <Button type="link" icon={<CheckOutlined />} onClick={handleReadAll}>
                一键已读
            </Button>
        }
    >
      <List
        itemLayout="horizontal"
        dataSource={notifications}
        loading={loading}
        locale={{ emptyText: <Empty description="暂无消息" /> }}
        renderItem={item => (
          <List.Item 
            style={{ 
                cursor: 'pointer', 
                backgroundColor: item.isRead ? 'transparent' : '#f0faff', 
                padding: '12px',
                borderRadius: '4px',
                marginBottom: '8px',
                transition: 'background 0.3s'
            }}
            onClick={() => handleClickNote(item)}
            actions={[
                !item.isRead && <Badge status="processing" text="未读" />
            ]}
          >
            <List.Item.Meta
              avatar={
                  <Badge dot={!item.isRead}>
                      <BellOutlined style={{ fontSize: '20px', color: item.isRead ? '#ccc' : '#1890ff' }} />
                  </Badge>
              }
              title={
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: item.isRead ? 'normal' : 'bold' }}>{item.title}</span>
                      <span style={{ fontSize: '12px', color: '#999' }}>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
              }
              description={
                  <div style={{ 
                      whiteSpace: 'nowrap', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      maxWidth: '500px',
                      color: '#666' 
                  }}>
                      {item.content}
                  </div>
              }
            />
          </List.Item>
        )}
      />

      <Modal
        title={currentNote?.title}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
            <Button key="close" onClick={() => setModalVisible(false)}>
                关闭
            </Button>
        ]}
      >
          <div style={{ padding: '10px 0' }}>
              <p style={{ fontSize: '16px', lineHeight: '1.6' }}>{currentNote?.content}</p>
              <div style={{ marginTop: '20px', color: '#999', fontSize: '12px', textAlign: 'right' }}>
                  <Space>
                    <span>类型: {currentNote?.type === 'system' ? '系统通知' : '任务通知'}</span>
                    <span>时间: {currentNote && new Date(currentNote.createdAt).toLocaleString()}</span>
                  </Space>
              </div>
          </div>
      </Modal>
    </Card>
  );
};

export default UserInbox;
