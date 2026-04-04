'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Card,
  Row,
  Col,
  Button,
  Space,
  Tag,
  Descriptions,
  Collapse,
  Input,
  Modal,
  message,
  Spin,
  Image,
  List,
  Typography,
  Select,
  Radio,
  Checkbox,
} from 'antd'
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  CameraOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  KeyOutlined,
  AimOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  FileTextOutlined,
  RobotOutlined,
  SendOutlined,
  SettingOutlined,
  ApiOutlined,
  DeleteOutlined,
  LinkOutlined,
  CodeOutlined,
  DesktopOutlined,
  ChromeOutlined,
} from '@ant-design/icons'
import Link from 'next/link'
import type { Device } from '@/types'

const { TextArea } = Input
const { Text } = Typography

interface LogEntry {
  time: string
  level: 'info' | 'success' | 'error'
  message: string
}

interface PluginAction {
  name: string
  description: string
  params?: { name: string; type: string; required?: boolean }[]
}

const pluginActions: Record<string, PluginAction[]> = {
  'window-control': [
    { name: 'list', description: '窗口列表' },
    { name: 'list-processes', description: '进程列表' },
    { name: 'activate', description: '激活窗口', params: [{ name: 'handle', type: 'number', required: true }] },
    { name: 'minimize', description: '最小化', params: [{ name: 'handle', type: 'number', required: true }] },
    { name: 'maximize', description: '最大化', params: [{ name: 'handle', type: 'number', required: true }] },
    { name: 'capture-screen', description: '屏幕截图' },
    { name: 'capture', description: '窗口截图', params: [{ name: 'handle', type: 'number', required: true }] },
    { name: 'send-keys', description: '发送按键', params: [{ name: 'keys', type: 'string', required: true }] },
    { name: 'mouse-click', description: '鼠标点击', params: [{ name: 'x', type: 'number', required: true }, { name: 'y', type: 'number', required: true }] },
    { name: 'list-ports', description: '端口列表' },
    { name: 'kill-by-port', description: '杀死端口进程', params: [{ name: 'port', type: 'number', required: true }] },
    { name: 'open-url', description: '打开URL', params: [{ name: 'url', type: 'string', required: true }] },
  ],
  'shell': [
    { name: 'execute', description: '执行命令', params: [
      { name: 'command', type: 'string', required: true },
      { name: 'shell', type: 'string', required: false },
      { name: 'cwd', type: 'string', required: false },
      { name: 'timeout', type: 'number', required: false },
    ]},
  ],
  'browser-debug': [
    { name: 'get-pages', description: 'Chrome页面列表' },
    { name: 'connect', description: '连接页面', params: [{ name: 'pageId', type: 'string', required: true }] },
    { name: 'execute-script', description: '执行JS', params: [{ name: 'script', type: 'string', required: true }, { name: 'pageId', type: 'string', required: true }] },
    { name: 'get-console', description: '控制台日志', params: [{ name: 'pageId', type: 'string', required: true }] },
    { name: 'get-network', description: '网络请求', params: [{ name: 'pageId', type: 'string', required: true }] },
  ],
  'windsurf': [
    { name: 'is-running', description: '检查运行状态' },
    { name: 'get-status', description: '获取窗口状态' },
    { name: 'type-text', description: '输入文本', params: [{ name: 'text', type: 'string', required: true }] },
    { name: 'send-key', description: '发送按键', params: [{ name: 'key', type: 'string', required: true }] },
    { name: 'click', description: '点击位置', params: [{ name: 'x', type: 'number', required: true }, { name: 'y', type: 'number', required: true }] },
  ],
}

export default function ControlPanelPage() {
  const params = useParams()
  const router = useRouter()
  const deviceId = params.deviceId as string

  const [device, setDevice] = useState<Device | null>(null)
  const [loading, setLoading] = useState(true)
  const [screenData, setScreenData] = useState<string | null>(null)
  const [screenLoading, setScreenLoading] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [executing, setExecuting] = useState(false)
  const [actionModal, setActionModal] = useState<{ plugin: string; action: PluginAction } | null>(null)
  const [actionParams, setActionParams] = useState<Record<string, string>>({})
  const [resultModal, setResultModal] = useState<{ title: string; data: unknown } | null>(null)
  
  // AI 功能状态
  const [ocrText, setOcrText] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [aiResult, setAiResult] = useState<{ status: string; problems: string[]; suggestions: string[] } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  
  // 窗口选择状态
  const [windowList, setWindowList] = useState<{ handle: number; title: string; processName: string }[]>([])
  const [selectedWindow, setSelectedWindow] = useState<number | null>(null)
  const [captureMode, setCaptureMode] = useState<'screen' | 'window'>('screen')
  
  // Shell 状态
  const [shellCommand, setShellCommand] = useState('')
  const [shellType, setShellType] = useState<'cmd' | 'powershell'>('cmd')
  const [shellCwd, setShellCwd] = useState('')
  const [shellOutput, setShellOutput] = useState('')
  const [shellLoading, setShellLoading] = useState(false)
  const [autoEnter, setAutoEnter] = useState(true)
  const [ideMode, setIdeMode] = useState(true)

  const addLog = useCallback((level: LogEntry['level'], msg: string) => {
    const time = new Date().toLocaleTimeString('zh-CN')
    setLogs(prev => [{ time, level, message: msg }, ...prev].slice(0, 100))
  }, [])

  const fetchDevice = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${deviceId}`)
      const data = await res.json()
      if (data.success) {
        setDevice(data.data)
      } else {
        message.error('设备不存在')
        router.push('/devices')
      }
    } catch {
      message.error('获取设备信息失败')
    } finally {
      setLoading(false)
    }
  }, [deviceId, router])

  const fetchScreen = useCallback(async () => {
    if (!device || device.status !== 'ONLINE') return
    setScreenLoading(true)

    try {
      // 检查是否启用了窗口隔离模式
      if (captureMode === 'window' && selectedWindow) {
        const res = await fetch(`/api/agents/${deviceId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plugin: 'window-control', action: 'capture', params: { handle: selectedWindow } }),
        })
        const data = await res.json()
        if (data.success && data.data?.image) {
          setScreenData(data.data.image)
        }
      } else {
        // 走常规的全屏画面流
        const res = await fetch(`/api/screen/${deviceId}`)
        const data = await res.json()
        if (data.success && data.data) {
          setScreenData(data.data)
        }
      }
    } catch {
      // ignore
    } finally {
      setScreenLoading(false)
    }
  }, [deviceId, device, captureMode, selectedWindow])

  useEffect(() => {
    fetchDevice()
  }, [fetchDevice])

  useEffect(() => {
    if (device?.status === 'ONLINE') {
      fetchScreen()
      const interval = setInterval(fetchScreen, 5000)
      return () => clearInterval(interval)
    }
  }, [device, fetchScreen])

  const executeAction = async (plugin: string, action: string, params: Record<string, unknown> = {}) => {
    if (!device || device.status !== 'ONLINE') {
      message.warning('设备离线')
      return
    }

    setExecuting(true)
    addLog('info', `执行 ${plugin}.${action}`)

    try {
      const res = await fetch(`/api/agents/${deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin, action, params }),
      })
      const data = await res.json()

      if (data.success) {
        addLog('success', `${plugin}.${action} 执行成功`)
        if (data.data) {
          setResultModal({ title: `${plugin}.${action} 结果`, data: data.data })
        }
      } else {
        addLog('error', `${plugin}.${action} 执行失败: ${data.error}`)
      }
    } catch (err) {
      addLog('error', `${plugin}.${action} 请求失败`)
    } finally {
      setExecuting(false)
    }
  }

  const openActionModal = (plugin: string, action: PluginAction) => {
    if (!action.params || action.params.length === 0) {
      executeAction(plugin, action.name)
    } else {
      setActionParams({})
      setActionModal({ plugin, action })
    }
  }

  const submitAction = () => {
    if (!actionModal) return
    const { plugin, action } = actionModal
    const params: Record<string, unknown> = {}
    action.params?.forEach(p => {
      const val = actionParams[p.name]
      if (p.type === 'number') {
        params[p.name] = Number(val)
      } else {
        params[p.name] = val
      }
    })
    executeAction(plugin, action.name, params)
    setActionModal(null)
  }

  // 加载窗口列表
  const loadWindowList = async () => {
    if (!device || device.status !== 'ONLINE') return
    try {
      const res = await fetch(`/api/agents/${deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'list' }),
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setWindowList(data.data.filter((w: { title: string }) => w.title && !w.title.includes('Program Manager')))
      }
    } catch {}
  }

  // OCR（支持全屏或指定窗口）
  const performOcr = async () => {
    if (!device || device.status !== 'ONLINE') return
    
    // 窗口模式必须选择窗口
    if (captureMode === 'window' && !selectedWindow) {
      message.warning('请先选择要识别的窗口')
      return
    }
    
    setOcrLoading(true)
    const isWindowMode = captureMode === 'window' && selectedWindow
    const targetName = isWindowMode ? windowList.find(w => w.handle === selectedWindow)?.title : '全屏'
    addLog('info', `执行 OCR: ${targetName}`)
    
    try {
      const action = isWindowMode ? 'ocr' : 'ocr-screen'
      const params = isWindowMode ? { handle: selectedWindow } : {}
      
      const res = await fetch(`/api/agents/${deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action, params }),
      })
      const data = await res.json()
      if (data.success) {
        setOcrText(data.data.text || '')
        addLog('success', `OCR 完成: ${targetName}`)
        message.success(`✓ OCR 完成 (${targetName})`)
      } else {
        addLog('error', 'OCR 失败: ' + data.error)
        message.error(data.error || 'OCR 失败')
      }
    } catch {
      addLog('error', 'OCR 请求失败')
      message.error('OCR 请求失败')
    }
    setOcrLoading(false)
  }
  
  // 截图（支持全屏或指定窗口）
  const captureTarget = async () => {
    if (!device || device.status !== 'ONLINE') return
    
    if (captureMode === 'window' && !selectedWindow) {
      message.warning('请先选择要截图的窗口')
      return
    }
    
    const isWindowMode = captureMode === 'window' && selectedWindow
    const action = isWindowMode ? 'capture' : 'capture-screen'
    const params = isWindowMode ? { handle: selectedWindow } : {}
    
    try {
      const res = await fetch(`/api/agents/${deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action, params }),
      })
      const data = await res.json()
      if (data.success && data.data?.image) {
        setScreenData(data.data.image)
        message.success('✓ 截图完成')
      }
    } catch {}
  }

  // AI 分析
  const performAiAnalysis = async () => {
    if (!ocrText.trim()) {
      message.warning('请先执行 OCR 提取文字')
      return
    }
    setAiLoading(true)
    addLog('info', '执行 AI 分析')
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ocrText }),
      })
      const data = await res.json()
      if (data.success) {
        setAiResult(data.data)
        addLog('success', 'AI 分析完成')
        message.success('✓ AI 分析完成')
      } else {
        addLog('error', 'AI 分析失败: ' + data.error)
        message.error(data.error || 'AI 分析失败')
      }
    } catch {
      addLog('error', 'AI 请求失败')
      message.error('AI 请求失败')
    }
    setAiLoading(false)
  }

  // 发送命令
  const sendCommand = async () => {
    if (!commandInput.trim() || !device || device.status !== 'ONLINE') return
    
    const isWindowTarget = captureMode === 'window' && selectedWindow
    const targetName = isWindowTarget ? (windowList.find(w => w.handle === selectedWindow)?.title || '选定窗口') : '当前活动窗口'
    
    const keysToSend = autoEnter && !commandInput.includes('{Enter}') ? `${commandInput}{Enter}` : commandInput;
    addLog('info', `发送命令到 ${targetName}: ${keysToSend}`)
    
    try {
      if (isWindowTarget) {
        // 使用 workflow 插件实现复合动作
        const steps: any[] = [
          { id: 'act', action: 'window-control.activate', params: { handle: selectedWindow } },
          { id: 'delay1', action: 'system.delay', params: { ms: 200 } }
        ];

        // 如果开启了 IDE 模式，先发送 Ctrl+L 唤起/聚焦对话框
        if (ideMode) {
          steps.push({ id: 'focus_ide', action: 'window-control.send-keys', params: { keys: '^l' } });
          steps.push({ id: 'delay2', action: 'system.delay', params: { ms: 200 } });
        }

        steps.push({ id: 'send', action: 'window-control.send-keys', params: { keys: keysToSend } });

        await executeAction('workflow', 'run', { steps });
      } else {
        // 普通全局发送
        await executeAction('window-control', 'send-keys', { keys: keysToSend })
      }
      setCommandInput('')
    } catch {
      addLog('error', '命令发送失败')
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!device) {
    return null
  }

  const installedPlugins = device.plugins || []

  return (
    <div>
      <Card
        title={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/devices')}>
              返回
            </Button>
            <span>🖥️ {device.hostname}</span>
            <Tag color={device.status === 'ONLINE' ? 'success' : 'default'}>
              {device.status === 'ONLINE' ? '在线' : '离线'}
            </Tag>
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchDevice}>
            刷新
          </Button>
        }
      >
        <Row gutter={[16, 16]}>
          {/* 左侧：屏幕预览 */}
          <Col xs={24} lg={12}>
            <Card
              title={
                <Space>
                  <span>📺 截图</span>
                  <Radio.Group 
                    size="small" 
                    value={captureMode} 
                    onChange={e => { setCaptureMode(e.target.value); if (e.target.value === 'window') loadWindowList() }}
                  >
                    <Radio.Button value="screen">全屏</Radio.Button>
                    <Radio.Button value="window">窗口</Radio.Button>
                  </Radio.Group>
                  {captureMode === 'window' && (
                    <Select
                      size="small"
                      style={{ width: 180 }}
                      placeholder="选择窗口"
                      value={selectedWindow}
                      onChange={setSelectedWindow}
                      options={windowList.map(w => ({ 
                        label: `${w.processName}: ${w.title.substring(0, 20)}`, 
                        value: w.handle 
                      }))}
                      showSearch
                      filterOption={(input, option) => 
                        (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                      }
                    />
                  )}
                </Space>
              }
              size="small"
              extra={
                <Space>
                  <Button
                    size="small"
                    icon={screenLoading ? <LoadingOutlined /> : <CameraOutlined />}
                    onClick={captureTarget}
                    disabled={device.status !== 'ONLINE'}
                  >
                    截图
                  </Button>
                  <Button
                    size="small"
                    icon={<FileTextOutlined />}
                    onClick={performOcr}
                    loading={ocrLoading}
                    disabled={device.status !== 'ONLINE'}
                  >
                    OCR
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<RobotOutlined />}
                    onClick={performAiAnalysis}
                    loading={aiLoading}
                    disabled={!ocrText}
                  >
                    AI
                  </Button>
                </Space>
              }
            >
              <div style={{ minHeight: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f0f0', borderRadius: 8 }}>
                {device.status !== 'ONLINE' ? (
                  <Text type="secondary">设备离线</Text>
                ) : screenData ? (
                  <Image
                    src={`data:image/jpeg;base64,${screenData}`}
                    alt="Screen"
                    style={{ maxWidth: '100%', maxHeight: 300 }}
                  />
                ) : (
                  <Text type="secondary">暂无屏幕数据</Text>
                )}
              </div>
            </Card>

            {/* AI 分析结果 */}
            {(ocrText || aiResult) && (
              <Card 
                title="🤖 AI 分析" 
                size="small" 
                style={{ marginTop: 16 }}
                extra={
                  <Link href="/settings">
                    <Button size="small" icon={<SettingOutlined />}>配置</Button>
                  </Link>
                }
              >
                {aiLoading ? (
                  <div style={{ textAlign: 'center', padding: 20 }}><Spin tip="分析中..." /></div>
                ) : aiResult ? (
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <Tag color="blue">状态</Tag> {aiResult.status}
                    </div>
                    {aiResult.problems.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <Tag color="orange">问题</Tag>
                        <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                          {aiResult.problems.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    )}
                    {aiResult.suggestions.length > 0 && (
                      <div>
                        <Tag color="green">建议</Tag>
                        <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                          {aiResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : ocrText ? (
                  <div>
                    <Text type="secondary">OCR 文字已提取 ({ocrText.length} 字符)</Text>
                    <TextArea 
                      value={ocrText} 
                      rows={3} 
                      style={{ marginTop: 8, fontSize: 12 }}
                      readOnly
                    />
                  </div>
                ) : null}
              </Card>
            )}

            {/* 命令输入 */}
            <Card title="⌨️ 命令输入" size="small" style={{ marginTop: 16 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="输入命令或按键序列..."
                  value={commandInput}
                  onChange={e => setCommandInput(e.target.value)}
                  onPressEnter={sendCommand}
                  disabled={device.status !== 'ONLINE'}
                />
                <Button 
                  type="primary" 
                  icon={<SendOutlined />} 
                  onClick={sendCommand}
                  disabled={device.status !== 'ONLINE' || !commandInput.trim()}
                >
                  发送
                </Button>
              </Space.Compact>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                {captureMode === 'window' && selectedWindow ? (
                  <Text type="success">✓ 将发送到选定窗口: {windowList.find(w => w.handle === selectedWindow)?.processName}</Text>
                ) : (
                  "将发送到 Agent 侧当前的活动窗口"
                )}
                <br />
                <Checkbox checked={autoEnter} onChange={(e: any) => setAutoEnter(e.target.checked)}>
                  自动在末尾附加回车 (Enter) 键
                </Checkbox>
                <Checkbox 
                  checked={ideMode} 
                  onChange={(e: any) => setIdeMode(e.target.checked)}
                  style={{ marginLeft: 16 }}
                >
                  IDE 模式 (自动发送 Ctrl+L 聚焦对话框)
                </Checkbox>
                <br />
                支持: 普通文字、{'{Enter}'}{'{Tab}'}{'{Ctrl+C}'} 等快捷键
              </Text>
            </Card>
          </Col>

          {/* 右侧：设备信息 */}
          <Col xs={24} lg={12}>
            <Card title="📋 设备信息" size="small">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="IP">{device.ip || '-'}</Descriptions.Item>
                <Descriptions.Item label="操作系统">{device.os}</Descriptions.Item>
                <Descriptions.Item label="Agent 版本">{device.agentVersion}</Descriptions.Item>
                <Descriptions.Item label="已安装插件">
                  <Space wrap>
                    {installedPlugins.map(p => <Tag key={p}>{p}</Tag>)}
                    {installedPlugins.length === 0 && '-'}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="最后在线">
                  {new Date(device.lastSeen).toLocaleString('zh-CN')}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          {/* 快捷操作 */}
          <Col span={24}>
            <Card title="🎮 快捷操作" size="small">
              <Space wrap>
                <Button
                  icon={<CameraOutlined />}
                  onClick={() => executeAction('window-control', 'capture-screen')}
                  disabled={device.status !== 'ONLINE' || executing}
                >
                  截图
                </Button>
                <Button
                  icon={<AppstoreOutlined />}
                  onClick={() => executeAction('window-control', 'list')}
                  disabled={device.status !== 'ONLINE' || executing}
                >
                  窗口列表
                </Button>
                <Button
                  icon={<UnorderedListOutlined />}
                  onClick={() => executeAction('window-control', 'list-processes')}
                  disabled={device.status !== 'ONLINE' || executing}
                >
                  进程列表
                </Button>
                <Button
                  icon={<KeyOutlined />}
                  onClick={() => openActionModal('window-control', pluginActions['window-control'].find(a => a.name === 'send-keys')!)}
                  disabled={device.status !== 'ONLINE' || executing}
                >
                  发送按键
                </Button>
                <Button
                  icon={<AimOutlined />}
                  onClick={() => openActionModal('window-control', pluginActions['window-control'].find(a => a.name === 'mouse-click')!)}
                  disabled={device.status !== 'ONLINE' || executing}
                >
                  鼠标点击
                </Button>
                <Button
                  icon={<ApiOutlined />}
                  onClick={() => executeAction('window-control', 'list-ports')}
                  disabled={device.status !== 'ONLINE' || executing}
                >
                  端口列表
                </Button>
                <Button
                  icon={<ChromeOutlined />}
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/agents/${deviceId}/execute`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          plugin: 'shell', 
                          action: 'execute', 
                          params: { 
                            command: '$paths=@("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe","C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe","D:\\software\\soft\\Google\\Chrome\\Application\\chrome.exe"); $p=$paths|Where-Object{Test-Path $_}|Select-Object -First 1; if($p){Start-Process $p -ArgumentList "--remote-debugging-port=9222","--user-data-dir=C:\\ChromeDebug"}else{Write-Error "Chrome not found"}',
                            shell: 'powershell',
                            timeout: 5000
                          } 
                        })
                      })
                      const data = await res.json()
                      if (data.success) {
                        message.success('✓ Chrome 调试模式已启动 (端口 9222)')
                        addLog('success', 'Chrome 调试模式启动成功')
                      } else {
                        message.error(data.error || '启动失败')
                      }
                    } catch {
                      message.error('启动失败')
                    }
                  }}
                  disabled={device.status !== 'ONLINE' || executing}
                >
                  调试浏览器
                </Button>
                <Button
                  icon={<CodeOutlined />}
                  type="primary"
                  ghost
                  onClick={() => window.open('/windsurf-test.html', '_blank')}
                >
                  IDE 自动化测试
                </Button>
                <Link href={`/supervision/${deviceId}`}>
                  <Button
                    icon={<RobotOutlined />}
                    type="primary"
                  >
                    🤖 AI 监管
                  </Button>
                </Link>
              </Space>
            </Card>
          </Col>

          {/* 远程 Shell */}
          <Col span={24}>
            <Card title="💻 远程 Shell" size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <Radio.Group value={shellType} onChange={e => setShellType(e.target.value)} size="small">
                    <Radio.Button value="cmd">CMD</Radio.Button>
                    <Radio.Button value="powershell">PowerShell</Radio.Button>
                  </Radio.Group>
                  <Input 
                    placeholder="工作目录 (可选)" 
                    value={shellCwd}
                    onChange={e => setShellCwd(e.target.value)}
                    style={{ width: 200 }}
                    size="small"
                    prefix={<DesktopOutlined />}
                  />
                </Space>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="输入命令..."
                    value={shellCommand}
                    onChange={e => setShellCommand(e.target.value)}
                    onPressEnter={async () => {
                      if (!shellCommand.trim()) return
                      setShellLoading(true)
                      setShellOutput('')
                      try {
                        const res = await fetch(`/api/agents/${deviceId}/execute`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            plugin: 'shell', 
                            action: 'execute', 
                            params: { 
                              command: shellCommand,
                              shell: shellType,
                              cwd: shellCwd || undefined,
                              timeout: 30000
                            } 
                          })
                        })
                        const data = await res.json()
                        if (data.success && data.data?.data) {
                          const result = data.data.data
                          setShellOutput(result.output || result.error || '(无输出)')
                          addLog(result.success ? 'success' : 'error', 
                            `命令执行${result.success ? '成功' : '失败'} (${result.durationMs}ms)`)
                        } else {
                          setShellOutput(data.error || '执行失败')
                          addLog('error', data.error || '命令执行失败')
                        }
                      } catch {
                        setShellOutput('请求失败')
                        addLog('error', '命令执行请求失败')
                      } finally {
                        setShellLoading(false)
                      }
                    }}
                    disabled={device.status !== 'ONLINE' || shellLoading}
                    prefix={<CodeOutlined />}
                  />
                  <Button 
                    type="primary" 
                    icon={<SendOutlined />} 
                    loading={shellLoading}
                    onClick={async () => {
                      if (!shellCommand.trim()) return
                      setShellLoading(true)
                      setShellOutput('')
                      try {
                        const res = await fetch(`/api/agents/${deviceId}/execute`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            plugin: 'shell', 
                            action: 'execute', 
                            params: { 
                              command: shellCommand,
                              shell: shellType,
                              cwd: shellCwd || undefined,
                              timeout: 30000
                            } 
                          })
                        })
                        const data = await res.json()
                        if (data.success && data.data?.data) {
                          const result = data.data.data
                          setShellOutput(result.output || result.error || '(无输出)')
                          addLog(result.success ? 'success' : 'error', 
                            `命令执行${result.success ? '成功' : '失败'} (${result.durationMs}ms)`)
                        } else {
                          setShellOutput(data.error || '执行失败')
                          addLog('error', data.error || '命令执行失败')
                        }
                      } catch {
                        setShellOutput('请求失败')
                        addLog('error', '命令执行请求失败')
                      } finally {
                        setShellLoading(false)
                      }
                    }}
                    disabled={device.status !== 'ONLINE' || !shellCommand.trim()}
                  >
                    执行
                  </Button>
                </Space.Compact>
                {shellOutput && (
                  <pre style={{ 
                    background: '#1e1e1e', 
                    color: '#d4d4d4', 
                    padding: 12, 
                    borderRadius: 4, 
                    fontSize: 12,
                    maxHeight: 200,
                    overflow: 'auto',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                  }}>
                    {shellOutput}
                  </pre>
                )}
              </Space>
            </Card>
          </Col>

          {/* 插件操作 */}
          <Col span={24}>
            <Card title="🧩 插件操作" size="small">
              <Collapse
                items={installedPlugins.map(pluginId => ({
                  key: pluginId,
                  label: pluginId,
                  children: (
                    <Space wrap>
                      {(pluginActions[pluginId] || []).map(action => (
                        <Button
                          key={action.name}
                          size="small"
                          icon={<PlayCircleOutlined />}
                          onClick={() => openActionModal(pluginId, action)}
                          disabled={device.status !== 'ONLINE' || executing}
                        >
                          {action.name}
                        </Button>
                      ))}
                    </Space>
                  ),
                }))}
              />
            </Card>
          </Col>

          {/* 操作日志 */}
          <Col span={24}>
            <Card
              title="📜 操作日志"
              size="small"
              extra={<Button size="small" onClick={() => setLogs([])}>清空</Button>}
            >
              <List
                size="small"
                dataSource={logs}
                locale={{ emptyText: '暂无日志' }}
                style={{ maxHeight: 200, overflow: 'auto' }}
                renderItem={item => (
                  <List.Item style={{ padding: '4px 0' }}>
                    <Space>
                      <Text type="secondary">{item.time}</Text>
                      {item.level === 'success' && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                      {item.level === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                      {item.level === 'info' && <LoadingOutlined style={{ color: '#1890ff' }} />}
                      <Text>{item.message}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 参数输入弹窗 */}
      <Modal
        title={actionModal ? `${actionModal.plugin}.${actionModal.action.name}` : ''}
        open={!!actionModal}
        onCancel={() => setActionModal(null)}
        onOk={submitAction}
        okText="执行"
      >
        {actionModal?.action.params?.map(p => (
          <div key={p.name} style={{ marginBottom: 16 }}>
            <label>{p.name} ({p.type}){p.required && ' *'}</label>
            <Input
              placeholder={`输入 ${p.name}`}
              value={actionParams[p.name] || ''}
              onChange={e => setActionParams(prev => ({ ...prev, [p.name]: e.target.value }))}
            />
          </div>
        ))}
      </Modal>

      {/* 结果弹窗 - 智能展示 */}
      <Modal
        title={resultModal?.title}
        open={!!resultModal}
        onCancel={() => setResultModal(null)}
        footer={null}
        width={900}
      >
        {resultModal && renderResultContent(resultModal.title, resultModal.data)}
      </Modal>
    </div>
  )

  // 智能结果渲染
  function renderResultContent(title: string, data: unknown) {
    // 窗口列表
    if (title.includes('list') && Array.isArray(data) && data[0]?.handle !== undefined) {
      return (
        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          <List
            size="small"
            dataSource={data}
            renderItem={(win: { handle: number; title: string; processName: string; processId: number; bounds: { width: number; height: number } }) => (
              <List.Item
                actions={[
                  <Button key="activate" size="small" type="link" onClick={() => { setResultModal(null); executeAction('window-control', 'activate', { handle: win.handle }) }}>
                    激活
                  </Button>,
                  <Button key="minimize" size="small" type="link" onClick={() => { setResultModal(null); executeAction('window-control', 'minimize', { handle: win.handle }) }}>
                    最小化
                  </Button>,
                  <Button key="capture" size="small" type="link" onClick={() => { setResultModal(null); executeAction('window-control', 'capture', { handle: win.handle }) }}>
                    截图
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={<span>{win.title || '(无标题)'}</span>}
                  description={
                    <Space>
                      <Tag color="blue">{win.processName}</Tag>
                      <Text type="secondary">PID: {win.processId}</Text>
                      <Text type="secondary">{win.bounds.width}x{win.bounds.height}</Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      )
    }

    // 进程列表
    if (title.includes('processes') && Array.isArray(data) && data[0]?.memory !== undefined) {
      return (
        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          <List
            size="small"
            dataSource={data}
            renderItem={(proc: { id: number; name: string; title: string; memory: number }) => (
              <List.Item>
                <List.Item.Meta
                  title={<span>{proc.name}</span>}
                  description={
                    <Space>
                      <Text type="secondary">PID: {proc.id}</Text>
                      <Text type="secondary">{proc.memory} MB</Text>
                      {proc.title && <Text type="secondary">{proc.title}</Text>}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      )
    }

    // 截图结果
    if (data && typeof data === 'object' && 'image' in data) {
      const imgData = data as { image: string; width?: number; height?: number }
      return (
        <div style={{ textAlign: 'center' }}>
          <Image
            src={`data:image/jpeg;base64,${imgData.image}`}
            alt="截图"
            style={{ maxWidth: '100%', maxHeight: 500 }}
          />
          {imgData.width && <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{imgData.width}x{imgData.height}</Text>}
        </div>
      )
    }

    // Chrome 页面列表
    if (title.includes('pages') && Array.isArray(data)) {
      return (
        <List
          size="small"
          dataSource={data}
          locale={{ emptyText: 'Chrome 未以调试模式启动或无页面' }}
          renderItem={(page: { id: string; title: string; url: string }) => (
            <List.Item
              actions={[
                <Button key="connect" size="small" type="link" onClick={() => { setResultModal(null); executeAction('browser-debug', 'connect', { pageId: page.id }) }}>
                  连接
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={page.title || '(无标题)'}
                description={<Text type="secondary" ellipsis>{page.url}</Text>}
              />
            </List.Item>
          )}
        />
      )
    }

    // 默认 JSON 展示
    return (
      <TextArea
        value={JSON.stringify(data, null, 2)}
        autoSize={{ minRows: 5, maxRows: 20 }}
        readOnly
      />
    )
  }
}
