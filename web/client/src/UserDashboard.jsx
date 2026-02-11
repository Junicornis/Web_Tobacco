import React, { useState, useEffect } from 'react';
import axios from 'axios';

function UserDashboard({ user, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState('tasks'); // 'tasks' or 'inbox'
  const [launchStatus, setLaunchStatus] = useState('');

  useEffect(() => {
    fetchTasks();
    fetchNotifications();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await axios.get(`/api/admin/my-tasks?userId=${user.id}`);
      if (res.data.success) setTasks(res.data.tasks);
    } catch (err) { console.error(err); }
  };

  const fetchNotifications = async () => {
    try {
      const res = await axios.get(`/api/admin/my-notifications?userId=${user.id}`);
      if (res.data.success) setNotifications(res.data.notifications);
    } catch (err) { console.error(err); }
  };

  const startTraining = async () => {
    setLaunchStatus('正在准备启动培训...');
    try {
      const tokenRes = await axios.post('/api/auth/token', { userId: user.id, username: user.username });
      if (tokenRes.data.success) {
        setLaunchStatus(`Token已生成... 正在启动Unity...`);
        const launchRes = await axios.post('/api/auth/launch-unity');
        if (launchRes.data.success) setLaunchStatus('Unity 启动指令已发送');
        else setLaunchStatus('启动失败: ' + launchRes.data.message);
      }
    } catch (err) {
      setLaunchStatus('启动过程出错: ' + err.message);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>用户中心 - {user.username}</h2>
        <div>
            <button onClick={() => setActiveTab('tasks')} style={{ marginRight: '10px', fontWeight: activeTab==='tasks'?'bold':'normal' }}>我的任务</button>
            <button onClick={() => setActiveTab('inbox')} style={{ marginRight: '10px', fontWeight: activeTab==='inbox'?'bold':'normal' }}>
                信箱通知 ({notifications.filter(n => !n.isRead).length})
            </button>
            <button onClick={onLogout}>退出</button>
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        {activeTab === 'tasks' && (
            <div>
                <h3>待完成培训任务</h3>
                {tasks.length === 0 ? <p>暂无任务</p> : (
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {tasks.map(task => (
                            <li key={task._id} style={{ border: '1px solid #ddd', margin: '10px 0', padding: '15px', borderRadius: '5px' }}>
                                <h4>{task.title} <span style={{ fontSize: '12px', color: '#666' }}>截止: {new Date(task.deadline).toLocaleDateString()}</span></h4>
                                <p>{task.description}</p>
                                <button 
                                    onClick={startTraining}
                                    style={{ backgroundColor: '#4CAF50', color: 'white', padding: '10px', border: 'none', cursor: 'pointer' }}
                                >
                                    开始培训
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <div style={{ marginTop: '20px', color: '#666' }}>
                    系统状态: {launchStatus}
                </div>
            </div>
        )}

        {activeTab === 'inbox' && (
            <div>
                <h3>消息通知</h3>
                {notifications.length === 0 ? <p>暂无消息</p> : (
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {notifications.map(note => (
                            <li key={note._id} style={{ borderBottom: '1px solid #eee', padding: '10px' }}>
                                <div style={{ fontWeight: 'bold' }}>{note.title} <span style={{ fontSize: '12px', color: '#999' }}>{new Date(note.createdAt).toLocaleString()}</span></div>
                                <div>{note.content}</div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        )}
      </div>
    </div>
  );
}

export default UserDashboard;
