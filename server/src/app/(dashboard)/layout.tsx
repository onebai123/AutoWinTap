'use client'

import { useState } from 'react'
import { Layout, Menu, Typography, theme, Space, Button, Segmented, Tooltip, Divider, Modal, Tabs, Steps, Alert, Tag } from 'antd'
import {
  DashboardOutlined,
  DesktopOutlined,
  ThunderboltOutlined,
  MonitorOutlined,
  AppstoreOutlined,
  SettingOutlined,
  GithubOutlined,
  UserOutlined,
  RobotOutlined,
  HomeOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import { usePathname, useRouter } from 'next/navigation'
import type { MenuProps } from 'antd'
import Link from 'next/link'

const { Header, Sider, Content } = Layout
const { Title, Text, Paragraph } = Typography

type MenuItem = Required<MenuProps>['items'][number]

const menuItems: MenuItem[] = [
  { key: '/', icon: <DashboardOutlined />, label: '首页' },
  { type: 'divider' },
  // 核心功能
  { key: '/workstation', icon: <MonitorOutlined />, label: '🖥️ 工作台' },
  { key: '/devices', icon: <DesktopOutlined />, label: '📱 设备管理' },
  { key: '/presets', icon: <AppstoreOutlined />, label: '📐 窗口编排' },
  { type: 'divider' },
  // 更多功能
  {
    key: 'more-group',
    icon: <ThunderboltOutlined />,
    label: '更多功能',
    children: [
      { key: '/tasks', label: '任务中心' },
      { key: '/monitor', label: '屏幕监控' },
      { key: '/browser', label: '浏览器调试' },
      { key: '/logs', label: '日志查看' },
      { key: '/plugins/installed', label: '插件管理' },
    ],
  },
  { key: '/settings', icon: <SettingOutlined />, label: '⚙️ 设置' },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [quickStartOpen, setQuickStartOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { token } = theme.useToken()

  const getSelectedKey = () => {
    return pathname || '/'
  }

  const getOpenKeys = () => {
    if (pathname?.startsWith('/tasks') || pathname?.startsWith('/monitor') || 
        pathname?.startsWith('/logs') || pathname?.startsWith('/browser') ||
        pathname?.startsWith('/plugins')) return ['more-group']
    return []
  }

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    router.push(key)
  }

  // 快速开始弹窗 Tabs 内容
  const quickStartTabs = [
    {
      key: 'install',
      label: <><PlayCircleOutlined /> 安装教程</>,
      children: (
        <div>
          <Alert message="环境要求" type="info" showIcon style={{ marginBottom: 16 }} 
            description={
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>Windows 10/11</li>
                <li>.NET 8.0 Runtime</li>
                <li>Node.js 18+</li>
              </ul>
            }
          />
          <Steps
            direction="vertical"
            size="small"
            current={-1}
            items={[
              { title: '克隆仓库', description: 'git clone https://github.com/onebai123/AutoWinTap.git' },
              { title: '一键启动', description: '双击运行 start-all.bat' },
              { title: '打开浏览器', description: '访问 http://localhost:3000' },
            ]}
          />
        </div>
      ),
    },
    {
      key: 'config',
      label: <><SettingOutlined /> 配置教程</>,
      children: (
        <div>
          <Steps
            direction="vertical"
            size="small"
            current={-1}
            items={[
              { 
                title: '配置 AI API', 
                description: (
                  <Space direction="vertical">
                    <Text>前往设置页面配置 AI 接口</Text>
                    <Link href="/settings"><Button size="small" type="primary">前往设置</Button></Link>
                  </Space>
                )
              },
              { 
                title: '窗口编排', 
                description: (
                  <Space direction="vertical">
                    <Text>配置需要监控的窗口布局</Text>
                    <Link href="/presets"><Button size="small">前往编排</Button></Link>
                  </Space>
                )
              },
              { 
                title: '进入工作台', 
                description: (
                  <Space direction="vertical">
                    <Text>选择设备，开始实时监控</Text>
                    <Link href="/workstation"><Button size="small" type="primary">进入工作台</Button></Link>
                  </Space>
                )
              },
            ]}
          />
        </div>
      ),
    },
    {
      key: 'features',
      label: <><BulbOutlined /> 功能介绍</>,
      children: (
        <div>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert message="🔍 智能监控" type="success" description="实时截图多个 Windows 窗口，OCR 提取文字内容" />
            <Alert message="🤖 AI 分析" type="success" description="自动检测错误日志，AI 理解上下文并给出修复建议" />
            <Alert message="⚡ 自动化操作" type="success" description="向任意窗口发送命令、按键序列，一键执行常用操作" />
            <Alert message="📊 状态追踪" type="success" description="实时事件日志，变化检测，错误告警" />
          </Space>
        </div>
      ),
    },
    {
      key: 'help',
      label: <><QuestionCircleOutlined /> 帮助</>,
      children: (
        <div>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert 
              message="常见问题" 
              type="info"
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li><strong>Agent 无法连接？</strong> 检查防火墙设置，确保 5000 端口开放</li>
                  <li><strong>截图失败？</strong> 确保目标窗口未最小化</li>
                  <li><strong>AI 分析无响应？</strong> 检查 API 密钥配置是否正确</li>
                </ul>
              }
            />
            <Space>
              <Button icon={<GithubOutlined />} href="https://github.com/onebai123/AutoWinTap" target="_blank">
                GitHub 仓库
              </Button>
              <Button icon={<GithubOutlined />} href="https://github.com/onebai123/AutoWinTap/issues" target="_blank">
                提交 Issue
              </Button>
            </Space>
          </Space>
        </div>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ background: token.colorBgContainer }}
      >
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={{ fontSize: 24 }}>🤖</Text>
          {!collapsed && (
            <Title level={4} style={{ margin: 0, color: token.colorPrimary }}>
              AutoWinTap
            </Title>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          defaultOpenKeys={getOpenKeys()}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: token.colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          {/* 左侧：产品介绍 */}
          <Space size="small">
            <Text type="secondary">AI编程监管者 · Windows 自动化</Text>
            <Divider type="vertical" />
            <Text style={{ color: token.colorTextSecondary, fontSize: 14 }}>
              📷 窗口截图 → 🔍 OCR识别 → 🤖 AI分析 → 🚨 任务偏离告警 → 💡 编码指令 → ⚡ 自动执行
            </Text>
            <Text strong style={{ fontSize: 14 }}>
              ➜ 🎯 项目稳定交付 / 效率提升
            </Text>
          </Space>

          {/* 右侧：模式切换 + 设置 + 快速开始 */}
          <Space size="middle">
            <Segmented
              size="small"
              options={[
                { label: '🧑‍💻 个人提效', value: 'personal' },
                { label: '📂 多项目并行', value: 'multi' },
                { label: '🤖 群控', value: 'group', disabled: true },
              ]}
              defaultValue="personal"
            />
            <Divider type="vertical" />
            <Tooltip title="设置">
              <Button 
                type="text" 
                icon={<SettingOutlined />}
                onClick={() => router.push('/settings')}
              />
            </Tooltip>
            <Tooltip title="GitHub">
              <Button 
                type="text" 
                icon={<GithubOutlined />}
                href="https://github.com/onebai123/AutoWinTap"
                target="_blank"
              />
            </Tooltip>
            <Button 
              type="primary"
              icon={<RocketOutlined />}
              onClick={() => setQuickStartOpen(true)}
            >
              快速开始
            </Button>
          </Space>
        </Header>
        <Content
          style={{
            margin: 24,
            padding: 24,
            background: token.colorBgContainer,
            borderRadius: token.borderRadiusLG,
            minHeight: 280,
          }}
        >
          {children}
        </Content>
      </Layout>

      {/* 快速开始弹窗 */}
      <Modal
        title={<><RocketOutlined /> 快速开始 - AutoWinTap</>}
        open={quickStartOpen}
        onCancel={() => setQuickStartOpen(false)}
        footer={[
          <Button key="close" onClick={() => setQuickStartOpen(false)}>关闭</Button>,
          <Button key="start" type="primary" onClick={() => { setQuickStartOpen(false); router.push('/workstation'); }}>
            进入工作台
          </Button>,
        ]}
        width={640}
      >
        <Tabs items={quickStartTabs} />
      </Modal>
    </Layout>
  )
}
