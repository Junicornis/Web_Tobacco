import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Modal, Form, Input, Select, message, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;

const AdminQuestionManage = () => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await axios.get('/api/admin/questions');
      if (res.data.success) setQuestions(res.data.questions);
    } catch (err) {
      message.error('获取题库失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleDelete = async (id) => {
      try {
          await axios.delete(`/api/admin/questions/${id}`);
          message.success('删除成功');
          fetchQuestions();
      } catch (err) {
          message.error('删除失败');
      }
  };

  const onFinish = async (values) => {
    // 简单处理 options
    const payload = {
        ...values,
        options: values.optionsString.split('\n').filter(s => s.trim())
    };

    try {
      await axios.post('/api/admin/questions', payload);
      message.success('添加题目成功');
      setIsModalVisible(false);
      fetchQuestions();
    } catch (err) {
      message.error('添加失败');
    }
  };

  const columns = [
    { title: '题目内容', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '分类', dataIndex: 'category', key: 'category', width: 100 },
    { title: '正确答案', dataIndex: 'correctAnswer', key: 'correctAnswer', width: 100 },
    { 
        title: '操作', 
        key: 'action', 
        width: 150,
        render: (_, record) => (
            <Space>
                <Button type="link" icon={<EditOutlined />}>编辑</Button>
                <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record._id)}>删除</Button>
            </Space>
        )
    }
  ];

  return (
    <Card title="题库管理" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增题目</Button>}>
      <Table columns={columns} dataSource={questions} rowKey="_id" loading={loading} />
      
      <Modal title="新增题目" open={isModalVisible} onCancel={() => setIsModalVisible(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item name="title" label="题目内容" rules={[{ required: true }]}>
                <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="optionsString" label="选项 (每行一个，如: A. 选项一)" rules={[{ required: true }]}>
                <Input.TextArea rows={4} placeholder="A. 选项A&#10;B. 选项B&#10;C. 选项C" />
            </Form.Item>
            <Form.Item name="correctAnswer" label="正确答案 (如 A)" rules={[{ required: true }]}>
                <Input />
            </Form.Item>
            <Form.Item name="category" label="分类">
                <Select>
                    <Option value="消防安全">消防安全</Option>
                    <Option value="生产规范">生产规范</Option>
                    <Option value="应急处理">应急处理</Option>
                </Select>
            </Form.Item>
            <Form.Item name="analysis" label="解析">
                <Input.TextArea />
            </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default AdminQuestionManage;
