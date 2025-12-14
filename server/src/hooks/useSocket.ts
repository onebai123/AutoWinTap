'use client'

import { useEffect, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { Device, MonitorData, TaskResult } from '@/types'

let socket: Socket | null = null

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const [onlineDevices, setOnlineDevices] = useState<string[]>([])

  useEffect(() => {
    if (!socket) {
      socket = io({
        path: '/api/socket',
      })
    }

    socket.on('connect', () => {
      setIsConnected(true)
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('device:online', (data: { machineId: string }) => {
      setOnlineDevices((prev) => [...prev, data.machineId])
    })

    socket.on('device:offline', (data: { machineId: string }) => {
      setOnlineDevices((prev) => prev.filter((id) => id !== data.machineId))
    })

    return () => {
      socket?.off('connect')
      socket?.off('disconnect')
      socket?.off('device:online')
      socket?.off('device:offline')
    }
  }, [])

  const subscribeMonitor = useCallback((machineId: string) => {
    socket?.emit('monitor:subscribe', machineId)
  }, [])

  const unsubscribeMonitor = useCallback((machineId: string) => {
    socket?.emit('monitor:unsubscribe', machineId)
  }, [])

  const onHeartbeat = useCallback((callback: (data: MonitorData) => void) => {
    socket?.on('agent:heartbeat', callback)
    return () => {
      socket?.off('agent:heartbeat', callback)
    }
  }, [])

  const onScreenFrame = useCallback((callback: (data: { machineId: string; frame: string }) => void) => {
    socket?.on('screen:frame', callback)
    return () => {
      socket?.off('screen:frame', callback)
    }
  }, [])

  const onTaskResult = useCallback((callback: (data: TaskResult) => void) => {
    socket?.on('task:result', callback)
    return () => {
      socket?.off('task:result', callback)
    }
  }, [])

  return {
    socket,
    isConnected,
    onlineDevices,
    subscribeMonitor,
    unsubscribeMonitor,
    onHeartbeat,
    onScreenFrame,
    onTaskResult,
  }
}

export default useSocket
