/**
 * 知识图谱模块布局组件
 * 提供侧边导航和公共布局
 */

import React from 'react';
import { Layout } from 'antd';
import { Outlet, useLocation } from 'react-router-dom';
import PillNav from './PillNav';

const { Content } = Layout;

const KGLayout = () => {
    const location = useLocation();

    const navItems = [
        { label: '文件上传', href: '/admin/knowledge-graph/upload' },
        { label: '构建任务', href: '/admin/knowledge-graph/tasks' },
        { label: '本体管理', href: '/admin/knowledge-graph/ontology' },
        { label: '图谱浏览', href: '/admin/knowledge-graph/browser' },
        { label: '系统设置', href: '/admin/knowledge-graph/settings' }
    ];

    // Simple matching for active state
    let activeHref = location.pathname;
    if (activeHref === '/admin/knowledge-graph' || activeHref === '/admin/knowledge-graph/') {
        activeHref = '/admin/knowledge-graph/upload';
    }

    return (
        <Layout style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <PillNav 
                items={navItems}
                activeHref={activeHref}
                baseColor="#666"
                pillColor="#1890ff"
                hoveredPillTextColor="#fff"
                theme="light"
                style={{ flex: '0 0 auto' }}
            />
            
            <Content style={{ 
                padding: '16px', 
                overflow: 'hidden', 
                background: '#f0f2f5',
                flex: 1,
                display: 'flex',
                flexDirection: 'column'
            }}>
                <Outlet />
            </Content>
        </Layout>
    );
};

export default KGLayout;
