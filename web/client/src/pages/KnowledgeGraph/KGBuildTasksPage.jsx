/**
 * 图谱构建任务列表页面
 * 
 * 功能：
 * 1. 展示所有构建任务列表
 * 2. 查看任务详情和结果
 * 3. 删除任务
 * 4. 跳转到确认页面
 */

import React, { useState, useEffect } from 'react';
import { 
    Tag, Button, Space, Card, Typography, 
    message, Popconfirm, Badge, Pagination, Row, Col, Spin,
    Radio, Empty, Tooltip, Progress, Drawer
} from 'antd';
import { 
    EyeOutlined, DeleteOutlined, ReloadOutlined,
    CheckCircleOutlined, CloseCircleOutlined, 
    LoadingOutlined, ClockCircleOutlined,
    FileTextOutlined, NodeIndexOutlined, ShareAltOutlined,
    DownOutlined, UpOutlined, AppstoreOutlined, BarsOutlined,
    CalendarOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AnimatedList from './AnimatedList';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { Title, Text, Paragraph } = Typography;

const KGBuildTasksPage = () => {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 12, // Grid view fits better with multiples of 3/4
        total: 0
    });
    // Track expanded items
    const [expandedTaskIds, setExpandedTaskIds] = useState([]);
    const [viewMode, setViewMode] = useState('grid'); // 'list' | 'grid'
    const [originalVisible, setOriginalVisible] = useState(false);
    const [originalLoading, setOriginalLoading] = useState(false);
    const [originalContent, setOriginalContent] = useState({ title: '原文预览', content: '' });

    useEffect(() => {
        fetchTasks();
    }, [pagination.current, pagination.pageSize]);

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/kg/tasks', {
                params: {
                    page: pagination.current,
                    limit: pagination.pageSize
                }
            });
            
            if (res.data.success) {
                // Ensure each task has a unique key for AnimatedList
                const tasksWithKeys = res.data.data.map(t => ({ ...t, key: t._id }));
                setTasks(tasksWithKeys);
                setPagination(prev => ({
                    ...prev,
                    total: res.data.pagination.total
                }));
            }
        } catch (error) {
            message.error('加载任务列表失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleViewOriginal = async (taskId) => {
        // 埋点
        try {
            console.log('Track event: original_view', { module: 'build_task', id: taskId });
            // 如果有真实的埋点SDK，这里调用
        } catch (e) { console.error(e); }

        setOriginalVisible(true);
        setOriginalLoading(true);
        setOriginalContent({ title: '原文预览', content: '' });
        try {
            const res = await axios.get(`/api/kg/${taskId}/original`);
            if (res.data.success) {
                setOriginalContent({ title: '原文预览', content: res.data.content || '' });
            } else {
                message.warning('未找到原文内容');
                setOriginalVisible(false);
            }
        } catch (error) {
            message.error('获取原文失败: ' + (error.response?.data?.message || error.message));
            setOriginalVisible(false);
        } finally {
            setOriginalLoading(false);
        }
    };

    const handleDelete = async (taskId) => {
        try {
            await axios.delete(`/api/kg/tasks/${taskId}`);
            message.success('任务已删除');
            fetchTasks();
        } catch (error) {
            message.error('删除失败: ' + error.message);
        }
    };

    const toggleExpand = (taskId) => {
        setExpandedTaskIds(prev => 
            prev.includes(taskId) 
                ? prev.filter(id => id !== taskId) 
                : [...prev, taskId]
        );
    };

    const getStatusTag = (status) => {
        const statusMap = {
            'pending': { color: 'default', icon: <ClockCircleOutlined />, text: '等待中' },
            'parsing': { color: 'processing', icon: <LoadingOutlined />, text: '解析中' },
            'ready': { color: 'warning', icon: <ClockCircleOutlined />, text: '待开始' },
            'extracting': { color: 'processing', icon: <LoadingOutlined />, text: '抽取中' },
            'aligning': { color: 'processing', icon: <LoadingOutlined />, text: '对齐中' },
            'confirming': { color: 'warning', icon: <ClockCircleOutlined />, text: '待确认' },
            'building': { color: 'processing', icon: <LoadingOutlined />, text: '构建中' },
            'completed': { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' },
            'failed': { color: 'error', icon: <CloseCircleOutlined />, text: '失败' }
        };

        const config = statusMap[status] || statusMap['pending'];
        return (
            <Tag icon={config.icon} color={config.color} style={{ margin: 0 }}>
                {config.text}
            </Tag>
        );
    };

    // List View Item
    const renderTaskItem = (task, index, isFocused) => {
        const isExpanded = expandedTaskIds.includes(task._id);
        
        return (
            <Card 
                size="small" 
                hoverable
                style={{ 
                    borderColor: isFocused ? '#1890ff' : '#f0f0f0',
                    transition: 'all 0.3s',
                    marginBottom: 8
                }}
                bodyStyle={{ padding: '16px' }}
            >
                {/* Header Row */}
                <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
                    <Col>
                        <Space>
                            {getStatusTag(task.status)}
                            <Text strong style={{ fontSize: '16px' }}>
                                任务 ID: <span style={{ fontFamily: 'monospace' }}>{task._id.slice(-8)}</span>
                            </Text>
                        </Space>
                    </Col>
                    <Col>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                            <CalendarOutlined style={{ marginRight: 4 }} />
                            {new Date(task.createdAt).toLocaleString()}
                        </Text>
                    </Col>
                </Row>

                {/* Content Stats Row */}
                <Row gutter={[16, 16]} align="middle">
                    <Col span={16}>
                        <Space size="large" wrap>
                            <Space>
                                <FileTextOutlined style={{ color: '#1890ff' }} />
                                <Text>{task.files?.length || 0} 文件</Text>
                            </Space>
                            <Space>
                                <NodeIndexOutlined style={{ color: '#52c41a' }} />
                                <Text>{task.draftEntities?.length || 0} 实体</Text>
                            </Space>
                            <Space>
                                <ShareAltOutlined style={{ color: '#722ed1' }} />
                                <Text>{task.draftRelations?.length || 0} 关系</Text>
                            </Space>
                            <Space>
                                <Text type="secondary">进度:</Text>
                                <Badge 
                                    percent={task.progress} 
                                    size="small" 
                                    status={task.status === 'failed' ? 'exception' : 'active'}
                                    text={`${task.progress}%`}
                                />
                            </Space>
                        </Space>
                    </Col>
                    
                    {/* Action Buttons */}
                    <Col span={8} style={{ textAlign: 'right' }}>
                        <Space>
                            <Button 
                                type="text" 
                                size="small"
                                icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpand(task._id);
                                }}
                            >
                                详情
                            </Button>

                            {(task.status === 'confirming' || task.status === 'completed') && (
                                <Button
                                    type="primary"
                                    size="small"
                                    icon={<EyeOutlined />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/admin/knowledge-graph/tasks/${task._id}`);
                                    }}
                                >
                                    {task.status === 'confirming' ? '确认' : '查看'}
                                </Button>
                            )}

                            <Tooltip title={false ? "无权限查看原文" : ""}>
                                <Button
                                    size="small"
                                    icon={<FileTextOutlined />}
                                    disabled={false} // 模拟权限控制
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewOriginal(task._id);
                                    }}
                                    style={{
                                        maxWidth: 80,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    查看原文
                                </Button>
                            </Tooltip>
                            
                            <Popconfirm
                                title="确认删除"
                                description="删除后无法恢复，是否继续？"
                                onConfirm={() => handleDelete(task._id)}
                                onCancel={(e) => e?.stopPropagation()}
                                okText="删除"
                                cancelText="取消"
                            >
                                <Button 
                                    size="small" 
                                    danger 
                                    icon={<DeleteOutlined />}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    删除
                                </Button>
                            </Popconfirm>
                        </Space>
                    </Col>
                </Row>

                {/* Expanded Content */}
                {isExpanded && (
                    <div style={{ 
                        marginTop: 16, 
                        padding: '12px', 
                        background: '#f9f9f9', 
                        borderRadius: 4,
                        borderTop: '1px solid #f0f0f0'
                    }}>
                        <Space direction="vertical" style={{ width: '100%' }}>
                            <p style={{ margin: 0 }}><strong>当前阶段:</strong> {task.stageMessage || '无'}</p>
                            {task.errorMessage && (
                                <p style={{ color: 'red', margin: 0 }}>
                                    <strong>错误信息:</strong> {task.errorMessage}
                                </p>
                            )}
                            <div>
                                <p style={{ marginBottom: 8 }}><strong>文件列表:</strong></p>
                                <div style={{ maxHeight: 100, overflowY: 'auto', paddingLeft: 8 }}>
                                    {task.files?.map((file, idx) => (
                                        <div key={idx} style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>
                                            • {file.filename}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Space>
                    </div>
                )}
            </Card>
        );
    };

    const renderOriginalDrawer = () => (
        <Drawer
            title={originalContent.title}
            width={800}
            open={originalVisible}
            onClose={() => setOriginalVisible(false)}
        >
            {originalLoading ? (
                <div style={{ textAlign: 'center', padding: 24 }}>
                    <Spin />
                </div>
            ) : (
                <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{originalContent.content}</ReactMarkdown>
                </div>
            )}
        </Drawer>
    );

    // Grid View Item
    const renderGridItem = (task) => {
        return (
            <Col xs={24} sm={12} lg={8} xl={6} key={task._id}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                >
                    <Card 
                        hoverable
                        className="task-grid-card"
                        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                        bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}
                        actions={[
                            <Popconfirm
                                title="确认删除"
                                onConfirm={() => handleDelete(task._id)}
                                okText="是"
                                cancelText="否"
                            >
                                <DeleteOutlined key="delete" style={{ color: '#ff4d4f' }} />
                            </Popconfirm>,
                            <Tooltip title="查看原文">
                                <FileTextOutlined 
                                    key="original"
                                    onClick={() => handleViewOriginal(task._id)}
                                />
                            </Tooltip>,
                            (task.status === 'confirming' || task.status === 'completed') ? (
                                <Tooltip title={task.status === 'confirming' ? '去确认' : '查看详情'}>
                                    <EyeOutlined 
                                        key="view" 
                                        style={{ color: '#1890ff' }}
                                        onClick={() => navigate(`/admin/knowledge-graph/tasks/${task._id}`)} 
                                    />
                                </Tooltip>
                            ) : (
                                <Tooltip title="处理中">
                                    <LoadingOutlined key="loading" />
                                </Tooltip>
                            )
                        ]}
                    >
                        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div>
                                <Text strong style={{ fontSize: 16, display: 'block' }}>Task #{task._id.slice(-6)}</Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {new Date(task.createdAt).toLocaleDateString()}
                                </Text>
                            </div>
                            {getStatusTag(task.status)}
                        </div>

                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text type="secondary">进度</Text>
                                <Text strong>{task.progress}%</Text>
                            </div>
                            <Progress percent={task.progress} showInfo={false} size="small" status={task.status === 'failed' ? 'exception' : 'active'} />
                            
                            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <FileTextOutlined style={{ fontSize: 16, color: '#1890ff', marginBottom: 4 }} />
                                    <div style={{ fontSize: 12, color: '#666' }}>{task.files?.length || 0} 文件</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <NodeIndexOutlined style={{ fontSize: 16, color: '#52c41a', marginBottom: 4 }} />
                                    <div style={{ fontSize: 12, color: '#666' }}>{task.draftEntities?.length || 0} 实体</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <ShareAltOutlined style={{ fontSize: 16, color: '#722ed1', marginBottom: 4 }} />
                                    <div style={{ fontSize: 12, color: '#666' }}>{task.draftRelations?.length || 0} 关系</div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </motion.div>
            </Col>
        );
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, padding: '0 12px' }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>📋 构建任务列表</Title>
                    <Text type="secondary">管理和查看知识图谱构建历史</Text>
                </div>
                <Space>
                    <Radio.Group 
                        value={viewMode} 
                        onChange={e => setViewMode(e.target.value)}
                        buttonStyle="solid"
                    >
                        <Radio.Button value="grid"><AppstoreOutlined /></Radio.Button>
                        <Radio.Button value="list"><BarsOutlined /></Radio.Button>
                    </Radio.Group>
                    <Button 
                        icon={<ReloadOutlined />} 
                        onClick={fetchTasks}
                    >
                        刷新
                    </Button>
                </Space>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0 12px' }}>
                {loading && tasks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '100px 0' }}>
                        <Spin size="large" />
                        <p style={{ marginTop: 16, color: '#999' }}>加载任务中...</p>
                    </div>
                ) : tasks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '100px 0' }}>
                        <Empty description="暂无构建任务" />
                        <Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate('/admin/knowledge-graph/upload')}>
                            去创建新任务
                        </Button>
                    </div>
                ) : (
                    <>
                        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 24 }}>
                            {viewMode === 'list' ? (
                                <AnimatedList 
                                    items={tasks}
                                    renderItem={renderTaskItem}
                                    showGradients={true}
                                    enableArrowNavigation={true}
                                    displayScrollbar={false} // Use parent scroll
                                    height="auto"
                                    className="task-list-container"
                                />
                            ) : (
                                <Row gutter={[24, 24]}>
                                    {tasks.map(task => renderGridItem(task))}
                                </Row>
                            )}
                        </div>
                        
                        <div style={{ marginTop: 16, textAlign: 'right', flexShrink: 0, paddingBottom: 12 }}>
                            <Pagination
                                {...pagination}
                                showTotal={(total) => `共 ${total} 条`}
                                onChange={(page, pageSize) => {
                                    setPagination({ ...pagination, current: page, pageSize });
                                }}
                            />
                        </div>
                    </>
                )}
            </div>
            {renderOriginalDrawer()}
        </div>
    );
};

export default KGBuildTasksPage;
