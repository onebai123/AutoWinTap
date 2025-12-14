import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import socketManager from '@/lib/socket'

// POST /api/tasks/execute - 执行任务
export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json()

    // 获取任务详情
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { device: true },
    })

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      )
    }

    // 检查 Agent 是否在线
    if (!socketManager.isAgentOnline(task.device.machineId)) {
      return NextResponse.json(
        { success: false, error: 'Agent is offline' },
        { status: 400 }
      )
    }

    // 更新任务状态
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'RUNNING' },
    })

    // 发送任务到 Agent
    const sent = socketManager.sendTask(task.device.machineId, {
      type: 'task:execute',
      requestId: taskId,
      data: {
        taskId,
        plugin: task.plugin,
        action: task.action,
        params: JSON.parse(task.params),
      },
      timestamp: Date.now(),
    })

    if (!sent) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'FAILED', result: JSON.stringify({ error: 'Failed to send task' }) },
      })
      return NextResponse.json(
        { success: false, error: 'Failed to send task to agent' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: 'Task sent to agent' })
  } catch (error) {
    console.error('[API] POST /api/tasks/execute error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to execute task' },
      { status: 500 }
    )
  }
}
