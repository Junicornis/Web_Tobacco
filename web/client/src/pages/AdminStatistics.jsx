import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, message, Space, Typography, Upload } from 'antd';
import { PlusOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import axios from 'axios';

const AdminSceneImport = () => {
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [selectedExeFile, setSelectedExeFile] = useState(null);

  useEffect(() => {
    fetchScenes();
  }, []);

  const fetchScenes = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/scenes');
      if (res.data.success) setScenes(res.data.scenes || []);
    } catch (err) {
      message.error('获取场景列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    form.resetFields();
    setSelectedExeFile(null);
    setIsModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      const res = await axios.delete(`/api/admin/scenes/${id}`);
      if (res.data.success) {
        message.success('删除成功');
        fetchScenes();
      } else {
        message.error(res.data.message || '删除失败');
      }
    } catch (err) {
      message.error('删除失败');
    }
  };

  const onFinish = async (values) => {
    try {
      if (selectedExeFile) {
        const formData = new FormData();
        formData.append('name', values.name);
        formData.append('file', selectedExeFile);

        const res = await axios.post('/api/admin/scenes/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (res.data.success) {
          message.success('导入成功');
          setIsModalVisible(false);
          fetchScenes();
          return;
        }

        message.error(res.data.message || '导入失败');
        return;
      }

      const res = await axios.post('/api/admin/scenes', values);
      if (res.data.success) {
        message.success('导入成功');
        setIsModalVisible(false);
        fetchScenes();
      } else {
        message.error(res.data.message || '导入失败');
      }
    } catch (err) {
      message.error(err?.response?.data?.message || '导入失败');
    }
  };

  const columns = [
    { title: '场景名称', dataIndex: 'name', key: 'name' },
    { title: '可执行文件路径', dataIndex: 'exePath', key: 'exePath', ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record._id)}>
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Card
      title="场景导入"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          导入场景
        </Button>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        场景用于任务下发时选择要启动的 Unity 客户端。推荐上传 Unity Windows 构建的 .zip（需包含主程序 .exe、*_Data、相关 dll 等；包含 UnityCrashHandler64.exe 这类辅助 exe 也没关系，系统会自动选主程序），或填写服务器可访问的 .exe 绝对路径。
      </Typography.Paragraph>

      <Table columns={columns} dataSource={scenes} rowKey="_id" loading={loading} />

      <Modal
        title="导入场景"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="场景名称" rules={[{ required: true, message: '请输入场景名称' }]}>
            <Input placeholder="例如：消防培训" />
          </Form.Item>
          <Form.Item label="选择 Unity 构建文件（推荐 .zip）">
            <Upload
              accept=".zip,.exe"
              maxCount={1}
              beforeUpload={(file) => {
                setSelectedExeFile(file);
                return false;
              }}
              onRemove={() => {
                setSelectedExeFile(null);
              }}
              fileList={selectedExeFile ? [selectedExeFile] : []}
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>

          <Form.Item
            name="exePath"
            label="或填写服务器绝对路径"
            rules={[
              ({ getFieldValue }) => ({
                validator: async () => {
                  const exePath = (getFieldValue('exePath') || '').trim();
                  if (selectedExeFile) return;
                  if (!exePath) throw new Error('请选择文件或填写路径');
                }
              })
            ]}
          >
            <Input placeholder="例如：D:/proj/Hu_tobacco/Web_Tobacco/unity/Build/Release/Safety-Training.exe" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default AdminSceneImport;
