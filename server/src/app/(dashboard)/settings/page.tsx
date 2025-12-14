'use client'

import { useState, useEffect } from 'react'
import { Card, Form, Input, InputNumber, Switch, Button, Divider, message, Spin, Row, Col, Alert, Typography } from 'antd'
import { SaveOutlined, ReloadOutlined, RobotOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons'

const { Text } = Typography

export default function SettingsPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  // 加载设置
  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.success) {
        form.setFieldsValue({
          ...data.data,
          serverPort: parseInt(data.data.serverPort) || 3000,
          heartbeatInterval: parseInt(data.data.heartbeatInterval) || 5000,
          screenQuality: parseInt(data.data.screenQuality) || 60,
          screenInterval: parseInt(data.data.screenInterval) || 1000,
          wsEnabled: data.data.wsEnabled !== 'false',
        })
      }
    } catch (error) {
      console.error('Load settings error:', error)
    }
    setLoading(false)
  }

  useEffect(() => { loadSettings() }, [])

  const onFinish = async (values: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (data.success) {
        message.success('✓ 设置已保存')
      } else {
        message.error(data.error || '保存失败')
      }
    } catch (error) {
      message.error('保存失败')
    }
    setSaving(false)
  }

  if (loading) {
    return <Card><Spin tip="加载设置..." /></Card>
  }

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Card 
          title="系统设置"
          extra={<Button icon={<ReloadOutlined />} onClick={loadSettings}>刷新</Button>}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              serverPort: 3000,
              wsEnabled: true,
              heartbeatInterval: 5000,
              screenQuality: 60,
              screenInterval: 1000,
            }}
            onFinish={onFinish}
          >
            <Divider orientation="left">服务器</Divider>
            
            <Form.Item label="服务端口" name="serverPort">
              <InputNumber min={1000} max={65535} style={{ width: 150 }} />
            </Form.Item>

            <Form.Item label="启用 WebSocket" name="wsEnabled" valuePropName="checked">
              <Switch />
            </Form.Item>

            <Divider orientation="left">Agent</Divider>

            <Form.Item label="心跳间隔 (ms)" name="heartbeatInterval">
              <InputNumber min={1000} max={60000} step={1000} style={{ width: 150 }} />
            </Form.Item>

            <Divider orientation="left">屏幕传输</Divider>

            <Form.Item label="截图质量 (%)" name="screenQuality">
              <InputNumber min={10} max={100} style={{ width: 150 }} />
            </Form.Item>

            <Form.Item label="截图间隔 (ms)" name="screenInterval">
              <InputNumber min={100} max={5000} step={100} style={{ width: 150 }} />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                保存设置
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </Col>

      <Col span={12}>
        <Card 
          title={<><RobotOutlined /> AI 配置</>}
          extra={<Text type="secondary">用于屏幕分析</Text>}
        >
          <Alert 
            message="配置 AI 接口后，可在屏幕监控页面使用 AI 分析功能" 
            type="info" 
            showIcon 
            style={{ marginBottom: 16 }}
          />
          
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
          >
            <Form.Item 
              label="API 地址" 
              name="ai_api_url"
              tooltip="OpenAI 兼容的 API 地址，会自动补全 /v1"
            >
              <Input placeholder="https://api.openai.com（自动补全 /v1）" />
            </Form.Item>

            <Form.Item 
              label="API 密钥" 
              name="ai_api_key"
              tooltip="API 访问密钥"
            >
              <Input.Password
                placeholder="sk-..."
                visibilityToggle={{
                  visible: showApiKey,
                  onVisibleChange: setShowApiKey,
                }}
                iconRender={(visible) => visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              />
            </Form.Item>

            <Form.Item 
              label="模型" 
              name="ai_model"
              tooltip="使用的模型名称"
            >
              <Input placeholder="gpt-4o / gemini-2.0-flash / deepseek-chat" />
            </Form.Item>

            <Form.Item 
              label="系统提示词（可选）" 
              name="ai_system_prompt"
              tooltip="留空使用内置提示词，填写则覆盖"
            >
              <Input.TextArea 
                rows={3} 
                placeholder="留空使用内置提示词（开发助手模式）"
              />
            </Form.Item>

            <Alert
              message="内置提示词模板"
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li><b>开发模式</b>：分析开发状态、检测问题、建议操作</li>
                  <li><b>调试模式</b>：识别错误类型、定位根源、修复建议</li>
                  <li><b>审查模式</b>：代码质量评估、潜在问题、改进建议</li>
                </ul>
              }
              type="info"
              style={{ marginBottom: 16 }}
            />

            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                保存 AI 配置
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </Col>
    </Row>
  )
}
