import { Server as SocketIOServer, Socket } from 'socket.io'
import type { WsMessage, AgentRegisterRequest, AgentHeartbeatRequest, TaskResult } from '@/types'

// 连接的 Agent 管理
interface ConnectedAgent {
  socket: Socket
  machineId: string
  hostname: string
  lastHeartbeat: Date
}

class SocketManager {
  private io: SocketIOServer | null = null
  private agents: Map<string, ConnectedAgent> = new Map()

  initialize(io: SocketIOServer) {
    this.io = io

    io.on('connection', (socket) => {
      console.log(`[Socket] Client connected: ${socket.id}`)

      // Agent 注册
      socket.on('agent:register', (data: AgentRegisterRequest) => {
        this.handleAgentRegister(socket, data)
      })

      // Agent 心跳
      socket.on('agent:heartbeat', (data: AgentHeartbeatRequest) => {
        this.handleAgentHeartbeat(socket, data)
      })

      // 任务结果
      socket.on('task:result', (data: TaskResult) => {
        this.handleTaskResult(socket, data)
      })

      // 屏幕帧
      socket.on('screen:frame', (data: { machineId: string; frame: string }) => {
        this.handleScreenFrame(socket, data)
      })

      // 断开连接
      socket.on('disconnect', () => {
        this.handleDisconnect(socket)
      })
    })
  }

  private handleAgentRegister(socket: Socket, data: AgentRegisterRequest) {
    console.log(`[Socket] Agent registered: ${data.hostname} (${data.machineId})`)

    this.agents.set(data.machineId, {
      socket,
      machineId: data.machineId,
      hostname: data.hostname,
      lastHeartbeat: new Date(),
    })

    // 加入以 machineId 命名的房间
    socket.join(`agent:${data.machineId}`)

    // 广播设备上线
    this.io?.emit('device:online', {
      machineId: data.machineId,
      hostname: data.hostname,
    })
  }

  private handleAgentHeartbeat(socket: Socket, data: AgentHeartbeatRequest) {
    const agent = this.agents.get(data.machineId)
    if (agent) {
      agent.lastHeartbeat = new Date()
    }

    // 广播心跳数据给监控订阅者
    this.io?.to(`monitor:${data.machineId}`).emit('agent:heartbeat', data)
  }

  private handleTaskResult(socket: Socket, data: TaskResult) {
    console.log(`[Socket] Task result: ${data.taskId} - ${data.success ? 'SUCCESS' : 'FAILED'}`)

    // 广播任务结果
    this.io?.emit('task:result', data)
  }

  private handleScreenFrame(socket: Socket, data: { machineId: string; frame: string }) {
    // 转发屏幕帧给订阅者
    this.io?.to(`monitor:${data.machineId}`).emit('screen:frame', data)
  }

  private handleDisconnect(socket: Socket) {
    console.log(`[Socket] Client disconnected: ${socket.id}`)

    // 查找并移除断开的 Agent
    for (const [machineId, agent] of this.agents.entries()) {
      if (agent.socket.id === socket.id) {
        this.agents.delete(machineId)

        // 广播设备离线
        this.io?.emit('device:offline', { machineId })
        break
      }
    }
  }

  // 发送任务到指定 Agent
  sendTask(machineId: string, task: WsMessage): boolean {
    const agent = this.agents.get(machineId)
    if (agent) {
      agent.socket.emit('task:execute', task)
      return true
    }
    return false
  }

  // 获取在线 Agent 列表
  getOnlineAgents(): string[] {
    return Array.from(this.agents.keys())
  }

  // 检查 Agent 是否在线
  isAgentOnline(machineId: string): boolean {
    return this.agents.has(machineId)
  }

  // 订阅设备监控
  subscribeMonitor(socket: Socket, machineId: string) {
    socket.join(`monitor:${machineId}`)
  }

  // 取消订阅
  unsubscribeMonitor(socket: Socket, machineId: string) {
    socket.leave(`monitor:${machineId}`)
  }
}

export const socketManager = new SocketManager()
export default socketManager
