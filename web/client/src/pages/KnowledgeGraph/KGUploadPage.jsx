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

import React, { useMemo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
    Card, Upload, Button, Steps, 
    Alert, Table, Tag, Typography, Tooltip,
    Radio, Select, message, Spin, Empty, InputNumber,
    Row, Col, Space, Drawer
} from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
    InboxOutlined, FileExcelOutlined, FileWordOutlined, 
    FilePdfOutlined, FileTextOutlined, LoadingOutlined,
    CheckCircleOutlined, SettingOutlined, CloudUploadOutlined,
    FileSearchOutlined, EyeOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getKgRequestTimeoutMs, setKgRequestTimeoutMs } from '../../utils/kgRequestTimeout';

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
    const [status, setStatus] = useState('idle'); // idle | processing | success
    const [currentTaskId, setCurrentTaskId] = useState(null);
    const [mask, setMask] = useState({ visible: false, state: 'loading', text: '正在解析，请稍候…' });
    const [requestRef, setRequestRef] = useState(null);
    const [parsedFiles, setParsedFiles] = useState([]);
    const [viewFileDrawerVisible, setViewFileDrawerVisible] = useState(false);
    const [viewFileContent, setViewFileContent] = useState({ title: '', content: '' });
    const [fileLoading, setFileLoading] = useState(false);
    const [requestTimeoutSec, setRequestTimeoutSec] = useState(() => {
        const ms = getKgRequestTimeoutMs();
        return Math.round(ms / 1000);
    });
    const requestTimeoutMs = useMemo(() => Math.max(10000, requestTimeoutSec * 1000), [requestTimeoutSec]);

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

    const generateTaskId = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    const isSupportedFile = (name) => {
        const ext = String(name || '').split('.').pop().toLowerCase();
        return ['xlsx', 'xls', 'docx', 'doc', 'pdf', 'txt'].includes(ext);
    };

    const validateSelectedFiles = (newFileList) => {
        if (!Array.isArray(newFileList) || newFileList.length === 0) return false;
        for (const f of newFileList) {
            const raw = f?.originFileObj;
            if (!raw) return false;
            const isLt100M = raw.size / 1024 / 1024 < 100;
            if (!isLt100M) {
                message.error(`${raw.name} 超过100MB限制`);
                return false;
            }
            if (!isSupportedFile(raw.name)) {
                message.error(`不支持的文件格式: ${raw.name}`);
                return false;
            }
        }
        if (ontologyMode === 'existing' && !selectedOntology) {
            message.warning('请选择目标本体后再上传');
            return false;
        }
        return true;
    };

    useEffect(() => {
        if (!mask.visible) return undefined;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const prevent = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        const preventKey = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        window.addEventListener('wheel', prevent, { passive: false, capture: true });
        window.addEventListener('touchmove', prevent, { passive: false, capture: true });
        window.addEventListener('keydown', preventKey, true);
        window.addEventListener('keypress', preventKey, true);
        window.addEventListener('keyup', preventKey, true);

        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener('wheel', prevent, { capture: true });
            window.removeEventListener('touchmove', prevent, { capture: true });
            window.removeEventListener('keydown', preventKey, true);
            window.removeEventListener('keypress', preventKey, true);
            window.removeEventListener('keyup', preventKey, true);
        };
    }, [mask.visible]);

    useEffect(() => {
        return () => {
            if (requestRef) requestRef.abort();
        };
    }, [requestRef]);

    const startParse = async (newFileList) => {
        if (!validateSelectedFiles(newFileList)) return;
        if (requestRef) requestRef.abort();

        const controller = new AbortController();
        setRequestRef(controller);

        const clientTaskId = generateTaskId();
        setCurrentTaskId(clientTaskId);
        setStatus('processing');
        setParsedFiles([]);
        setMask({ visible: true, state: 'loading', text: '正在解析，请稍候…' });

        try {
            const formData = new FormData();
            newFileList.forEach(file => {
                formData.append('files', file.originFileObj);
            });
            formData.append('ontologyMode', ontologyMode);
            if (ontologyMode === 'existing' && selectedOntology) {
                formData.append('ontologyId', selectedOntology);
            }
            formData.append('clientTaskId', clientTaskId);

            try {
                console.log('[KG] upload-and-parse request', {
                    url: '/api/kg/upload-and-parse',
                    params: { wait: 1, timeoutSec: 60 },
                    clientTaskId,
                    ontologyMode,
                    ontologyId: ontologyMode === 'existing' ? (selectedOntology || null) : null,
                    files: newFileList.map(f => ({
                        name: f?.name,
                        size: f?.size,
                        type: f?.type
                    }))
                });
            } catch (e) {}

            const uploadRes = await axios.post('/api/kg/upload-and-parse', formData, {
                params: { wait: 1, timeoutSec: 60 },
                timeout: requestTimeoutMs,
                signal: controller.signal
            });
            if (!uploadRes.data?.success) {
                throw new Error(uploadRes.data?.message || '上传失败');
            }

            const taskId = uploadRes.data?.taskId || clientTaskId;
            setCurrentTaskId(taskId);
            setParsedFiles(Array.isArray(uploadRes.data?.files) ? uploadRes.data.files : []);
            setMask({ visible: false, state: 'loading', text: '正在解析，请稍候…' });
            setStatus('success');
        } catch (error) {
            if (error?.code === 'ERR_CANCELED') return;
            try {
                console.error('[KG] upload-and-parse failed', {
                    message: error?.message,
                    code: error?.code,
                    status: error?.response?.status,
                    data: error?.response?.data
                });
            } catch (e) {}
            setMask({ visible: true, state: 'error', text: '原文解析失败，请重新上传' });
            setStatus('idle');
            setTimeout(() => {
                setMask({ visible: false, state: 'loading', text: '正在解析原文，请稍候…' });
                setCurrentTaskId(null);
                setFileList([]);
                setParsedFiles([]);
            }, 3000);
        }
    };

    const handleStartBuild = async () => {
        if (!currentTaskId) return;
        if (requestRef) requestRef.abort();
        const controller = new AbortController();
        setRequestRef(controller);
        setMask({ visible: true, state: 'loading', text: '正在开始构建知识图谱，请稍候…' });
        try {
            try {
                console.log('[KG] start-build request', {
                    url: `/api/kg/tasks/${encodeURIComponent(String(currentTaskId))}/start-build`,
                    taskId: currentTaskId
                });
            } catch (e) {}
            const res = await axios.post(`/api/kg/tasks/${encodeURIComponent(String(currentTaskId))}/start-build`, null, {
                timeout: requestTimeoutMs,
                signal: controller.signal
            });
            if (!res.data?.success) {
                throw new Error(res.data?.message || '开始构建失败');
            }
            setMask({ visible: false, state: 'loading', text: '正在开始构建知识图谱，请稍候…' });
            navigate(`/admin/knowledge-graph/tasks/${encodeURIComponent(String(currentTaskId))}`);
        } catch (error) {
            if (error?.code === 'ERR_CANCELED') return;
            try {
                console.error('[KG] start-build failed', {
                    message: error?.message,
                    code: error?.code,
                    status: error?.response?.status,
                    data: error?.response?.data
                });
            } catch (e) {}
            setMask({ visible: true, state: 'error', text: '开始构建失败，请稍后重试' });
            setTimeout(() => {
                setMask({ visible: false, state: 'loading', text: '正在解析原文，请稍候…' });
            }, 3000);
        }
    };

    const handleViewFile = async (fileId, filename) => {
        if (!fileId) return;
        setViewFileDrawerVisible(true);
        setViewFileContent({ title: filename || '原文', content: '' });
        setFileLoading(true);
        try {
            const res = await axios.get(`/api/kg/file/${encodeURIComponent(String(fileId))}/content`, { timeout: requestTimeoutMs });
            if (!res.data?.success) throw new Error(res.data?.message || '加载失败');
            const content = res.data?.data?.content || '';
            setViewFileContent({ title: res.data?.data?.filename || filename || '原文', content });
        } catch (error) {
            message.error('加载原文失败: ' + (error?.response?.data?.message || error.message));
        } finally {
            setFileLoading(false);
        }
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
        onChange: ({ file, fileList: newFileList }) => {
            setFileList(newFileList);
            if (mask.visible) return;
            if (file?.status === 'removed') return;
            const hasSelected = Boolean(newFileList?.[0]?.originFileObj);
            if (!hasSelected) return;
            startParse(newFileList);
        },
        onDrop: (e) => {
            console.log('Dropped files', e.dataTransfer.files);
        },
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
            width: 200,
            align: 'right',
            render: (_, record, index) => {
                const parsed = Array.isArray(parsedFiles) ? parsedFiles[index] : null;
                const canView = Boolean(parsed?.fileId);
                const canRemove = status === 'idle';
                return (
                    <Space size={8}>
                        <Button
                            type="link"
                            size="small"
                            icon={<EyeOutlined />}
                            disabled={!canView}
                            onClick={() => handleViewFile(parsed.fileId, parsed.filename || record?.name)}
                        >
                            查看原文
                        </Button>
                        <Button
                            type="text"
                            danger
                            size="small"
                            disabled={!canRemove}
                            onClick={() => {
                                const newList = fileList.filter((_, i) => i !== index);
                                setFileList(newList);
                            }}
                        >
                            移除
                        </Button>
                    </Space>
                );
            }
        }
    ];

    // 重置状态
    const handleReset = () => {
        if (requestRef) requestRef.abort();
        setFileList([]);
        setStatus('idle');
        setCurrentTaskId(null);
        setParsedFiles([]);
        setMask({ visible: false, state: 'loading', text: '正在解析，请稍候…' });
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

    const overlayNode = mask.visible ? createPortal(
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'rgba(255,255,255,0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                {mask.state === 'loading' ? (
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} />
                ) : (
                    <FileSearchOutlined style={{ fontSize: 40, color: '#ff4d4f' }} />
                )}
                <Text style={{ fontSize: 16, color: mask.state === 'loading' ? '#333' : '#ff4d4f' }}>
                    {mask.text}
                </Text>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <div style={containerStyle}>
            {overlayNode}
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
                        current={status === 'idle' ? 0 : 1} 
                        items={[
                            { title: '上传并解析', description: '选择文件后自动开始解析' },
                            { title: '结果确认', description: currentTaskId ? `任务ID: ${String(currentTaskId).slice(-8)}` : '' }
                        ]}
                    />
                </div>
            </div>

            <Card 
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} 
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' } }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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

                            <div style={{ width: 200 }}>
                                <Space direction="vertical" size={4}>
                                    <Tooltip title="影响上传解析、开始构建、查看原文等请求的等待时间">
                                        <Text type="secondary" style={{ fontSize: 12 }}>请求超时（秒）</Text>
                                    </Tooltip>
                                    <InputNumber
                                        min={10}
                                        max={600}
                                        step={5}
                                        value={requestTimeoutSec}
                                        onChange={(v) => {
                                            const sec = Number(v);
                                            if (!Number.isFinite(sec)) return;
                                            const ms = setKgRequestTimeoutMs(sec * 1000);
                                            setRequestTimeoutSec(Math.round(ms / 1000));
                                        }}
                                        style={{ width: '100%' }}
                                        size="small"
                                    />
                                </Space>
                            </div>
                        </Space>
                    </div>

                    <div style={{ flex: 1, padding: '24px 32px', overflow: 'hidden' }}>
                        <Row gutter={24} style={{ height: '100%' }}>
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
                                            选择文件后将自动开始解析（单文件最大 100MB）
                                        </p>
                                    </div>
                                </Dragger>
                            </Col>

                            <Col span={14} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text strong>待处理文件 ({fileList.length})</Text>
                                    <Space size={12}>
                                        <Button
                                            type="primary"
                                            size="small"
                                            disabled={status !== 'success' || !currentTaskId}
                                            onClick={handleStartBuild}
                                        >
                                            开始构建知识图谱
                                        </Button>
                                        {fileList.length > 0 && (
                                            <Button type="link" onClick={() => setFileList([])} size="small">清空列表</Button>
                                        )}
                                        <Button onClick={handleReset} size="small">重置</Button>
                                    </Space>
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
                </div>
            </Card>

            <Drawer
                title={viewFileContent.title || '原文'}
                open={viewFileDrawerVisible}
                width={720}
                onClose={() => setViewFileDrawerVisible(false)}
            >
                {fileLoading ? (
                    <div style={{ textAlign: 'center', marginTop: 50 }}>
                        <Spin size="large" tip="加载中..." />
                    </div>
                ) : (
                    <div className="markdown-body" style={{ padding: '0 12px' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {viewFileContent.content}
                        </ReactMarkdown>
                    </div>
                )}
            </Drawer>
        </div>
    );
};

export default KGUploadPage;
