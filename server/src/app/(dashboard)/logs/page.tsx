'use client'

import { useState } from 'react'
import { Card, Table, Input, Select, Space, Tag, Button, DatePicker } from 'antd'
import { SearchOutlined, DownloadOutlined, ClearOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

const { RangePicker } = DatePicker

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  source: string
  message: string
  deviceId?: string
}

// 模拟日志数据
const mockLogs: LogEntry[] = [
  { id: '1', timestamp: '2024-12-14 17:00:01', level: 'info', source: 'Agent', message: 'Agent started', deviceId: 'dev-1' },
  { id: '2', timestamp: '2024-12-14 17:00:02', level: 'info', source: 'WebSocket', message: 'Connected to server' },
  { id: '3', timestamp: '2024-12-14 17:00:05', level: 'debug', source: 'Plugin', message: 'WindowControl plugin loaded' },
  { id: '4', timestamp: '2024-12-14 17:00:10', level: 'warn', source: 'Screen', message: 'Low quality capture' },
  { id: '5', timestamp: '2024-12-14 17:00:15', level: 'error', source: 'Task', message: 'Task execution failed: timeout' },
]

export default function LogsPage() {
  const [logs] = useState<LogEntry[]>(mockLogs)
  const [searchText, setSearchText] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>()

  const levelColors: Record<string, string> = {
    info: 'blue',
    warn: 'orange',
    error: 'red',
    debug: 'default',
  }

  const columns: ColumnsType<LogEntry> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (level: string) => (
        <Tag color={levelColors[level]}>{level.toUpperCase()}</Tag>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 120,
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
    },
    {
      title: '设备',
      dataIndex: 'deviceId',
      key: 'deviceId',
      width: 100,
      render: (id?: string) => id || '-',
    },
  ]

  const filteredLogs = logs.filter(log => {
    if (levelFilter && log.level !== levelFilter) return false
    if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  })

  const handleExport = () => {
    const content = filteredLogs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`)
      .join('\n')
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card
      title="日志查看"
      extra={
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出
          </Button>
          <Button icon={<ClearOutlined />}>
            清空
          </Button>
        </Space>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="搜索日志..."
          prefix={<SearchOutlined />}
          style={{ width: 300 }}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          allowClear
        />
        <Select
          placeholder="日志级别"
          style={{ width: 120 }}
          value={levelFilter}
          onChange={setLevelFilter}
          allowClear
          options={[
            { label: 'INFO', value: 'info' },
            { label: 'WARN', value: 'warn' },
            { label: 'ERROR', value: 'error' },
            { label: 'DEBUG', value: 'debug' },
          ]}
        />
        <RangePicker showTime />
      </Space>

      <Table
        columns={columns}
        dataSource={filteredLogs}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 20 }}
      />
    </Card>
  )
}
