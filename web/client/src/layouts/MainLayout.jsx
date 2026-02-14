import React from 'react';
import { Layout, Menu, Button, theme } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  LogoutOutlined,
  UploadOutlined,
  ScheduleOutlined,
  BookOutlined,
  IdcardOutlined,
  BranchesOutlined,
  ApartmentOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

const MainLayout = ({ children, role, onLogout, username }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const adminItems = [
    {
      key: '/admin/scenes',
      icon: <UploadOutlined />,
      label: '场景导入',
    },
    {
      key: '/admin/users',
      icon: <UserOutlined />,
      label: '人员管理',
    },
    {
      key: '/admin/questions',
      icon: <BookOutlined />,
      label: '知识图谱',
    },
    {
      key: 'sub1',
      icon: <DashboardOutlined />,
      label: '任务管理',
      children: [
        { key: '/admin/dashboard', label: '任务下发' },
        { key: '/admin/monitor', label: '任务监控' },
      ]
    },
    {
      key: '/admin/knowledge-graph/browser',
      icon: <BranchesOutlined />,
      label: '知识图谱',
    }
  ];

  const userItems = [
    {
      key: '/user/tasks',
      icon: <ScheduleOutlined />,
      label: '我的任务',
    },
    {
      key: '/user/profile',
      icon: <IdcardOutlined />,
      label: '个人画像',
    },
    {
      key: '/user/knowledge-graph',
      icon: <BranchesOutlined />,
      label: '知识图谱',
    }
  ];

  const items = role === 'admin' ? adminItems : userItems;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible breakpoint="lg">
        <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', textAlign: 'center', color: 'white', lineHeight: '32px', fontWeight: 'bold' }}>
          Safety Training
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={(e) => navigate(e.key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 500 }}>
            {role === 'admin' ? '管理控制台' : '员工中心'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span>欢迎, {username}</span>
            <Button type="text" icon={<LogoutOutlined />} onClick={onLogout}>
              退出
            </Button>
          </div>
        </Header>
        <Content style={{ margin: '0px 0px 0px 0px', padding: 12, minHeight: 280, background: colorBgContainer, borderRadius: borderRadiusLG }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
