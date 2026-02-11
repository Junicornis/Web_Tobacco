import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, Input, message, Modal, Form, Select } from 'antd';
import { SearchOutlined, UserAddOutlined } from '@ant-design/icons';
import axios from 'axios';

const AdminUserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/admin/users');
      if (res.data.success) {
        setUsers(res.data.users);
      }
    } catch (err) {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      filteredValue: searchText ? [searchText] : null,
      onFilter: (value, record) => record.username.toLowerCase().includes(value.toLowerCase()),
    },
    {
      title: '所属部门',
      dataIndex: 'department',
      key: 'department',
      render: text => <Tag color="blue">{text || '无部门'}</Tag>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: text => <Tag color={text === 'admin' ? 'gold' : 'green'}>{text === 'admin' ? '管理员' : '员工'}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button type="link" danger onClick={() => message.info('编辑功能待开发')}>
          编辑
        </Button>
      ),
    },
  ];

  return (
    <Card 
      title="人员管理" 
      extra={
        <Input 
            prefix={<SearchOutlined />} 
            placeholder="搜索用户名" 
            onChange={e => setSearchText(e.target.value)} 
            style={{ width: 200 }} 
        />
      }
    >
      <Table 
        columns={columns} 
        dataSource={users} 
        rowKey="_id" 
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </Card>
  );
};

export default AdminUserList;
