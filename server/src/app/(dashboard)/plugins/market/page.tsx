'use client'

import { useState, useEffect } from 'react'
import { Card, Row, Col, Input, Tag, Button, Typography, Space, message } from 'antd'
import { SearchOutlined, DownloadOutlined, CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

interface Plugin {
  id: string
  name: string
  version: string
  description: string
  author: string
  category: string
  downloads: number
  isBuiltin: boolean
}

export default function PluginMarketPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [installed, setInstalled] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  useEffect(() => {
    loadPlugins()
    loadInstalled()
  }, [])

  const loadPlugins = async () => {
    try {
      const res = await fetch('/api/plugins?source=store')
      const data = await res.json()
      if (data.success) setPlugins(data.data)
    } catch {}
    setLoading(false)
  }

  const loadInstalled = async () => {
    try {
      const res = await fetch('/api/plugins')
      const data = await res.json()
      if (data.success) setInstalled(data.data.map((p: Plugin) => p.id))
    } catch {}
  }

  const installPlugin = async (pluginId: string) => {
    setInstalling(pluginId)
    try {
      const res = await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId }),
      })
      const data = await res.json()
      if (data.success) {
        message.success(data.message)
        setInstalled([...installed, pluginId])
      } else {
        message.error(data.error)
      }
    } catch {
      message.error('安装失败')
    }
    setInstalling(null)
  }

  const filteredPlugins = plugins.filter((p) => {
    if (search && !p.name.includes(search) && !p.description.includes(search)) return false
    if (category !== 'all' && p.category !== category) return false
    return true
  })

  const categories = ['all', 'system', 'browser', 'ide', 'ai']
  const categoryLabels: Record<string, string> = {
    all: '全部',
    system: '系统',
    browser: '浏览器',
    ide: 'IDE',
    ai: 'AI',
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" gutter={16}>
          <Col flex={1}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索插件..."
              size="large"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col>
            <Space>
              {categories.map((c) => (
                <Tag
                  key={c}
                  color={category === c ? 'blue' : undefined}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setCategory(c)}
                >
                  {categoryLabels[c]}
                </Tag>
              ))}
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        {filteredPlugins.map((plugin) => {
          const isInstalled = installed.includes(plugin.id) || plugin.isBuiltin
          const isInstalling = installing === plugin.id

          return (
            <Col span={8} key={plugin.id}>
              <Card
                loading={loading}
                actions={[
                  isInstalled ? (
                    <Button type="text" icon={<CheckCircleOutlined />} disabled key="installed">
                      已安装
                    </Button>
                  ) : (
                    <Button
                      type="text"
                      icon={isInstalling ? <LoadingOutlined /> : <DownloadOutlined />}
                      onClick={() => installPlugin(plugin.id)}
                      disabled={isInstalling}
                      key="install"
                    >
                      {isInstalling ? '安装中' : '安装'}
                    </Button>
                  ),
                ]}
              >
                <Title level={5}>{plugin.name}</Title>
                <Space style={{ marginBottom: 8 }}>
                  <Tag>{categoryLabels[plugin.category] || plugin.category}</Tag>
                  <Text type="secondary">v{plugin.version}</Text>
                </Space>
                <Paragraph type="secondary" ellipsis={{ rows: 2 }}>
                  {plugin.description}
                </Paragraph>
                <Text type="secondary">
                  {plugin.author} · {plugin.downloads} 次下载
                </Text>
              </Card>
            </Col>
          )
        })}
      </Row>
    </div>
  )
}
