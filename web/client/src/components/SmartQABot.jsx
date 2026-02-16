import React, { useState, useRef, useEffect } from 'react';
import { Button, Input, List, Card, Spin, Avatar, FloatButton, Collapse, Drawer, Tag, Typography, Tree } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, MessageOutlined, CloseOutlined, CopyOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';
import './SmartQABot.css';

const STRATEGY_TAG_CONFIG = {
  neo4j: { label: 'neo4j', backgroundColor: '#0b7a4a', color: '#ffffff' },
  rag: { label: 'rag', backgroundColor: '#4c1d95', color: '#ffffff' },
  'neo4j+rag': { label: 'neo4j+rag', backgroundColor: '#111827', color: '#ffffff' }
};

const jsonStringifySafe = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    try {
      return String(value);
    } catch {
      return '';
    }
  }
};

const toTreeData = (value, keyPrefix = 'root') => {
  const makeTitle = (k, v) => {
    if (v && typeof v === 'object' && v.__type === 'node') {
      return (
        <span>
          <Tag color="green" style={{ marginRight: 6 }}>NODE</Tag>
          <span style={{ color: '#111827' }}>{k}</span>
        </span>
      );
    }
    if (v && typeof v === 'object' && v.__type === 'relationship') {
      return (
        <span>
          <Tag color="orange" style={{ marginRight: 6 }}>REL</Tag>
          <span style={{ color: '#111827' }}>{k}</span>
        </span>
      );
    }
    if (v === null) return <span><span style={{ color: '#111827' }}>{k}</span>: <span style={{ color: '#6b7280' }}>null</span></span>;
    if (typeof v === 'string') return <span><span style={{ color: '#111827' }}>{k}</span>: <span style={{ color: '#2563eb' }}>{v}</span></span>;
    if (typeof v === 'number') return <span><span style={{ color: '#111827' }}>{k}</span>: <span style={{ color: '#059669' }}>{v}</span></span>;
    if (typeof v === 'boolean') return <span><span style={{ color: '#111827' }}>{k}</span>: <span style={{ color: '#7c3aed' }}>{String(v)}</span></span>;
    if (Array.isArray(v)) return <span><span style={{ color: '#111827' }}>{k}</span>: <span style={{ color: '#6b7280' }}>[{v.length}]</span></span>;
    if (v && typeof v === 'object') return <span><span style={{ color: '#111827' }}>{k}</span>: <span style={{ color: '#6b7280' }}>{'{…}'}</span></span>;
    return <span><span style={{ color: '#111827' }}>{k}</span>: <span style={{ color: '#6b7280' }}>{String(v)}</span></span>;
  };

  const buildNode = (k, v, path) => {
    const key = `${keyPrefix}:${path}`;
    if (Array.isArray(v)) {
      return {
        key,
        title: makeTitle(k, v),
        children: v.map((item, idx) => buildNode(String(idx), item, `${path}.${idx}`))
      };
    }
    if (v && typeof v === 'object') {
      return {
        key,
        title: makeTitle(k, v),
        children: Object.entries(v).map(([ck, cv]) => buildNode(ck, cv, `${path}.${ck}`))
      };
    }
    return { key, title: makeTitle(k, v) };
  };

  return [buildNode('data', value, 'data')];
};

const highlightText = (text, phrases) => {
  if (!text) return text;
  const safePhrases = Array.isArray(phrases) ? phrases.filter((p) => typeof p === 'string' && p.trim()) : [];
  if (safePhrases.length === 0) return text;

  const unique = Array.from(new Set(safePhrases)).sort((a, b) => b.length - a.length);
  const escaped = unique.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'g');
  const parts = String(text).split(re);
  return parts.map((part, idx) => {
    if (unique.includes(part)) {
      return (
        <mark key={idx} style={{ backgroundColor: '#fde68a', padding: '0 2px' }}>
          {part}
        </mark>
      );
    }
    return <span key={idx}>{part}</span>;
  });
};

const EvidencePanel = ({ evidence, onPreviewRag }) => {
  if (!evidence || !evidence.strategyTag) return null;

  const config = STRATEGY_TAG_CONFIG[evidence.strategyTag] || { label: evidence.strategyTag, backgroundColor: '#111827', color: '#ffffff' };
  const neo4j = evidence.neo4j;
  const rag = evidence.rag;

  const items = [];

  if (neo4j) {
    const cypherStatements = Array.isArray(neo4j.cypherStatements) ? neo4j.cypherStatements : [];
    const cypherText = cypherStatements.map((s, i) => {
      const cypher = (s && s.cypher) || '';
      const params = s && s.params ? jsonStringifySafe(s.params) : null;
      const block = params ? `${cypher}\n\nPARAMS:\n${params}` : cypher;
      return `#${i + 1}\n${block}`;
    }).join('\n\n');

    items.push({
      key: 'neo4j',
      label: 'Neo4j 查询语句与图数据',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Typography.Text strong>Cypher 查询语句</Typography.Text>
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => navigator.clipboard.writeText(cypherText || '')}
              disabled={!cypherText}
            >
              复制
            </Button>
          </div>
          <pre style={{ margin: 0, padding: 12, background: '#0b1220', color: '#e5e7eb', borderRadius: 6, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
            {cypherText || '无'}
          </pre>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Typography.Text strong>原始图数据</Typography.Text>
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => navigator.clipboard.writeText(jsonStringifySafe(neo4j.graphData))}
              disabled={neo4j.graphData == null}
            >
              复制
            </Button>
          </div>
          {neo4j.graphData != null ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, background: '#ffffff' }}>
              <Tree
                showLine
                selectable={false}
                defaultExpandAll={false}
                treeData={toTreeData(neo4j.graphData, 'neo4j')}
              />
            </div>
          ) : (
            <Typography.Text type="secondary">无</Typography.Text>
          )}
        </div>
      )
    });
  }

  if (rag) {
    const matches = Array.isArray(rag.matches) ? rag.matches : [];
    items.push({
      key: 'rag',
      label: 'RAG 相符数据',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {matches.length === 0 ? (
            <Typography.Text type="secondary">无</Typography.Text>
          ) : (
            <List
              size="small"
              dataSource={matches}
              renderItem={(m, idx) => (
                <List.Item style={{ paddingLeft: 0, paddingRight: 0 }}>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Tag color="geekblue">{m.fileName}</Tag>
                        <Tag color="blue">段落 {m.paragraphIndex}</Tag>
                        <Tag color="purple">相似度 {m.score === null || m.score === undefined ? '—' : m.score}</Tag>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {m.originalUrl && (
                          <Button size="small" type="link" onClick={() => window.open(m.originalUrl, '_blank')}>原文</Button>
                        )}
                        <Button size="small" onClick={() => onPreviewRag({ ...m, _index: idx })}>预览</Button>
                      </div>
                    </div>
                    {Array.isArray(m.keySentences) && m.keySentences.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {m.keySentences.map((s, i) => (
                          <div key={i} style={{ fontSize: 12, lineHeight: 1.5, color: '#111827' }}>
                            {highlightText(s, m.keySentences)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>
      )
    });
  }

  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>证据源</Typography.Text>
        <span style={{ padding: '2px 8px', borderRadius: 6, backgroundColor: config.backgroundColor, color: config.color, fontSize: 12, fontWeight: 700 }}>
          {config.label}
        </span>
      </div>
      <Collapse size="small" bordered={false} items={items} defaultActiveKey={[]} />
    </div>
  );
};

const SmartQABot = () => {
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '你好！我是安全培训智能助手，有什么可以帮你的吗？' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const [ragPreviewOpen, setRagPreviewOpen] = useState(false);
  const [ragPreviewData, setRagPreviewData] = useState(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, visible]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage = { role: 'user', content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      // 准备历史记录 (最近 5 条)
      const history = messages.slice(-5).map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await axios.post('/api/kg/chat', {
        question: userMessage.content,
        history
      });

      if (response.data.success) {
        const botMessage = {
          role: 'assistant',
          content: response.data.data.answer,
          source: response.data.data.source,
          strategyTag: response.data.data.strategyTag,
          evidence: response.data.data.evidence
        };
        setMessages(prev => [...prev, botMessage]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，遇到了一些错误：' + response.data.message }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: '网络请求失败，请稍后重试。' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <FloatButton 
        icon={<MessageOutlined />} 
        type="primary" 
        style={{ right: 24, bottom: 24 }}
        onClick={() => setVisible(!visible)}
        tooltip="智能问答"
      />

      {visible && (
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RobotOutlined /> 智能问答
            </div>
          }
          extra={<Button type="text" icon={<CloseOutlined />} onClick={() => setVisible(false)} />}
          className="smart-qa-bot-card"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 80,
            width: 400,
            height: 600,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
          bodyStyle={{ 
            flex: 1, 
            overflow: 'hidden', 
            display: 'flex', 
            flexDirection: 'column',
            padding: 0
          }}
        >
          <div className="messages-container" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <List
              itemLayout="horizontal"
              dataSource={messages}
              renderItem={(item) => (
                <List.Item style={{ border: 'none', padding: '8px 0' }}>
                  <div style={{ 
                    display: 'flex', 
                    width: '100%', 
                    flexDirection: item.role === 'user' ? 'row-reverse' : 'row',
                    gap: '12px'
                  }}>
                    <Avatar 
                      icon={item.role === 'user' ? <UserOutlined /> : <RobotOutlined />} 
                      style={{ backgroundColor: item.role === 'user' ? '#1890ff' : '#52c41a', flexShrink: 0 }}
                    />
                    <div style={{
                      backgroundColor: item.role === 'user' ? '#e6f7ff' : '#f6f6f6',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      maxWidth: '80%',
                      wordBreak: 'break-word'
                    }}>
                      <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {item.content}
                        </ReactMarkdown>
                      </div>
                      {item.role === 'assistant' && item.evidence && (
                        <EvidencePanel
                          evidence={item.evidence}
                          onPreviewRag={(data) => {
                            setRagPreviewData(data);
                            setRagPreviewOpen(true);
                          }}
                        />
                      )}
                      {item.source && item.source !== 'none' && (
                        <div style={{ fontSize: '10px', color: '#999', marginTop: '4px', textAlign: 'right' }}>
                          来源: {item.source}
                        </div>
                      )}
                    </div>
                  </div>
                </List.Item>
              )}
            />
            {loading && (
              <div style={{ padding: '10px', textAlign: 'center' }}>
                <Spin size="small" /> 思考中...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: '12px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: '8px' }}>
            <Input 
              placeholder="请输入您的问题..." 
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onPressEnter={handleSend}
              disabled={loading}
            />
            <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={loading} />
          </div>
        </Card>
      )}

      <Drawer
        title={ragPreviewData ? `${ragPreviewData.fileName} · 段落 ${ragPreviewData.paragraphIndex}` : 'RAG 预览'}
        placement="right"
        width={520}
        open={ragPreviewOpen}
        onClose={() => {
          setRagPreviewOpen(false);
          setRagPreviewData(null);
        }}
      >
        {ragPreviewData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Tag color="purple">相似度 {ragPreviewData.score === null || ragPreviewData.score === undefined ? '—' : ragPreviewData.score}</Tag>
              {ragPreviewData.originalUrl && (
                <Button type="link" onClick={() => window.open(ragPreviewData.originalUrl, '_blank')}>打开原文</Button>
              )}
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => navigator.clipboard.writeText(String(ragPreviewData.text || ''))}
              >
                复制片段
              </Button>
            </div>
            <div style={{ padding: 12, borderRadius: 8, border: '1px solid #e5e7eb', background: '#ffffff', lineHeight: 1.7 }}>
              {highlightText(ragPreviewData.text, ragPreviewData.keySentences)}
            </div>
            {Array.isArray(ragPreviewData.keySentences) && ragPreviewData.keySentences.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Typography.Text strong>关键句</Typography.Text>
                {ragPreviewData.keySentences.map((s, i) => (
                  <div key={i} style={{ fontSize: 13, lineHeight: 1.7 }}>
                    {highlightText(s, ragPreviewData.keySentences)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
};

export default SmartQABot;
