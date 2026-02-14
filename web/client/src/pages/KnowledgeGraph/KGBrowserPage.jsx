/**
 * 知识图谱浏览页面 (现代分析仪表盘版)
 * 
 * 功能：
 * 1. 双栏布局 (Sidebar + Canvas)
 * 2. 侧边栏整合搜索、筛选、统计和详情
 * 3. 沉浸式图谱展示
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    Layout, Card, Input, Select, Button, Space, Tag, 
    Divider, Statistic, Row, Col, Empty, Spin, Tooltip,
    Typography, Badge, message, Checkbox, Tabs, theme
} from 'antd';
import { 
    SearchOutlined, ReloadOutlined, ExpandOutlined,
    NodeIndexOutlined, InfoCircleOutlined,
    FilterOutlined, ProfileOutlined, ArrowLeftOutlined,
    ShareAltOutlined, DashboardOutlined
} from '@ant-design/icons';
import axios from 'axios';
import GraphVis from './components/GraphVis';
import { motion, AnimatePresence } from 'framer-motion';

const { Sider, Content } = Layout;
const { Search } = Input;
const { Title, Text, Paragraph } = Typography;

const KGBrowserPage = () => {
    const { token } = theme.useToken();
    const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState(null);
    
    // Filters
    const [searchKeyword, setSearchKeyword] = useState('');
    const [selectedType, setSelectedType] = useState(null);
    const [entityTypes, setEntityTypes] = useState([]);
    const [edgeTypes, setEdgeTypes] = useState([]);
    const [hiddenEdgeTypes, setHiddenEdgeTypes] = useState([]);

    // UI State
    const [selectedNode, setSelectedNode] = useState(null);
    const [sidebarMode, setSidebarMode] = useState('filter'); // 'filter' | 'detail'
    
    // Refs
    const statsRequestRef = useRef(null);
    const graphRequestRef = useRef(null);

    // 加载图谱统计
    useEffect(() => {
        fetchStats();
        fetchGraphData();
        
        return () => {
            if (statsRequestRef.current) statsRequestRef.current.abort();
            if (graphRequestRef.current) graphRequestRef.current.abort();
        };
    }, []);

    const fetchStats = async () => {
        if (statsRequestRef.current) statsRequestRef.current.abort();
        const controller = new AbortController();
        statsRequestRef.current = controller;

        try {
            const res = await axios.get('/api/kg/stats', { signal: controller.signal });
            if (res.data.success) {
                setStats(res.data.data);
                const types = res.data.data.typeDistribution || [];
                setEntityTypes(types.map(t => ({ value: t.type, label: t.type, count: t.count })));
            }
        } catch (error) {
            if (!axios.isCancel(error)) {
                console.error('加载统计失败:', error);
            }
        }
    };

    const fetchGraphData = async (params = {}) => {
        if (graphRequestRef.current) graphRequestRef.current.abort();
        const controller = new AbortController();
        graphRequestRef.current = controller;

        setLoading(true);
        try {
            const res = await axios.get('/api/kg/graph', {
                params: {
                    keyword: params.keyword ?? searchKeyword,
                    type: params.type ?? selectedType,
                    limit: 100
                },
                signal: controller.signal
            });
            
            if (res.data.success) {
                const { nodes: rawNodes, edges: rawEdges } = res.data.data;
                
                // Process data
                const nodes = rawNodes.map(e => ({
                    id: e.id,
                    label: e.name,
                    type: e.type,
                    properties: e.properties,
                    color: getNodeColor(e.type)
                }));

                const edges = (rawEdges || []).map(e => ({
                    source: e.source,
                    target: e.target,
                    label: e.type,
                    type: e.type,
                    properties: e.properties
                }));

                setGraphData({ nodes, edges });
                
                // Clear node selection if new data loaded
                if (params.keyword !== undefined || params.type !== undefined) {
                    setSelectedNode(null);
                    setSidebarMode('filter');
                }
            }
        } catch (error) {
            if (!axios.isCancel(error)) {
                message.error('加载图谱数据失败');
                setGraphData({ nodes: [], edges: [] });
            }
        } finally {
            if (graphRequestRef.current === controller) {
                setLoading(false);
            }
        }
    };

    const fetchNodeNetwork = async (entityId) => {
        try {
            const res = await axios.get(`/api/kg/network/${entityId}`, {
                params: { depth: 1 }
            });
            
            if (res.data.success) {
                const { nodes, edges } = res.data.data;
                setGraphData({
                    nodes: nodes.map(n => ({
                        id: n.id,
                        label: n.name,
                        type: n.type,
                        properties: n.properties,
                        color: getNodeColor(n.type)
                    })),
                    edges: edges.map(e => ({
                        source: e.source,
                        target: e.target,
                        label: e.type,
                        type: e.type
                    }))
                });
                message.success('已展开关联网络');
            }
        } catch (error) {
            message.error('加载关联网络失败');
        }
    };

    const handleNodeClick = useCallback((node) => {
        setSelectedNode(node);
        setSidebarMode('detail');
    }, []);

    const handleSearch = (value) => {
        setSearchKeyword(value);
        fetchGraphData({ keyword: value });
    };

    const handleTypeChange = (value) => {
        setSelectedType(value);
        fetchGraphData({ type: value });
    };

    const handleEdgeTypesLoaded = useCallback((types) => {
        setEdgeTypes(types);
        setHiddenEdgeTypes([]); // Reset hidden types on new data
    }, []);

    const toggleEdgeType = (type) => {
        setHiddenEdgeTypes(prev => 
            prev.includes(type) 
                ? prev.filter(t => t !== type)
                : [...prev, type]
        );
    };

    // 生成基于字符串的固定颜色
    const stringToColor = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00ffffff).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
    };

    const getNodeColor = (type) => {
        const colorMap = {
            // 原有类型
            '设备': '#52c41a', // Green
            '操作': '#1890ff', // Blue
            '规范': '#722ed1', // Purple
            '风险': '#ff4d4f', // Red
            '人员': '#faad14', // Gold
            '场所': '#13c2c2', // Cyan
            '物料': '#eb2f96', // Magenta
            
            // 后端实际提取类型 (安全领域)
            '风险单元': '#13c2c2', // Cyan (同场所)
            '作业活动': '#1890ff', // Blue (同操作)
            '危险源': '#ff4d4f',   // Red (同风险)
            '后果': '#fa8c16',     // Orange
            '控制措施': '#52c41a', // Green (同设备/安全)
            '部门': '#722ed1',     // Purple (同规范/组织)
        };
        return colorMap[type] || stringToColor(type);
    };

    // Sidebar Content Components
    const renderFilterPanel = () => (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <div style={{ padding: '24px 20px', borderBottom: '1px solid #f0f0f0' }}>
                <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <DashboardOutlined style={{ color: '#1890ff' }} />
                    图谱探索
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>{graphData.nodes.length} 实体 · {graphData.edges.length} 关系</Text>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                <Space direction="vertical" size={24} style={{ width: '100%' }}>
                    {/* 1. Search */}
                    <div>
                        <Text strong style={{ marginBottom: 8, display: 'block' }}>实体搜索</Text>
                        <Search
                            placeholder="输入实体名称..."
                            allowClear
                            onSearch={handleSearch}
                            enterButton
                        />
                    </div>

                    {/* 2. Entity Filter */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text strong>实体类型</Text>
                            {selectedType && (
                                <Button type="link" size="small" onClick={() => handleTypeChange(null)} style={{ padding: 0 }}>
                                    清除
                                </Button>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {entityTypes.map(t => (
                                <Tag.CheckableTag
                                    key={t.value}
                                    checked={selectedType === t.value}
                                    onChange={(checked) => handleTypeChange(checked ? t.value : null)}
                                    style={{ border: `1px solid ${selectedType === t.value ? 'transparent' : '#f0f0f0'}` }}
                                >
                                    <span style={{ marginRight: 4 }}>{t.label}</span>
                                    <span style={{ fontSize: 10, opacity: 0.7 }}>{t.count}</span>
                                </Tag.CheckableTag>
                            ))}
                        </div>
                    </div>

                    {/* 3. Relation Filter */}
                    {edgeTypes.length > 0 && (
                        <div>
                            <Text strong style={{ marginBottom: 8, display: 'block' }}>关系类型筛选</Text>
                            <div style={{ background: '#fafafa', padding: 12, borderRadius: 8 }}>
                                <Row gutter={[0, 8]}>
                                    {edgeTypes.map(type => (
                                        <Col span={24} key={type}>
                                            <Checkbox 
                                                checked={!hiddenEdgeTypes.includes(type)}
                                                onChange={() => toggleEdgeType(type)}
                                                style={{ fontSize: 13 }}
                                            >
                                                {type}
                                            </Checkbox>
                                        </Col>
                                    ))}
                                </Row>
                            </div>
                        </div>
                    )}

                    {/* 4. Statistics */}
                    {stats && (
                        <Card size="small" title="全库统计" style={{ marginTop: 12 }}>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Statistic title="总实体" value={stats.entityCount} valueStyle={{ fontSize: 18, color: '#1890ff' }} />
                                </Col>
                                <Col span={12}>
                                    <Statistic title="总关系" value={stats.relationCount} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
                                </Col>
                            </Row>
                        </Card>
                    )}
                </Space>
            </div>

            <div style={{ padding: '16px 20px', borderTop: '1px solid #f0f0f0', textAlign: 'center' }}>
                <Button 
                    icon={<ReloadOutlined />} 
                    block
                    onClick={() => {
                        setSearchKeyword('');
                        setSelectedType(null);
                        setHiddenEdgeTypes([]);
                        fetchGraphData({});
                    }}
                >
                    重置所有筛选
                </Button>
            </div>
        </motion.div>
    );

    const renderDetailPanel = () => (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}
        >
            <div style={{ padding: '20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Button 
                    icon={<ArrowLeftOutlined />} 
                    type="text" 
                    onClick={() => setSidebarMode('filter')}
                />
                <Title level={5} style={{ margin: 0 }}>实体详情</Title>
            </div>

            {selectedNode ? (
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                        <div style={{ 
                            width: 64, height: 64, borderRadius: '50%', 
                            background: selectedNode.color || getNodeColor(selectedNode.type),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 16px',
                            color: '#fff', fontSize: 24, fontWeight: 'bold',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                        }}>
                            {selectedNode.label.substring(0, 2)}
                        </div>
                        <Title level={4} style={{ marginBottom: 8 }}>{selectedNode.label}</Title>
                        <Tag color={selectedNode.color || getNodeColor(selectedNode.type)}>{selectedNode.type}</Tag>
                    </div>

                    <Divider orientation="left" style={{ fontSize: 12, color: '#999' }}>属性信息</Divider>
                    
                    {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {Object.entries(selectedNode.properties).map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                    <Text type="secondary">{k}</Text>
                                    <Text style={{ maxWidth: '60%', textAlign: 'right' }}>{String(v)}</Text>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无属性" />
                    )}

                    <Divider orientation="left" style={{ fontSize: 12, color: '#999' }}>操作</Divider>
                    
                    <Button 
                        type="primary" 
                        ghost 
                        block 
                        icon={<ExpandOutlined />}
                        onClick={() => fetchNodeNetwork(selectedNode.id)}
                        style={{ marginBottom: 12 }}
                    >
                        展开关联网络
                    </Button>
                </div>
            ) : (
                <Empty description="未选择实体" style={{ marginTop: 50 }} />
            )}
        </motion.div>
    );

    return (
        <Layout style={{ height: '100%', overflow: 'hidden', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Sider 
                width={320} 
                theme="light"
                style={{ 
                    borderRight: '1px solid #f0f0f0',
                    zIndex: 2,
                    height: '100%'
                }}
            >
                <AnimatePresence mode="wait">
                    {sidebarMode === 'filter' ? (
                        <motion.div key="filter" style={{ height: '100%' }}>
                            {renderFilterPanel()}
                        </motion.div>
                    ) : (
                        <motion.div key="detail" style={{ height: '100%' }}>
                            {renderDetailPanel()}
                        </motion.div>
                    )}
                </AnimatePresence>
            </Sider>

            <Content style={{ position: 'relative', background: '#f8f9fa' }}>
                <GraphVis 
                    data={graphData}
                    onNodeClick={handleNodeClick}
                    hiddenEdgeTypes={hiddenEdgeTypes}
                    onEdgeTypesLoaded={handleEdgeTypesLoaded}
                    height="100%"
                />
                
                {/* Floating Legend / Info */}
                <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ background: 'rgba(255,255,255,0.9)', padding: '8px 12px', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: 12 }}>
                        <Space wrap size={[8, 4]}>
                            {entityTypes.slice(0, 5).map(t => (
                                <span key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: getNodeColor(t.value) }}></span>
                                    {t.label}
                                </span>
                            ))}
                            {entityTypes.length > 5 && <span style={{ color: '#999' }}>...</span>}
                        </Space>
                    </div>
                </div>
            </Content>
        </Layout>
    );
};

export default KGBrowserPage;
