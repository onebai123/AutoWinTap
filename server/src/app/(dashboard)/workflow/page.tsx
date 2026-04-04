'use client'

import { useEffect, useState } from 'react'
import { Card, Button, Input, Select, message, Spin, Space, Layout, Typography } from 'antd'
import { CodeOutlined, PlayCircleOutlined } from '@ant-design/icons'
import type { Device } from '@/types'

const { TextArea } = Input
const { Title, Text } = Typography

const DEFAULT_WORKFLOW = JSON.stringify({
  "steps": [
    {
      "id": "step_find",
      "action": "window-control.find",
      "params": {
        "processNamePattern": "Antigravity"
      }
    },
    {
      "id": "step_activate",
      "action": "window-control.activate",
      "params": {
        "handle": "${step_find.handle}"
      }
    },
    {
      "id": "step_delay",
      "action": "system.delay",
      "params": { "ms": 500 }
    },
    {
      "id": "step_send",
      "action": "window-control.send-keys",
      "params": {
        "keys": "来自 Web 自动化宏的问候！{Enter}"
      }
    }
  ]
}, null, 2)

export default function WorkflowPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [workflowJson, setWorkflowJson] = useState(DEFAULT_WORKFLOW)
  const [result, setResult] = useState<string>('')

  const fetchDevices = async () => {
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      if (data.success) {
        const onlineDevices = data.data.filter((d: Device) => d.status === 'ONLINE')
        setDevices(onlineDevices)
        if (onlineDevices.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(onlineDevices[0].id)
        }
      }
    } catch (error) {
      message.error('获取设备列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevices()
  }, [])

  const handleTestWorkflow = async () => {
    if (!selectedDeviceId) {
      message.warning('请先选择一个在线设备')
      return
    }

    let parsedJson
    try {
      parsedJson = JSON.parse(workflowJson)
    } catch (e) {
      message.error('工作流 JSON 格式错误')
      return
    }

    setExecuting(true)
    setResult('正在执行工作流，请稍后...\n注：目标窗口可能跳到前台获得焦点。')

    try {
      const startTime = Date.now()
      const res = await fetch(`/api/agents/${selectedDeviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plugin: 'workflow',
          action: 'run',
          params: parsedJson
        })
      })
      
      const resData = await res.json()
      const duration = Date.now() - startTime
      
      setResult(`执行完成 (耗时 ${duration}ms):\n\n${JSON.stringify(resData, null, 2)}`)

      if (resData.success) {
        message.success('工作流执行成功！')
      } else {
        message.error(`执行出错: ${resData.error || '未知错误'}`)
      }
    } catch (error: any) {
      message.error('请求失败')
      setResult(`请求失败:\n${error.message}`)
    } finally {
      setExecuting(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 50, textAlign: 'center' }}><Spin size="large" /></div>
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>工作流编排测试</Title>
          <Text type="secondary">发送一连串动作在 Agent 侧本地闭环执行，解决网络延时和焦点切换等问题。</Text>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* 左侧：输入配置区 */}
        <div style={{ flex: '1 1 500px' }}>
          <Card 
            title={<><CodeOutlined /> 动作编排 (JSON DSL)</>}
            extra={
              <Space>
                <Select 
                  placeholder="选择目标设备"
                  style={{ width: 220 }}
                  value={selectedDeviceId}
                  onChange={setSelectedDeviceId}
                  options={devices.map(d => ({ label: `${d.hostname} (${d.ip})`, value: d.id }))}
                />
                <Button 
                  type="primary" 
                  icon={<PlayCircleOutlined />} 
                  onClick={handleTestWorkflow}
                  loading={executing}
                  disabled={!selectedDeviceId}
                >
                  运行宏
                </Button>
              </Space>
            }
          >
            <TextArea
              value={workflowJson}
              onChange={e => setWorkflowJson(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 13, minHeight: 450 }}
              autoSize={{ minRows: 20, maxRows: 30 }}
            />
          </Card>
        </div>

        {/* 右侧：结果日志区 */}
        <div style={{ flex: '1 1 400px' }}>
          <Card title="执行日志记录">
            <pre style={{ 
              backgroundColor: '#1e1e1e', 
              color: '#d4d4d4', 
              padding: 16, 
              borderRadius: 6,
              minHeight: 450,
              maxHeight: 600,
              overflow: 'auto',
              fontFamily: 'Consolas, monospace',
              fontSize: 13,
              margin: 0
            }}>
              {result || '等待执行...'}
            </pre>
          </Card>
        </div>
      </div>
    </div>
  )
}
