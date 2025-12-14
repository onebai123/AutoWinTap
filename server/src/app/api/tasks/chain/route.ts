import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const AGENT_HTTP_PORT = 5100

interface ChainTask {
  plugin: string
  action: string
  params?: Record<string, unknown>
  continueOnError?: boolean
}

// POST /api/tasks/chain - 执行任务链 (按顺序执行，支持依赖)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, tasks, deviceId } = body as {
      name: string
      tasks: ChainTask[]
      deviceId: string
    }

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tasks array is required' },
        { status: 400 }
      )
    }

    // 获取设备
    const device = await prisma.device.findUnique({ where: { id: deviceId } })
    if (!device) {
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 }
      )
    }

    if (device.status !== 'ONLINE') {
      return NextResponse.json(
        { success: false, error: 'Device is offline' },
        { status: 400 }
      )
    }

    // 按顺序执行任务链
    const results: {
      step: number
      plugin: string
      action: string
      success: boolean
      data?: unknown
      error?: string
      duration?: number
    }[] = []

    let chainSuccess = true
    let previousResult: unknown = null

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]

      // 支持使用上一步结果作为参数
      let params = task.params || {}
      if (previousResult && typeof params === 'object') {
        params = { ...params, _previousResult: previousResult }
      }

      try {
        const startTime = Date.now()
        const agentUrl = `http://localhost:${AGENT_HTTP_PORT}/execute`
        const res = await fetch(agentUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plugin: task.plugin,
            action: task.action,
            params,
          }),
        })

        const result = await res.json()
        const duration = Date.now() - startTime

        results.push({
          step: i + 1,
          plugin: task.plugin,
          action: task.action,
          success: result.success,
          data: result.data,
          error: result.error,
          duration,
        })

        if (result.success) {
          previousResult = result.data
        } else {
          chainSuccess = false
          if (!task.continueOnError) {
            break // 停止执行后续任务
          }
        }
      } catch (err) {
        results.push({
          step: i + 1,
          plugin: task.plugin,
          action: task.action,
          success: false,
          error: String(err),
        })
        chainSuccess = false
        if (!task.continueOnError) {
          break
        }
      }
    }

    // 记录任务链执行结果
    await prisma.task.create({
      data: {
        name: name || `任务链 (${tasks.length} 步)`,
        type: 'CHAIN',
        plugin: tasks.map((t) => t.plugin).join(','),
        action: tasks.map((t) => t.action).join(','),
        params: JSON.stringify(tasks),
        status: chainSuccess ? 'SUCCESS' : 'FAILED',
        result: JSON.stringify(results),
        deviceId,
      },
    })

    return NextResponse.json({
      success: chainSuccess,
      data: {
        name,
        totalSteps: tasks.length,
        completedSteps: results.length,
        success: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      },
    })
  } catch (error) {
    console.error('[API] POST /api/tasks/chain error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to execute task chain' },
      { status: 500 }
    )
  }
}
