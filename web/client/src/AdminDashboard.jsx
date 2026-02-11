import React, { useState, useEffect } from 'react';
import axios from 'axios';

function AdminDashboard({ user, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [newTask, setNewTask] = useState({ title: '', description: '', deadline: '', assignedUserIds: [], notifyUsers: true });
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/admin/users');
      if (res.data.success) setUsers(res.data.users);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (newTask.assignedUserIds.length === 0) {
        alert("请至少选择一个员工");
        return;
    }

    try {
      const res = await axios.post('/api/admin/create', newTask);
      if (res.data.success) {
        setStatus('任务下发成功！通知已发送。');
        setNewTask({ title: '', description: '', deadline: '', assignedUserIds: [], notifyUsers: true });
      } else {
        setStatus('失败: ' + res.data.message);
      }
    } catch (err) {
      setStatus('错误: ' + err.message);
    }
  };

  const toggleUserSelection = (userId) => {
      const current = newTask.assignedUserIds;
      if (current.includes(userId)) {
          setNewTask({ ...newTask, assignedUserIds: current.filter(id => id !== userId) });
      } else {
          setNewTask({ ...newTask, assignedUserIds: [...current, userId] });
      }
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>管理员控制台 - {user.username}</h2>
        <button onClick={onLogout}>退出登录</button>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1, border: '1px solid #ccc', padding: '15px' }}>
          <h3>下发新培训任务</h3>
          <form onSubmit={handleCreateTask}>
            <div style={{ marginBottom: '10px' }}>
              <label>任务标题:</label><br/>
              <input 
                type="text" 
                value={newTask.title} 
                onChange={e => setNewTask({...newTask, title: e.target.value})}
                required 
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label>任务简介与要求:</label><br/>
              <textarea 
                value={newTask.description} 
                onChange={e => setNewTask({...newTask, description: e.target.value})}
                required
                style={{ width: '100%', height: '80px' }}
              />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label>截止时间:</label><br/>
              <input 
                type="date" 
                value={newTask.deadline} 
                onChange={e => setNewTask({...newTask, deadline: e.target.value})}
                required 
              />
            </div>
            
            <div style={{ marginBottom: '10px' }}>
              <label>选择员工:</label>
              <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #eee' }}>
                  {users.map(u => (
                      <div key={u._id}>
                          <input 
                            type="checkbox" 
                            checked={newTask.assignedUserIds.includes(u._id)}
                            onChange={() => toggleUserSelection(u._id)}
                          /> 
                          {u.username} ({u.department})
                      </div>
                  ))}
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label>
                  <input 
                    type="checkbox" 
                    checked={newTask.notifyUsers}
                    onChange={e => setNewTask({...newTask, notifyUsers: e.target.checked})}
                  />
                  同时发送信箱通知
              </label>
            </div>

            <button type="submit">下发任务</button>
          </form>
          <p style={{ color: 'green' }}>{status}</p>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
