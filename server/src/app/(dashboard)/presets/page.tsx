'use client'

import { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Empty, Modal, Input, Select, message, Popconfirm, Typography, Row, Col, Spin, Tooltip, Divider } from 'antd'
import { PlusOutlined, DeleteOutlined, PlayCircleOutlined, AppstoreOutlined, CheckCircleOutlined, ReloadOutlined, MinusCircleOutlined, ExpandOutlined, SearchOutlined, EyeOutlined, EyeInvisibleOutlined, LeftOutlined, RightOutlined, DesktopOutlined, BorderOuterOutlined, ColumnWidthOutlined, ColumnHeightOutlined, ThunderboltOutlined, EditOutlined } from '@ant-design/icons'
import { Checkbox } from 'antd'

const { Text } = Typography

interface WindowInfo {
  handle: number
  title: string
  processName: string
  processId: number
  bounds: { left: number; top: number; width: number; height: number }
  isMinimized?: boolean
}

interface Preset {
  id: string
  shortcut?: string
  name: string
  hotkey: string
  deviceId: string
  windows: { handle: number; title: string; processName: string }[]
  createdAt: string
}

interface Device {
  id: string
  hostname: string
  status: string
}

const HOTKEYS = ['Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5', 'Alt+6', 'Alt+7', 'Alt+8', 'Alt+9']
const AI_SHORTCUTS = ['Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5', 'Alt+6', 'Alt+7', 'Alt+8', 'Alt+9']

interface AIComboSuggestion {
  name: string
  description: string
  windows: { handle: number; title: string; processName: string }[]
  shortcut: string
  priority: number
  selected: boolean // 用户是否选中
}

// 进程颜色
const getProcessColor = (name: string) => {
  const colors: Record<string, string> = {
    chrome: '#4285F4', Windsurf: '#00D4AA', Code: '#007ACC',
    Weixin: '#07C160', explorer: '#FFB900', msedge: '#0078D4',
  }
  return colors[name] || '#666'
}

export default function PresetsPage() {
  const [presets, setPresets] = useState<Preset[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [createModal, setCreateModal] = useState(false)
  const [availableWindows, setAvailableWindows] = useState<WindowInfo[]>([])
  const [selectedWindows, setSelectedWindows] = useState<number[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [windowsLoading, setWindowsLoading] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presetHotkey, setPresetHotkey] = useState<string | undefined>()
  const [searchText, setSearchText] = useState('')
  const [showMinimized, setShowMinimized] = useState(true)
  
  // AI 组合状态
  const [aiInputModal, setAiInputModal] = useState(false)
  const [aiPreviewModal, setAiPreviewModal] = useState(false)
  const [aiPreference, setAiPreference] = useState('')
  const [aiCombos, setAiCombos] = useState<AIComboSuggestion[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)
  
  // 批量删除状态
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([])
  const [batchDeleting, setBatchDeleting] = useState(false)
  
  // 编辑组合状态（复用新建弹窗）
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  // 批量操作
  const batchActivate = async (handles: number[]) => {
    if (!selectedDevice) return
    const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: 'window-control', action: 'switch-preset', params: { handles } }),
    })
    const data = await res.json()
    if (data.success) message.success('✓ 窗口已激活')
    else message.error(data.error || '操作失败')
  }

  const batchMinimize = async (handles: number[]) => {
    if (!selectedDevice) return
    for (const handle of handles) {
      await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'minimize', params: { handle } }),
      })
    }
    message.success('✓ 窗口已最小化')
    loadWindows(selectedDevice) // 刷新状态
  }

  // 激活单个窗口（仅激活，不刷新列表，保持选择状态）
  const activateSingleWindow = async (handle: number, e: React.MouseEvent) => {
    e.stopPropagation() // 阻止触发卡片点击
    if (!selectedDevice) return
    await fetch(`/api/agents/${selectedDevice}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: 'window-control', action: 'activate', params: { handle } }),
    })
    message.success('✓ 窗口已激活')
    // 不刷新列表，保持选择状态
  }

  // 切换虚拟桌面
  const switchDesktop = async (direction: 'left' | 'right') => {
    if (!selectedDevice) return
    const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: 'window-control', action: 'switch-desktop', params: { direction } }),
    })
    const data = await res.json()
    if (data.success) message.success(`✓ 切换到${direction === 'left' ? '左' : '右'}侧桌面`)
    else message.error(data.error || '切换失败')
  }

  // 最小化/恢复所有窗口
  const minimizeAll = async () => {
    if (!selectedDevice) return
    const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: 'window-control', action: 'minimize-all' }),
    })
    const data = await res.json()
    if (data.success) {
      message.success('✓ Win+D')
      loadWindows(selectedDevice)
    }
  }

  // 平铺选中窗口
  const tileWindows = async (layout: 'grid' | 'horizontal' | 'vertical') => {
    if (!selectedDevice || selectedWindows.length === 0) {
      message.warning('请先选择窗口')
      return
    }
    const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: 'window-control', action: 'tile-windows', params: { handles: selectedWindows, layout } }),
    })
    const data = await res.json()
    if (data.success) {
      message.success(`✓ ${data.data.count} 个窗口已${layout === 'grid' ? '网格' : layout === 'horizontal' ? '水平' : '垂直'}平铺`)
      loadWindows(selectedDevice)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [presetsRes, devicesRes] = await Promise.all([
        fetch('/api/presets'), fetch('/api/agents'),
      ])
      const presetsData = await presetsRes.json()
      const devicesData = await devicesRes.json()
      if (presetsData.success) setPresets(presetsData.data)
      if (devicesData.success) setDevices(devicesData.data.filter((d: Device) => d.status === 'ONLINE'))
    } catch {}
    setLoading(false)
  }

  const loadWindows = async (deviceId: string) => {
    setWindowsLoading(true)
    try {
      const res = await fetch(`/api/agents/${deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'list' }),
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        // 包含所有窗口（包括最小化的），只过滤系统窗口
        const filtered = data.data.filter((w: WindowInfo) => 
          w.title && 
          !w.title.includes('Program Manager') && 
          !w.title.includes('Windows 输入体验') &&
          !w.title.includes('NVIDIA GeForce')
        ).map((w: WindowInfo) => ({
          ...w,
          isMinimized: w.bounds.left < -10000  // 标记最小化状态
        }))
        setAvailableWindows(filtered)
        // 默认选中非最小化的窗口
        const visible = filtered.filter((w: WindowInfo & { isMinimized: boolean }) => !w.isMinimized)
        setSelectedWindows(visible.map((w: WindowInfo) => w.handle))
        // 默认名称
        if (!presetName) {
          const names = visible.slice(0, 2).map((w: WindowInfo) => w.processName).join(' + ')
          setPresetName(names || '我的组合')
        }
      }
    } catch { message.error('获取窗口失败') }
    setWindowsLoading(false)
  }

  const openCreateModal = () => {
    setSelectedWindows([])
    setAvailableWindows([])
    setSelectedDevice(devices[0]?.id || '')
    setPresetName('')
    setPresetHotkey(undefined)
    setCreateModal(true)
    // 自动加载第一个设备的窗口
    if (devices[0]?.id) {
      setSelectedDevice(devices[0].id)
      loadWindows(devices[0].id)
    }
  }

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDevice(deviceId)
    setSelectedWindows([])
    setPresetName('')
    loadWindows(deviceId)
  }

  const toggleWindow = (handle: number) => {
    if (selectedWindows.includes(handle)) {
      setSelectedWindows(selectedWindows.filter(h => h !== handle))
    } else {
      setSelectedWindows([...selectedWindows, handle])
      // 更新默认名称
      const win = availableWindows.find(w => w.handle === handle)
      if (win && selectedWindows.length === 0) {
        setPresetName(win.processName)
      }
    }
  }

  const handleCreate = async () => {
    if (!presetName.trim()) {
      message.warning('请输入组合名称')
      return
    }
    if (selectedWindows.length === 0) {
      message.warning('请点击选择窗口')
      return
    }

    // 编辑模式：先删除旧的
    if (editingPresetId) {
      await fetch(`/api/presets/${editingPresetId}`, { method: 'DELETE' })
    }

    const windows = availableWindows
      .filter(w => selectedWindows.includes(w.handle))
      .map(w => ({ handle: w.handle, title: w.title, processName: w.processName }))

    const res = await fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: presetName,
        hotkey: presetHotkey,
        deviceId: selectedDevice,
        windows,
      }),
    })

    const data = await res.json()
    if (data.success) {
      message.success(editingPresetId ? '✓ 组合已更新' : '✓ 组合已创建')
      setCreateModal(false)
      setEditingPresetId(null)
      loadData()
    } else {
      message.error(data.error || '创建失败')
    }
  }

  const activatePreset = async (preset: Preset) => {
    const handles = preset.windows.map(w => w.handle)
    const res = await fetch(`/api/agents/${preset.deviceId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: 'window-control', action: 'switch-preset', params: { handles } }),
    })
    const data = await res.json()
    if (data.success) {
      message.success(`✓ 已切换到「${preset.name}」`)
    } else {
      message.error(data.error || '切换失败')
    }
  }

  const deletePreset = async (id: string) => {
    try {
      const res = await fetch(`/api/presets/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        message.success('已删除')
        loadData()
      } else {
        message.error(data.error || '删除失败')
      }
    } catch {
      message.error('删除请求失败')
    }
  }

  // 打开编辑弹窗（复用新建弹窗）
  const openEditModal = async (preset: Preset) => {
    // 设置编辑 ID
    setEditingPresetId(preset.id)
    // 设置设备
    setSelectedDevice(preset.deviceId)
    // 预填数据
    setPresetName(preset.name)
    setPresetHotkey(preset.hotkey || undefined)
    // 加载窗口列表并预选
    await loadWindows(preset.deviceId)
    // 预选已有的窗口 handles
    setSelectedWindows(preset.windows.map(w => w.handle))
    // 打开弹窗
    setCreateModal(true)
  }

  // 批量删除
  const batchDeletePresets = async (ids: string[]) => {
    if (ids.length === 0) return
    setBatchDeleting(true)
    let successCount = 0
    for (const id of ids) {
      try {
        const res = await fetch(`/api/presets/${id}`, { method: 'DELETE' })
        const data = await res.json()
        if (data.success) successCount++
      } catch { /* ignore */ }
    }
    setBatchDeleting(false)
    setSelectedPresetIds([])
    message.success(`已删除 ${successCount} 个组合`)
    loadData()
  }

  // 全部删除
  const deleteAllPresets = () => {
    const allIds = presets.map(p => p.id)
    batchDeletePresets(allIds)
  }

  // AI 组合 - 打开输入弹窗
  const openAIComboModal = () => {
    if (devices.length === 0) {
      message.warning('没有在线设备')
      return
    }
    setSelectedDevice(devices[0]?.id || '')
    setAiPreference('')
    setAiInputModal(true)
  }

  // AI 组合 - 生成建议
  const generateAICombos = async () => {
    if (!selectedDevice) {
      setSelectedDevice(devices[0]?.id || '')
    }
    const deviceId = selectedDevice || devices[0]?.id
    if (!deviceId) {
      message.error('请选择设备')
      return
    }

    setAiLoading(true)
    try {
      const res = await fetch('/api/presets/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, preference: aiPreference })
      })
      const data = await res.json()
      
      if (data.success && data.data?.combos) {
        const combosWithSelection = data.data.combos.map((c: Omit<AIComboSuggestion, 'selected'>) => ({ ...c, selected: true }))
        setAiCombos(combosWithSelection)
        setAiInputModal(false)
        setAiPreviewModal(true)
      } else {
        message.error(data.error || '生成失败')
      }
    } catch {
      message.error('生成失败，请重试')
    }
    setAiLoading(false)
  }

  // AI 组合 - 切换选中状态
  const toggleAIComboSelection = (index: number) => {
    setAiCombos(prev => prev.map((c, i) => i === index ? { ...c, selected: !c.selected } : c))
  }

  // AI 组合 - 修改快捷键
  const updateAIComboShortcut = (index: number, shortcut: string) => {
    setAiCombos(prev => prev.map((c, i) => i === index ? { ...c, shortcut } : c))
  }

  // AI 组合 - 编辑名称
  const updateAIComboName = (index: number, name: string) => {
    setAiCombos(prev => prev.map((c, i) => i === index ? { ...c, name } : c))
  }

  // AI 组合 - 编辑描述
  const updateAIComboDescription = (index: number, description: string) => {
    setAiCombos(prev => prev.map((c, i) => i === index ? { ...c, description } : c))
  }

  // AI 组合 - 移除窗口
  const removeWindowFromCombo = (comboIndex: number, windowIndex: number) => {
    setAiCombos(prev => prev.map((c, i) => {
      if (i !== comboIndex) return c
      const newWindows = c.windows.filter((_, wi) => wi !== windowIndex)
      return { ...c, windows: newWindows }
    }))
  }

  // AI 组合 - 保存选中的组合
  const saveAICombos = async () => {
    const selectedCombos = aiCombos.filter(c => c.selected)
    if (selectedCombos.length === 0) {
      message.warning('请至少选择一个组合')
      return
    }

    setAiSaving(true)
    try {
      const res = await fetch('/api/presets/batch-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: selectedDevice || devices[0]?.id,
          combos: selectedCombos.map(c => ({
            name: c.name,
            windows: c.windows,
            shortcut: c.shortcut
          })),
          overwrite: true
        })
      })
      const data = await res.json()
      
      if (data.success) {
        message.success(`✓ 已创建 ${data.data.count} 个组合`)
        setAiPreviewModal(false)
        setAiCombos([])
        loadData()
      } else {
        message.error(data.error || '保存失败')
      }
    } catch {
      message.error('保存失败')
    }
    setAiSaving(false)
  }

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', render: (name: string) => <Text strong>{name}</Text> },
    { title: '快捷键', dataIndex: 'hotkey', key: 'hotkey', width: 100,
      render: (h: string) => h ? <Tag color="blue">{h}</Tag> : <Text type="secondary">-</Text> },
    { title: '窗口', dataIndex: 'windows', key: 'windows',
      render: (windows: Preset['windows']) => (
        <Space size={4} wrap>
          {windows.map((w, i) => (
            <Tag key={i} color={getProcessColor(w.processName)} style={{ margin: 2 }}>{w.processName}</Tag>
          ))}
        </Space>
      )},
    { title: '操作', key: 'actions', width: 220,
      render: (_: unknown, record: Preset) => (
        <Space>
          <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => activatePreset(record)}>
            激活
          </Button>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          <Popconfirm title="确认删除？" onConfirm={() => deletePreset(record.id)} okText="删除" cancelText="取消">
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )},
  ]

  return (
    <>
      <Card
        title={<Space><AppstoreOutlined /> 窗口编排</Space>}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
            {selectedPresetIds.length > 0 && (
              <Popconfirm 
                title={`确认删除选中的 ${selectedPresetIds.length} 个组合？`} 
                onConfirm={() => batchDeletePresets(selectedPresetIds)}
                okText="删除" 
                cancelText="取消"
              >
                <Button danger loading={batchDeleting}>
                  删除选中 ({selectedPresetIds.length})
                </Button>
              </Popconfirm>
            )}
            {presets.length > 0 && (
              <Popconfirm 
                title={`确认删除全部 ${presets.length} 个组合？`} 
                onConfirm={deleteAllPresets}
                okText="全部删除" 
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button danger type="text" loading={batchDeleting}>
                  清空全部
                </Button>
              </Popconfirm>
            )}
            <Button icon={<ThunderboltOutlined />} onClick={openAIComboModal} disabled={devices.length === 0}>
              AI 组合
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal} disabled={devices.length === 0}>
              新建组合
            </Button>
          </Space>
        }
      >
        {devices.length === 0 && !loading ? (
          <Empty description="没有在线设备" />
        ) : presets.length === 0 ? (
          <Empty description={<span>点击「新建组合」选择要组合的窗口<br/><Text type="secondary">一键切换工作布局，支持快捷键</Text></span>} />
        ) : (
          <Table 
            columns={columns} 
            dataSource={presets} 
            rowKey="id" 
            loading={loading} 
            pagination={false}
            rowSelection={{
              selectedRowKeys: selectedPresetIds,
              onChange: (keys) => setSelectedPresetIds(keys as string[]),
            }}
          />
        )}
      </Card>

      {/* 快捷操作栏 */}
      {devices.length > 0 && (
        <Card size="small" style={{ marginTop: 16 }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Space split={<Divider type="vertical" />}>
                <Space>
                  <Text strong><DesktopOutlined /> 虚拟桌面</Text>
                  <Tooltip title="切换到左侧桌面 (Win+Ctrl+←)">
                    <Button icon={<LeftOutlined />} onClick={() => switchDesktop('left')}>左</Button>
                  </Tooltip>
                  <Tooltip title="切换到右侧桌面 (Win+Ctrl+→)">
                    <Button icon={<RightOutlined />} onClick={() => switchDesktop('right')}>右</Button>
                  </Tooltip>
                </Space>
                <Tooltip title="显示桌面 / 恢复 (Win+D)">
                  <Button icon={<DesktopOutlined />} onClick={minimizeAll}>显示桌面</Button>
                </Tooltip>
              </Space>
            </Col>
            <Col>
              <Space>
                <Text type="secondary">选中 {selectedWindows.length} 个窗口后平铺:</Text>
                <Tooltip title="网格平铺">
                  <Button icon={<BorderOuterOutlined />} onClick={() => tileWindows('grid')} disabled={selectedWindows.length === 0}>网格</Button>
                </Tooltip>
                <Tooltip title="水平平铺">
                  <Button icon={<ColumnWidthOutlined />} onClick={() => tileWindows('horizontal')} disabled={selectedWindows.length === 0}>水平</Button>
                </Tooltip>
                <Tooltip title="垂直平铺">
                  <Button icon={<ColumnHeightOutlined />} onClick={() => tileWindows('vertical')} disabled={selectedWindows.length === 0}>垂直</Button>
                </Tooltip>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      {/* 创建/编辑组合 - 卡片点选 */}
      <Modal
        title={editingPresetId ? "编辑窗口组合" : "新建窗口组合"}
        open={createModal}
        onCancel={() => { setCreateModal(false); setEditingPresetId(null) }}
        onOk={handleCreate}
        okText={editingPresetId ? `保存 (${selectedWindows.length}个窗口)` : `创建 (${selectedWindows.length}个窗口)`}
        okButtonProps={{ disabled: selectedWindows.length === 0 }}
        width={800}
        styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
      >
        {/* 基本信息 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <Text type="secondary">组合名称</Text>
            <Input 
              value={presetName} 
              onChange={e => setPresetName(e.target.value)}
              placeholder="自动生成或手动输入"
              size="large"
              style={{ marginTop: 4 }}
            />
          </Col>
          <Col span={8}>
            <Text type="secondary">快捷键（可选）</Text>
            <Select 
              value={presetHotkey} 
              onChange={setPresetHotkey}
              placeholder="选择快捷键"
              allowClear
              style={{ width: '100%', marginTop: 4 }}
              size="large"
            >
              {HOTKEYS.map(k => <Select.Option key={k} value={k}>{k}</Select.Option>)}
            </Select>
          </Col>
          <Col span={4}>
            <Text type="secondary">设备</Text>
            <Select 
              value={selectedDevice} 
              onChange={handleDeviceChange}
              style={{ width: '100%', marginTop: 4 }}
              size="large"
            >
              {devices.map(d => <Select.Option key={d.id} value={d.id}>{d.hostname}</Select.Option>)}
            </Select>
          </Col>
        </Row>

        <Divider style={{ margin: '12px 0' }} />

        {/* 工具栏 */}
        <Row gutter={8} style={{ marginBottom: 12 }} align="middle">
          <Col flex="auto">
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索窗口..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col>
            <Tooltip title={showMinimized ? '隐藏最小化窗口' : '显示最小化窗口'}>
              <Button 
                icon={showMinimized ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                onClick={() => setShowMinimized(!showMinimized)}
              />
            </Tooltip>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={() => loadWindows(selectedDevice)}>刷新</Button>
          </Col>
        </Row>

        {/* 批量操作 */}
        <Row gutter={8} style={{ marginBottom: 12 }}>
          <Col>
            <Text type="secondary">已选 {selectedWindows.length} 个窗口</Text>
          </Col>
          <Col>
            <Button size="small" type="link" onClick={() => setSelectedWindows(availableWindows.map(w => w.handle))}>全选</Button>
          </Col>
          <Col>
            <Button size="small" type="link" onClick={() => {
              const visible = availableWindows.filter(w => !w.isMinimized)
              setSelectedWindows(visible.map(w => w.handle))
            }}>选可见</Button>
          </Col>
          <Col>
            <Button size="small" type="link" onClick={() => setSelectedWindows([])}>清空</Button>
          </Col>
          <Col flex="auto" />
          <Col>
            <Tooltip title="激活选中的窗口">
              <Button 
                size="small" 
                icon={<ExpandOutlined />} 
                disabled={selectedWindows.length === 0}
                onClick={() => batchActivate(selectedWindows)}
              >
                全部激活
              </Button>
            </Tooltip>
          </Col>
          <Col>
            <Tooltip title="最小化选中的窗口">
              <Button 
                size="small" 
                icon={<MinusCircleOutlined />} 
                disabled={selectedWindows.length === 0}
                onClick={() => batchMinimize(selectedWindows)}
              >
                全部最小化
              </Button>
            </Tooltip>
          </Col>
        </Row>

        {/* 窗口卡片 */}
        {windowsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="加载窗口中..." /></div>
        ) : (
          <Row gutter={[8, 8]}>
            {availableWindows
              .filter(w => {
                if (!showMinimized && w.isMinimized) return false
                if (searchText && !w.title.toLowerCase().includes(searchText.toLowerCase()) && 
                    !w.processName.toLowerCase().includes(searchText.toLowerCase())) return false
                return true
              })
              .sort((a, b) => a.processName.localeCompare(b.processName)) // 按进程名排序，同类放一起
              .map(win => {
                const selected = selectedWindows.includes(win.handle)
                return (
                  <Col span={12} key={win.handle}>
                    <Card
                      size="small"
                      hoverable
                      onClick={() => toggleWindow(win.handle)}
                      style={{
                        border: selected ? '2px solid #1890ff' : '1px solid #d9d9d9',
                        background: selected ? '#e6f7ff' : win.isMinimized ? '#fafafa' : '#fff',
                        cursor: 'pointer',
                        opacity: win.isMinimized ? 0.7 : 1,
                      }}
                    >
                      <Row justify="space-between" align="middle" style={{ width: '100%' }}>
                        <Col>
                          <Space size="small" style={{ flexWrap: 'nowrap' }}>
                            {selected && <CheckCircleOutlined style={{ color: '#1890ff' }} />}
                            {win.isMinimized && <Tag color="orange">最小化</Tag>}
                            <Tag color={getProcessColor(win.processName)}>{win.processName}</Tag>
                            <Text ellipsis style={{ maxWidth: 150, display: 'inline-block' }} title={win.title}>{win.title}</Text>
                          </Space>
                        </Col>
                        <Col>
                          <Tooltip title="激活此窗口（置顶）">
                            <Button 
                              type="primary" 
                              size="small" 
                              icon={<ExpandOutlined />}
                              onClick={(e) => activateSingleWindow(win.handle, e)}
                            >
                              激活
                            </Button>
                          </Tooltip>
                        </Col>
                      </Row>
                    </Card>
                  </Col>
                )
              })}
          </Row>
        )}
      </Modal>

      {/* AI 组合 - 输入偏好 */}
      <Modal
        title={<Space><ThunderboltOutlined /> AI 智能组合</Space>}
        open={aiInputModal}
        onCancel={() => setAiInputModal(false)}
        onOk={generateAICombos}
        okText="生成组合"
        okButtonProps={{ loading: aiLoading }}
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">选择设备</Text>
          <Select 
            value={selectedDevice} 
            onChange={setSelectedDevice}
            style={{ width: '100%', marginTop: 4 }}
            size="large"
          >
            {devices.map(d => <Select.Option key={d.id} value={d.id}>{d.hostname}</Select.Option>)}
          </Select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">输入你的工作重点（可选）</Text>
          <Input.TextArea
            value={aiPreference}
            onChange={e => setAiPreference(e.target.value)}
            placeholder="例如：前端开发、Python 项目、文档编写..."
            rows={3}
            style={{ marginTop: 4 }}
          />
        </div>
        <Text type="secondary">
          💡 留空将自动分析当前窗口，优先生成开发相关的组合
        </Text>
      </Modal>

      {/* AI 组合 - 预览确认 */}
      <Modal
        title={<Space><ThunderboltOutlined /> AI 生成的组合</Space>}
        open={aiPreviewModal}
        onCancel={() => setAiPreviewModal(false)}
        onOk={saveAICombos}
        okText={`应用选中的组合 (${aiCombos.filter(c => c.selected).length})`}
        okButtonProps={{ loading: aiSaving, disabled: aiCombos.filter(c => c.selected).length === 0 }}
        cancelText="取消"
        width={700}
      >
        {aiCombos.length === 0 ? (
          <Empty description="没有生成组合建议" />
        ) : (
          <div>
            {aiCombos.map((combo, index) => (
              <Card 
                key={index} 
                size="small" 
                style={{ 
                  marginBottom: 12, 
                  opacity: combo.selected ? 1 : 0.5,
                  border: combo.selected ? '1px solid #1890ff' : '1px solid #d9d9d9'
                }}
              >
                <Row align="middle" gutter={12}>
                  <Col>
                    <Checkbox 
                      checked={combo.selected} 
                      onChange={() => toggleAIComboSelection(index)}
                    />
                  </Col>
                  <Col flex="auto">
                    <div style={{ marginBottom: 4 }}>
                      <Input
                        value={combo.name}
                        onChange={e => updateAIComboName(index, e.target.value)}
                        style={{ width: 150, marginRight: 8 }}
                        size="small"
                        placeholder="组合名称"
                      />
                      <Input
                        value={combo.description}
                        onChange={e => updateAIComboDescription(index, e.target.value)}
                        style={{ width: 200 }}
                        size="small"
                        placeholder="描述（可选）"
                      />
                    </div>
                    <Space size={4} wrap>
                      {combo.windows.map((w, i) => (
                        <Tag 
                          key={i} 
                          color={getProcessColor(w.processName)}
                          closable
                          onClose={() => removeWindowFromCombo(index, i)}
                        >
                          {w.processName}: {w.title.slice(0, 20)}
                        </Tag>
                      ))}
                    </Space>
                  </Col>
                  <Col>
                    <Text type="secondary">快捷键：</Text>
                    <Select
                      value={combo.shortcut}
                      onChange={(v) => updateAIComboShortcut(index, v)}
                      style={{ width: 100 }}
                      size="small"
                      allowClear
                      placeholder="无"
                    >
                      {AI_SHORTCUTS.map(k => (
                        <Select.Option key={k} value={k} disabled={aiCombos.some((c, i) => i !== index && c.shortcut === k)}>
                          {k}
                        </Select.Option>
                      ))}
                    </Select>
                  </Col>
                </Row>
              </Card>
            ))}
            <div style={{ marginTop: 16, padding: 12, background: '#fffbe6', borderRadius: 4 }}>
              <Text type="warning">⚠️ 确认后将覆盖已有的相同快捷键配置</Text>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
