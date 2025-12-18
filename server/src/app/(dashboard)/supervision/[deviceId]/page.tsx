'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Card,
  Row,
  Col,
  Button,
  Space,
  Input,
  Select,
  Tag,
  Progress,
  List,
  Typography,
  message,
  Spin,
  Alert,
  Tooltip,
  Badge,
  Tabs,
  Timeline,
  Drawer,
  Empty,
  Statistic,
} from 'antd'
import {
  ArrowLeftOutlined,
  RobotOutlined,
  SendOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  SettingOutlined,
  ReloadOutlined,
  BulbOutlined,
  EyeOutlined,
  PauseCircleOutlined,
  StopOutlined,
  HistoryOutlined,
  CameraOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  CodeOutlined,
} from '@ant-design/icons'
import Link from 'next/link'
import { CAPABILITY_LABELS, type ModelCapability } from '@/lib/advanced-model'

const { TextArea } = Input
const { Text } = Typography

interface TaskStep {
  id: string
  description: string
  action: string
  params?: { message: string }
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: string
  error?: string
}

interface TaskPlan {
  goal: string
  analysis: {
    understood: string[]
    missing: string[]
    questions: string[]
  }
  steps: TaskStep[]
  ready: boolean
}

interface AdvancedModel {
  id: string
  name: string
  provider: string
  capabilities: ModelCapability[]
  isDefault?: boolean
}

interface LogEntry {
  time: string
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
}

interface AnalysisResult {
  status: string
  problems: string[]
  suggestions: string[]
}

export default function SupervisionPage() {
  const params = useParams()
  const router = useRouter()
  const deviceId = params.deviceId as string

  const [loading, setLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [plan, setPlan] = useState<TaskPlan | null>(null)
  const [executing, setExecuting] = useState(false)
  const [paused, setPaused] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [models, setModels] = useState<AdvancedModel[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [autoMonitor, setAutoMonitor] = useState(false)
  const pauseRef = useRef(false)
  const abortRef = useRef(false)

  // 添加日志
  const addLog = useCallback((type: LogEntry['type'], msg: string) => {
    const entry: LogEntry = {
      time: new Date().toLocaleTimeString(),
      type,
      message: msg,
    }
    setLogs(prev => [entry, ...prev].slice(0, 100))
  }, [])

  // 加载高级模型
  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch('/api/models/advanced')
        const data = await res.json()
        if (data.success && data.data) {
          setModels(data.data)
          // 选择默认模型
          const defaultModel = data.data.find((m: AdvancedModel) => m.isDefault)
          if (defaultModel) {
            setSelectedModel(defaultModel.id)
          } else if (data.data.length > 0) {
            setSelectedModel(data.data[0].id)
          }
        }
      } catch (error) {
        console.error('Load models error:', error)
      }
    }
    loadModels()
  }, [])

  // 截图
  const captureScreen = async (): Promise<string | null> => {
    try {
      addLog('info', '正在截图...')
      const res = await fetch(`/api/agents/${deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'capture-screen' }),
      })
      const data = await res.json()
      if (data.success && data.data?.image) {
        setScreenshot(data.data.image)
        addLog('success', '截图完成')
        return data.data.image
      }
      addLog('error', '截图失败')
    } catch {
      addLog('error', '截图请求失败')
    }
    return null
  }

  // 截图并分析
  const captureAndAnalyze = async () => {
    setLoading(true)
    setAnalysis(null)
    
    // 1. 截图
    const img = await captureScreen()
    if (!img) {
      setLoading(false)
      return
    }

    // 2. OCR 识别
    addLog('info', '正在 OCR 识别...')
    try {
      const ocrRes = await fetch(`/api/agents/${deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'ocr', action: 'recognize', params: { image: img } }),
      })
      const ocrData = await ocrRes.json()
      
      if (ocrData.success && ocrData.data?.text) {
        addLog('success', `OCR 识别完成: ${ocrData.data.text.length} 字符`)
        
        // 3. AI 分析
        addLog('info', '正在 AI 分析...')
        const analyzeRes = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: ocrData.data.text, promptType: 'dev' }),
        })
        const analyzeData = await analyzeRes.json()
        
        if (analyzeData.success && analyzeData.data) {
          setAnalysis(analyzeData.data)
          addLog('success', '分析完成')
          
          // 检测问题
          if (analyzeData.data.problems?.length > 0) {
            addLog('warning', `检测到 ${analyzeData.data.problems.length} 个问题`)
          }
        }
      }
    } catch (e) {
      addLog('error', 'OCR/分析失败')
    }
    
    setLoading(false)
  }

  // 生成规划
  const generatePlan = async () => {
    if (!prompt.trim()) {
      message.warning('请输入任务描述')
      return
    }

    if (!selectedModel && models.length === 0) {
      message.warning('请先在设置页面配置高级模型')
      return
    }

    setLoading(true)
    setPlan(null)
    addLog('info', '正在生成任务规划...')

    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          modelId: selectedModel,
          context: screenshot ? { screenshot } : undefined,
        }),
      })
      const data = await res.json()

      if (data.success && data.plan) {
        setPlan(data.plan)
        addLog('success', `规划生成完成: ${data.plan.steps?.length || 0} 个步骤`)
        message.success('规划生成完成')
      } else {
        addLog('error', data.error || '规划生成失败')
        message.error(data.error || '规划生成失败')
      }
    } catch (e) {
      addLog('error', '规划请求失败')
      message.error('请求失败')
    }
    setLoading(false)
  }

  // 执行规划
  const executePlan = async () => {
    if (!plan || !plan.ready) {
      message.warning('规划未就绪')
      return
    }

    setExecuting(true)
    setPaused(false)
    pauseRef.current = false
    abortRef.current = false
    addLog('info', '开始执行任务规划')
    
    for (let i = 0; i < plan.steps.length; i++) {
      // 检查是否中止
      if (abortRef.current) {
        addLog('warning', '任务已中止')
        break
      }

      // 检查是否暂停
      while (pauseRef.current && !abortRef.current) {
        await new Promise(r => setTimeout(r, 500))
      }

      setCurrentStep(i)
      const step = plan.steps[i]
      
      // 更新步骤状态
      setPlan(prev => {
        if (!prev) return prev
        const newSteps = [...prev.steps]
        newSteps[i] = { ...newSteps[i], status: 'running' }
        return { ...prev, steps: newSteps }
      })

      addLog('info', `执行步骤 ${i + 1}: ${step.description}`)

      try {
        // 解析 action
        const [plugin, action] = step.action.split(':')
        const msg = step.params?.message || step.description
        
        const res = await fetch(`/api/agents/${deviceId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plugin: plugin || 'windsurf',
            action: action || 'send-message',
            params: { message: msg },
          }),
        })
        const data = await res.json()

        if (data.success) {
          setPlan(prev => {
            if (!prev) return prev
            const newSteps = [...prev.steps]
            newSteps[i] = { ...newSteps[i], status: 'done', result: '成功' }
            return { ...prev, steps: newSteps }
          })
          addLog('success', `步骤 ${i + 1} 完成`)
        } else {
          setPlan(prev => {
            if (!prev) return prev
            const newSteps = [...prev.steps]
            newSteps[i] = { ...newSteps[i], status: 'failed', error: data.error }
            return { ...prev, steps: newSteps }
          })
          addLog('error', `步骤 ${i + 1} 失败: ${data.error || '未知错误'}`)
          message.error(`步骤 ${i + 1} 执行失败`)
          break
        }

        // 等待让 IDE 处理
        if (i < plan.steps.length - 1) {
          addLog('info', '等待 IDE 处理...')
          await new Promise(r => setTimeout(r, 3000))
        }
      } catch (e) {
        setPlan(prev => {
          if (!prev) return prev
          const newSteps = [...prev.steps]
          newSteps[i] = { ...newSteps[i], status: 'failed', error: '请求失败' }
          return { ...prev, steps: newSteps }
        })
        addLog('error', `步骤 ${i + 1} 请求异常`)
        break
      }
    }

    setExecuting(false)
    setPaused(false)
    setCurrentStep(-1)
    
    const completed = plan.steps.filter(s => s.status === 'done').length
    if (completed === plan.steps.length) {
      addLog('success', '✅ 任务执行完成!')
      message.success('任务执行完成!')
    } else if (!abortRef.current) {
      addLog('warning', `任务部分完成 (${completed}/${plan.steps.length})`)
    }
  }

  // 暂停/继续
  const togglePause = () => {
    pauseRef.current = !pauseRef.current
    setPaused(pauseRef.current)
    addLog('info', pauseRef.current ? '任务已暂停' : '任务继续执行')
  }

  // 停止执行
  const stopExecution = () => {
    abortRef.current = true
    pauseRef.current = false
    setPaused(false)
    addLog('warning', '正在停止任务...')
  }

  // 发送到 IDE
  const sendToIDE = async (msg?: string) => {
    const text = msg || prompt
    if (!text.trim()) {
      message.warning('请输入任务描述')
      return
    }

    setLoading(true)
    addLog('info', `发送到 IDE: ${text.substring(0, 50)}...`)
    
    try {
      const res = await fetch(`/api/agents/${deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plugin: 'windsurf',
          action: 'send-message',
          params: { message: text },
        }),
      })
      const data = await res.json()
      if (data.success) {
        addLog('success', '已发送到 IDE')
        message.success('已发送到 IDE')
      } else {
        addLog('error', data.error || '发送失败')
        message.error(data.error || '发送失败')
      }
    } catch {
      addLog('error', '发送请求失败')
      message.error('发送失败')
    }
    setLoading(false)
  }

  // 一键执行：规划 + 执行
  const quickExecute = async () => {
    await generatePlan()
    // 规划完成后自动执行会在 useEffect 中处理
  }

  // 清空
  const clearAll = () => {
    setPrompt('')
    setPlan(null)
    setScreenshot(null)
    setAnalysis(null)
    setLogs([])
    addLog('info', '已清空')
  }

  const completedSteps = plan?.steps.filter(s => s.status === 'done').length || 0
  const totalSteps = plan?.steps.length || 0
  const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
  const hasProblems = analysis?.problems && analysis.problems.length > 0

  return (
    <div style={{ padding: 16 }}>
      {/* 顶部导航栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space size="large">
              <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
                返回
              </Button>
              <Space>
                <RobotOutlined style={{ fontSize: 24, color: '#1890ff' }} />
                <span style={{ fontSize: 18, fontWeight: 600 }}>AI 监管面板</span>
              </Space>
            </Space>
          </Col>
          <Col>
            <Space>
              {/* 模型选择 */}
              <Select
                value={selectedModel}
                onChange={setSelectedModel}
                style={{ width: 200 }}
                placeholder={models.length === 0 ? '请先配置模型' : '选择模型'}
                options={models.map((m: AdvancedModel) => ({
                  label: (
                    <Space>
                      <span>{m.name}</span>
                      {m.capabilities?.slice(0, 2).map((c: ModelCapability) => (
                        <Tag key={c} color={CAPABILITY_LABELS[c]?.color} style={{ fontSize: 10 }}>
                          {CAPABILITY_LABELS[c]?.icon}
                        </Tag>
                      ))}
                    </Space>
                  ),
                  value: m.id,
                }))}
              />
              <Tooltip title="日志">
                <Badge count={logs.filter(l => l.type === 'error').length} size="small">
                  <Button icon={<HistoryOutlined />} onClick={() => setShowLogs(true)} />
                </Badge>
              </Tooltip>
              <Link href="/settings">
                <Button icon={<SettingOutlined />}>设置</Button>
              </Link>
              <Button 
                icon={<CodeOutlined />} 
                onClick={() => window.open('/windsurf-test.html', '_blank')}
              >
                IDE 测试
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        {/* 左侧：任务输入 + 截图 */}
        <Col xs={24} lg={10}>
          <Card 
            title={<><ThunderboltOutlined /> 任务输入</>}
            size="small"
            style={{ marginBottom: 16 }}
          >
            <TextArea
              placeholder="描述你想要完成的任务...&#10;&#10;例如：帮我实现一个用户登录功能"
              rows={5}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              style={{ marginBottom: 12 }}
            />

            <Space wrap>
              <Button
                type="primary"
                icon={<BulbOutlined />}
                onClick={generatePlan}
                loading={loading}
                disabled={!prompt.trim()}
              >
                AI 规划
              </Button>
              <Button
                icon={<SendOutlined />}
                onClick={() => sendToIDE()}
                loading={loading}
                disabled={!prompt.trim()}
              >
                直发 IDE
              </Button>
              <Button
                icon={<CameraOutlined />}
                onClick={captureAndAnalyze}
                loading={loading}
              >
                截图分析
              </Button>
              <Button onClick={clearAll} disabled={loading}>
                清空
              </Button>
            </Space>
          </Card>

          {/* 截图预览 */}
          {screenshot && (
            <Card 
              title={<><EyeOutlined /> IDE 截图</>}
              size="small"
              style={{ marginBottom: 16 }}
              extra={
                hasProblems ? (
                  <Tag color="error"><ExclamationCircleOutlined /> 检测到问题</Tag>
                ) : analysis ? (
                  <Tag color="success"><CheckCircleOutlined /> 状态正常</Tag>
                ) : null
              }
            >
              <img 
                src={`data:image/png;base64,${screenshot}`} 
                alt="Screenshot"
                style={{ width: '100%', borderRadius: 8, marginBottom: 8 }}
              />
              
              {/* 分析结果 */}
              {analysis && (
                <div style={{ fontSize: 13 }}>
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>状态：</Text>
                    <Text>{analysis.status}</Text>
                  </div>
                  {analysis.problems?.length > 0 && (
                    <Alert
                      type="error"
                      message="检测到问题"
                      description={
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {analysis.problems.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      }
                      style={{ marginBottom: 8 }}
                    />
                  )}
                  {analysis.suggestions?.length > 0 && (
                    <div>
                      <Text strong>建议：</Text>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {analysis.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </Col>

        {/* 右侧：任务规划 + 执行 */}
        <Col xs={24} lg={14}>
          <Card 
            title={
              <Space>
                <span>📋 任务规划</span>
                {plan && (
                  <Tag color={plan.ready ? 'green' : 'orange'}>
                    {plan.ready ? '就绪' : '待确认'}
                  </Tag>
                )}
              </Space>
            }
            size="small"
            extra={
              plan && (
                <Space>
                  {executing ? (
                    <>
                      <Button 
                        icon={paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                        onClick={togglePause}
                      >
                        {paused ? '继续' : '暂停'}
                      </Button>
                      <Button 
                        danger 
                        icon={<StopOutlined />}
                        onClick={stopExecution}
                      >
                        停止
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={executePlan}
                      disabled={!plan.ready}
                    >
                      开始执行
                    </Button>
                  )}
                </Space>
              )
            }
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <Spin size="large" />
                <div style={{ marginTop: 16, color: '#666' }}>AI 正在分析...</div>
              </div>
            ) : plan ? (
              <div>
                {/* 目标 */}
                <Alert
                  message={<><strong>目标：</strong>{plan.goal}</>}
                  type="info"
                  style={{ marginBottom: 16 }}
                />

                {/* 进度统计 */}
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={8}>
                    <Statistic 
                      title="总步骤" 
                      value={totalSteps} 
                      prefix={<ClockCircleOutlined />}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic 
                      title="已完成" 
                      value={completedSteps} 
                      valueStyle={{ color: '#52c41a' }}
                      prefix={<CheckCircleOutlined />}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic 
                      title="进度" 
                      value={progress} 
                      suffix="%" 
                      valueStyle={{ color: progress === 100 ? '#52c41a' : '#1890ff' }}
                    />
                  </Col>
                </Row>

                {/* 进度条 */}
                {(executing || completedSteps > 0) && (
                  <Progress 
                    percent={progress} 
                    status={executing ? 'active' : (completedSteps === totalSteps ? 'success' : 'normal')}
                    style={{ marginBottom: 16 }}
                  />
                )}

                {/* 缺失信息提示 */}
                {!plan.ready && plan.analysis.questions?.length > 0 && (
                  <Alert
                    type="warning"
                    message="需要更多信息"
                    description={
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {plan.analysis.questions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    }
                    style={{ marginBottom: 16 }}
                  />
                )}

                {/* 步骤列表 */}
                <Timeline
                  items={plan.steps.map((step, index) => ({
                    color: step.status === 'done' ? 'green' 
                         : step.status === 'running' ? 'blue'
                         : step.status === 'failed' ? 'red'
                         : 'gray',
                    dot: step.status === 'running' ? <LoadingOutlined /> : undefined,
                    children: (
                      <div 
                        style={{ 
                          padding: '8px 12px',
                          background: currentStep === index ? '#e6f7ff' : (step.status === 'failed' ? '#fff2f0' : undefined),
                          borderRadius: 4,
                          marginBottom: 4,
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>
                          步骤 {index + 1}: {step.description}
                        </div>
                        {step.params?.message && step.params.message !== step.description && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            指令: {step.params.message.substring(0, 100)}...
                          </Text>
                        )}
                        {step.error && (
                          <Text type="danger" style={{ fontSize: 12, display: 'block' }}>
                            错误: {step.error}
                          </Text>
                        )}
                      </div>
                    ),
                  }))}
                />
              </div>
            ) : (
              <Empty
                image={<RobotOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
                description={
                  <div>
                    <div style={{ marginBottom: 8 }}>输入任务描述，AI 将帮你规划执行步骤</div>
                    {models.length === 0 && (
                      <Link href="/settings">
                        <Button type="link">先去配置高级模型 →</Button>
                      </Link>
                    )}
                  </div>
                }
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* 日志抽屉 */}
      <Drawer
        title={<><HistoryOutlined /> 操作日志</>}
        placement="right"
        width={400}
        onClose={() => setShowLogs(false)}
        open={showLogs}
        extra={
          <Button size="small" onClick={() => setLogs([])}>清空</Button>
        }
      >
        {logs.length === 0 ? (
          <Empty description="暂无日志" />
        ) : (
          <Timeline
            items={logs.map((log, i) => ({
              color: log.type === 'success' ? 'green' 
                   : log.type === 'error' ? 'red'
                   : log.type === 'warning' ? 'orange'
                   : 'blue',
              children: (
                <div key={i}>
                  <Text type="secondary" style={{ fontSize: 11 }}>{log.time}</Text>
                  <div>{log.message}</div>
                </div>
              ),
            }))}
          />
        )}
      </Drawer>
    </div>
  )
}
