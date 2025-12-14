// 设备状态
export type DeviceStatus = 'ONLINE' | 'OFFLINE'

// 任务类型
export type TaskType = 'WINDOW' | 'BROWSER' | 'IDE' | 'CUSTOM'

// 任务状态
export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'

// 设备信息
export interface Device {
  id: string
  machineId: string
  hostname: string
  ip?: string
  os: string
  agentVersion: string
  status: DeviceStatus
  plugins: string[]
  lastSeen: Date
  createdAt: Date
}

// 窗口信息
export interface WindowInfo {
  handle: string
  title: string
  processName: string
  processId: number
  isVisible: boolean
  bounds?: {
    left: number
    top: number
    right: number
    bottom: number
  }
}

// 窗口组合
export interface Preset {
  id: string
  name: string
  hotkey?: string
  windows: string[]
  deviceId: string
}

// 任务
export interface Task {
  id: string
  name: string
  type: TaskType
  plugin: string
  action: string
  params: Record<string, unknown>
  status: TaskStatus
  result?: Record<string, unknown>
  deviceId: string
  createdAt: Date
}

// 插件信息
export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: string
  category: string
  capabilities: string[]
  isBuiltin: boolean
}

// WebSocket 消息
export interface WsMessage {
  type: string
  requestId?: string
  data: unknown
  timestamp: number
}

// Agent 注册请求
export interface AgentRegisterRequest {
  machineId: string
  hostname: string
  ip?: string
  os: string
  agentVersion: string
  plugins: string[]
}

// Agent 心跳请求
export interface AgentHeartbeatRequest {
  machineId: string
  cpu: number
  memory: number
  windows?: WindowInfo[]
  screen?: string // base64
}

// 任务执行请求
export interface TaskExecuteRequest {
  taskId: string
  plugin: string
  action: string
  params: Record<string, unknown>
}

// 任务结果
export interface TaskResult {
  taskId: string
  success: boolean
  result?: unknown
  error?: string
  duration: number
}

// 监控数据
export interface MonitorData {
  machineId: string
  timestamp: number
  system: {
    cpu: number
    memory: number
    disk?: number
  }
  windows: WindowInfo[]
  screen?: string
}
