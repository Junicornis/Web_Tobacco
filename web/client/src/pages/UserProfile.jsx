import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, message, Descriptions, Row, Col, Statistic, Progress, Table, Space, Empty } from 'antd';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';

const UserProfile = ({ user }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const taskId = searchParams.get('taskId');
  const taskTitle = searchParams.get('taskTitle');

  useEffect(() => {
    fetchHistory();
  }, [user.id, taskId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ userId: user.id });
      if (taskId) query.set('taskId', taskId);
      const res = await axios.get(`/api/training/my-history?${query.toString()}`);
      if (res.data.success) setRecords(res.data.records || []);
    } catch (err) {
      message.error('获取学习记录失败');
    } finally {
      setLoading(false);
    }
  };

  const aggregates = useMemo(() => {
    const safeRecords = Array.isArray(records) ? records : [];
    const total = safeRecords.length;
    const scores = safeRecords.map(r => Number(r.score) || 0);
    const durations = safeRecords.map(r => Number(r.duration) || 0);
    const avgScore = total > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / total) : 0;
    const bestScore = total > 0 ? Math.max(...scores) : 0;
    const passCount = safeRecords.filter(r => (Number(r.score) || 0) >= 60).length;
    const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0;
    const totalDuration = durations.reduce((a, b) => a + b, 0);
    const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;
    const lastCompletedAt = safeRecords
      .map(r => r.completedAt ? new Date(r.completedAt).getTime() : 0)
      .reduce((a, b) => Math.max(a, b), 0);

    const byTaskMap = new Map();
    for (const r of safeRecords) {
      const key = r.taskId || r.taskName || 'unknown';
      const prev = byTaskMap.get(key) || {
        taskId: r.taskId || null,
        taskName: r.taskName || '未命名任务',
        total: 0,
        sumScore: 0,
        bestScore: 0,
        passCount: 0,
        lastCompletedAt: null,
        records: []
      };
      const score = Number(r.score) || 0;
      const completedAt = r.completedAt ? new Date(r.completedAt) : null;
      const next = {
        ...prev,
        total: prev.total + 1,
        sumScore: prev.sumScore + score,
        bestScore: Math.max(prev.bestScore, score),
        passCount: prev.passCount + (score >= 60 ? 1 : 0),
        lastCompletedAt: completedAt && (!prev.lastCompletedAt || completedAt > prev.lastCompletedAt) ? completedAt : prev.lastCompletedAt,
        records: [...prev.records, r]
      };
      byTaskMap.set(key, next);
    }

    const byTask = Array.from(byTaskMap.values())
      .map(t => ({
        ...t,
        avgScore: t.total > 0 ? Math.round(t.sumScore / t.total) : 0,
        passRate: t.total > 0 ? Math.round((t.passCount / t.total) * 100) : 0
      }))
      .sort((a, b) => {
        const at = a.lastCompletedAt ? a.lastCompletedAt.getTime() : 0;
        const bt = b.lastCompletedAt ? b.lastCompletedAt.getTime() : 0;
        return bt - at;
      });

    return {
      total,
      avgScore,
      bestScore,
      passRate,
      totalDuration,
      avgDuration,
      lastCompletedAt: lastCompletedAt ? new Date(lastCompletedAt) : null,
      byTask
    };
  }, [records]);

  return (
    <>
      <Card title="个人画像" style={{ marginBottom: 20 }}>
        {taskId ? (
          <div style={{ marginBottom: 12 }}>
            <Space wrap>
              <span>当前项目：</span>
              <span style={{ fontWeight: 600 }}>{taskTitle || taskId}</span>
              <Button onClick={() => navigate('/user/profile')}>查看全部项目</Button>
            </Space>
          </div>
        ) : null}

        <Row gutter={[16, 16]}>
          <Col xs={24} md={10}>
            <Card title="基本信息" bordered>
              <Descriptions bordered column={1}>
                <Descriptions.Item label="用户名">{user.username}</Descriptions.Item>
                <Descriptions.Item label="部门">{user.department || '未分配'}</Descriptions.Item>
                <Descriptions.Item label="最近学习">{aggregates.lastCompletedAt ? aggregates.lastCompletedAt.toLocaleString() : '暂无'}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          <Col xs={24} md={14}>
            <Card title="学习概览" bordered>
              <Row gutter={[16, 16]}>
                <Col xs={12} md={6}>
                  <Statistic title="学习次数" value={aggregates.total} />
                </Col>
                <Col xs={12} md={6}>
                  <Statistic title="平均分" value={aggregates.avgScore} />
                </Col>
                <Col xs={12} md={6}>
                  <Statistic title="最高分" value={aggregates.bestScore} />
                </Col>
                <Col xs={12} md={6}>
                  <Statistic title="平均用时(秒)" value={aggregates.avgDuration} />
                </Col>
                <Col xs={24} md={12}>
                  <div style={{ marginTop: 6 }}>
                    <div style={{ marginBottom: 6, color: '#666' }}>通过率</div>
                    <Progress percent={aggregates.passRate} />
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <div style={{ marginTop: 6 }}>
                    <div style={{ marginBottom: 6, color: '#666' }}>平均分</div>
                    <Progress percent={aggregates.avgScore} status="active" />
                  </div>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Card>

      <Card title="项目画像" style={{ marginBottom: 20 }}>
        {aggregates.byTask.length === 0 ? (
          <Empty description="暂无学习记录" />
        ) : (
          <Table
            loading={loading}
            rowKey={(r) => r.taskId || r.taskName}
            dataSource={aggregates.byTask}
            pagination={{ pageSize: 6 }}
            expandable={{
              expandedRowRender: (row) => (
                <div style={{ padding: 12 }}>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <div style={{ marginBottom: 6, color: '#666' }}>平均分</div>
                      <Progress percent={row.avgScore} status="active" />
                    </Col>
                    <Col xs={24} md={12}>
                      <div style={{ marginBottom: 6, color: '#666' }}>通过率</div>
                      <Progress percent={row.passRate} />
                    </Col>
                  </Row>

                  <div style={{ marginTop: 12 }}>
                    <Table
                      rowKey="_id"
                      dataSource={[...row.records].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())}
                      pagination={false}
                      columns={[
                        { title: '分数', dataIndex: 'score', key: 'score', width: 90 },
                        { title: '用时(秒)', dataIndex: 'duration', key: 'duration', width: 100 },
                        {
                          title: '完成时间',
                          dataIndex: 'completedAt',
                          key: 'completedAt',
                          render: (d) => d ? new Date(d).toLocaleString() : '-'
                        }
                      ]}
                    />
                  </div>
                </div>
              )
            }}
            columns={[
              { title: '项目名称', dataIndex: 'taskName', key: 'taskName' },
              { title: '学习次数', dataIndex: 'total', key: 'total', width: 100 },
              { title: '平均分', dataIndex: 'avgScore', key: 'avgScore', width: 90 },
              { title: '最高分', dataIndex: 'bestScore', key: 'bestScore', width: 90 },
              {
                title: '通过率',
                dataIndex: 'passRate',
                key: 'passRate',
                width: 160,
                render: (p) => <Progress percent={p} />
              },
              {
                title: '最近学习',
                dataIndex: 'lastCompletedAt',
                key: 'lastCompletedAt',
                width: 170,
                render: (d) => d ? new Date(d).toLocaleString() : '-'
              }
            ]}
          />
        )}
      </Card>
    </>
  );
};

export default UserProfile;
