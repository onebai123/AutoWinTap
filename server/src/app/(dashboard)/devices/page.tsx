'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Table, Card, Tag, Button, Space, Modal, Descriptions, message, Popconfirm } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  ControlOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { Device } from '@/types'

export default function DevicesPage() {
  const router = useRouter()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)

  const fetchDevices = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      if (data.success) {
        setDevices(data.data)
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

  const showDetail = (device: Device) => {
    setSelectedDevice(device)
    setDetailVisible(true)
  }

  const openControl = (device: Device) => {
    router.push(`/control/${device.id}`)
  }

  const deleteDevice = async (device: Device) => {
    try {
      const res = await fetch(`/api/agents/${device.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        message.success('设备已删除')
        fetchDevices()
      } else {
        message.error(data.error || '删除失败')
      }
    } catch {
      message.error('删除失败')
    }
  }

  const columns = [
    {
      title: '主机名',
      dataIndex: 'hostname',
      key: 'hostname',
      sorter: (a: Device, b: Device) => a.hostname.localeCompare(b.hostname),
    },
    {
      title: 'Machine ID',
      dataIndex: 'machineId',
      key: 'machineId',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: '在线', value: 'ONLINE' },
        { text: '离线', value: 'OFFLINE' },
      ],
      onFilter: (value: unknown, record: Device) => record.status === value,
      render: (status: string) => (
        <Tag
          icon={status === 'ONLINE' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          color={status === 'ONLINE' ? 'success' : 'default'}
        >
          {status === 'ONLINE' ? '在线' : '离线'}
        </Tag>
      ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      render: (ip: string) => ip || '-',
    },
    {
      title: '操作系统',
      dataIndex: 'os',
      key: 'os',
    },
    {
      title: 'Agent 版本',
      dataIndex: 'agentVersion',
      key: 'agentVersion',
    },
    {
      title: '已安装插件',
      dataIndex: 'plugins',
      key: 'plugins',
      render: (plugins: string[]) => (
        <Space wrap>
          {plugins?.map((p) => (
            <Tag key={p}>{p}</Tag>
          )) || '-'}
        </Space>
      ),
    },
    {
      title: '最后在线',
      dataIndex: 'lastSeen',
      key: 'lastSeen',
      sorter: (a: Device, b: Device) =>
        new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime(),
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: Device) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => showDetail(record)}
          >
            详情
          </Button>
          <Button
            type="text"
            icon={<ControlOutlined />}
            onClick={() => openControl(record)}
            disabled={record.status !== 'ONLINE'}
          >
            控制
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除后无法恢复，确认删除该设备？"
            onConfirm={() => deleteDevice(record)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Card
        title="设备管理"
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchDevices} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={devices}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title="设备详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={600}
      >
        {selectedDevice && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="主机名">{selectedDevice.hostname}</Descriptions.Item>
            <Descriptions.Item label="Machine ID">{selectedDevice.machineId}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={selectedDevice.status === 'ONLINE' ? 'success' : 'default'}>
                {selectedDevice.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="IP">{selectedDevice.ip || '-'}</Descriptions.Item>
            <Descriptions.Item label="操作系统">{selectedDevice.os}</Descriptions.Item>
            <Descriptions.Item label="Agent 版本">{selectedDevice.agentVersion}</Descriptions.Item>
            <Descriptions.Item label="已安装插件">
              <Space wrap>
                {selectedDevice.plugins?.map((p) => <Tag key={p}>{p}</Tag>) || '-'}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="注册时间">
              {new Date(selectedDevice.createdAt).toLocaleString('zh-CN')}
            </Descriptions.Item>
            <Descriptions.Item label="最后在线">
              {new Date(selectedDevice.lastSeen).toLocaleString('zh-CN')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}
