'use client'

import { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Modal, Form, Input, Select, message } from 'antd'
import { PlusOutlined, PlayCircleOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

interface Task {
  id: string
  name: string
  type: string
  plugin: string
  action: string
  params: string
  status: string
  deviceId: string
  device?: { hostname: string }
  result?: string
  createdAt: string
}

interface Device {
  id: string
  hostname: string
  status: string
}

const plugins = [
  { id: 'window-control', name: '窗口控制', actions: ['list', 'activate', 'minimize', 'capture-screen'] },
  { id: 'browser-debug', name: '浏览器调试', actions: ['get-pages', 'execute-script', 'get-console'] },
  { id: 'windsurf', name: 'Windsurf IDE', actions: ['is-running', 'activate', 'execute-task'] },
]

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [detailModal, setDetailModal] = useState<Task | null>(null)
  const [selectedPlugin, setSelectedPlugin] = useState<string>()
  const [form] = Form.useForm()

  // 加载数据
  useEffect(() => {
    loadTasks()
    loadDevices()
  }, [])

  const loadTasks = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tasks')
      const data = await res.json()
      if (data.success) setTasks(data.data)
    } catch {}
    setLoading(false)
  }

  const loadDevices = async () => {
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      if (data.success) setDevices(data.data.filter((d: Device) => d.status === 'ONLINE'))
    } catch {}
  }

  const handleCreate = async (values: Record<string, string>) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (data.success) {
        message.success('任务创建成功')
        setCreateModal(false)
        form.resetFields()
        loadTasks()
      } else {
        message.error(data.error)
      }
    } catch {
      message.error('创建失败')
    }
  }

  const handleExecute = async (task: Task) => {
    try {
      const res = await fetch('/api/tasks/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id }),
      })
      const data = await res.json()
      if (data.success) {
        message.success('任务已执行')
        loadTasks()
      } else {
        message.error(data.error)
      }
    } catch {
      message.error('执行失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      message.success('任务已删除')
      loadTasks()
    } catch {
      message.error('删除失败')
    }
  }

  const statusColors: Record<string, string> = {
    PENDING: 'default',
    RUNNING: 'processing',
    SUCCESS: 'success',
    FAILED: 'error',
  }

  const columns: ColumnsType<Task> = [
    { title: '任务名', dataIndex: 'name', key: 'name' },
    { title: '插件', dataIndex: 'plugin', key: 'plugin' },
    { title: '动作', dataIndex: 'action', key: 'action' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={statusColors[s] || 'default'}>{s}</Tag>,
    },
    {
      title: '设备',
      dataIndex: 'device',
      key: 'device',
      render: (d?: { hostname: string }) => d?.hostname || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (t: string) => new Date(t).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button type="text" icon={<EyeOutlined />} onClick={() => setDetailModal(record)} />
          <Button
            type="text"
            icon={<PlayCircleOutlined />}
            onClick={() => handleExecute(record)}
            disabled={record.status === 'RUNNING'}
          />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
        </Space>
      ),
    },
  ]

  const currentPlugin = plugins.find(p => p.id === selectedPlugin)

  return (
    <>
      <Card
        title="任务管理"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>新建任务</Button>}
      >
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 创建任务 */}
      <Modal
        title="新建任务"
        open={createModal}
        onCancel={() => setCreateModal(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true }]}>
            <Input placeholder="输入任务名称" />
          </Form.Item>
          <Form.Item name="deviceId" label="目标设备" rules={[{ required: true }]}>
            <Select
              placeholder="选择设备"
              options={devices.map(d => ({ label: d.hostname, value: d.id }))}
            />
          </Form.Item>
          <Form.Item name="plugin" label="插件" rules={[{ required: true }]}>
            <Select
              placeholder="选择插件"
              onChange={setSelectedPlugin}
              options={plugins.map(p => ({ label: p.name, value: p.id }))}
            />
          </Form.Item>
          <Form.Item name="action" label="动作" rules={[{ required: true }]}>
            <Select
              placeholder="选择动作"
              disabled={!selectedPlugin}
              options={currentPlugin?.actions.map(a => ({ label: a, value: a })) || []}
            />
          </Form.Item>
          <Form.Item name="params" label="参数 (JSON)">
            <Input.TextArea placeholder='{"key": "value"}' rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 任务详情 */}
      <Modal
        title="任务详情"
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={null}
      >
        {detailModal && (
          <div>
            <p><strong>名称:</strong> {detailModal.name}</p>
            <p><strong>插件:</strong> {detailModal.plugin}</p>
            <p><strong>动作:</strong> {detailModal.action}</p>
            <p><strong>状态:</strong> <Tag color={statusColors[detailModal.status]}>{detailModal.status}</Tag></p>
            <p><strong>参数:</strong></p>
            <pre style={{ background: '#f5f5f5', padding: 8 }}>{detailModal.params || '{}'}</pre>
            {detailModal.result && (
              <>
                <p><strong>结果:</strong></p>
                <pre style={{ background: '#f5f5f5', padding: 8 }}>{detailModal.result}</pre>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
