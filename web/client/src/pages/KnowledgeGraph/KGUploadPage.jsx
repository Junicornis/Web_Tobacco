/**
 * 文件上传与图谱构建页面
 * 
 * 功能：
 * 1. 拖拽/点击上传文件
 * 2. 显示上传文件列表与状态
 * 3. 选择使用已有本体或让大模型自动推断
 * 4. 同步等待抽取结果
 * 5. 完成后跳转预览确认页面
 */

import React, { useState, useEffect } from 'react';
import { 
    Card, Upload, Button, Steps, Progress, 
    Alert, Table, Tag, Typography, Tooltip,
    Radio, Select, message, Spin, Empty, Divider,
    Row, Col, Space
} from 'antd';
import { 
    InboxOutlined, FileExcelOutlined, FileWordOutlined, 
    FilePdfOutlined, FileTextOutlined, LoadingOutlined,
    CheckCircleOutlined, SettingOutlined, CloudUploadOutlined,
    RocketOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const { Dragger } = Upload;
const { Title, Text, Paragraph } = Typography;

// 文件类型配置
const FILE_CONFIG = {
    'excel': { 
        icon: <FileExcelOutlined style={{ color: '#52c41a', fontSize: 24 }} />, 
        color: 'green', 
        label: 'Excel' 
    },
    'word': { 
        icon: <FileWordOutlined style={{ color: '#1890ff', fontSize: 24 }} />, 
        color: 'blue', 
        label: 'Word' 
    },
    'pdf': { 
        icon: <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 24 }} />, 
        color: 'red', 
        label: 'PDF' 
    },
    'txt': { 
        icon: <FileTextOutlined style={{ color: '#faad14', fontSize: 24 }} />, 
        color: 'orange', 
        label: '文本' 
    }
};

const KGUploadPage = () => {
    const navigate = useNavigate();
    
    const [fileList, setFileList] = useState([]);
    const [ontologyMode, setOntologyMode] = useState('auto');
    const [selectedOntology, setSelectedOntology] = useState(null);
    const [ontologies, setOntologies] = useState([]);
    
    // 状态管理
    const [status, setStatus] = useState('idle'); // idle | uploading | processing | completed | error
    const [progress, setProgress] = useState({ percent: 0, message: '' });
    const [currentTaskId, setCurrentTaskId] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    // 加载本体列表
    useEffect(() => {
        fetchOntologies();
    }, []);

    const fetchOntologies = async () => {
        try {
            const res = await axios.get('/api/kg/ontology');
            if (res.data.success) {
                setOntologies(res.data.data.map(o => ({
                    value: o._id,
                    label: `${o.name} (v${o.version})`
                })));
            }
        } catch (error) {
            console.error('加载本体列表失败:', error);
        }
    };

    // 检测文件类型
    const detectFileType = (filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        if (['xlsx', 'xls'].includes(ext)) return 'excel';
        if (['docx', 'doc'].includes(ext)) return 'word';
        if (ext === 'pdf') return 'pdf';
        return 'txt';
    };

    // 文件上传配置
    const uploadProps = {
        multiple: true,
        maxCount: 10,
        fileList,
        accept: '.xlsx,.xls,.docx,.doc,.pdf,.txt',
        showUploadList: false, // 自定义列表展示
        beforeUpload: (file) => {
            const isLt100M = file.size / 1024 / 1024 < 100;
            if (!isLt100M) {
                message.error(`${file.name} 超过100MB限制`);
                return Upload.LIST_IGNORE;
            }
            return false;
        },
        onChange: ({ fileList: newFileList }) => {
            setFileList(newFileList);
        },
        onDrop: (e) => {
            console.log('Dropped files', e.dataTransfer.files);
        },
    };

    // 开始构建流程
    const handleStartBuild = async () => {
        if (fileList.length === 0) {
            message.warning('请至少上传一个文件');
            return;
        }

        setStatus('uploading');
        setProgress({ percent: 10, message: '正在上传文件...' });

        try {
            const formData = new FormData();
            fileList.forEach(file => {
                formData.append('files', file.originFileObj);
            });
            formData.append('ontologyMode', ontologyMode);
            if (ontologyMode === 'existing' && selectedOntology) {
                formData.append('ontologyId', selectedOntology);
            }

            setProgress({ percent: 30, status: 'active', message: '正在解析文档...' });
            
            const response = await axios.post('/api/kg/upload-and-extract', formData);

            if (!response.data.success) {
                throw new Error(response.data.message);
            }

            setCurrentTaskId(response.data.taskId);
            setStatus('processing');

            // 轮询等待结果
            await pollExtractResult(response.data.taskId);

        } catch (error) {
            setStatus('error');
            setErrorMsg(error.message || '构建失败');
            message.error('构建失败: ' + error.message);
        }
    };

    // 轮询抽取结果
    const pollExtractResult = async (taskId) => {
        const maxAttempts = 120; // 最多轮询120次 (约10分钟)
        
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            try {
                const res = await axios.get(`/api/kg/extract-result/${taskId}`);
                const data = res.data;

                if (data.status === 'completed' || data.status === 'confirming') {
                    setProgress({ 
                        percent: 100, 
                        message: '抽取完成！' 
                    });
                    setStatus('completed');
                    message.success('文档解析完成，正在进入确认页面...');
                    
                    setTimeout(() => {
                        navigate(`/admin/knowledge-graph/tasks/${taskId}`);
                    }, 1000);
                    return;
                } else if (data.status === 'failed') {
                    throw new Error(data.errorMessage || '抽取失败');
                } else {
                    const percent = 30 + Math.floor((data.progress || 0) * 0.7);
                    setProgress({ 
                        percent, 
                        message: data.stageMessage || 'AI正在抽取知识...' 
                    });
                }
            } catch (error) {
                throw error;
            }
        }
        
        throw new Error('处理超时，请稍后查看任务列表');
    };

    // 文件列表列定义
    const fileColumns = [
        {
            title: '文件名',
            dataIndex: 'name',
            key: 'name',
            render: (name) => {
                const type = detectFileType(name);
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {FILE_CONFIG[type]?.icon}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <Text strong ellipsis style={{ maxWidth: 300 }} title={name}>
                                {name}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>{FILE_CONFIG[type]?.label} 文档</Text>
                        </div>
                    </div>
                );
            }
        },
        {
            title: '大小',
            dataIndex: 'size',
            key: 'size',
            width: 120,
            render: (size) => <Text type="secondary">{(size / 1024 / 1024).toFixed(2)} MB</Text>
        },
        {
            title: '状态',
            key: 'status',
            width: 100,
            render: (_, record) => {
                if (record.status === 'error') return <Tag color="red">错误</Tag>;
                if (record.status === 'uploading') return <Tag color="blue">上传中</Tag>;
                return <Tag color="success" icon={<CheckCircleOutlined />}>就绪</Tag>;
            }
        },
        {
            title: '操作',
            key: 'action',
            width: 80,
            align: 'right',
            render: (_, record, index) => (
                <Button 
                    type="text" 
                    danger 
                    size="small"
                    onClick={() => {
                        const newList = fileList.filter((_, i) => i !== index);
                        setFileList(newList);
                    }}
                >
                    移除
                </Button>
            )
        }
    ];

    // 重置状态
    const handleReset = () => {
        setFileList([]);
        setStatus('idle');
        setProgress({ percent: 0, message: '' });
        setCurrentTaskId(null);
        setErrorMsg('');
    };

    // 自定义样式
    const containerStyle = {
        maxWidth: 1200,
        margin: '0 auto',
        padding: '24px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
    };

    return (
        <div style={containerStyle}>
            {/* 顶部标题栏 */}
            <div style={{ marginBottom: 24, textAlign: 'center' }}>
                <Title level={3} style={{ marginBottom: 8 }}>
                    <CloudUploadOutlined style={{ marginRight: 12, color: '#1890ff' }} />
                    知识图谱构建工作台
                </Title>
                <Paragraph type="secondary" style={{ fontSize: 16 }}>
                    上传非结构化文档，利用 AI 自动提取实体与关系，构建领域知识图谱
                </Paragraph>
                <div style={{ maxWidth: 1000, margin: '24px auto 0' }}>
                    <Steps 
                        size="small"
                        current={status === 'idle' ? 0 : status === 'completed' ? 2 : 1} 
                        items={[
                            { title: '上传文档', description: '' },
                            { 
                                title: 'AI 智能抽取', 
                                description: '',
                                icon: status === 'processing' ? <LoadingOutlined /> : null
                            },
                            { title: '人工确认', description: '' }
                        ]}
                    />
                </div>
            </div>

            <Card 
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} 
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' } }}
            >
                {status === 'idle' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        {/* 1. 配置区域 */}
                        <div style={{ padding: '24px 32px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                            <Space align="start" size={32}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32 }}>
                                    <SettingOutlined style={{ color: '#1890ff' }} />
                                    <Text strong>构建配置:</Text>
                                </div>
                                <Radio.Group 
                                    value={ontologyMode} 
                                    onChange={(e) => setOntologyMode(e.target.value)}
                                >
                                    <Space direction="horizontal" size={24}>
                                        <Radio value="auto">
                                            <Space direction="vertical" size={0}>
                                                <Text>自动推断模式</Text>
                                                <Text type="secondary" style={{ fontSize: 12 }}>AI 自动识别实体类型</Text>
                                            </Space>
                                        </Radio>
                                        <Radio value="existing">
                                            <Space direction="vertical" size={0}>
                                                <Text>使用已有本体</Text>
                                                <Text type="secondary" style={{ fontSize: 12 }}>基于预定义模式构建</Text>
                                            </Space>
                                        </Radio>
                                    </Space>
                                </Radio.Group>

                                {ontologyMode === 'existing' && (
                                    <div style={{ width: 240 }}>
                                        <Select
                                            placeholder="请选择目标本体"
                                            style={{ width: '100%' }}
                                            value={selectedOntology}
                                            onChange={setSelectedOntology}
                                            options={ontologies}
                                            status={!selectedOntology ? 'warning' : ''}
                                        />
                                    </div>
                                )}
                            </Space>
                        </div>

                        {/* 2. 上传与列表区域 */}
                        <div style={{ flex: 1, padding: '24px 32px', overflow: 'hidden' }}>
                            <Row gutter={24} style={{ height: '100%' }}>
                                {/* 左侧上传区 */}
                                <Col span={10} style={{ height: '100%' }}>
                                    <Dragger 
                                        {...uploadProps} 
                                        style={{ 
                                            padding: '32px', 
                                            background: '#fcfcfc', 
                                            border: '1px dashed #d9d9d9', 
                                            borderRadius: 8, 
                                            height: '100%'
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', minHeight: 300 }}>
                                            <p className="ant-upload-drag-icon">
                                                <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
                                            </p>
                                            <p className="ant-upload-text" style={{ fontSize: 18, color: '#333', marginTop: 16 }}>
                                                点击或拖拽文件到此区域
                                            </p>
                                            <p className="ant-upload-hint" style={{ color: '#666', marginTop: 8 }}>
                                                支持批量上传 Excel、Word、PDF、TXT 文档<br/>(单文件最大 100MB)
                                            </p>
                                        </div>
                                    </Dragger>
                                </Col>

                                {/* 右侧列表区 */}
                                <Col span={14} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text strong>待处理文件 ({fileList.length})</Text>
                                        {fileList.length > 0 && (
                                            <Button type="link" onClick={() => setFileList([])} size="small">清空列表</Button>
                                        )}
                                    </div>
                                    
                                    <div style={{ flex: 1, overflow: 'hidden', border: '1px solid #f0f0f0', borderRadius: 8, position: 'relative' }}>
                                        {fileList.length > 0 ? (
                                            <div style={{ height: '100%', overflow: 'auto' }}>
                                                <Table 
                                                    columns={fileColumns} 
                                                    dataSource={fileList.map((f, i) => ({ ...f, key: i }))} 
                                                    pagination={false}
                                                    size="middle"
                                                    style={{ border: 'none' }}
                                                />
                                            </div>
                                        ) : (
                                            <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                <Empty 
                                                    image={Empty.PRESENTED_IMAGE_SIMPLE} 
                                                    description={<Text type="secondary">暂无文件，请先上传</Text>} 
                                                />
                                            </div>
                                        )}
                                    </div>
                                </Col>
                            </Row>
                        </div>

                        {/* 3. 底部操作栏 */}
                        <div style={{ 
                            padding: '16px 32px', 
                            borderTop: '1px solid #f0f0f0', 
                            textAlign: 'right',
                            background: '#fff'
                        }}>
                            <Space size={16}>
                                <div style={{ marginRight: 16 }}>
                                    <Text type="secondary">预计消耗 Token: </Text>
                                    <Text strong>~{fileList.reduce((acc, f) => acc + (f.size/1000), 0).toFixed(0)} k</Text>
                                </div>
                                <Button onClick={handleReset}>重置</Button>
                                <Button 
                                    type="primary" 
                                    size="large"
                                    icon={<RocketOutlined />}
                                    disabled={fileList.length === 0 || (ontologyMode === 'existing' && !selectedOntology)}
                                    onClick={handleStartBuild}
                                    style={{ padding: '0 32px' }}
                                >
                                    开始构建知识图谱
                                </Button>
                            </Space>
                        </div>
                    </div>
                ) : (
                    /* 4. 处理中/结果状态 */
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 48 }}>
                        {status === 'error' ? (
                            <div style={{ width: 600, textAlign: 'center' }}>
                                <Alert
                                    message="构建任务失败"
                                    description={errorMsg}
                                    type="error"
                                    showIcon
                                    style={{ marginBottom: 24, textAlign: 'left' }}
                                />
                                <Button type="primary" onClick={handleReset} size="large">返回重试</Button>
                            </div>
                        ) : (
                            <div style={{ width: 600, textAlign: 'center' }}>
                                <div style={{ marginBottom: 32 }}>
                                    <Spin size="large" />
                                </div>
                                <Title level={4} style={{ marginBottom: 16 }}>
                                    {status === 'completed' ? '处理完成' : 'AI 正在努力工作中...'}
                                </Title>
                                <Progress 
                                    percent={progress.percent} 
                                    status="active" 
                                    strokeColor={{ from: '#108ee9', to: '#87d068' }}
                                    strokeWidth={12}
                                />
                                <div style={{ marginTop: 24, padding: '16px', background: '#f5f5f5', borderRadius: 8 }}>
                                    <Text type="secondary">{progress.message}</Text>
                                </div>
                                <Paragraph type="secondary" style={{ marginTop: 24 }}>
                                    请勿关闭页面，这可能需要几分钟时间...
                                </Paragraph>
                            </div>
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default KGUploadPage;
