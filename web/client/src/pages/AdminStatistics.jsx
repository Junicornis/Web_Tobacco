import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Progress } from 'antd';
import { UserOutlined, FileDoneOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const AdminStatistics = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/admin/statistics');
      if (res.data.success) setStats(res.data.stats);
    } catch (err) {
      console.error(err);
    }
  };

  if (!stats) return <div>Loading...</div>;

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={8}>
            <Card>
                <Statistic title="总培训人次" value={stats.totalTrainings} prefix={<UserOutlined />} />
            </Card>
        </Col>
        <Col span={8}>
            <Card>
                <Statistic title="平均分" value={stats.avgScore} prefix={<FileDoneOutlined />} suffix="分" />
            </Card>
        </Col>
        <Col span={8}>
            <Card>
                <Statistic title="及格率" value={stats.passRate} prefix={<CheckCircleOutlined />} suffix="%" />
            </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
            <Card title="部门参与度排行 (Top 5)">
                {stats.departmentStats.map((item, index) => (
                    <div key={item._id} style={{ marginBottom: 15 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                            <span>{index + 1}. {item._id}</span>
                            <span>{item.count} 人次</span>
                        </div>
                        <Progress percent={Math.round((item.count / stats.totalTrainings) * 100)} showInfo={false} />
                    </div>
                ))}
            </Card>
        </Col>
        <Col span={12}>
            <Card title="待开发图表">
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
                    更多可视化图表敬请期待...
                </div>
            </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AdminStatistics;
