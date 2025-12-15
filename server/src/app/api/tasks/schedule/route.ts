import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// 内存中的定时任务存储
const scheduledTasks = new Map<string, {
  id: string
  name: string
  cron: string
  plugin: string
  action: string
  params: Record<string, unknown>
  deviceId: string
  enabled: boolean
  lastRun?: Date
  nextRun?: Date
  intervalId?: NodeJS.Timeout
}>()

// 简单的 cron 解析 (仅支持 */n 格式的分钟间隔)
function parseCronInterval(cron: string): number | null {
  // 支持格式: */5 * * * * (每5分钟)
  const match = cron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/)
  if (match) {
    return parseInt(match[1]) * 60 * 1000 // 转换为毫秒
  }
  return null
}

// GET /api/tasks/schedule - 获取定时任务列表
export async function GET() {
  const tasks = Array.from(scheduledTasks.values()).map((t) => ({
    id: t.id,
    name: t.name,
    cron: t.cron,
    plugin: t.plugin,
    action: t.action,
    params: t.params,
    deviceId: t.deviceId,
    enabled: t.enabled,
    lastRun: t.lastRun?.toISOString(),
    nextRun: t.nextRun?.toISOString(),
  }))

  return NextResponse.json({ success: true, data: tasks })
}

// POST /api/tasks/schedule - 创建定时任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, cron, plugin, action, params, deviceId } = body

    if (!name || !cron || !plugin || !action || !deviceId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const interval = parseCronInterval(cron)
    if (!interval) {
      return NextResponse.json(
        { success: false, error: 'Invalid cron format. Use */n * * * * for n minutes interval' },
        { status: 400 }
      )
    }

    const id = `schedule-${Date.now()}`
    const task = {
      id,
      name,
      cron,
      plugin,
      action,
      params: params || {},
      deviceId,
      enabled: true,
      nextRun: new Date(Date.now() + interval),
    }

    // 设置定时执行
    const intervalId = setInterval(async () => {
      const t = scheduledTasks.get(id)
      if (!t || !t.enabled) return

      try {
        // 检查设备状态
        const device = await prisma.device.findUnique({ where: { id: deviceId } })
        if (!device || device.status !== 'ONLINE') return

        // 执行任务
        const agentUrl = `http://localhost:5200/execute`
        const res = await fetch(agentUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plugin, action, params: params || {} }),
        })
        const result = await res.json()

        // 记录执行
        await prisma.task.create({
          data: {
            name: `[定时] ${name}`,
            type: 'SCHEDULED',
            plugin,
            action,
            params: JSON.stringify(params || {}),
            status: result.success ? 'SUCCESS' : 'FAILED',
            result: JSON.stringify(result.data || result.error),
            deviceId,
          },
        })

        // 更新状态
        t.lastRun = new Date()
        t.nextRun = new Date(Date.now() + interval)
      } catch (err) {
        console.error(`[Schedule] Task ${id} failed:`, err)
      }
    }, interval)

    scheduledTasks.set(id, { ...task, intervalId })

    return NextResponse.json({ success: true, data: task })
  } catch (error) {
    console.error('[API] POST /api/tasks/schedule error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create scheduled task' },
      { status: 500 }
    )
  }
}

// DELETE /api/tasks/schedule - 删除定时任务
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Task ID is required' },
        { status: 400 }
      )
    }

    const task = scheduledTasks.get(id)
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      )
    }

    // 清除定时器
    if (task.intervalId) {
      clearInterval(task.intervalId)
    }
    scheduledTasks.delete(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] DELETE /api/tasks/schedule error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete scheduled task' },
      { status: 500 }
    )
  }
}

// PATCH /api/tasks/schedule - 启用/禁用定时任务
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, enabled } = body

    const task = scheduledTasks.get(id)
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      )
    }

    task.enabled = enabled

    return NextResponse.json({ success: true, data: { id, enabled } })
  } catch (error) {
    console.error('[API] PATCH /api/tasks/schedule error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update scheduled task' },
      { status: 500 }
    )
  }
}
