import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, message } from 'antd';
import axios from 'axios';

const AdminTrainingRecords = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      const res = await axios.get('/api/admin/training-records');
      if (res.data.success) {
        setRecords(res.data.records);
      }
    } catch (err) {
      message.error('获取培训记录失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '员工姓名',
      dataIndex: ['userId', 'username'],
      key: 'username',
      render: text => <b>{text || '未知用户'}</b>
    },
    {
      title: '所属部门',
      dataIndex: ['userId', 'department'],
      key: 'department',
      render: text => <Tag color="geekblue">{text}</Tag>
    },
    {
      title: '任务名称',
      dataIndex: 'taskName',
      key: 'taskName',
    },
    {
      title: '分数',
      dataIndex: 'score',
      key: 'score',
      render: score => <span style={{ color: score >= 60 ? 'green' : 'red', fontWeight: 'bold' }}>{score}分</span>
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      render: seconds => `${Math.floor(seconds / 60)}分${seconds % 60}秒`
    },
    {
      title: '完成时间',
      dataIndex: 'completedAt',
      key: 'completedAt',
      render: date => new Date(date).toLocaleString()
    }
  ];

  return (
    <Card title="全员培训记录" variant="borderless">
      <Table 
        columns={columns} 
        dataSource={records} 
        rowKey="_id" 
        loading={loading}
      />
    </Card>
  );
};

export default AdminTrainingRecords;
