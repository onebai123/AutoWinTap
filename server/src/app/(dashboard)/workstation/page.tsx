'use client'

import { useState, useEffect } from 'react'
import { Card, Row, Col, Button, Empty, Modal, Form, Input, Select, Space, Tag, message, Typography, Alert, Spin } from 'antd'
import { PlusOutlined, DesktopOutlined, DeleteOutlined, PlayCircleOutlined, ReloadOutlined, RocketOutlined, CodeOutlined, ChromeOutlined, ConsoleSqlOutlined, ThunderboltOutlined, AppstoreOutlined } from '@ant-design/icons'
import Link from 'next/link'

const { Text } = Typography

interface Device {
  id: string
  hostname: string
  ip: string
  status: string
}

interface WindowInfo {
  handle: number
  title: string
  processName: string
}

interface WindowConfig {
  handle: number
  role: 'browser' | 'editor' | 'terminal' | 'other'
  name: string
  processName?: string   // 进程名，用于重启后匹配
  titlePattern?: string  // 标题模式，用于重启后匹配
}

interface CommandConfig {
  name: string
  target: 'terminal' | 'editor' | 'browser'
  command: string
}

interface Workstation {
  id: string
  name: string
  deviceId: string
  presetId: string | null  // 关联的窗口编排
  windows: WindowConfig[]
  commands: CommandConfig[]
  createdAt: string
  updatedAt: string
}

// 自动识别窗口类型
function detectWindowRole(processName: string, title: string): WindowConfig['role'] {
  const pn = processName.toLowerCase()
  const t = title.toLowerCase()
  
  if (pn.includes('chrome') || pn.includes('firefox') || pn.includes('edge') || pn.includes('msedge')) {
    return 'browser'
  }
  if (pn.includes('code') || pn.includes('windsurf') || pn.includes('idea') || pn.includes('studio') || pn.includes('vim') || pn.includes('notepad')) {
    return 'editor'
  }
  if (pn.includes('terminal') || pn.includes('powershell') || pn.includes('cmd') || pn.includes('wt') || pn.includes('conhost') || t.includes('命令提示符')) {
    return 'terminal'
  }
  return 'other'
}

// 获取角色图标
function getRoleIcon(role: string) {
  switch (role) {
    case 'browser': return <ChromeOutlined style={{ color: '#4285f4' }} />
    case 'editor': return <CodeOutlined style={{ color: '#007acc' }} />
    case 'terminal': return <ConsoleSqlOutlined style={{ color: '#4d4d4d' }} />
    default: return <DesktopOutlined />
  }
}

// 预设命令模板
const defaultCommands: CommandConfig[] = [
  { name: '编译', target: 'terminal', command: 'npm run build{Enter}' },
  { name: '启动', target: 'terminal', command: 'npm run dev{Enter}' },
  { name: '测试', target: 'terminal', command: 'npm test{Enter}' },
  { name: '刷新', target: 'browser', command: '{F5}' },
  { name: '保存', target: 'editor', command: '^s' },
  { name: '格式化', target: 'editor', command: '+!f' },
]

// 预设类型
interface Preset {
  id: string
  name: string
  hotkey?: string
  deviceId: string
  windows: { handle: number; title: string; processName: string }[]
}

export default function WorkstationListPage() {
  const [workstations, setWorkstations] = useState<Workstation[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  
  // 选择预设
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  
  // 切换弹窗
  const [switchModalOpen, setSwitchModalOpen] = useState(false)
  const [switchingWs, setSwitchingWs] = useState<Workstation | null>(null)
  const [switchPresetId, setSwitchPresetId] = useState<string>('')

  // 加载工作台列表
  const loadWorkstations = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/workstation')
      const data = await res.json()
      if (data.success) {
        setWorkstations(data.data)
      }
    } catch {}
    setLoading(false)
  }

  // 加载设备列表
  const loadDevices = async () => {
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      if (data.success) {
        setDevices(data.data)
      }
    } catch {}
  }

  // 加载预设列表
  const loadPresets = async () => {
    try {
      const res = await fetch('/api/presets')
      const data = await res.json()
      if (data.success) {
        setPresets(data.data)
      }
    } catch {}
  }

  useEffect(() => {
    loadWorkstations()
    loadDevices()
    loadPresets()
  }, [])

  // 设备变更时过滤预设
  const devicePresets = selectedDevice 
    ? presets.filter(p => p.deviceId === selectedDevice)
    : presets

  // 从预设创建工作台
  const handleCreateFromPreset = async () => {
    const name = form.getFieldValue('name')
    if (!name || !selectedPreset) {
      message.warning('请填写名称并选择预设')
      return
    }
    
    const preset = presets.find(p => p.id === selectedPreset)
    if (!preset) {
      message.error('预设不存在')
      return
    }
    
    // 从预设构建窗口配置
    const windows: WindowConfig[] = preset.windows.map(w => ({
      handle: w.handle,
      name: w.title,
      role: detectWindowRole(w.processName, w.title),
      processName: w.processName,
      titlePattern: w.title,
    }))
    
    try {
      const res = await fetch('/api/workstation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          deviceId: preset.deviceId,
          presetId: preset.id,  // 关联预设，切换时使用
          windows,
          commands: defaultCommands,
        }),
      })
      const data = await res.json()
      if (data.success) {
        message.success('✓ 工作台已创建')
        setModalOpen(false)
        resetForm()
        loadWorkstations()
      } else {
        message.error(data.error)
      }
    } catch {
      message.error('创建失败')
    }
  }

  // 重置表单
  const resetForm = () => {
    form.resetFields()
    setSelectedDevice('')
    setSelectedPreset('')
  }

  // 删除工作台
  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个工作台吗？',
      onOk: async () => {
        try {
          const res = await fetch(`/api/workstation/${id}`, { method: 'DELETE' })
          const data = await res.json()
          if (data.success) {
            message.success('已删除')
            loadWorkstations()
          }
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  // 切换工作台
  const handleSwitch = (ws: Workstation) => {
    // 如果有关联的预设，直接切换
    const preset = ws.presetId ? presets.find(p => p.id === ws.presetId) : null
    if (preset) {
      doSwitch(ws, preset)
    } else {
      // 没有关联预设，弹窗让用户选择
      setSwitchingWs(ws)
      setSwitchPresetId('')
      setSwitchModalOpen(true)
    }
  }

  // 执行切换
  const doSwitch = async (ws: Workstation, preset: Preset) => {
    const device = devices.find(d => d.id === ws.deviceId)
    if (!device || device.status !== 'ONLINE') {
      message.error('设备不在线')
      return
    }
    
    const handles = preset.windows.map(w => w.handle)
    try {
      const res = await fetch(`/api/agents/${ws.deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plugin: 'window-control',
          action: 'switch-preset',
          params: { handles }
        }),
      })
      const data = await res.json()
      if (data.success) {
        message.success(`✓ 已切换到「${ws.name}」`)
        setSwitchModalOpen(false)
      } else {
        message.error(data.error || '切换失败')
      }
    } catch {
      message.error('切换失败')
    }
  }

  // 确认切换
  const handleSwitchConfirm = () => {
    if (!switchingWs || !switchPresetId) {
      message.warning('请选择窗口编排')
      return
    }
    const preset = presets.find(p => p.id === switchPresetId)
    if (preset) {
      doSwitch(switchingWs, preset)
    }
  }

  // 获取设备名称
  const getDeviceName = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId)
    return device ? `${device.hostname} (${device.ip})` : deviceId
  }

  // 获取关联预设名称
  const getPresetName = (presetId: string | null) => {
    if (!presetId) return null
    const preset = presets.find(p => p.id === presetId)
    return preset?.name || null
  }

  if (loading) {
    return <Card><Spin tip="加载中..." /></Card>
  }

  return (
    <div>
      <Card
        title={<><DesktopOutlined /> 工作台</>}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadWorkstations}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              新建工作台
            </Button>
          </Space>
        }
      >
        {workstations.length === 0 ? (
          <Empty description="暂无工作台，点击「新建工作台」创建">
            <Button type="primary" onClick={() => setModalOpen(true)}>新建工作台</Button>
          </Empty>
        ) : (
          <Row gutter={[16, 16]}>
            {workstations.map(ws => (
              <Col key={ws.id} xs={24} sm={12} lg={8} xl={6}>
                <Card
                  size="small"
                  hoverable
                  actions={[
                    <span key="switch" style={{ color: '#1890ff' }} onClick={(e) => { e.stopPropagation(); handleSwitch(ws) }}>
                      <Space><ThunderboltOutlined /> 切换</Space>
                    </span>,
                    <Link key="open" href={`/workstation/${ws.id}`}>
                      <Space><PlayCircleOutlined /> 进入</Space>
                    </Link>,
                    <span key="delete" style={{ color: '#ff4d4f' }} onClick={(e) => { e.stopPropagation(); handleDelete(ws.id) }}>
                      <Space><DeleteOutlined /> 删除</Space>
                    </span>,
                  ]}
                >
                  <Card.Meta
                    title={ws.name}
                    description={
                      <div>
                        <Text type="secondary">{getDeviceName(ws.deviceId)}</Text>
                        <div style={{ marginTop: 8 }}>
                          {getPresetName(ws.presetId) && (
                            <Tag color="purple" icon={<AppstoreOutlined />}>{getPresetName(ws.presetId)}</Tag>
                          )}
                          <Tag color="blue">{(ws.windows as WindowConfig[]).length} 窗口</Tag>
                          <Tag color="green">{(ws.commands as CommandConfig[]).length} 命令</Tag>
                        </div>
                      </div>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      {/* 从预设创建工作台弹窗 */}
      <Modal
        title={<><RocketOutlined /> 从预设创建工作台</>}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); resetForm() }}
        width={500}
        footer={[
          <Button key="cancel" onClick={() => { setModalOpen(false); resetForm() }}>取消</Button>,
          <Button 
            key="create" 
            type="primary" 
            icon={<RocketOutlined />}
            onClick={handleCreateFromPreset}
            disabled={!selectedPreset}
          >
            创建工作台
          </Button>,
        ]}
      >
        <Alert 
          message="选择已有的窗口预设，快速创建工作台" 
          type="info" 
          showIcon 
          style={{ marginBottom: 16 }}
        />
        
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="工作台名称" rules={[{ required: true }]}>
            <Input placeholder="如：前端开发、后端调试" />
          </Form.Item>
          
          <Form.Item label="筛选设备（可选）">
            <Select
              placeholder="全部设备"
              allowClear
              value={selectedDevice || undefined}
              onChange={(v) => { setSelectedDevice(v || ''); setSelectedPreset('') }}
              options={devices.filter(d => d.status === 'ONLINE').map(d => ({
                label: `${d.hostname} (${d.ip})`,
                value: d.id,
              }))}
            />
          </Form.Item>
          
          <Form.Item label="选择预设" required>
            <Select
              placeholder="选择窗口预设"
              value={selectedPreset || undefined}
              onChange={setSelectedPreset}
              options={devicePresets.map(p => ({
                label: `${p.name} (${p.windows.length} 窗口)`,
                value: p.id,
              }))}
            />
          </Form.Item>
          
          {selectedPreset && (
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
              <Text strong>预设窗口：</Text>
              <div style={{ marginTop: 8 }}>
                {presets.find(p => p.id === selectedPreset)?.windows.map(w => (
                  <Tag key={w.handle} style={{ marginBottom: 4 }}>
                    {getRoleIcon(detectWindowRole(w.processName, w.title))} {w.title.substring(0, 25)}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </Form>
        
        {presets.length === 0 && (
          <Alert
            message="暂无预设"
            description={<>请先在 <Link href="/presets">预设管理</Link> 页面创建窗口预设</>}
            type="warning"
            showIcon
          />
        )}
      </Modal>

      {/* 切换窗口编排弹窗 */}
      <Modal
        title={<><ThunderboltOutlined /> 选择窗口编排</>}
        open={switchModalOpen}
        onCancel={() => setSwitchModalOpen(false)}
        onOk={handleSwitchConfirm}
        okText="切换"
        width={400}
      >
        <Alert 
          message={`为「${switchingWs?.name}」选择要切换的窗口编排`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Select
          placeholder="选择窗口编排"
          value={switchPresetId || undefined}
          onChange={setSwitchPresetId}
          style={{ width: '100%' }}
          options={presets.map(p => ({
            label: `${p.name} (${p.windows.length} 窗口)${p.hotkey ? ` [${p.hotkey}]` : ''}`,
            value: p.id,
          }))}
        />
      </Modal>
    </div>
  )
}
