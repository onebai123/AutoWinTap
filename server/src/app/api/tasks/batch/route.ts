import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const AGENT_HTTP_PORT = 5100

// POST /api/tasks/batch - 批量执行任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tasks, deviceId } = body as {
      tasks: { plugin: string; action: string; params?: Record<string, unknown> }[]
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

    // 执行所有任务
    const results: { plugin: string; action: string; success: boolean; data?: unknown; error?: string }[] = []

    for (const task of tasks) {
      try {
        const agentUrl = `http://localhost:${AGENT_HTTP_PORT}/execute`
        const res = await fetch(agentUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plugin: task.plugin,
            action: task.action,
            params: task.params || {},
          }),
        })

        const result = await res.json()

        // 记录任务
        await prisma.task.create({
          data: {
            name: `${task.plugin}.${task.action}`,
            type: 'BATCH',
            plugin: task.plugin,
            action: task.action,
            params: JSON.stringify(task.params || {}),
            status: result.success ? 'SUCCESS' : 'FAILED',
            result: JSON.stringify(result.data || result.error),
            deviceId,
          },
        })

        results.push({
          plugin: task.plugin,
          action: task.action,
          success: result.success,
          data: result.data,
          error: result.error,
        })
      } catch (err) {
        results.push({
          plugin: task.plugin,
          action: task.action,
          success: false,
          error: String(err),
        })
      }
    }

    const successCount = results.filter((r) => r.success).length
    return NextResponse.json({
      success: true,
      data: {
        total: tasks.length,
        success: successCount,
        failed: tasks.length - successCount,
        results,
      },
    })
  } catch (error) {
    console.error('[API] POST /api/tasks/batch error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to execute batch tasks' },
      { status: 500 }
    )
  }
}
