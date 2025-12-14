'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Tabs, Button, Space, Tag, Empty, message, Typography, List, Input, Select, Row, Col, Table, Modal, Badge, Tooltip, Alert, Switch } from 'antd'
import { ChromeOutlined, ReloadOutlined, LinkOutlined, CodeOutlined, ApiOutlined, PlayCircleOutlined, DisconnectOutlined, ClearOutlined, SearchOutlined, InfoCircleOutlined, SyncOutlined, AimOutlined, EyeOutlined } from '@ant-design/icons'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface Device {
  id: string
  hostname: string
  status: string
}

interface ChromePage {
  id: string
  title: string
  url: string
  isConnected: boolean
}

interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'info'
  text: string
  timestamp: string
}

interface NetworkRequest {
  id: string
  method: string
  url: string
  status: number
  type: string
  time: number
}

interface DomChange {
  type: string
  target: string
  added: number
  removed: number
  attribute?: string
  time: number
}

interface ElementInfo {
  tag: string
  id: string
  className: string
  text: string
  rect: { x: number; y: number; width: number; height: number }
  display: string
  position: string
  margin: string
  padding: string
  children: number
}

export default function BrowserDebugPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [pages, setPages] = useState<ChromePage[]>([])
  const [connectedPage, setConnectedPage] = useState<string | null>(null)
  const [consoleLogs, setConsoleLogs] = useState<ConsoleMessage[]>([])
  const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>([])
  const [domChanges, setDomChanges] = useState<DomChange[]>([])
  const [elements, setElements] = useState<ElementInfo[]>([])
  const [elementSelector, setElementSelector] = useState('body > *')
  const [selectedElement, setSelectedElement] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [consoleFilter, setConsoleFilter] = useState<string>('all')
  const [consoleSearch, setConsoleSearch] = useState('')
  const [networkFilter, setNetworkFilter] = useState<string>('all')
  const [executeCode, setExecuteCode] = useState('')
  const [executeResult, setExecuteResult] = useState<string | null>(null)
  const [detailModal, setDetailModal] = useState<NetworkRequest | null>(null)
  const [autoConnect, setAutoConnect] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // 加载设备
  useEffect(() => {
    loadDevices()
  }, [])

  // 自动刷新数据
  useEffect(() => {
    if (!autoRefresh || !connectedPage) return
    const interval = setInterval(() => {
      loadConsole(connectedPage)
      loadNetwork(connectedPage)
      loadDomChanges(connectedPage)
    }, 3000)
    return () => clearInterval(interval)
  }, [autoRefresh, connectedPage])

  const loadDevices = async () => {
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      if (data.success) {
        const online = data.data.filter((d: Device) => d.status === 'ONLINE')
        setDevices(online)
        if (online.length > 0 && !selectedDevice) {
          setSelectedDevice(online[0].id)
        }
      }
    } catch {}
  }

  // 加载页面
  const loadPages = useCallback(async () => {
    if (!selectedDevice) return
    setLoading(true)
    try {
      const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'browser-debug', action: 'get-pages' }),
      })
      const data = await res.json()
      if (data.success) {
        const pageList = data.data || []
        setPages(pageList)
        // 自动连接第一个页面
        if (autoConnect && pageList.length > 0 && !connectedPage) {
          connectPage(pageList[0].id)
        }
      }
    } catch {
      message.error('获取页面失败')
    }
    setLoading(false)
  }, [selectedDevice, autoConnect, connectedPage])

  useEffect(() => {
    if (selectedDevice) loadPages()
  }, [selectedDevice, loadPages])

  // 连接页面
  const connectPage = async (pageId: string) => {
    try {
      const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'browser-debug', action: 'connect', params: { pageId } }),
      })
      const data = await res.json()
      if (data.success) {
        setConnectedPage(pageId)
        message.success('已连接')
        // 加载日志、网络和DOM变化
        loadConsole(pageId)
        loadNetwork(pageId)
        loadDomChanges(pageId)
      } else {
        message.error(data.error || '连接失败')
      }
    } catch {
      message.error('连接失败')
    }
  }

  // 断开连接
  const disconnectPage = async () => {
    if (!connectedPage) return
    try {
      await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'browser-debug', action: 'disconnect', params: { pageId: connectedPage } }),
      })
      setConnectedPage(null)
      setConsoleLogs([])
      setNetworkRequests([])
      setDomChanges([])
      message.success('已断开')
    } catch {}
  }

  // 加载控制台日志
  const loadConsole = async (pageId: string) => {
    try {
      const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'browser-debug', action: 'get-console', params: { pageId } }),
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setConsoleLogs(data.data)
      }
    } catch {}
  }

  // 加载网络请求
  const loadNetwork = async (pageId: string) => {
    try {
      const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'browser-debug', action: 'get-network', params: { pageId } }),
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setNetworkRequests(data.data)
      }
    } catch {}
  }

  // 加载 DOM 变化
  const loadDomChanges = async (pageId: string) => {
    try {
      const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'browser-debug', action: 'get-dom-changes', params: { pageId } }),
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setDomChanges(data.data)
      }
    } catch {}
  }

  // 加载元素列表
  const loadElements = async (selector: string = elementSelector) => {
    if (!connectedPage) return
    try {
      const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'browser-debug', action: 'get-elements', params: { pageId: connectedPage, selector } }),
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setElements(data.data)
      }
    } catch {}
  }

  // 获取元素样式详情
  const getElementStyle = async (selector: string) => {
    if (!connectedPage) return
    try {
      const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'browser-debug', action: 'get-element-style', params: { pageId: connectedPage, selector } }),
      })
      const data = await res.json()
      if (data.success) {
        setSelectedElement(data.data)
      }
    } catch {}
  }

  // 高亮元素
  const highlightElement = async (selector: string) => {
    if (!connectedPage) return
    await fetch(`/api/agents/${selectedDevice}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: 'browser-debug', action: 'highlight-element', params: { pageId: connectedPage, selector } }),
    })
  }

  // 执行脚本
  const executeScript = async () => {
    if (!connectedPage || !executeCode.trim()) return
    try {
      const res = await fetch(`/api/agents/${selectedDevice}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plugin: 'browser-debug',
          action: 'execute-script',
          params: { pageId: connectedPage, script: executeCode },
        }),
      })
      const data = await res.json()
      if (data.success) {
        setExecuteResult(JSON.stringify(data.data, null, 2))
        message.success('执行成功')
      } else {
        setExecuteResult(`Error: ${data.error}`)
      }
    } catch {
      setExecuteResult('执行失败')
    }
  }

  // 刷新数据
  const refreshData = () => {
    if (connectedPage) {
      loadConsole(connectedPage)
      loadNetwork(connectedPage)
    }
  }

  // 筛选日志
  const filteredLogs = consoleLogs.filter(log => {
    const logType = log.type || 'log'
    const logText = log.text || ''
    if (consoleFilter !== 'all' && logType !== consoleFilter) return false
    if (consoleSearch && !logText.toLowerCase().includes(consoleSearch.toLowerCase())) return false
    return true
  })

  // 筛选网络
  const filteredNetwork = networkRequests.filter(req => {
    if (networkFilter !== 'all' && req.type !== networkFilter) return false
    return true
  })

  const logTypeColors: Record<string, string> = {
    log: 'default', info: 'blue', warn: 'orange', error: 'red'
  }

  const networkColumns = [
    { title: '方法', dataIndex: 'method', width: 80, render: (m: string) => <Tag>{m}</Tag> },
    { title: 'URL', dataIndex: 'url', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 80, render: (s: number) => (
      <Tag color={s >= 200 && s < 300 ? 'green' : s >= 400 ? 'red' : 'default'}>{s || '-'}</Tag>
    )},
    { title: '类型', dataIndex: 'type', width: 80 },
    { title: '耗时', dataIndex: 'time', width: 80, render: (t: number) => t ? `${t}ms` : '-' },
  ]

  return (
    <div>
      {/* 头部 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row align="middle" gutter={16}>
          <Col>
            <Space>
              <ChromeOutlined style={{ fontSize: 20 }} />
              <Text strong>浏览器调试</Text>
            </Space>
          </Col>
          <Col>
            <Select
              value={selectedDevice}
              onChange={v => { setSelectedDevice(v); setConnectedPage(null); setConsoleLogs([]); setNetworkRequests([]) }}
              style={{ width: 200 }}
              placeholder="选择设备"
            >
              {devices.map(d => (
                <Select.Option key={d.id} value={d.id}>{d.hostname}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={loadPages} loading={loading}>刷新页面</Button>
          </Col>
          {connectedPage && (
            <Col>
              <Button icon={<ReloadOutlined />} onClick={refreshData}>刷新数据</Button>
            </Col>
          )}
          <Col flex="auto" />
          <Col>
            <Space>
              <Tooltip title="自动连接第一个页面">
                <Switch 
                  checkedChildren="自动连接" 
                  unCheckedChildren="手动" 
                  checked={autoConnect} 
                  onChange={setAutoConnect}
                />
              </Tooltip>
              <Tooltip title="每3秒自动刷新日志和网络">
                <Switch 
                  checkedChildren={<><SyncOutlined spin /> 自动刷新</>} 
                  unCheckedChildren="手动刷新" 
                  checked={autoRefresh} 
                  onChange={setAutoRefresh}
                  disabled={!connectedPage}
                />
              </Tooltip>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Chrome 启动提示 */}
      {pages.length === 0 && !loading && (
        <Alert
          type="info"
          icon={<InfoCircleOutlined />}
          message="未检测到 Chrome 页面"
          description={
            <div>
              <p>请以调试模式启动 Chrome：</p>
              <code style={{ background: '#f5f5f5', padding: '8px', display: 'block', borderRadius: 4 }}>
                chrome.exe --remote-debugging-port=9222
              </code>
              <p style={{ marginTop: 8 }}>或关闭所有 Chrome 后重新启动</p>
            </div>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 页面列表 */}
      <Card title="📑 页面列表" size="small" style={{ marginBottom: 16 }}>
        {pages.length === 0 ? (
          <Empty description="无页面" />
        ) : (
          <List
            size="small"
            dataSource={pages}
            renderItem={page => (
              <List.Item
                actions={[
                  connectedPage === page.id ? (
                    <Button key="disconnect" danger size="small" icon={<DisconnectOutlined />} onClick={disconnectPage}>
                      断开
                    </Button>
                  ) : (
                    <Button key="connect" type="primary" size="small" icon={<LinkOutlined />} onClick={() => connectPage(page.id)}>
                      连接
                    </Button>
                  ),
                ]}
              >
                <List.Item.Meta
                  avatar={connectedPage === page.id ? <Badge status="success" /> : <Badge status="default" />}
                  title={page.title || '(无标题)'}
                  description={<Text type="secondary" ellipsis>{page.url}</Text>}
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* 调试面板 */}
      {connectedPage && (
        <Card size="small">
          <Tabs
            items={[
              {
                key: 'console',
                label: <span><CodeOutlined /> 控制台 ({filteredLogs.length})</span>,
                children: (
                  <div>
                    <Row gutter={8} style={{ marginBottom: 8 }}>
                      <Col>
                        <Select value={consoleFilter} onChange={setConsoleFilter} style={{ width: 100 }}>
                          <Select.Option value="all">全部</Select.Option>
                          <Select.Option value="log">Log</Select.Option>
                          <Select.Option value="info">Info</Select.Option>
                          <Select.Option value="warn">Warn</Select.Option>
                          <Select.Option value="error">Error</Select.Option>
                        </Select>
                      </Col>
                      <Col flex="auto">
                        <Input
                          prefix={<SearchOutlined />}
                          placeholder="搜索日志..."
                          value={consoleSearch}
                          onChange={e => setConsoleSearch(e.target.value)}
                          allowClear
                        />
                      </Col>
                      <Col>
                        <Button icon={<ClearOutlined />} onClick={() => setConsoleLogs([])}>清空</Button>
                      </Col>
                    </Row>
                    <div style={{ maxHeight: 300, overflow: 'auto', background: '#1e1e1e', padding: 8, borderRadius: 4 }}>
                      {filteredLogs.length === 0 ? (
                        <Text type="secondary">暂无日志</Text>
                      ) : (
                        filteredLogs.map((log, i) => {
                          const logType = log.type || 'log'
                          return (
                            <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 4 }}>
                              <Tag color={logTypeColors[logType] || 'default'} style={{ marginRight: 8 }}>
                                {logType.toUpperCase()}
                              </Tag>
                              <Text style={{ color: logType === 'error' ? '#ff6b6b' : logType === 'warn' ? '#ffd93d' : '#98c379' }}>
                                {log.text || ''}
                              </Text>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'network',
                label: <span><ApiOutlined /> 网络 ({filteredNetwork.length})</span>,
                children: (
                  <div>
                    <Row gutter={8} style={{ marginBottom: 8 }}>
                      <Col>
                        <Select value={networkFilter} onChange={setNetworkFilter} style={{ width: 100 }}>
                          <Select.Option value="all">全部</Select.Option>
                          <Select.Option value="xhr">XHR</Select.Option>
                          <Select.Option value="fetch">Fetch</Select.Option>
                          <Select.Option value="document">Doc</Select.Option>
                          <Select.Option value="script">JS</Select.Option>
                          <Select.Option value="stylesheet">CSS</Select.Option>
                        </Select>
                      </Col>
                      <Col>
                        <Button icon={<ClearOutlined />} onClick={() => setNetworkRequests([])}>清空</Button>
                      </Col>
                    </Row>
                    <Table
                      size="small"
                      columns={networkColumns}
                      dataSource={filteredNetwork}
                      rowKey="id"
                      pagination={false}
                      scroll={{ y: 250 }}
                      onRow={record => ({ onClick: () => setDetailModal(record) })}
                    />
                  </div>
                ),
              },
              {
                key: 'dom',
                label: <span>🔄 DOM ({domChanges.length})</span>,
                children: (
                  <div>
                    <Row gutter={8} style={{ marginBottom: 8 }}>
                      <Col>
                        <Button icon={<ClearOutlined />} onClick={() => setDomChanges([])}>清空</Button>
                      </Col>
                      <Col>
                        <Text type="secondary">监听页面 DOM 结构变化</Text>
                      </Col>
                    </Row>
                    <div style={{ maxHeight: 300, overflow: 'auto', background: '#1e1e1e', padding: 8, borderRadius: 4 }}>
                      {domChanges.length === 0 ? (
                        <Text type="secondary">暂无 DOM 变化</Text>
                      ) : (
                        domChanges.slice().reverse().map((change, i) => (
                          <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 4, color: '#abb2bf' }}>
                            <Tag color={change.type === 'childList' ? 'blue' : change.type === 'attributes' ? 'orange' : 'green'}>
                              {change.type}
                            </Tag>
                            <Text style={{ color: '#e5c07b' }}>{change.target}</Text>
                            {change.added > 0 && <Tag color="green">+{change.added}</Tag>}
                            {change.removed > 0 && <Tag color="red">-{change.removed}</Tag>}
                            {change.attribute && <Tag color="purple">{change.attribute}</Tag>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'elements',
                label: <span><AimOutlined /> 元素 ({elements.length})</span>,
                children: (
                  <div>
                    <Row gutter={8} style={{ marginBottom: 8 }}>
                      <Col flex="auto">
                        <Input
                          prefix={<SearchOutlined />}
                          placeholder="CSS选择器，如: .container, #app, div"
                          value={elementSelector}
                          onChange={e => setElementSelector(e.target.value)}
                          onPressEnter={() => loadElements()}
                        />
                      </Col>
                      <Col>
                        <Button type="primary" onClick={() => loadElements()}>查询</Button>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={selectedElement ? 12 : 24}>
                        <div style={{ maxHeight: 280, overflow: 'auto' }}>
                          <Table
                            size="small"
                            dataSource={elements}
                            rowKey={(r, i) => `${r.tag}-${i}`}
                            pagination={false}
                            columns={[
                              { title: '元素', dataIndex: 'tag', width: 80, render: (tag: string, r: ElementInfo) => (
                                <Tag color="blue">{tag}{r.id ? `#${r.id}` : ''}</Tag>
                              )},
                              { title: '位置/尺寸', dataIndex: 'rect', width: 150, render: (rect: ElementInfo['rect']) => (
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  {rect.width}×{rect.height} @ ({rect.x},{rect.y})
                                </Text>
                              )},
                              { title: '布局', dataIndex: 'display', width: 80 },
                              { title: '操作', width: 100, render: (_: unknown, r: ElementInfo) => {
                                const sel = r.id ? `#${r.id}` : r.className ? `.${r.className.split(' ')[0]}` : r.tag.toLowerCase()
                                return (
                                  <Space size={4}>
                                    <Tooltip title="高亮">
                                      <Button size="small" icon={<EyeOutlined />} onClick={() => highlightElement(sel)} />
                                    </Tooltip>
                                    <Tooltip title="样式详情">
                                      <Button size="small" icon={<AimOutlined />} onClick={() => getElementStyle(sel)} />
                                    </Tooltip>
                                  </Space>
                                )
                              }},
                            ]}
                          />
                        </div>
                      </Col>
                      {selectedElement && (
                        <Col span={12}>
                          <Card size="small" title="样式详情" extra={<Button size="small" onClick={() => setSelectedElement(null)}>关闭</Button>}>
                            <pre style={{ fontSize: 11, margin: 0, maxHeight: 240, overflow: 'auto', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                              {JSON.stringify(selectedElement, null, 2)}
                            </pre>
                          </Card>
                        </Col>
                      )}
                    </Row>
                  </div>
                ),
              },
              {
                key: 'execute',
                label: <span><PlayCircleOutlined /> 执行</span>,
                children: (
                  <div>
                    <TextArea
                      rows={4}
                      placeholder="输入 JavaScript 代码..."
                      value={executeCode}
                      onChange={e => setExecuteCode(e.target.value)}
                      style={{ fontFamily: 'monospace', marginBottom: 8 }}
                    />
                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={executeScript}>
                      执行
                    </Button>
                    {executeResult && (
                      <div style={{ marginTop: 8, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                        <Text strong>结果：</Text>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{executeResult}</pre>
                      </div>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* 网络详情弹窗 */}
      <Modal
        title="请求详情"
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={null}
        width={600}
      >
        {detailModal && (
          <div>
            <p><Text strong>URL:</Text> {detailModal.url}</p>
            <p><Text strong>方法:</Text> {detailModal.method}</p>
            <p><Text strong>状态:</Text> {detailModal.status}</p>
            <p><Text strong>类型:</Text> {detailModal.type}</p>
            <p><Text strong>耗时:</Text> {detailModal.time}ms</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
