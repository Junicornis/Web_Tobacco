import React, { useState, useEffect } from 'react';
import { List, Card, Tag, Collapse, Typography, Empty } from 'antd';
import { CloseCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Panel } = Collapse;
const { Text } = Typography;

const UserMistakes = ({ user }) => {
  const [mistakes, setMistakes] = useState([]);

  useEffect(() => {
    const fetchMistakes = async () => {
        try {
            const res = await axios.get(`/api/training/my-mistakes?userId=${user.id}`);
            if (res.data.success) setMistakes(res.data.mistakes);
        } catch (err) { console.error(err); }
    };
    fetchMistakes();
  }, [user.id]);

  return (
    <Card title="我的错题本" bordered={false}>
        {mistakes.length === 0 ? <Empty description="太棒了，暂无错题！" /> : (
            <Collapse accordion>
                {mistakes.map((m, index) => (
                    <Panel 
                        header={<span><CloseCircleOutlined style={{ color: 'red', marginRight: 8 }} /> {m.questionContent || '未知题目'}</span>} 
                        key={m._id}
                    >
                        <p><Text type="secondary">你的答案：</Text> <Tag color="red">{m.userAnswer}</Tag></p>
                        <p><Text type="success">正确答案：</Text> <Tag color="green">{m.correctAnswer}</Tag></p>
                        <p><Text type="secondary">记录时间：</Text> {new Date(m.createdAt).toLocaleString()}</p>
                    </Panel>
                ))}
            </Collapse>
        )}
    </Card>
  );
};

export default UserMistakes;
