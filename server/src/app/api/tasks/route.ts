import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { v4 as uuid } from 'uuid'

// GET /api/tasks - 获取任务列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('deviceId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (deviceId) where.deviceId = deviceId
    if (status) where.status = status

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const result = tasks.map((t) => ({
      ...t,
      params: JSON.parse(t.params),
      result: t.result ? JSON.parse(t.result) : null,
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('[API] GET /api/tasks error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tasks' },
      { status: 500 }
    )
  }
}

// POST /api/tasks - 创建任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, type, plugin, action, params, deviceId } = body

    const task = await prisma.task.create({
      data: {
        id: uuid(),
        name,
        type,
        plugin,
        action,
        params: JSON.stringify(params || {}),
        deviceId,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        ...task,
        params: JSON.parse(task.params),
      },
    })
  } catch (error) {
    console.error('[API] POST /api/tasks error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create task' },
      { status: 500 }
    )
  }
}
