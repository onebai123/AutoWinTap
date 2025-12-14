'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, Row, Col, Button, Space, Tag, message, Spin, Empty, Modal, Form, Select, Input, Typography, Image, Divider, Switch, Segmented, Tooltip } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined, PlayCircleOutlined, FileTextOutlined, RobotOutlined, SettingOutlined, SendOutlined, CameraOutlined, AppstoreOutlined, BlockOutlined, BorderOutlined, LoadingOutlined, EditOutlined, CheckOutlined, ExpandOutlined, MinusOutlined, FullscreenOutlined, CopyOutlined } from '@ant-design/icons'
import Link from 'next/link'

const { Text, Title } = Typography
const { TextArea } = Input

// 相对时间格式化
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

// 绝对时间格式化
function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

interface WindowConfig {
  handle: number
  role: 'browser' | 'editor' | 'terminal' | 'other'
  name: string
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
  windows: WindowConfig[]
  commands: CommandConfig[]
}

type LogType = 'info' | 'error' | 'warning' | 'inactive' | 'command'
interface LogEntry {
  time: Date
  type: LogType
  result: string
}

// 全局事件类型
type EventLevel = 'error' | 'warning' | 'info' | 'inactive'
interface GlobalEvent {
  time: Date
  level: EventLevel
  window: string
  message: string
}

interface WindowState {
  handle: number
  name: string
  customName?: string  // 自定义名称
  role: string
  screenshot?: string
  ocrText?: string
  captureLoading?: boolean
  ocrLoading?: boolean
  aiLoading?: boolean
  aiResult?: string
  logs: LogEntry[]  // 分析日志
  autoAnalyze: boolean  // 单独自动分析开关
  editing?: boolean  // 是否正在编辑名称
  hasError?: boolean  // 是否检测到错误
}

// 错误关键词检测
const ERROR_KEYWORDS = ['error', 'exception', 'failed', 'failure', 'undefined', 'null', 'cannot', 'fatal', '错误', '失败', 'ENOENT', 'EACCES', 'TypeError', 'SyntaxError', 'ReferenceError']
function detectError(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return ERROR_KEYWORDS.some(k => lower.includes(k.toLowerCase()))
}

interface WindowInfo {
  handle: number
  title: string
  processName: string
}

export default function WorkstationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [workstation, setWorkstation] = useState<Workstation | null>(null)
  const [loading, setLoading] = useState(true)
  const [windowStates, setWindowStates] = useState<WindowState[]>([])
  const [ocrLoading, setOcrLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<{ status: string; problems: string[]; suggestions: string[] } | null>(null)
  const [commandInput, setCommandInput] = useState('')
  
  // 添加窗口弹窗
  const [addWindowOpen, setAddWindowOpen] = useState(false)
  const [availableWindows, setAvailableWindows] = useState<WindowInfo[]>([])
  const [windowForm] = Form.useForm()
  
  // 命令目标
  const [commandTarget, setCommandTarget] = useState<string>('terminal')
  
  // 布局和自动分析
  const [layoutMode, setLayoutMode] = useState<'auto' | 'main1' | 'main2' | 'grid2' | 'grid3'>('auto')
  const [autoAnalyze, setAutoAnalyze] = useState(false)
  const [analyzeMode, setAnalyzeMode] = useState<'dev' | 'debug' | 'review'>('dev')
  const [lastOcrHash, setLastOcrHash] = useState<Record<number, string>>({}) // 用于检测变化
  const [liveMode, setLiveMode] = useState(false) // 实时模式
  const [liveInterval, setLiveInterval] = useState(3) // 刷新间隔（秒）
  const [globalEvents, setGlobalEvents] = useState<GlobalEvent[]>([]) // 全局事件日志
  
  // 添加全局事件
  const addEvent = useCallback((level: EventLevel, window: string, message: string) => {
    setGlobalEvents(prev => [{ time: new Date(), level, window, message }, ...prev].slice(0, 50))
  }, [])

  // 加载工作台
  const loadWorkstation = useCallback(async () => {
    try {
      const res = await fetch(`/api/workstation/${id}`)
      const data = await res.json()
      if (data.success) {
        setWorkstation(data.data)
        // 初始化窗口状态
        setWindowStates((data.data.windows as WindowConfig[]).map(w => ({
          handle: w.handle,
          name: w.name,
          role: w.role,
          logs: [],
          autoAnalyze: true,  // 默认开启
        })))
      } else {
        message.error('工作台不存在')
        router.push('/workstation')
      }
    } catch {
      message.error('加载失败')
    }
    setLoading(false)
  }, [id, router])

  useEffect(() => { loadWorkstation() }, [loadWorkstation])

  // 实时模式（定时刷新截图+OCR检测变化）
  useEffect(() => {
    if (!liveMode || !workstation || windowStates.length === 0) return
    
    const interval = setInterval(async () => {
      for (const ws of windowStates) {
        try {
          // 截图
          const captureRes = await fetch(`/api/agents/${workstation.deviceId}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plugin: 'window-control', action: 'capture', params: { handle: ws.handle } }),
          })
          const captureData = await captureRes.json()
          if (captureData.success) {
            setWindowStates(prev => prev.map(w => 
              w.handle === ws.handle ? { ...w, screenshot: captureData.data.image } : w
            ))
          }
          
          // OCR 检测变化
          const ocrRes = await fetch(`/api/agents/${workstation.deviceId}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plugin: 'window-control', action: 'ocr', params: { handle: ws.handle } }),
          })
          const ocrData = await ocrRes.json()
          if (ocrData.success) {
            const text = ocrData.data.text || ''
            const hash = text.substring(0, 200)
            const oldHash = lastOcrHash[ws.handle]
            const windowName = ws.customName || ws.name
            
            if (hash !== oldHash) {
              setLastOcrHash(prev => ({ ...prev, [ws.handle]: hash }))
              const hasError = detectError(text)
              const logType: LogType = hasError ? 'error' : 'info'
              const logMsg = hasError ? '检测到错误' : '内容已更新'
              const newLog: LogEntry = { time: new Date(), type: logType, result: logMsg }
              setWindowStates(prev => prev.map(w => 
                w.handle === ws.handle ? { ...w, ocrText: text, hasError, logs: [newLog, ...w.logs].slice(0, 20) } : w
              ))
              addEvent(hasError ? 'error' : 'info', windowName, logMsg)
            } else {
              // 无变化 - 只保留一条不活跃日志
              setWindowStates(prev => prev.map(w => {
                if (w.handle !== ws.handle) return w
                const lastLog = w.logs[0]
                if (lastLog?.type === 'inactive') return w // 已经是不活跃状态，不重复添加
                const newLog: LogEntry = { time: new Date(), type: 'inactive', result: '窗口无变化' }
                return { ...w, logs: [newLog, ...w.logs].slice(0, 20) }
              }))
              addEvent('inactive', windowName, '无变化')
            }
          }
        } catch {}
      }
    }, liveInterval * 1000)
    
    return () => clearInterval(interval)
  }, [liveMode, liveInterval, workstation, windowStates.length, lastOcrHash, addEvent])

  // 自动分析（检测变化才分析）
  useEffect(() => {
    if (!autoAnalyze || !workstation || windowStates.length === 0) return
    
    const interval = setInterval(async () => {
      for (const ws of windowStates) {
        // 跳过未开启自动分析的窗口
        if (!ws.autoAnalyze || ws.aiLoading) continue
        
        // 先 OCR 获取当前内容
        try {
          const ocrRes = await fetch(`/api/agents/${workstation.deviceId}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plugin: 'window-control', action: 'ocr', params: { handle: ws.handle } }),
          })
          const ocrData = await ocrRes.json()
          if (ocrData.success) {
            const newText = ocrData.data.text || ''
            const hash = newText.substring(0, 200) // 简单 hash
            const oldHash = lastOcrHash[ws.handle]
            
            // 只有内容变化才分析
            if (hash !== oldHash) {
              setLastOcrHash(prev => ({ ...prev, [ws.handle]: hash }))
              setWindowStates(prev => prev.map(w => 
                w.handle === ws.handle ? { ...w, ocrText: newText } : w
              ))
              // 触发分析
              analyzeWindow(ws.handle, true)
            }
          }
        } catch {}
      }
    }, 10000) // 每 10 秒检查一次
    
    return () => clearInterval(interval)
  }, [autoAnalyze, workstation, windowStates.length])

  // 加载可用窗口
  const loadAvailableWindows = async () => {
    if (!workstation) return
    try {
      const res = await fetch(`/api/agents/${workstation.deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'list' }),
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setAvailableWindows(data.data.filter((w: WindowInfo) => 
          w.title && !w.title.includes('Program Manager')
        ))
      }
    } catch {}
  }

  // 窗口控制
  const controlWindow = async (handle: number, action: 'activate' | 'minimize' | 'maximize') => {
    if (!workstation) return
    try {
      await fetch(`/api/agents/${workstation.deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action, params: { handle } }),
      })
      const actionName = action === 'activate' ? '激活' : action === 'minimize' ? '最小化' : '最大化'
      message.success(`${actionName}成功`)
      // 如果是激活或最大化，延迟刷新截图
      if (action !== 'minimize') {
        setTimeout(() => captureWindow(handle, false), 300)
      }
    } catch {
      message.error('操作失败')
    }
  }

  // 单窗口截图
  const captureWindow = async (handle: number, activate = true) => {
    if (!workstation) return
    setWindowStates(prev => prev.map(w => w.handle === handle ? { ...w, captureLoading: true } : w))
    
    try {
      // 先激活窗口确保可见
      if (activate) {
        await fetch(`/api/agents/${workstation.deviceId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plugin: 'window-control', action: 'activate', params: { handle } }),
        })
        await new Promise(r => setTimeout(r, 200)) // 等待窗口激活
      }
      
      const res = await fetch(`/api/agents/${workstation.deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'capture', params: { handle } }),
      })
      const data = await res.json()
      if (data.success) {
        setWindowStates(prev => prev.map(w => 
          w.handle === handle ? { ...w, screenshot: data.data.image, captureLoading: false } : w
        ))
      }
    } catch {
      setWindowStates(prev => prev.map(w => w.handle === handle ? { ...w, captureLoading: false } : w))
    }
  }

  // 单窗口 OCR
  const ocrWindow = async (handle: number) => {
    if (!workstation) return
    setWindowStates(prev => prev.map(w => w.handle === handle ? { ...w, ocrLoading: true } : w))
    
    try {
      const res = await fetch(`/api/agents/${workstation.deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'ocr', params: { handle } }),
      })
      const data = await res.json()
      if (data.success) {
        const text = data.data.text
        const hasError = detectError(text)
        setWindowStates(prev => prev.map(w => 
          w.handle === handle ? { ...w, ocrText: text, ocrLoading: false, hasError } : w
        ))
        if (hasError) {
          message.warning('⚠️ 检测到错误')
        } else {
          message.success('OCR 完成')
        }
      }
    } catch {
      setWindowStates(prev => prev.map(w => w.handle === handle ? { ...w, ocrLoading: false } : w))
    }
  }

  // 单窗口一键 AI 分析（截图→OCR→分析）
  const analyzeWindow = async (handle: number, useExistingOcr = false) => {
    if (!workstation) return
    const ws = windowStates.find(w => w.handle === handle)
    if (!ws) return
    
    setWindowStates(prev => prev.map(w => w.handle === handle ? { ...w, aiLoading: true } : w))
    
    try {
      let ocrText = ws.ocrText
      
      // 如果不使用现有 OCR，先截图再 OCR
      if (!useExistingOcr || !ocrText) {
        // 先激活窗口
        await fetch(`/api/agents/${workstation.deviceId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plugin: 'window-control', action: 'activate', params: { handle } }),
        })
        await new Promise(r => setTimeout(r, 200))
        
        // 截图
        const captureRes = await fetch(`/api/agents/${workstation.deviceId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plugin: 'window-control', action: 'capture', params: { handle } }),
        })
        const captureData = await captureRes.json()
        if (captureData.success) {
          setWindowStates(prev => prev.map(w => 
            w.handle === handle ? { ...w, screenshot: captureData.data.image } : w
          ))
        }
        
        // OCR
        const ocrRes = await fetch(`/api/agents/${workstation.deviceId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plugin: 'window-control', action: 'ocr', params: { handle } }),
        })
        const ocrData = await ocrRes.json()
        if (ocrData.success) {
          ocrText = ocrData.data.text
          setWindowStates(prev => prev.map(w => 
            w.handle === handle ? { ...w, ocrText } : w
          ))
        }
      }
      
      if (!ocrText) {
        setWindowStates(prev => prev.map(w => w.handle === handle ? { ...w, aiLoading: false } : w))
        return
      }
      
      // AI 分析
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: `[${ws.role}: ${ws.name}]\n${ocrText}`,
          promptType: analyzeMode
        }),
      })
      const data = await res.json()
      if (data.success) {
        const analysis = data.data.analysis
        const hasErr = detectError(analysis)
        const newLog: LogEntry = { time: new Date(), type: hasErr ? 'error' : 'info', result: analysis }
        setWindowStates(prev => prev.map(w => 
          w.handle === handle ? { 
            ...w, 
            aiResult: analysis, 
            aiLoading: false,
            logs: [newLog, ...w.logs].slice(0, 20)  // 保留最近20条
          } : w
        ))
      } else {
        setWindowStates(prev => prev.map(w => w.handle === handle ? { ...w, aiLoading: false } : w))
      }
    } catch {
      setWindowStates(prev => prev.map(w => w.handle === handle ? { ...w, aiLoading: false } : w))
    }
  }

  // 截图所有窗口
  const captureAll = async () => {
    if (!workstation) return
    for (const ws of windowStates) {
      await captureWindow(ws.handle)
    }
    message.success('全部截图完成')
  }

  // OCR 所有窗口
  const ocrAll = async () => {
    if (!workstation) return
    setOcrLoading(true)
    const newStates = [...windowStates]
    
    for (let i = 0; i < newStates.length; i++) {
      try {
        const res = await fetch(`/api/agents/${workstation.deviceId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            plugin: 'window-control', 
            action: 'ocr',
            params: { handle: newStates[i].handle }
          }),
        })
        const data = await res.json()
        if (data.success) {
          newStates[i].ocrText = data.data.text
        }
      } catch {}
    }
    
    setWindowStates(newStates)
    setOcrLoading(false)
    message.success('OCR 完成')
  }

  // AI 分析
  const analyzeAll = async () => {
    const allText = windowStates.map(w => `[${w.role}: ${w.name}]\n${w.ocrText || '(无文字)'}`).join('\n\n')
    if (!allText.trim()) {
      message.warning('请先执行 OCR')
      return
    }
    
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: allText, context: `工作台: ${workstation?.name}` }),
      })
      const data = await res.json()
      if (data.success) {
        setAiResult(data.data)
        message.success('分析完成')
      } else {
        message.error(data.error)
      }
    } catch {
      message.error('分析失败')
    }
    setAiLoading(false)
  }

  // 执行命令
  const executeCommand = async (cmd: CommandConfig) => {
    if (!workstation) return
    const targetWindow = windowStates.find(w => w.role === cmd.target)
    if (!targetWindow) {
      message.warning(`未找到 ${cmd.target} 窗口`)
      return
    }
    
    try {
      // 先激活窗口
      await fetch(`/api/agents/${workstation.deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          plugin: 'window-control', 
          action: 'activate',
          params: { handle: targetWindow.handle }
        }),
      })
      
      // 发送按键
      await fetch(`/api/agents/${workstation.deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          plugin: 'window-control', 
          action: 'send-keys',
          params: { keys: cmd.command }
        }),
      })
      
      message.success(`执行: ${cmd.name}`)
    } catch {
      message.error('执行失败')
    }
  }

  // 发送自定义命令
  const sendCustomCommand = async () => {
    if (!commandInput.trim() || !workstation) return
    const targetWindow = windowStates.find(w => w.role === commandTarget)
    if (!targetWindow) {
      message.warning(`未找到 ${commandTarget} 窗口`)
      return
    }
    
    try {
      await fetch(`/api/agents/${workstation.deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'activate', params: { handle: targetWindow.handle } }),
      })
      await fetch(`/api/agents/${workstation.deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'send-keys', params: { keys: commandInput } }),
      })
      message.success('命令已发送')
      setCommandInput('')
    } catch {
      message.error('发送失败')
    }
  }

  // 窗口布局
  const tileWindows = async (layout: 'horizontal' | 'vertical' | 'grid') => {
    if (!workstation) return
    const handles = windowStates.map(w => w.handle)
    
    try {
      await fetch(`/api/agents/${workstation.deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'tile-windows', params: { handles, layout } }),
      })
      message.success('布局已调整')
      // 刷新截图
      setTimeout(captureAll, 500)
    } catch {
      message.error('布局调整失败')
    }
  }

  // 添加窗口
  const handleAddWindow = async (values: { handle: number; role: string }) => {
    if (!workstation) return
    const win = availableWindows.find(w => w.handle === values.handle)
    if (!win) return
    
    const newWindow: WindowConfig = {
      handle: values.handle,
      role: values.role as WindowConfig['role'],
      name: win.title,
    }
    
    const updatedWindows = [...(workstation.windows as WindowConfig[]), newWindow]
    
    try {
      const res = await fetch(`/api/workstation/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...workstation, windows: updatedWindows }),
      })
      const data = await res.json()
      if (data.success) {
        setAddWindowOpen(false)
        windowForm.resetFields()
        loadWorkstation()
        message.success('窗口已添加')
      }
    } catch {
      message.error('添加失败')
    }
  }

  // 移除窗口
  const removeWindow = async (handle: number) => {
    if (!workstation) return
    const updatedWindows = (workstation.windows as WindowConfig[]).filter(w => w.handle !== handle)
    
    try {
      await fetch(`/api/workstation/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...workstation, windows: updatedWindows }),
      })
      loadWorkstation()
    } catch {}
  }

  if (loading) {
    return <Card><Spin tip="加载中..." /></Card>
  }

  if (!workstation) {
    return null
  }

  const commands = workstation.commands as CommandConfig[]

  return (
    <div>
      <Card
        title={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/workstation')}>返回</Button>
            <span>🖥️ {workstation.name}</span>
          </Space>
        }
        extra={
          <Space>
            <Space size={4}>
              <Text type="secondary">实时</Text>
              <Switch size="small" checked={liveMode} onChange={setLiveMode} />
              {liveMode && (
                <Select
                  size="small"
                  style={{ width: 70 }}
                  value={liveInterval}
                  onChange={setLiveInterval}
                  options={[
                    { label: '1秒', value: 1 },
                    { label: '3秒', value: 3 },
                    { label: '5秒', value: 5 },
                    { label: '10秒', value: 10 },
                  ]}
                />
              )}
            </Space>
            <Divider type="vertical" />
            <Button icon={<ReloadOutlined />} onClick={captureAll}>截图</Button>
            <Button icon={<FileTextOutlined />} onClick={ocrAll} loading={ocrLoading}>OCR</Button>
            <Button type="primary" icon={<RobotOutlined />} onClick={analyzeAll} loading={aiLoading}>AI 分析</Button>
            <Link href="/settings"><Button icon={<SettingOutlined />}>配置</Button></Link>
          </Space>
        }
      >
        <Row gutter={16}>
          {/* 左侧：窗口网格 */}
          <Col span={16}>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Text strong>监控窗口 ({windowStates.length})</Text>
                <Button size="small" icon={<PlusOutlined />} onClick={() => { loadAvailableWindows(); setAddWindowOpen(true) }}>
                  添加
                </Button>
              </Space>
              <Space>
                <Text type="secondary">布局:</Text>
                <Segmented
                  size="small"
                  value={layoutMode}
                  onChange={(v) => setLayoutMode(v as typeof layoutMode)}
                  options={[
                    { label: '自动', value: 'auto' },
                    { label: '一主多副', value: 'main1' },
                    { label: '双主', value: 'main2' },
                    { label: '2列', value: 'grid2' },
                    { label: '3列', value: 'grid3' },
                  ]}
                />
                <Divider type="vertical" />
                <Text type="secondary">模式:</Text>
                <Segmented
                  size="small"
                  value={analyzeMode}
                  onChange={(v) => setAnalyzeMode(v as 'dev' | 'debug' | 'review')}
                  options={[
                    { label: '开发', value: 'dev' },
                    { label: '调试', value: 'debug' },
                    { label: '审查', value: 'review' },
                  ]}
                />
                <Divider type="vertical" />
                <Text type="secondary">自动:</Text>
                <Switch size="small" checked={autoAnalyze} onChange={setAutoAnalyze} />
              </Space>
            </div>
            
            {windowStates.length === 0 ? (
              <Empty description="暂无窗口，点击「添加窗口」添加">
                <Button onClick={() => { loadAvailableWindows(); setAddWindowOpen(true) }}>添加窗口</Button>
              </Empty>
            ) : (
              <Row gutter={[8, 8]}>
                {windowStates.map((ws, idx) => {
                  // 计算 span 和高度
                  const count = windowStates.length
                  let span = 12, imgHeight = 180
                  
                  if (layoutMode === 'auto') {
                    // 自动：根据数量调整
                    if (count === 1) { span = 24; imgHeight = 400 }
                    else if (count === 2) { span = 12; imgHeight = 250 }
                    else if (count <= 4) { span = 12; imgHeight = 180 }
                    else { span = 8; imgHeight = 140 }
                  } else if (layoutMode === 'main1') {
                    // 一主多副：第一个大，其他小
                    if (idx === 0) { span = 16; imgHeight = 300 }
                    else { span = 8; imgHeight = 140 }
                  } else if (layoutMode === 'main2') {
                    // 双主：前两个大，其他小
                    if (idx < 2) { span = 12; imgHeight = 250 }
                    else { span = 8; imgHeight = 120 }
                  } else if (layoutMode === 'grid2') {
                    span = 12; imgHeight = 200
                  } else if (layoutMode === 'grid3') {
                    span = 8; imgHeight = 150
                  }
                  
                  return (
                  <Col key={ws.handle} span={span}>
                    <Card 
                      size="small"
                      style={ws.hasError ? { borderColor: '#ff4d4f', borderWidth: 2 } : undefined}
                      title={
                        <Space size={4}>
                          {ws.hasError && <span style={{ color: '#ff4d4f' }}>🔴</span>}
                          <Tag color={ws.role === 'browser' ? 'blue' : ws.role === 'editor' ? 'green' : ws.role === 'terminal' ? 'orange' : 'default'}>
                            {ws.role}
                          </Tag>
                          {ws.editing ? (
                            <Input
                              size="small"
                              style={{ width: 100 }}
                              defaultValue={ws.customName || ws.name}
                              autoFocus
                              onPressEnter={(e) => {
                                const newName = (e.target as HTMLInputElement).value
                                setWindowStates(prev => prev.map(w => 
                                  w.handle === ws.handle ? { ...w, customName: newName, editing: false } : w
                                ))
                              }}
                              onBlur={(e) => {
                                const newName = e.target.value
                                setWindowStates(prev => prev.map(w => 
                                  w.handle === ws.handle ? { ...w, customName: newName, editing: false } : w
                                ))
                              }}
                            />
                          ) : (
                            <>
                              <Text ellipsis style={{ maxWidth: 100 }}>{ws.customName || ws.name}</Text>
                              <Button 
                                type="text" 
                                size="small" 
                                icon={<EditOutlined />} 
                                onClick={() => setWindowStates(prev => prev.map(w => 
                                  w.handle === ws.handle ? { ...w, editing: true } : w
                                ))}
                              />
                            </>
                          )}
                        </Space>
                      }
                      extra={
                        <Space size={4}>
                          <Tooltip title="激活窗口">
                            <Button size="small" icon={<ExpandOutlined />} onClick={() => controlWindow(ws.handle, 'activate')} />
                          </Tooltip>
                          <Tooltip title="最大化">
                            <Button size="small" icon={<FullscreenOutlined />} onClick={() => controlWindow(ws.handle, 'maximize')} />
                          </Tooltip>
                          <Tooltip title="最小化">
                            <Button size="small" icon={<MinusOutlined />} onClick={() => controlWindow(ws.handle, 'minimize')} />
                          </Tooltip>
                          <Divider type="vertical" style={{ margin: '0 2px' }} />
                          <Tooltip title="截图">
                            <Button size="small" icon={ws.captureLoading ? <LoadingOutlined /> : <CameraOutlined />} onClick={() => captureWindow(ws.handle)} />
                          </Tooltip>
                          <Tooltip title="OCR">
                            <Button size="small" icon={ws.ocrLoading ? <LoadingOutlined /> : <FileTextOutlined />} onClick={() => ocrWindow(ws.handle)} />
                          </Tooltip>
                          <Tooltip title="AI 分析">
                            <Button size="small" type={ws.aiResult ? 'primary' : 'default'} icon={ws.aiLoading ? <LoadingOutlined /> : <RobotOutlined />} onClick={() => analyzeWindow(ws.handle)} />
                          </Tooltip>
                          <Divider type="vertical" style={{ margin: '0 2px' }} />
                          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeWindow(ws.handle)} />
                        </Space>
                      }
                    >
                      <Row gutter={8}>
                        {/* 左边：截图 */}
                        <Col span={14}>
                          {ws.screenshot ? (
                            <Image
                              src={`data:image/jpeg;base64,${ws.screenshot}`}
                              alt={ws.name}
                              style={{ width: '100%', height: imgHeight, objectFit: 'contain' }}
                              preview={{ mask: '查看大图' }}
                            />
                          ) : (
                            <div style={{ height: imgHeight * 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', borderRadius: 4 }}>
                              <Text type="secondary">点击 📷 截图</Text>
                            </div>
                          )}
                        </Col>
                        {/* 右边：日志 */}
                        <Col span={10}>
                          <div style={{ height: imgHeight, overflow: 'auto', background: '#fff', borderRadius: 4, border: '1px solid #f0f0f0' }}>
                            <div style={{ padding: '4px 8px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', fontWeight: 500, fontSize: 11 }}>
                              📋 状态 & 事件
                            </div>
                            <div style={{ padding: 6 }}>
                              {ws.logs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 20 }}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>⚪ 等待中...</Text>
                                </div>
                              ) : (
                                ws.logs.slice(0, 6).map((log, i) => {
                                  const icon = log.type === 'error' ? '🔴' : log.type === 'warning' ? '🟡' : log.type === 'command' ? '⚡' : log.type === 'inactive' ? '⚪' : '🟢'
                                  const label = log.type === 'error' ? '错误' : log.type === 'warning' ? '等待' : log.type === 'command' ? '命令' : log.type === 'inactive' ? '空闲' : '正常'
                                  const bgColor = log.type === 'error' ? '#fff2f0' : log.type === 'warning' ? '#fffbe6' : log.type === 'command' ? '#f0f5ff' : log.type === 'inactive' ? '#f5f5f5' : '#f6ffed'
                                  const borderColor = log.type === 'error' ? '#ffccc7' : log.type === 'warning' ? '#ffe58f' : log.type === 'command' ? '#adc6ff' : log.type === 'inactive' ? '#d9d9d9' : '#b7eb8f'
                                  return (
                                    <div key={i} style={{ 
                                      padding: '6px 8px', 
                                      marginBottom: 4, 
                                      borderRadius: 4,
                                      background: bgColor,
                                      border: `1px solid ${borderColor}`
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                        <Space size={4}>
                                          <span>{icon}</span>
                                          <Tag color={log.type === 'error' ? 'red' : log.type === 'warning' ? 'orange' : log.type === 'command' ? 'blue' : log.type === 'inactive' ? 'default' : 'green'} style={{ margin: 0, fontSize: 10 }}>{label}</Tag>
                                        </Space>
                                        <Text type="secondary" style={{ fontSize: 10 }}>{formatTime(log.time)}</Text>
                                      </div>
                                      <Text style={{ fontSize: 11, wordBreak: 'break-all' }}>{(log.result || '').substring(0, 60)}{log.result?.length > 60 ? '...' : ''}</Text>
                                    </div>
                                  )
                                })
                              )}
                            </div>
                          </div>
                        </Col>
                      </Row>
                      {/* 命令输入 */}
                      <div style={{ marginTop: 8 }}>
                        <Space.Compact style={{ width: '100%' }}>
                          <Input
                            id={`cmd-${ws.handle}`}
                            size="small"
                            placeholder="输入命令... (回车发送)"
                            onPressEnter={async (e) => {
                              const cmd = (e.target as HTMLInputElement).value
                              if (!cmd || !workstation) return
                              try {
                                await fetch(`/api/agents/${workstation.deviceId}/execute`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ plugin: 'window-control', action: 'activate', params: { handle: ws.handle } }),
                                })
                                await fetch(`/api/agents/${workstation.deviceId}/execute`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ plugin: 'window-control', action: 'send-keys', params: { keys: cmd } }),
                                })
                                // 记录日志
                                const newLog: LogEntry = { time: new Date(), type: 'command', result: `执行: ${cmd}` }
                                setWindowStates(prev => prev.map(w => 
                                  w.handle === ws.handle ? { ...w, logs: [newLog, ...w.logs].slice(0, 20) } : w
                                ))
                                message.success('已发送');
                                (e.target as HTMLInputElement).value = ''
                              } catch { message.error('发送失败') }
                            }}
                          />
                          <Button size="small" icon={<SendOutlined />} onClick={async () => {
                            const input = document.querySelector(`#cmd-${ws.handle}`) as HTMLInputElement
                            if (!input?.value || !workstation) return
                            try {
                              await fetch(`/api/agents/${workstation.deviceId}/execute`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ plugin: 'window-control', action: 'activate', params: { handle: ws.handle } }),
                              })
                              await fetch(`/api/agents/${workstation.deviceId}/execute`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ plugin: 'window-control', action: 'send-keys', params: { keys: input.value } }),
                              })
                              const newLog: LogEntry = { time: new Date(), type: 'command', result: `执行: ${input.value}` }
                              setWindowStates(prev => prev.map(w => 
                                w.handle === ws.handle ? { ...w, logs: [newLog, ...w.logs].slice(0, 20) } : w
                              ))
                              message.success('已发送')
                              input.value = ''
                            } catch { message.error('发送失败') }
                          }} />
                        </Space.Compact>
                      </div>
                      {/* 自动分析开关 */}
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>自动分析</Text>
                        <Switch 
                          size="small" 
                          checked={ws.autoAnalyze} 
                          onChange={(v) => setWindowStates(prev => prev.map(w => 
                            w.handle === ws.handle ? { ...w, autoAnalyze: v } : w
                          ))}
                        />
                      </div>
                    </Card>
                  </Col>
                  )
                })}
              </Row>
            )}
          </Col>

          {/* 右侧：AI 分析和命令 */}
          <Col span={8}>
            {/* AI 分析结果 */}
            <Card title="🤖 AI 分析" size="small" style={{ marginBottom: 16 }}>
              {aiLoading ? (
                <Spin tip="分析中..." />
              ) : aiResult ? (
                <div>
                  <div style={{ marginBottom: 8 }}><Tag color="blue">状态</Tag> {aiResult.status}</div>
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
              ) : (
                <Empty description="点击「AI 分析」" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>

            {/* 快捷命令 */}
            <Card title="⌨️ 快捷命令" size="small" style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 11, marginBottom: 8, display: 'block' }}>工作台命令</Text>
              <Space wrap style={{ marginBottom: 8 }}>
                {commands.map((cmd, i) => (
                  <Button key={i} size="small" icon={<PlayCircleOutlined />} onClick={() => executeCommand(cmd)}>
                    {cmd.name}
                  </Button>
                ))}
              </Space>
              <Text type="secondary" style={{ fontSize: 11, marginBottom: 8, display: 'block' }}>常用操作</Text>
              <Space wrap style={{ marginBottom: 8 }}>
                <Button size="small" onClick={() => executeCommand({ name: '保存', target: 'editor', command: '^s' })}>💾 保存</Button>
                <Button size="small" onClick={() => executeCommand({ name: '撤销', target: 'editor', command: '^z' })}>↩️ 撤销</Button>
                <Button size="small" onClick={() => executeCommand({ name: '刷新', target: 'browser', command: '{F5}' })}>🔄 刷新</Button>
                <Button size="small" onClick={() => executeCommand({ name: '停止', target: 'terminal', command: '^c' })}>⏹️ 停止</Button>
                <Button size="small" onClick={() => executeCommand({ name: '清屏', target: 'terminal', command: 'clear{Enter}' })}>🧹 清屏</Button>
              </Space>
              <Space wrap style={{ marginBottom: 12 }}>
                <Button size="small" onClick={() => executeCommand({ name: 'git pull', target: 'terminal', command: 'git pull{Enter}' })}>📥 git pull</Button>
                <Button size="small" onClick={() => executeCommand({ name: 'npm install', target: 'terminal', command: 'npm install{Enter}' })}>📦 npm i</Button>
                <Button size="small" onClick={() => executeCommand({ name: 'npm run dev', target: 'terminal', command: 'npm run dev{Enter}' })}>🚀 dev</Button>
                <Button size="small" onClick={() => executeCommand({ name: 'npm run build', target: 'terminal', command: 'npm run build{Enter}' })}>🔨 build</Button>
              </Space>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>发送到：</Text>
                <Select
                  size="small"
                  style={{ width: 100, marginLeft: 8 }}
                  value={commandTarget}
                  onChange={setCommandTarget}
                  options={[
                    { label: '终端', value: 'terminal' },
                    { label: '编辑器', value: 'editor' },
                    { label: '浏览器', value: 'browser' },
                  ]}
                />
              </div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="输入命令或按键序列..."
                  value={commandInput}
                  onChange={e => setCommandInput(e.target.value)}
                  onPressEnter={sendCustomCommand}
                />
                <Button type="primary" icon={<SendOutlined />} onClick={sendCustomCommand}>
                  发送
                </Button>
              </Space.Compact>
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  支持: {'{Enter}'} {'{Tab}'} {'^s'}=Ctrl+S {'+s'}=Shift+S {'!s'}=Alt+S
                </Text>
              </div>
            </Card>

            {/* 窗口布局 */}
            <Card title="📐 窗口布局" size="small" style={{ marginBottom: 16 }}>
              <Space>
                <Button icon={<BorderOutlined />} onClick={() => tileWindows('horizontal')}>横向</Button>
                <Button icon={<BlockOutlined />} onClick={() => tileWindows('vertical')}>纵向</Button>
                <Button icon={<AppstoreOutlined />} onClick={() => tileWindows('grid')}>网格</Button>
              </Space>
            </Card>

            {/* 实时事件日志 */}
            <Card 
              title="📋 实时事件" 
              size="small"
              extra={<Button size="small" onClick={() => setGlobalEvents([])}>清空</Button>}
            >
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                {globalEvents.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 11 }}>开启实时模式后显示事件...</Text>
                ) : (
                  globalEvents.map((evt, i) => (
                    <div key={i} style={{ 
                      padding: '4px 8px', 
                      marginBottom: 4, 
                      borderRadius: 4,
                      background: evt.level === 'error' ? '#fff2f0' : evt.level === 'warning' ? '#fffbe6' : evt.level === 'inactive' ? '#f5f5f5' : '#f6ffed',
                      borderLeft: `3px solid ${evt.level === 'error' ? '#ff4d4f' : evt.level === 'warning' ? '#faad14' : evt.level === 'inactive' ? '#d9d9d9' : '#52c41a'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Space size={4}>
                          <span>{evt.level === 'error' ? '🔴' : evt.level === 'warning' ? '🟡' : evt.level === 'inactive' ? '⚪' : '🟢'}</span>
                          <Text strong style={{ fontSize: 11 }}>{evt.window}</Text>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 10 }}>{formatTime(evt.time)}</Text>
                      </div>
                      <Text style={{ fontSize: 11 }}>{evt.message}</Text>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 添加窗口弹窗 */}
      <Modal
        title="添加窗口"
        open={addWindowOpen}
        onCancel={() => setAddWindowOpen(false)}
        onOk={() => windowForm.submit()}
      >
        <Form form={windowForm} layout="vertical" onFinish={handleAddWindow}>
          <Form.Item name="handle" label="选择窗口" rules={[{ required: true }]}>
            <Select
              placeholder="选择窗口"
              options={availableWindows.map(w => ({
                label: `${w.processName}: ${w.title.substring(0, 40)}`,
                value: w.handle,
              }))}
            />
          </Form.Item>
          <Form.Item name="role" label="窗口角色" rules={[{ required: true }]}>
            <Select
              placeholder="选择角色"
              options={[
                { label: '浏览器', value: 'browser' },
                { label: '代码编辑器', value: 'editor' },
                { label: '终端', value: 'terminal' },
                { label: '其他', value: 'other' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
