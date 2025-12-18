'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Tabs, Button, Space, Tag, Empty, message, Typography, Input, Select, Row, Col, Table, Modal, Tooltip, Statistic, Divider, List, Popconfirm, Form, InputNumber } from 'antd'
import { SendOutlined, SaveOutlined, PlayCircleOutlined, StopOutlined, CopyOutlined, ReloadOutlined, CameraOutlined, AimOutlined, PlusOutlined, DeleteOutlined, EditOutlined, ThunderboltOutlined, HistoryOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons'

const { Text, Title } = Typography
const { TextArea } = Input

interface Device {
  id: string
  hostname: string
  status: string
}

interface Location {
  id: string
  name: string
  x: number
  y: number
  target: string
  description?: string
}

interface Preset {
  id: string
  name: string
  category: string
  icon?: string
  steps: Array<{ action: string; [key: string]: unknown }>
  variables?: Record<string, string>
  description?: string
  isBuiltin?: boolean
  usageCount?: number
}

interface ExecutionLog {
  id: string
  presetName?: string
  success: boolean
  duration: number
  createdAt: string
  error?: string
}

export default function IdePage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [locations, setLocations] = useState<Location[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [loading, setLoading] = useState(false)
  const [taskInput, setTaskInput] = useState('')
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [locationModal, setLocationModal] = useState(false)
  const [newLocation, setNewLocation] = useState({ name: '', description: '' })
  const [executing, setExecuting] = useState(false)
  const [aiInput, setAiInput] = useState('')

  // 加载设备
  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setDevices(data.data)
          const online = data.data.find((d: Device) => d.status === 'ONLINE')
          if (online) setSelectedDevice(online.id)
        }
      })
  }, [])

  // 加载数据
  const loadData = useCallback(async () => {
    if (!selectedDevice) return
    setLoading(true)
    
    try {
      const [locRes, presetRes] = await Promise.all([
        fetch('/api/ide/locations'),
        fetch('/api/ide/presets'),
      ])
      
      const locData = await locRes.json()
      const presetData = await presetRes.json()
      
      if (locData.success) setLocations(locData.data)
      if (presetData.success) setPresets(presetData.data)
    } catch (e) {
      console.error(e)
    }
    
    setLoading(false)
  }, [selectedDevice])

  useEffect(() => { loadData() }, [loadData])

  // 获取鼠标位置
  const getMousePosition = async () => {
    if (!selectedDevice) return
    try {
      const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'windsurf', action: 'get-mouse-position', params: {} }),
      })
      const data = await res.json()
      if (data.success && data.data) {
        setMousePosition({ x: data.data.x, y: data.data.y })
        message.success(`当前位置: (${data.data.x}, ${data.data.y})`)
      }
    } catch {
      message.error('获取失败')
    }
  }

  // 保存定位点
  const saveLocation = async () => {
    if (!mousePosition || !newLocation.name) {
      message.error('请先获取坐标并输入名称')
      return
    }
    
    try {
      const res = await fetch('/api/ide/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newLocation.name,
          x: mousePosition.x,
          y: mousePosition.y,
          target: 'windsurf',
          description: newLocation.description,
        }),
      })
      const data = await res.json()
      if (data.success) {
        message.success('定位点已保存')
        setLocationModal(false)
        setNewLocation({ name: '', description: '' })
        loadData()
      }
    } catch {
      message.error('保存失败')
    }
  }

  // 删除定位点
  const deleteLocation = async (id: string) => {
    try {
      await fetch(`/api/ide/locations?id=${id}`, { method: 'DELETE' })
      message.success('已删除')
      loadData()
    } catch {
      message.error('删除失败')
    }
  }

  // 执行预设
  const executePreset = async (presetId: string, variables?: Record<string, string>) => {
    if (!selectedDevice) {
      message.error('请先选择设备')
      return
    }
    
    setExecuting(true)
    try {
      const res = await fetch('/api/ide/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: selectedDevice, presetId, variables }),
      })
      const data = await res.json()
      if (data.success) {
        message.success(`执行成功 (${data.duration}ms)`)
      } else {
        message.error(data.error || '执行失败')
      }
    } catch {
      message.error('执行失败')
    }
    setExecuting(false)
  }

  // 发送任务
  const sendTask = async () => {
    if (!taskInput.trim()) {
      message.error('请输入任务内容')
      return
    }
    await executePreset('builtin-send-task', { task: taskInput })
    setTaskInput('')
  }

  // 快捷操作
  const quickActions = [
    { id: 'builtin-save', name: '保存', icon: <SaveOutlined />, color: '#1890ff' },
    { id: 'builtin-run', name: '运行', icon: <PlayCircleOutlined />, color: '#52c41a' },
    { id: 'builtin-stop', name: '停止', icon: <StopOutlined />, color: '#ff4d4f' },
    { id: 'builtin-copy-all', name: '全选复制', icon: <CopyOutlined />, color: '#722ed1' },
    { id: 'builtin-terminal', name: '终端', icon: <ThunderboltOutlined />, color: '#fa8c16' },
    { id: 'builtin-format', name: '格式化', icon: <SettingOutlined />, color: '#13c2c2' },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Title level={4} style={{ margin: 0 }}>🤖 IDE 自动化控制</Title>
        </Col>
        <Col>
          <Space>
            <Text type="secondary">设备:</Text>
            <Select
              value={selectedDevice}
              onChange={setSelectedDevice}
              style={{ width: 200 }}
              options={devices.map(d => ({
                value: d.id,
                label: <Space><Tag color={d.status === 'ONLINE' ? 'green' : 'default'}>{d.status}</Tag>{d.hostname}</Space>
              }))}
            />
            <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* 左侧：快捷操作 + 发送任务 */}
        <Col span={16}>
          <Card title="⚡ 快捷操作" size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {quickActions.map(action => (
                <Tooltip key={action.id} title={action.name}>
                  <Button
                    icon={action.icon}
                    style={{ borderColor: action.color, color: action.color }}
                    onClick={() => executePreset(action.id)}
                    loading={executing}
                  >
                    {action.name}
                  </Button>
                </Tooltip>
              ))}
            </Space>
          </Card>

          <Card title="📤 发送任务到 Windsurf" size="small" style={{ marginBottom: 16 }}>
            <Space.Compact style={{ width: '100%' }}>
              <TextArea
                placeholder="输入要发送给 AI 的任务..."
                value={taskInput}
                onChange={e => setTaskInput(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 4 }}
                style={{ flex: 1 }}
                onPressEnter={e => { if (e.ctrlKey) sendTask() }}
              />
            </Space.Compact>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary">Ctrl+Enter 发送</Text>
              <Button type="primary" icon={<SendOutlined />} onClick={sendTask} loading={executing}>
                发送任务
              </Button>
            </div>
          </Card>

          <Card title="🎯 定位点管理" size="small" extra={
            <Space>
              <Button icon={<AimOutlined />} onClick={getMousePosition}>获取鼠标位置</Button>
              <Button icon={<PlusOutlined />} onClick={() => setLocationModal(true)} disabled={!mousePosition}>
                保存定位点
              </Button>
            </Space>
          }>
            {mousePosition && (
              <div style={{ marginBottom: 12 }}>
                <Tag color="blue">当前位置: X={mousePosition.x}, Y={mousePosition.y}</Tag>
              </div>
            )}
            <Table
              size="small"
              dataSource={locations}
              rowKey="id"
              pagination={false}
              columns={[
                { title: '名称', dataIndex: 'name', width: 120, render: (name: string) => <Tag color="purple">{name}</Tag> },
                { title: '坐标', width: 120, render: (_: unknown, r: Location) => <Text code>({r.x}, {r.y})</Text> },
                { title: '描述', dataIndex: 'description', ellipsis: true },
                { title: '操作', width: 80, render: (_: unknown, r: Location) => (
                  <Popconfirm title="确定删除?" onConfirm={() => deleteLocation(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )},
              ]}
            />
          </Card>
        </Col>

        {/* 右侧：预设库 */}
        <Col span={8}>
          <Card title="📦 预设模板库" size="small">
            <List
              size="small"
              dataSource={presets}
              renderItem={preset => (
                <List.Item
                  actions={[
                    <Button 
                      key="run" 
                      type="link" 
                      size="small"
                      icon={<PlayCircleOutlined />}
                      onClick={() => executePreset(preset.id)}
                      loading={executing}
                    >
                      执行
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<span style={{ fontSize: 20 }}>{preset.icon || '📋'}</span>}
                    title={
                      <Space>
                        {preset.name}
                        {preset.isBuiltin && <Tag color="blue">内置</Tag>}
                      </Space>
                    }
                    description={preset.description || `${preset.steps?.length || 0} 个步骤`}
                  />
                </List.Item>
              )}
            />
          </Card>

          <Card title="🤖 AI 自然语言" size="small" style={{ marginTop: 16 }}>
            <TextArea
              placeholder="用自然语言描述你想做什么...&#10;例如: 帮我保存文件并运行调试"
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              autoSize={{ minRows: 3, maxRows: 5 }}
            />
            <Button 
              type="primary" 
              icon={<RobotOutlined />} 
              style={{ marginTop: 8, width: '100%' }}
              disabled={!aiInput.trim()}
            >
              AI 规划并执行
            </Button>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              AI 将理解你的意图并自动规划操作步骤
            </Text>
          </Card>
        </Col>
      </Row>

      {/* 保存定位点弹窗 */}
      <Modal
        title="保存定位点"
        open={locationModal}
        onOk={saveLocation}
        onCancel={() => setLocationModal(false)}
      >
        {mousePosition && (
          <div style={{ marginBottom: 16 }}>
            <Tag color="blue" style={{ fontSize: 14 }}>坐标: X={mousePosition.x}, Y={mousePosition.y}</Tag>
          </div>
        )}
        <Form layout="vertical">
          <Form.Item label="名称" required>
            <Input 
              placeholder="例如: input-box"
              value={newLocation.name}
              onChange={e => setNewLocation({ ...newLocation, name: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="描述">
            <Input 
              placeholder="例如: Cascade 输入框"
              value={newLocation.description}
              onChange={e => setNewLocation({ ...newLocation, description: e.target.value })}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
