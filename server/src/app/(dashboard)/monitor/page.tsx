'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Row, Col, Empty, Select, Typography, List, Tag, Button, Statistic, Space, Checkbox, Spin, Input, Divider, Alert, message } from 'antd'
import { DesktopOutlined, ReloadOutlined, PauseOutlined, PlayCircleOutlined, FileTextOutlined, RobotOutlined, CopyOutlined, AppstoreOutlined, SettingOutlined } from '@ant-design/icons'
import Link from 'next/link'

const { Title, Text } = Typography
const { TextArea } = Input

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
  bounds: { left: number; top: number; width: number; height: number }
  isMinimized?: boolean
}

export default function MonitorPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>()
  const [screenData, setScreenData] = useState<string>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // 新增状态
  const [windows, setWindows] = useState<WindowInfo[]>([])
  const [selectedWindows, setSelectedWindows] = useState<number[]>([])
  const [ocrText, setOcrText] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [aiResult, setAiResult] = useState<{ status: string; problems: string[]; suggestions: string[]; raw?: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'ocr' | 'ai'>('ocr')

  // 加载设备列表
  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setDevices(data.data.filter((d: Device) => d.status === 'ONLINE'))
        }
      })
      .catch(() => {})
  }, [])

  // 加载窗口列表
  const loadWindows = useCallback(async () => {
    if (!selectedDevice) return
    try {
      const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'list' }),
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setWindows(data.data.filter((w: WindowInfo) => 
          w.title && !w.title.includes('Program Manager')
        ))
      }
    } catch {}
  }, [selectedDevice])

  // 设备变更时加载窗口和截图
  useEffect(() => {
    if (selectedDevice) {
      loadWindows()
      fetchScreen()  // 自动加载第一帧
    }
  }, [selectedDevice, loadWindows])

  // 获取屏幕画面
  const fetchScreen = async () => {
    if (!selectedDevice) return
    try {
      const res = await fetch(`/api/screen/${selectedDevice}`)
      const data = await res.json()
      if (data.success) {
        setScreenData(data.data.image)
        setLastUpdate(new Date())
      }
    } catch {}
  }

  // 开始/停止流
  const toggleStream = () => {
    if (isStreaming) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setIsStreaming(false)
    } else {
      fetchScreen()
      intervalRef.current = setInterval(fetchScreen, 1000)
      setIsStreaming(true)
    }
  }

  // 清理
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // 设备变更时停止流
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      setIsStreaming(false)
    }
    setScreenData(undefined)
    setOcrText('')
    setAiResult(null)
    setSelectedWindows([])
  }, [selectedDevice])

  // OCR 屏幕
  const performOcr = async () => {
    if (!selectedDevice) return
    setOcrLoading(true)
    try {
      const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'ocr-screen' }),
      })
      const data = await res.json()
      if (data.success) {
        setOcrText(data.data.text || '')
        message.success('✓ OCR 完成')
      } else {
        message.error(data.error || 'OCR 失败')
      }
    } catch {
      message.error('OCR 请求失败')
    }
    setOcrLoading(false)
  }

  // AI 分析
  const performAiAnalysis = async () => {
    if (!ocrText.trim()) {
      message.warning('请先执行 OCR 提取文字')
      return
    }
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ocrText }),
      })
      const data = await res.json()
      if (data.success) {
        setAiResult(data.data)
        setActiveTab('ai')
        message.success('✓ AI 分析完成')
      } else {
        message.error(data.error || 'AI 分析失败')
      }
    } catch {
      message.error('AI 请求失败')
    }
    setAiLoading(false)
  }

  // 复制文字
  const copyText = () => {
    navigator.clipboard.writeText(ocrText)
    message.success('已复制')
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" gutter={16}>
          <Col>
            <Title level={5} style={{ margin: 0 }}>选择设备:</Title>
          </Col>
          <Col flex={1}>
            <Select
              style={{ width: 300 }}
              placeholder="选择要监控的设备"
              value={selectedDevice}
              onChange={setSelectedDevice}
              options={devices.map(d => ({ label: `${d.hostname} (${d.ip})`, value: d.id }))}
              notFoundContent="暂无在线设备"
            />
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={fetchScreen} disabled={!selectedDevice}>
                刷新
              </Button>
              <Button 
                type={isStreaming ? 'default' : 'primary'}
                icon={isStreaming ? <PauseOutlined /> : <PlayCircleOutlined />} 
                onClick={toggleStream}
                disabled={!selectedDevice}
              >
                {isStreaming ? '暂停' : '实时'}
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        {/* 左侧：屏幕画面 */}
        <Col span={14}>
          <Card 
            title={
              <Space>
                <DesktopOutlined />
                <span>屏幕画面</span>
                {isStreaming && <Tag color="processing">实时</Tag>}
              </Space>
            } 
            extra={
              <Space>
                {lastUpdate && <Text type="secondary">{lastUpdate.toLocaleTimeString()}</Text>}
                <Button icon={<FileTextOutlined />} onClick={performOcr} loading={ocrLoading} disabled={!selectedDevice}>
                  OCR
                </Button>
              </Space>
            }
          >
            {screenData ? (
              <img 
                src={`data:image/jpeg;base64,${screenData}`} 
                alt="Screen" 
                style={{ width: '100%', height: 'auto', maxHeight: 380, objectFit: 'contain', background: '#000' }}
              />
            ) : (
              <Empty
                image={<DesktopOutlined style={{ fontSize: 64, color: '#999' }} />}
                description="选择设备后显示实时画面"
                style={{ padding: 60 }}
              />
            )}
          </Card>
        </Col>

        {/* 右侧：窗口列表 */}
        <Col span={10}>
          <Card 
            title={<><AppstoreOutlined /> 窗口列表 ({windows.length})</>}
            extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadWindows}>刷新</Button>}
            style={{ marginBottom: 16 }}
            bodyStyle={{ maxHeight: 200, overflow: 'auto', padding: 8 }}
          >
            {windows.length > 0 ? (
              <List
                size="small"
                dataSource={windows.slice(0, 10)}
                renderItem={(w) => (
                  <List.Item style={{ padding: '4px 8px' }}>
                    <Checkbox 
                      checked={selectedWindows.includes(w.handle)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedWindows([...selectedWindows, w.handle])
                        } else {
                          setSelectedWindows(selectedWindows.filter(h => h !== w.handle))
                        }
                      }}
                    >
                      <Tag color="blue" style={{ marginRight: 4 }}>{w.processName}</Tag>
                      <Text ellipsis style={{ maxWidth: 150 }}>{w.title}</Text>
                    </Checkbox>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="无窗口" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>

          {/* 设备状态 */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="状态" value={selectedDevice ? '在线' : '-'} valueStyle={{ color: '#52c41a', fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="帧率" value={isStreaming ? '1 FPS' : '-'} valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="窗口" value={windows.length} valueStyle={{ fontSize: 16 }} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* 下方：OCR 和 AI 分析 */}
      <Card 
        style={{ marginTop: 16 }}
        tabList={[
          { key: 'ocr', tab: <><FileTextOutlined /> OCR 文字</> },
          { key: 'ai', tab: <><RobotOutlined /> AI 分析</> },
        ]}
        activeTabKey={activeTab}
        onTabChange={(k) => setActiveTab(k as 'ocr' | 'ai')}
        tabBarExtraContent={
          <Space>
            <Button icon={<CopyOutlined />} onClick={copyText} disabled={!ocrText}>复制</Button>
            <Button type="primary" icon={<RobotOutlined />} onClick={performAiAnalysis} loading={aiLoading} disabled={!ocrText}>
              AI 分析
            </Button>
            <Link href="/settings">
              <Button icon={<SettingOutlined />}>配置 AI</Button>
            </Link>
          </Space>
        }
      >
        {activeTab === 'ocr' ? (
          <div>
            {ocrLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="正在识别..." /></div>
            ) : ocrText ? (
              <TextArea 
                value={ocrText} 
                onChange={e => setOcrText(e.target.value)}
                rows={8} 
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            ) : (
              <Empty description="点击上方 OCR 按钮提取屏幕文字" />
            )}
          </div>
        ) : (
          <div>
            {aiLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="AI 分析中..." /></div>
            ) : aiResult ? (
              <div>
                <Alert message="当前状态" description={aiResult.status} type="info" showIcon style={{ marginBottom: 12 }} />
                {aiResult.problems.length > 0 && (
                  <Alert 
                    message="检测到的问题" 
                    description={<ul style={{ margin: 0, paddingLeft: 20 }}>{aiResult.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
                    type="warning" 
                    showIcon 
                    style={{ marginBottom: 12 }} 
                  />
                )}
                {aiResult.suggestions.length > 0 && (
                  <Alert 
                    message="建议操作" 
                    description={<ul style={{ margin: 0, paddingLeft: 20 }}>{aiResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>}
                    type="success" 
                    showIcon 
                  />
                )}
              </div>
            ) : (
              <Empty description="先执行 OCR，然后点击「AI 分析」" />
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
