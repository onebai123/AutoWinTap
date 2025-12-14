'use client'

import { Card, Tag, Space, Button, Typography, Progress } from 'antd'
import {
  DesktopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  ControlOutlined,
} from '@ant-design/icons'
import type { Device, MonitorData } from '@/types'

const { Text } = Typography

interface DeviceCardProps {
  device: Device
  monitorData?: MonitorData
  onView?: () => void
  onControl?: () => void
}

export default function DeviceCard({
  device,
  monitorData,
  onView,
  onControl,
}: DeviceCardProps) {
  const isOnline = device.status === 'ONLINE'

  return (
    <Card
      title={
        <Space>
          <DesktopOutlined />
          <span>{device.hostname}</span>
        </Space>
      }
      extra={
        <Tag
          icon={isOnline ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          color={isOnline ? 'success' : 'default'}
        >
          {isOnline ? '在线' : '离线'}
        </Tag>
      }
      actions={[
        <Button
          key="view"
          type="text"
          icon={<EyeOutlined />}
          onClick={onView}
        >
          查看
        </Button>,
        <Button
          key="control"
          type="text"
          icon={<ControlOutlined />}
          disabled={!isOnline}
          onClick={onControl}
        >
          控制
        </Button>,
      ]}
      style={{ opacity: isOnline ? 1 : 0.6 }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">{device.os}</Text>
        <Text type="secondary">IP: {device.ip || '-'}</Text>

        {monitorData && (
          <>
            <div>
              <Text type="secondary">CPU</Text>
              <Progress
                percent={monitorData.system.cpu}
                size="small"
                status={monitorData.system.cpu > 80 ? 'exception' : 'normal'}
              />
            </div>
            <div>
              <Text type="secondary">内存</Text>
              <Progress
                percent={monitorData.system.memory}
                size="small"
                status={monitorData.system.memory > 80 ? 'exception' : 'normal'}
              />
            </div>
          </>
        )}

        <div>
          <Text type="secondary">插件: </Text>
          {device.plugins?.map((p) => (
            <Tag key={p} style={{ marginRight: 4 }}>
              {p}
            </Tag>
          ))}
        </div>
      </Space>
    </Card>
  )
}
