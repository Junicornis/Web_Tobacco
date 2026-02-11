import React, { useState, useEffect } from 'react';
import { Table, Card, Statistic, Row, Col } from 'antd';
import { TrophyOutlined, HistoryOutlined } from '@ant-design/icons';
import axios from 'axios';

const UserHistory = ({ user }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`/api/training/my-history?userId=${user.id}`);
      if (res.data.success) {
        setRecords(res.data.records);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'taskName',
      key: 'taskName',
    },
    {
      title: '分数',
      dataIndex: 'score',
      key: 'score',
      render: score => <span style={{ color: score >= 80 ? 'green' : 'orange', fontWeight: 'bold' }}>{score}</span>
    },
    {
      title: '完成时间',
      dataIndex: 'completedAt',
      key: 'completedAt',
      render: date => new Date(date).toLocaleString()
    }
  ];

  // 计算简单的统计数据
  const totalTraining = records.length;
  const maxScore = records.length > 0 ? Math.max(...records.map(r => r.score)) : 0;

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: '20px' }}>
        <Col span={12}>
          <Card>
            <Statistic title="已完成培训" value={totalTraining} prefix={<HistoryOutlined />} suffix="次" />
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <Statistic title="最高得分" value={maxScore} prefix={<TrophyOutlined />} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      <Card title="历史成绩单" bordered={false}>
        <Table 
            columns={columns} 
            dataSource={records} 
            rowKey="_id" 
            loading={loading} 
            pagination={{ pageSize: 5 }}
        />
      </Card>
    </div>
  );
};

export default UserHistory;
