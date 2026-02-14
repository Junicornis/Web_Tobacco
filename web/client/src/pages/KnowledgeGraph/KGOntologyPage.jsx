/**
 * 本体管理页面
 * 
 * 功能：
 * 1. 展示本体列表
 * 2. 创建/编辑/删除本体
 * 3. 定义实体类型和属性
 * 4. 定义关系类型
 */

import React, { useState, useEffect } from 'react';
import { 
    Card, Button, Table, Tag, Space, Modal, Form, 
    Input, Select, Switch, Popconfirm, message, 
    Tabs, Badge, Tooltip, Row, Col
} from 'antd';
import { 
    PlusOutlined, EditOutlined, DeleteOutlined, 
    CopyOutlined, ApartmentOutlined, BranchesOutlined,
    EyeOutlined
} from '@ant-design/icons';
import axios from 'axios';

const KGOntologyPage = () => {
    const [ontologies, setOntologies] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingOntology, setEditingOntology] = useState(null);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [viewingOntology, setViewingOntology] = useState(null);
    
    const [form] = Form.useForm();

    useEffect(() => {
        fetchOntologies();
    }, []);

    const fetchOntologies = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/kg/ontology');
            if (res.data.success) {
                setOntologies(res.data.data);
            }
        } catch (error) {
            message.error('加载本体列表失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingOntology(null);
        form.resetFields();
        form.setFieldsValue({
            entityTypes: [],
            relationTypes: [],
            isActive: true
        });
        setModalVisible(true);
    };

    const handleEdit = (ontology) => {
        setEditingOntology(ontology);
        form.setFieldsValue({
            name: ontology.name,
            description: ontology.description,
            version: ontology.version,
            isActive: ontology.isActive,
            entityTypes: ontology.entityTypes || [],
            relationTypes: ontology.relationTypes || []
        });
        setModalVisible(true);
    };

    const handleView = (ontology) => {
        setViewingOntology(ontology);
        setDetailModalVisible(true);
    };

    const handleDelete = async (id) => {
        try {
            await axios.delete(`/api/kg/ontology/${id}`);
            message.success('本体已删除');
            fetchOntologies();
        } catch (error) {
            message.error('删除失败: ' + error.message);
        }
    };

    const handleSubmit = async (values) => {
        try {
            if (editingOntology) {
                await axios.put(`/api/kg/ontology/${editingOntology._id}`, values);
                message.success('本体更新成功');
            } else {
                await axios.post('/api/kg/ontology', values);
                message.success('本体创建成功');
            }
            setModalVisible(false);
            fetchOntologies();
        } catch (error) {
            message.error('保存失败: ' + error.message);
        }
    };

    const columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            render: (name, record) => (
                <Space>
                    <span style={{ fontWeight: 'bold' }}>{name}</span>
                    {record.isDefault && <Tag color="blue">默认</Tag>}
                    {!record.isActive && <Tag>已停用</Tag>}
                </Space>
            )
        },
        {
            title: '版本',
            dataIndex: 'version',
            key: 'version',
            width: 100
        },
        {
            title: '实体类型数',
            dataIndex: 'entityTypes',
            key: 'entityTypeCount',
            width: 120,
            render: (types) => <Badge count={types?.length || 0} showZero />
        },
        {
            title: '关系类型数',
            dataIndex: 'relationTypes',
            key: 'relationTypeCount',
            width: 120,
            render: (types) => <Badge count={types?.length || 0} showZero />
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 180,
            render: (date) => new Date(date).toLocaleString()
        },
        {
            title: '操作',
            key: 'action',
            width: 200,
            render: (_, record) => (
                <Space>
                    <Button 
                        icon={<EyeOutlined />} 
                        size="small"
                        onClick={() => handleView(record)}
                    >
                        查看
                    </Button>
                    <Button 
                        icon={<EditOutlined />} 
                        size="small"
                        onClick={() => handleEdit(record)}
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title="确认删除"
                        onConfirm={() => handleDelete(record._id)}
                    >
                        <Button icon={<DeleteOutlined />} size="small" danger>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <h2 style={{ fontSize: '20px', margin: 0 }}>📚 本体管理</h2>
                    <p style={{ color: '#666', margin: 0, fontSize: '12px' }}>
                        定义知识图谱的实体类型、属性结构和关系类型
                    </p>
                </div>
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={handleCreate}
                    size="small"
                >
                    新建本体
                </Button>
            </div>

            <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: '12px', overflow: 'hidden' } }}>
                <Table
                    columns={columns}
                    dataSource={ontologies}
                    rowKey="_id"
                    loading={loading}
                    scroll={{ y: 'calc(100vh - 280px)' }}
                    size="small"
                    pagination={false}
                />
            </Card>

            {/* 编辑/创建弹窗 */}
            <Modal
                title={editingOntology ? '编辑本体' : '新建本体'}
                open={modalVisible}
                onOk={() => form.submit()}
                onCancel={() => setModalVisible(false)}
                width={800}
            >
                <Form form={form} onFinish={handleSubmit} layout="vertical">
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="name"
                                label="本体名称"
                                rules={[{ required: true }]}
                            >
                                <Input placeholder="如：安全培训标准本体" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="version"
                                label="版本号"
                                initialValue="1.0"
                            >
                                <Input placeholder="如：1.0" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        name="description"
                        label="描述"
                    >
                        <Input.TextArea rows={2} placeholder="描述本体的用途和适用范围" />
                    </Form.Item>

                    <Form.Item
                        name="isActive"
                        label="状态"
                        valuePropName="checked"
                        initialValue={true}
                    >
                        <Switch checkedChildren="启用" unCheckedChildren="停用" />
                    </Form.Item>

                    <Tabs
                        defaultActiveKey="entities"
                        items={[
                            {
                                key: 'entities',
                                label: <span><ApartmentOutlined /> 实体类型</span>,
                                children: (
                                    <Form.List name="entityTypes">
                                        {(fields, { add, remove }) => (
                                            <>
                                                {fields.map(({ key, name, ...restField }) => (
                                                    <Card 
                                                        key={key} 
                                                        size="small" 
                                                        style={{ marginBottom: 8 }}
                                                        extra={
                                                            <Button 
                                                                type="link" 
                                                                danger 
                                                                onClick={() => remove(name)}
                                                            >
                                                                删除
                                                            </Button>
                                                        }
                                                    >
                                                        <Row gutter={8}>
                                                            <Col span={8}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'name']}
                                                                    rules={[{ required: true }]}
                                                                >
                                                                    <Input placeholder="类型名称" />
                                                                </Form.Item>
                                                            </Col>
                                                            <Col span={8}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'displayName']}
                                                                >
                                                                    <Input placeholder="显示名称" />
                                                                </Form.Item>
                                                            </Col>
                                                            <Col span={8}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'color']}
                                                                >
                                                                    <Select placeholder="颜色">
                                                                        <Select.Option value="#1890ff">蓝色</Select.Option>
                                                                        <Select.Option value="#52c41a">绿色</Select.Option>
                                                                        <Select.Option value="#faad14">黄色</Select.Option>
                                                                        <Select.Option value="#ff4d4f">红色</Select.Option>
                                                                        <Select.Option value="#722ed1">紫色</Select.Option>
                                                                    </Select>
                                                                </Form.Item>
                                                            </Col>
                                                        </Row>
                                                        <Form.Item
                                                            {...restField}
                                                            name={[name, 'description']}
                                                        >
                                                            <Input.TextArea 
                                                                rows={1} 
                                                                placeholder="描述"
                                                            />
                                                        </Form.Item>
                                                    </Card>
                                                ))}
                                                <Button 
                                                    type="dashed" 
                                                    onClick={() => add()} 
                                                    block
                                                    icon={<PlusOutlined />}
                                                >
                                                    添加实体类型
                                                </Button>
                                            </>
                                        )}
                                    </Form.List>
                                )
                            },
                            {
                                key: 'relations',
                                label: <span><BranchesOutlined /> 关系类型</span>,
                                children: (
                                    <Form.List name="relationTypes">
                                        {(fields, { add, remove }) => (
                                            <>
                                                {fields.map(({ key, name, ...restField }) => (
                                                    <Card 
                                                        key={key} 
                                                        size="small" 
                                                        style={{ marginBottom: 8 }}
                                                        extra={
                                                            <Button 
                                                                type="link" 
                                                                danger 
                                                                onClick={() => remove(name)}
                                                            >
                                                                删除
                                                            </Button>
                                                        }
                                                    >
                                                        <Row gutter={8}>
                                                            <Col span={8}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'name']}
                                                                    rules={[{ required: true }]}
                                                                >
                                                                    <Input placeholder="关系名称" />
                                                                </Form.Item>
                                                            </Col>
                                                            <Col span={8}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'displayName']}
                                                                >
                                                                    <Input placeholder="显示名称" />
                                                                </Form.Item>
                                                            </Col>
                                                            <Col span={8}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'isDirected']}
                                                                    valuePropName="checked"
                                                                    initialValue={true}
                                                                >
                                                                    <Switch checkedChildren="有向" unCheckedChildren="无向" />
                                                                </Form.Item>
                                                            </Col>
                                                        </Row>
                                                        <Form.Item
                                                            {...restField}
                                                            name={[name, 'description']}
                                                        >
                                                            <Input placeholder="描述" />
                                                        </Form.Item>
                                                    </Card>
                                                ))}
                                                <Button 
                                                    type="dashed" 
                                                    onClick={() => add()} 
                                                    block
                                                    icon={<PlusOutlined />}
                                                >
                                                    添加关系类型
                                                </Button>
                                            </>
                                        )}
                                    </Form.List>
                                )
                            }
                        ]}
                    />
                </Form>
            </Modal>

            {/* 详情弹窗 */}
            <Modal
                title="本体详情"
                open={detailModalVisible}
                onCancel={() => setDetailModalVisible(false)}
                footer={null}
                width={700}
            >
                {viewingOntology && (
                    <Tabs
                        defaultActiveKey="entities"
                        items={[
                            {
                                key: 'entities',
                                label: '实体类型',
                                children: (
                                    <div>
                                        {(viewingOntology.entityTypes || []).map((item, index) => (
                                            <div key={index} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                                                <div style={{ marginBottom: 4 }}>
                                                    <Space>
                                                        <Tag color={item.color || 'blue'}>
                                                            {item.displayName || item.name}
                                                        </Tag>
                                                        <span style={{ color: '#999' }}>{item.name}</span>
                                                    </Space>
                                                </div>
                                                {item.description && (
                                                    <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 14 }}>
                                                        {item.description}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )
                            },
                            {
                                key: 'relations',
                                label: '关系类型',
                                children: (
                                    <div>
                                        {(viewingOntology.relationTypes || []).map((item, index) => (
                                            <div key={index} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                                                <div style={{ marginBottom: 4 }}>
                                                    <Tag color="purple">
                                                        {item.displayName || item.name}
                                                    </Tag>
                                                </div>
                                                {item.description && (
                                                    <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 14 }}>
                                                        {item.description}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )
                            }
                        ]}
                    />
                )}
            </Modal>
        </div>
    );
};

export default KGOntologyPage;
