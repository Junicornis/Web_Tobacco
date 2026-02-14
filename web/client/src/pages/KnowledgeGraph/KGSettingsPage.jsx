/**
 * 知识图谱系统设置页面
 * 
 * 功能：
 * 1. 配置大模型参数
 * 2. 配置实体对齐阈值
 * 3. 配置文档解析选项
 */

import React, { useState, useEffect } from 'react';
import { 
    Card, Form, Input, Button, Slider, Switch, 
    message, Divider, Typography, Space, InputNumber
} from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const KGSettingsPage = () => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    // 加载设置（实际应从后端或本地存储加载）
    useEffect(() => {
        const savedSettings = localStorage.getItem('kg_settings');
        if (savedSettings) {
            form.setFieldsValue(JSON.parse(savedSettings));
        } else {
            // 默认值
            form.setFieldsValue({
                llmTemperature: 0.3,
                llmMaxTokens: 8000,
                autoMergeThreshold: 0.9,
                candidateThreshold: 0.7,
                enableOCR: true,
                preserveStructure: true,
                maxFileSize: 100
            });
        }
    }, [form]);

    const handleSave = async (values) => {
        setLoading(true);
        try {
            // 保存到本地存储
            localStorage.setItem('kg_settings', JSON.stringify(values));
            message.success('设置已保存');
        } catch (error) {
            message.error('保存失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <h2 style={{ fontSize: '20px', margin: 0 }}>⚙️ 系统设置</h2>
                    <p style={{ color: '#666', margin: 0, fontSize: '12px' }}>
                        配置知识图谱构建的各项参数
                    </p>
                </div>
                <Space>
                    <Button 
                        type="primary" 
                        icon={<SaveOutlined />}
                        onClick={form.submit}
                        loading={loading}
                        size="small"
                    >
                        保存设置
                    </Button>
                    <Button 
                        icon={<ReloadOutlined />}
                        onClick={() => form.resetFields()}
                        size="small"
                    >
                        重置
                    </Button>
                </Space>
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                        {/* 大模型设置 */}
                        <Card title="大模型设置" size="small" styles={{ body: { padding: '12px 24px' } }}>
                            <Form.Item
                                name="llmTemperature"
                                label="模型温度"
                                extra={<span style={{fontSize: 12}}>较低的值使输出更确定，较高的值更具创意</span>}
                                style={{marginBottom: 12}}
                            >
                                <Slider
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    marks={{ 0: '精确', 0.5: '平衡', 1: '创意' }}
                                />
                            </Form.Item>

                            <Form.Item
                                name="llmMaxTokens"
                                label="最大输出长度"
                                style={{marginBottom: 12}}
                            >
                                <InputNumber min={1000} max={16000} step={1000} style={{ width: '100%' }} />
                            </Form.Item>
                        </Card>

                        {/* 实体对齐设置 */}
                        <Card title="实体对齐设置" size="small" styles={{ body: { padding: '12px 24px' } }}>
                            <Form.Item
                                name="autoMergeThreshold"
                                label="自动合并阈值"
                                extra={<span style={{fontSize: 12}}>相似度高于此值自动合并</span>}
                                style={{marginBottom: 12}}
                            >
                                <Slider
                                    min={0.5}
                                    max={1}
                                    step={0.05}
                                    marks={{ 0.5: '0.5', 0.7: '0.7', 0.9: '0.9' }}
                                />
                            </Form.Item>

                            <Form.Item
                                name="candidateThreshold"
                                label="候选对齐阈值"
                                extra={<span style={{fontSize: 12}}>相似度高于此值列为候选</span>}
                                style={{marginBottom: 12}}
                            >
                                <Slider
                                    min={0.5}
                                    max={0.9}
                                    step={0.05}
                                    marks={{ 0.5: '0.5', 0.7: '0.7', 0.9: '0.9' }}
                                />
                            </Form.Item>
                        </Card>

                        {/* 文档解析设置 */}
                        <Card title="文档解析设置" size="small" styles={{ body: { padding: '12px 24px' } }}>
                            <div style={{ display: 'flex', gap: 24 }}>
                                <Form.Item
                                    name="enableOCR"
                                    label="启用 OCR"
                                    valuePropName="checked"
                                    style={{marginBottom: 12}}
                                >
                                    <Switch />
                                </Form.Item>

                                <Form.Item
                                    name="preserveStructure"
                                    label="保留结构"
                                    valuePropName="checked"
                                    style={{marginBottom: 12}}
                                >
                                    <Switch />
                                </Form.Item>
                            </div>

                            <Form.Item
                                name="maxFileSize"
                                label="最大文件大小 (MB)"
                                style={{marginBottom: 12}}
                            >
                                <InputNumber min={10} max={500} style={{ width: '100%' }} />
                            </Form.Item>
                        </Card>
                    </div>
                </Form>
            </div>
        </div>
    );
};

export default KGSettingsPage;
