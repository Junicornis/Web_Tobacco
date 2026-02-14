import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, Input, message, Modal, Form, Select } from 'antd';
import { SearchOutlined, UserAddOutlined } from '@ant-design/icons';
import axios from 'axios';

const AdminUserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

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

  const openCreateModal = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role: 'user', password: '123456' });
    setIsModalVisible(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    form.resetFields();
    form.setFieldsValue({
      username: user.username,
      department: user.department,
      role: user.role
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (user) => {
    Modal.confirm({
      title: '确认删除该账号？',
      content: `用户名：${user.username}`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await axios.delete(`/api/admin/users/${user._id}`);
          if (res.data.success) {
            message.success('删除成功');
            fetchUsers();
          } else {
            message.error(res.data.message || '删除失败');
          }
        } catch (err) {
          message.error(err?.response?.data?.message || '删除失败');
        }
      }
    });
  };

  const onFinish = async (values) => {
    setSubmitting(true);
    try {
      if (editingUser) {
        const payload = {
          username: values.username,
          department: values.department,
          role: values.role
        };
        if (values.password) payload.password = values.password;

        const res = await axios.put(`/api/admin/users/${editingUser._id}`, payload);
        if (res.data.success) {
          message.success('更新成功');
          setIsModalVisible(false);
          fetchUsers();
        } else {
          message.error(res.data.message || '更新失败');
        }
      } else {
        const res = await axios.post('/api/admin/users', values);
        if (res.data.success) {
          message.success('创建成功');
          setIsModalVisible(false);
          fetchUsers();
        } else {
          message.error(res.data.message || '创建失败');
        }
      }
    } catch (err) {
      message.error(err?.response?.data?.message || '提交失败');
    } finally {
      setSubmitting(false);
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
        <>
          <Button type="link" onClick={() => openEditModal(record)}>
            编辑
          </Button>
          <Button type="link" danger onClick={() => handleDelete(record)}>
            删除
          </Button>
        </>
      ),
    },
  ];

  return (
    <Card 
      title="人员管理" 
      extra={
        <div style={{ display: 'flex', gap: 12 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索用户名"
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<UserAddOutlined />} onClick={openCreateModal}>
            创建账号
          </Button>
        </div>
      }
    >
      <Table 
        columns={columns} 
        dataSource={users} 
        rowKey="_id" 
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingUser ? '编辑账号' : '创建账号'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="例如：zhangsan" />
          </Form.Item>

          <Form.Item name="department" label="所属部门">
            <Input placeholder="例如：生产部" />
          </Form.Item>

          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select
              options={[
                { label: '员工', value: 'user' },
                { label: '管理员', value: 'admin' }
              ]}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={editingUser ? '密码（留空不修改）' : '初始密码'}
            rules={editingUser ? [] : [{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder={editingUser ? '不修改请留空' : '例如：123456'} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default AdminUserList;
