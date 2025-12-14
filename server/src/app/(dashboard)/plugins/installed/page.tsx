'use client'

import { useState, useEffect } from 'react'
import { Card, Table, Switch, Button, Space, Modal, Form, Input, message, Popconfirm } from 'antd'
import { SettingOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

interface Plugin {
  id: string
  name: string
  version: string
  description: string
  author: string
  isBuiltin: boolean
  enabled: boolean
  config?: Record<string, unknown>
}

// 默认内置插件
const builtinPlugins: Plugin[] = [
  {
    id: 'window-control',
    name: '窗口控制',
    version: '1.0.0',
    description: 'Windows 窗口管理：枚举、激活、最小化、截图',
    author: 'WinTab Team',
    isBuiltin: true,
    enabled: true,
  },
  {
    id: 'browser-debug',
    name: '浏览器调试',
    version: '1.0.0',
    description: 'Chrome DevTools 协议：Console 日志、网络请求监听',
    author: 'WinTab Team',
    isBuiltin: true,
    enabled: true,
    config: { port: 9222 },
  },
  {
    id: 'windsurf',
    name: 'Windsurf IDE',
    version: '1.0.0',
    description: 'Windsurf IDE 自动化：输入任务、读取结果',
    author: 'WinTab Team',
    isBuiltin: true,
    enabled: true,
    config: { inputBoxX: 1700, inputBoxY: 1042 },
  },
]

export default function InstalledPluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>(builtinPlugins)
  const [configModal, setConfigModal] = useState<Plugin | null>(null)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    loadPlugins()
  }, [])

  const loadPlugins = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/plugins')
      const data = await res.json()
      if (data.success && data.data.length > 0) {
        // 合并内置插件和数据库插件
        const dbPlugins = data.data.map((p: Plugin) => ({ ...p, enabled: true }))
        const merged = [...builtinPlugins]
        dbPlugins.forEach((p: Plugin) => {
          if (!merged.find((m) => m.id === p.id)) {
            merged.push(p)
          }
        })
        setPlugins(merged)
      }
    } catch {}
    setLoading(false)
  }

  const handleToggle = (id: string, enabled: boolean) => {
    setPlugins(plugins.map(p => (p.id === id ? { ...p, enabled } : p)))
    message.success(`插件已${enabled ? '启用' : '禁用'}`)
  }

  const handleSaveConfig = (values: Record<string, unknown>) => {
    if (configModal) {
      setPlugins(plugins.map(p => (p.id === configModal.id ? { ...p, config: values } : p)))
      message.success('配置已保存')
      setConfigModal(null)
    }
  }

  const handleUninstall = async (plugin: Plugin) => {
    try {
      const res = await fetch(`/api/plugins?id=${plugin.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        message.success(data.message)
        setPlugins(plugins.filter((p) => p.id !== plugin.id))
      } else {
        message.error(data.error)
      }
    } catch {
      message.error('卸载失败')
    }
  }

  const columns: ColumnsType<Plugin> = [
    { title: '插件名称', dataIndex: 'name', key: 'name' },
    { title: '版本', dataIndex: 'version', key: 'version' },
    { title: '作者', dataIndex: 'author', key: 'author' },
    {
      title: '类型',
      key: 'type',
      render: (_, record) => (record.isBuiltin ? '内置' : '扩展'),
    },
    {
      title: '状态',
      key: 'enabled',
      render: (_, record) => (
        <Switch
          checked={record.enabled}
          onChange={(checked) => handleToggle(record.id, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => {
              setConfigModal(record)
              form.setFieldsValue(record.config || {})
            }}
          >
            配置
          </Button>
          {record.isBuiltin ? (
            <Button type="text" danger icon={<DeleteOutlined />} disabled>
              卸载
            </Button>
          ) : (
            <Popconfirm
              title="确认卸载"
              description={`确定要卸载 ${record.name} 吗？`}
              onConfirm={() => handleUninstall(record)}
              okText="卸载"
              cancelText="取消"
            >
              <Button type="text" danger icon={<DeleteOutlined />}>
                卸载
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <>
      <Card
        title="已安装插件"
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadPlugins} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={plugins}
          rowKey="id"
          pagination={false}
          expandable={{
            expandedRowRender: (record) => (
              <p style={{ margin: 0 }}>{record.description}</p>
            ),
          }}
        />
      </Card>

      <Modal
        title={`配置 - ${configModal?.name}`}
        open={!!configModal}
        onCancel={() => setConfigModal(null)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSaveConfig}>
          {configModal?.id === 'browser-debug' && (
            <Form.Item name="port" label="Chrome 调试端口">
              <Input type="number" placeholder="9222" />
            </Form.Item>
          )}
          {configModal?.id === 'windsurf' && (
            <>
              <Form.Item name="inputBoxX" label="输入框 X 坐标">
                <Input type="number" />
              </Form.Item>
              <Form.Item name="inputBoxY" label="输入框 Y 坐标">
                <Input type="number" />
              </Form.Item>
            </>
          )}
          {configModal?.id === 'window-control' && (
            <p>此插件无需配置</p>
          )}
        </Form>
      </Modal>
    </>
  )
}
