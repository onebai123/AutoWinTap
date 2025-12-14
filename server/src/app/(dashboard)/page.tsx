'use client'

import { useEffect, useState } from 'react'
import { Row, Col, Card, Statistic, Table, Tag, Button, Space, message, Typography, Segmented, Divider, Alert } from 'antd'
import {
  DesktopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  GithubOutlined,
  RocketOutlined,
  UserOutlined,
  AppstoreOutlined,
  RobotOutlined,
  WindowsOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type { Device } from '@/types'
import Link from 'next/link'

const { Title, Text, Paragraph } = Typography

type WorkMode = '个人提效' | '多项目并行' | '群控托管'

// Demo 数据
const demoDevices: Device[] = [
  {
    id: 'demo-1',
    machineId: 'DEMO-PC-001',
    hostname: 'DEMO-开发机',
    os: 'Windows 11 Pro',
    agentVersion: '1.0.0',
    plugins: ['window-control', 'browser-debug'],
    status: 'ONLINE',
    lastSeen: new Date(),
    createdAt: new Date(),
  },
]

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [workMode, setWorkMode] = useState<WorkMode>('个人提效')
  const [demoMode, setDemoMode] = useState(false)

  const fetchDevices = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      if (data.success) {
        setDevices(data.data)
      }
    } catch (error) {
      message.error('获取设备列表失败')
    } finally {
      setLoading(false)
    }
  }

  const loadDemoData = () => {
    setDevices(demoDevices)
    setDemoMode(true)
    message.success('已加载演示数据')
  }

  useEffect(() => {
    fetchDevices()
  }, [])

  const onlineCount = devices.filter((d) => d.status === 'ONLINE').length
  const offlineCount = devices.filter((d) => d.status === 'OFFLINE').length

  const columns = [
    { title: '主机名', dataIndex: 'hostname', key: 'hostname' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag
          icon={status === 'ONLINE' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          color={status === 'ONLINE' ? 'success' : 'default'}
        >
          {status === 'ONLINE' ? '在线' : '离线'}
        </Tag>
      ),
    },
    { title: '操作系统', dataIndex: 'os', key: 'os' },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: Device) => (
        <Space>
          <Link href={`/workstation/${record.id}`}>
            <Button type="primary" size="small" disabled={record.status !== 'ONLINE'}>
              进入工作台
            </Button>
          </Link>
        </Space>
      ),
    },
  ]

  const modeDescriptions: Record<WorkMode, { desc: string; status: 'success' | 'warning' }> = {
    '个人提效': { desc: '单人单机，监控多个开发窗口，AI 辅助调试排错', status: 'success' },
    '多项目并行': { desc: '同时监控多个项目窗口，快速切换上下文', status: 'success' },
    '群控托管': { desc: '批量管理多窗口，自动化任务编排（规划中）', status: 'warning' },
  }

  return (
    <div>
      {/* Hero 区域 */}
      <Card 
        style={{ 
          marginBottom: 24, 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
        }}
      >
        <Row align="middle" gutter={24}>
          <Col flex="auto">
            <Title level={2} style={{ color: '#fff', margin: 0 }}>
              🖥️ AutoWinTap
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16 }}>
              AI 驱动的窗口自动化平台 - 你的智能编程监管者
            </Text>
            <Paragraph style={{ color: 'rgba(255,255,255,0.8)', marginTop: 12, marginBottom: 0 }}>
              实时监控多个 Windows 窗口，结合 AI 分析能力，自动检测错误、提供调试建议、执行自动化操作
            </Paragraph>
          </Col>
          <Col>
            <Button 
              type="default" 
              icon={<GithubOutlined />} 
              size="large"
              href="https://github.com/onebai123/AutoWinTap"
              target="_blank"
              style={{ marginRight: 12 }}
            >
              GitHub
            </Button>
            <Link href="/workstation">
              <Button type="primary" icon={<RocketOutlined />} size="large">
                进入工作台
              </Button>
            </Link>
          </Col>
        </Row>
      </Card>

      {/* 快速入门教程 */}
      <Card 
        title="📚 快速入门" 
        style={{ marginBottom: 24 }}
        extra={<Tag color="blue">4 步上手</Tag>}
      >
        <Row gutter={16}>
          <Col span={6}>
            <Card size="small" style={{ height: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Tag color="purple">Step 1</Tag>
                <Title level={5} style={{ margin: 0 }}>启动服务</Title>
                <Text type="secondary">双击运行启动脚本</Text>
                <div style={{ 
                  background: '#1e1e1e', 
                  padding: '8px 12px', 
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: '#4ec9b0'
                }}>
                  <div>start-all.bat</div>
                </div>
              </Space>
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ height: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Tag color="purple">Step 2</Tag>
                <Title level={5} style={{ margin: 0 }}>配置 AI</Title>
                <Text type="secondary">设置 API 密钥</Text>
                <Link href="/settings">
                  <Button type="primary" block size="small" icon={<SettingOutlined />}>
                    前往设置
                  </Button>
                </Link>
              </Space>
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ height: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Tag color="purple">Step 3</Tag>
                <Title level={5} style={{ margin: 0 }}>窗口编排</Title>
                <Text type="secondary">配置监控窗口布局</Text>
                <Link href="/presets">
                  <Button type="primary" block size="small" icon={<AppstoreOutlined />}>
                    前往编排
                  </Button>
                </Link>
              </Space>
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ height: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Tag color="green">Step 4</Tag>
                <Title level={5} style={{ margin: 0 }}>进入工作台</Title>
                <Text type="secondary">开始监控 + AI 分析</Text>
                <Link href="/workstation">
                  <Button type="primary" block size="small" icon={<RocketOutlined />}>
                    进入工作台
                  </Button>
                </Link>
              </Space>
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 使用模式切换 */}
      <Card title="🎯 使用模式" style={{ marginBottom: 24 }}>
        <Segmented
          block
          size="large"
          options={[
            { label: <><UserOutlined /> 个人提效</>, value: '个人提效' },
            { label: <><AppstoreOutlined /> 多项目并行</>, value: '多项目并行' },
            { label: <><RobotOutlined /> 群控托管</>, value: '群控托管', disabled: true },
          ]}
          value={workMode}
          onChange={(v) => setWorkMode(v as WorkMode)}
        />
        <Alert
          style={{ marginTop: 16 }}
          message={modeDescriptions[workMode].desc}
          type={modeDescriptions[workMode].status}
          showIcon
        />
      </Card>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card hoverable>
            <Statistic
              title="Agent 设备"
              value={devices.length}
              prefix={<DesktopOutlined />}
              suffix="台"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable>
            <Statistic
              title="在线设备"
              value={onlineCount}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
              suffix="台"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable>
            <Statistic
              title="监控窗口"
              value={onlineCount > 0 ? '-' : 0}
              prefix={<WindowsOutlined />}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable>
            <Statistic
              title="今日任务"
              value={0}
              prefix={<ThunderboltOutlined />}
              suffix="次"
            />
          </Card>
        </Col>
      </Row>

      {/* 在线设备 */}
      <Card 
        title={<Space>📱 在线设备 {demoMode && <Tag color="orange">演示模式</Tag>}</Space>}
        style={{ marginBottom: 24 }}
        extra={
          <Space>
            {devices.length === 0 && !demoMode && (
              <Button type="dashed" size="small" onClick={loadDemoData}>
                加载演示数据
              </Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={fetchDevices} loading={loading} size="small">
              刷新
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={devices}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无设备，请启动 Agent' }}
        />
      </Card>

      {/* 项目信息 */}
      <Card title="📖 关于项目">
        <Row gutter={48}>
          <Col span={8}>
            <Title level={5}>✨ 核心特性</Title>
            <ul style={{ paddingLeft: 20 }}>
              <li>🔍 智能监控 - 实时截图 + OCR</li>
              <li>🤖 AI 分析 - 自动检测错误</li>
              <li>⚡ 自动化 - 发送命令/按键</li>
              <li>📊 状态追踪 - 事件日志</li>
            </ul>
          </Col>
          <Col span={8}>
            <Title level={5}>🔧 技术栈</Title>
            <ul style={{ paddingLeft: 20 }}>
              <li>Server: Next.js 15 + React 19</li>
              <li>Agent: C# .NET 8 + Win32 API</li>
              <li>AI: OpenAI / Gemini 兼容</li>
              <li>UI: Ant Design 5</li>
            </ul>
          </Col>
          <Col span={8}>
            <Title level={5}>📋 版本规划</Title>
            <ul style={{ paddingLeft: 20 }}>
              <li>✅ v1.0 个人提效版</li>
              <li>🔜 v2.0 多项目并行版</li>
              <li>📋 v3.0 群控托管版</li>
            </ul>
            <Divider style={{ margin: '12px 0' }} />
            <Button 
              type="link" 
              icon={<GithubOutlined />} 
              href="https://github.com/onebai123/AutoWinTap"
              target="_blank"
              style={{ padding: 0 }}
            >
              GitHub: onebai123/AutoWinTap
            </Button>
          </Col>
        </Row>
      </Card>
    </div>
  )
}
