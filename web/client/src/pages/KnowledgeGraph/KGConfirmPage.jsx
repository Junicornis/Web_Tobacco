/**
 * 抽取结果确认与修正页面
 * 
 * 功能：
 * 1. 展示AI抽取的本体定义（实体类型、关系类型）
 * 2. 展示实体列表（可编辑、删除、合并）
 * 3. 展示关系列表
 * 4. 实时图谱预览
 * 5. 提交确认生成图谱
 */

import React, { useState, useEffect } from 'react';
import { 
    Card, Tabs, Tag, Button, Badge, Space, 
    Modal, Form, Input, Select, Alert, Tooltip, 
    Typography, Row, Col, message, Popconfirm, Spin,
    Checkbox
} from 'antd';
import { 
    MergeCellsOutlined, EditOutlined, DeleteOutlined,
    PlusOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
    NodeIndexOutlined, ApartmentOutlined, SaveOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AnimatedList from './AnimatedList';

const { Title, Text } = Typography;

const KGConfirmPage = () => {
    const { taskId } = useParams();
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [taskData, setTaskData] = useState(null);
    const [entities, setEntities] = useState([]);
    const [relations, setRelations] = useState([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingEntity, setEditingEntity] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const [form] = Form.useForm();

    // 加载任务数据
    useEffect(() => {
        fetchTaskData();
    }, [taskId]);

    const fetchTaskData = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`/api/kg/extract-result/${taskId}`);
            const data = res.data;
            
            const draftEntities = Array.isArray(data?.draftEntities) ? data.draftEntities : [];
            const draftRelations = Array.isArray(data?.draftRelations) ? data.draftRelations : [];

            setTaskData(data ?? null);
            setEntities(draftEntities.map(e => ({ ...e, key: e.id })));
            setRelations(draftRelations.map(r => ({ ...r, key: r.id })));
            setLoading(false);
        } catch (error) {
            message.error('加载任务数据失败: ' + error.message);
            setLoading(false);
        }
    };

    // 渲染实体列表项
    const renderEntityItem = (entity, index, isFocused) => {
        const isSelected = selectedRowKeys.includes(entity.key);
        return (
            <Card 
                size="small" 
                hoverable
                style={{ 
                    borderColor: isSelected || isFocused ? '#1890ff' : '#f0f0f0',
                    backgroundColor: isSelected ? '#e6f7ff' : '#fff',
                    transition: 'all 0.3s'
                }}
                bodyStyle={{ padding: '12px' }}
            >
                <Row align="middle" gutter={16}>
                    <Col>
                        <Checkbox 
                            checked={isSelected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                                const newKeys = e.target.checked 
                                    ? [...selectedRowKeys, entity.key]
                                    : selectedRowKeys.filter(k => k !== entity.key);
                                setSelectedRowKeys(newKeys);
                            }}
                        />
                    </Col>
                    <Col flex="auto">
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            <Space wrap>
                                <Text strong style={{ fontSize: '16px' }}>{entity.name}</Text>
                                <Tag color="blue">{entity.type}</Tag>
                                {entity.alignmentSuggestion?.type === 'new' && (
                                    <Tag color="green">新</Tag>
                                )}
                                {entity.alignmentSuggestion?.type === 'merge' && (
                                    <Tooltip title={`将合并到: ${entity.alignmentSuggestion.targetEntity?.name}`}>
                                        <Tag color="orange">合并</Tag>
                                    </Tooltip>
                                )}
                                {entity.alignmentSuggestion?.type === 'candidate' && (
                                    <Tag color="blue">{entity.alignmentSuggestion.candidates?.length}候选</Tag>
                                )}
                            </Space>
                            <div style={{ fontSize: '12px', color: '#666' }}>
                                {Object.entries(entity.properties || {}).slice(0, 4).map(([k, v]) => (
                                    <Tag key={k} size="small" style={{ marginRight: 4, color: '#666' }}>
                                        {k}: {String(v).substring(0, 30)}
                                    </Tag>
                                ))}
                                {Object.keys(entity.properties || {}).length > 4 && (
                                    <Tag size="small">+{Object.keys(entity.properties).length - 4}</Tag>
                                )}
                            </div>
                        </Space>
                    </Col>
                    <Col>
                        <Space size="middle">
                            <Badge 
                                status={entity.confidence > 0.9 ? 'success' : entity.confidence > 0.7 ? 'warning' : 'error'} 
                                text={`${((entity.confidence || 0) * 100).toFixed(0)}%`} 
                            />
                            <Space size="small">
                                <Button 
                                    icon={<EditOutlined />} 
                                    size="small"
                                    type="text"
                                    onClick={(e) => { e.stopPropagation(); handleEditEntity(entity); }}
                                />
                                <Popconfirm
                                    title="确认删除"
                                    description="删除后将无法恢复，是否继续？"
                                    onConfirm={() => handleDeleteEntity(entity.key)}
                                    onCancel={(e) => e?.stopPropagation()}
                                    okText="删除"
                                    cancelText="取消"
                                >
                                    <Button 
                                        icon={<DeleteOutlined />} 
                                        size="small" 
                                        danger
                                        type="text"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </Popconfirm>
                            </Space>
                        </Space>
                    </Col>
                </Row>
            </Card>
        );
    };

    // 渲染关系列表项
    const renderRelationItem = (relation, index, isFocused) => {
        return (
            <Card 
                size="small" 
                hoverable
                style={{ 
                    borderColor: isFocused ? '#1890ff' : '#f0f0f0',
                    transition: 'all 0.3s'
                }}
                bodyStyle={{ padding: '12px' }}
            >
                <Row align="middle" justify="space-between">
                    <Col flex="auto">
                        <Space size="large" align="center">
                            <Text strong>{relation.source}</Text>
                            <Space direction="vertical" align="center" size={0}>
                                <Text type="secondary" style={{ fontSize: '12px' }}>{relation.relationType}</Text>
                                <div style={{ height: 1, width: 40, background: '#d9d9d9', position: 'relative' }}>
                                    <div style={{ position: 'absolute', right: 0, top: -3, borderTop: '4px solid transparent', borderBottom: '4px solid transparent', borderLeft: '6px solid #d9d9d9' }} />
                                </div>
                            </Space>
                            <Text strong>{relation.target}</Text>
                        </Space>
                    </Col>
                    <Col>
                        <Space size="middle">
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                置信度: {((relation.confidence || 0) * 100).toFixed(0)}%
                            </Text>
                            <Popconfirm
                                title="确认删除"
                                onConfirm={() => handleDeleteRelation(relation.key)}
                                okText="删除"
                                cancelText="取消"
                            >
                                <Button 
                                    icon={<DeleteOutlined />} 
                                    size="small" 
                                    danger
                                    type="text"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </Popconfirm>
                        </Space>
                    </Col>
                </Row>
            </Card>
        );
    };

    // 编辑实体
    const handleEditEntity = (entity) => {
        setEditingEntity(entity);
        form.setFieldsValue({
            name: entity.name,
            type: entity.type,
            ...entity.properties
        });
        setEditModalVisible(true);
    };

    // 保存编辑
    const handleSaveEdit = async (values) => {
        const { name, type, ...properties } = values;
        
        setEntities(prev => prev.map(e => {
            if (e.key === editingEntity.key) {
                return {
                    ...e,
                    name,
                    type,
                    properties
                };
            }
            return e;
        }));

        setEditModalVisible(false);
        setEditingEntity(null);
        form.resetFields();
        message.success('实体已更新');
    };

    // 删除实体
    const handleDeleteEntity = (key) => {
        setEntities(prev => prev.filter(e => e.key !== key));
        message.success('实体已删除');
    };

    // 删除关系
    const handleDeleteRelation = (key) => {
        setRelations(prev => prev.filter(r => r.key !== key));
        message.success('关系已删除');
    };

    // 批量合并实体
    const handleMergeEntities = () => {
        if (selectedRowKeys.length < 2) {
            message.warning('请选择至少两个实体进行合并');
            return;
        }

        Modal.confirm({
            title: '合并实体',
            content: `确定要将选中的 ${selectedRowKeys.length} 个实体合并吗？合并后将保留第一个实体的信息。`,
            onOk: () => {
                const selectedEntities = entities.filter(e => selectedRowKeys.includes(e.key));
                const mainEntity = selectedEntities[0];
                
                const mergedProperties = selectedEntities.reduce((acc, e) => ({
                    ...acc,
                    ...e.properties
                }), {});

                setEntities(prev => {
                    const filtered = prev.filter(e => !selectedRowKeys.includes(e.key) || e.key === mainEntity.key);
                    return filtered.map(e => {
                        if (e.key === mainEntity.key) {
                            return {
                                ...e,
                                properties: mergedProperties,
                                alignmentSuggestion: { type: 'new' }
                            };
                        }
                        return e;
                    });
                });

                setSelectedRowKeys([]);
                message.success('实体已合并');
            }
        });
    };

    // 提交确认
    const handleSubmit = async () => {
        if (!taskData) {
            message.error('任务数据为空，无法提交');
            return;
        }
        setSubmitting(true);

        try {
            const originalEntities = Array.isArray(taskData.draftEntities) ? taskData.draftEntities : [];
            const originalRelations = Array.isArray(taskData.draftRelations) ? taskData.draftRelations : [];
            const modifications = {
                deletedEntityIds: originalEntities
                    .filter(oe => !entities.find(e => e.id === oe.id))
                    .map(e => e.id),
                modifiedEntities: entities
                    .filter(e => {
                        const original = originalEntities.find(oe => oe.id === e.id);
                        return original && JSON.stringify(original) !== JSON.stringify(e);
                    })
                    .map(e => ({
                        entityId: e.id,
                        oldValue: originalEntities.find(oe => oe.id === e.id),
                        newValue: e
                    })),
                deletedRelationIds: originalRelations
                    .filter(or => !relations.find(r => r.id === or.id))
                    .map(r => r.id)
            };

            const res = await axios.post(`/api/kg/confirm-and-build/${taskId}`, {
                modifications
            });

            if (res.data.success) {
                message.success('知识图谱构建成功！');
                navigate('/admin/knowledge-graph/browser');
            }
        } catch (error) {
            message.error('构建失败: ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '50px' }}>
                <Spin size="large" />
                <p>加载中...</p>
            </div>
        );
    }

    if (!taskData) {
        return (
            <div style={{ padding: 24 }}>
                <Card>
                    <Alert
                        type="error"
                        showIcon
                        message="任务数据为空或加载失败"
                        description="未能获取到抽取结果，请检查任务ID是否存在、后端服务是否正常，然后重试。"
                    />
                    <Space style={{ marginTop: 16 }}>
                        <Button type="primary" onClick={fetchTaskData}>重试</Button>
                        <Button onClick={() => navigate('/admin/knowledge-graph/tasks')}>返回任务列表</Button>
                    </Space>
                </Card>
            </div>
        );
    }

    const newCount = entities.filter(e => e.alignmentSuggestion?.type === 'new').length;
    const mergeCount = entities.filter(e => e.alignmentSuggestion?.type === 'merge').length;

    return (
        <div>
            <Title level={3}>✅ 抽取结果确认与修正</Title>

            {/* 统计概览 */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={6}>
                    <Card>
                        <Statistic title="实体总数" value={entities.length} />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic title="新实体" value={newCount} valueStyle={{ color: '#52c41a' }} />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic title="待合并" value={mergeCount} valueStyle={{ color: '#fa8c16' }} />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic title="关系数" value={relations.length} />
                    </Card>
                </Col>
            </Row>

            {/* 操作按钮 */}
            <Space style={{ marginBottom: 16 }}>
                <Button 
                    type="primary" 
                    icon={<SaveOutlined />}
                    loading={submitting}
                    onClick={handleSubmit}
                >
                    确认生成图谱
                </Button>
                <Button 
                    icon={<MergeCellsOutlined />}
                    onClick={handleMergeEntities}
                    disabled={selectedRowKeys.length < 2}
                >
                    合并选中实体
                </Button>
            </Space>

            {/* 详细数据 - 使用 AnimatedList 替换 Table */}
            <Card>
                <Tabs
                    defaultActiveKey="entities"
                    items={[
                        {
                            key: 'entities',
                            label: `实体 (${entities.length})`,
                            children: (
                                <AnimatedList 
                                    items={entities} 
                                    renderItem={renderEntityItem}
                                    showGradients 
                                    enableArrowNavigation 
                                    displayScrollbar 
                                    height="500px"
                                />
                            )
                        },
                        {
                            key: 'relations',
                            label: `关系 (${relations.length})`,
                            children: (
                                <AnimatedList 
                                    items={relations} 
                                    renderItem={renderRelationItem}
                                    showGradients 
                                    enableArrowNavigation 
                                    displayScrollbar 
                                    height="500px"
                                />
                            )
                        },
                        {
                            key: 'ontology',
                            label: '本体定义',
                            children: (
                                <>
                                    <Card title="实体类型" size="small" style={{ marginBottom: 16 }}>
                                        {taskData?.draftOntology?.entityTypes?.map(type => (
                                            <Tag key={type.name} color="blue" style={{ margin: 4 }}>
                                                {type.name}
                                            </Tag>
                                        ))}
                                    </Card>
                                    <Card title="关系类型" size="small">
                                        {taskData?.draftOntology?.relationTypes?.map(type => (
                                            <Tag key={type.name} color="purple" style={{ margin: 4 }}>
                                                {type.name}
                                            </Tag>
                                        ))}
                                    </Card>
                                </>
                            )
                        }
                    ]}
                />
            </Card>

            {/* 编辑弹窗 */}
            <Modal
                title="编辑实体"
                open={editModalVisible}
                onOk={() => form.submit()}
                onCancel={() => {
                    setEditModalVisible(false);
                    setEditingEntity(null);
                    form.resetFields();
                }}
            >
                <Form form={form} onFinish={handleSaveEdit} layout="vertical">
                    <Form.Item
                        name="name"
                        label="实体名称"
                        rules={[{ required: true }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="type"
                        label="实体类型"
                        rules={[{ required: true }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <Input.TextArea />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

// 统计卡片组件
const Statistic = ({ title, value, valueStyle }) => (
    <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 32, fontWeight: 'bold', ...valueStyle }}>{value}</div>
    </div>
);

export default KGConfirmPage;
