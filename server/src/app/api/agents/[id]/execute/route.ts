import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const AGENT_HTTP_PORT = 5100

// POST /api/agents/[id]/execute - 执行插件动作
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { plugin, action, params: actionParams } = body

    // 检查设备是否存在且在线
    const device = await prisma.device.findUnique({
      where: { id },
    })

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

    // 直接调用 Agent HTTP API
    const agentUrl = `http://${device.ip}:${AGENT_HTTP_PORT}/execute`
    
    try {
      const agentRes = await fetch(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin, action, params: actionParams }),
      })

      const result = await agentRes.json()

      // 记录任务
      await prisma.task.create({
        data: {
          name: `${plugin}.${action}`,
          type: 'CUSTOM',
          plugin,
          action,
          params: JSON.stringify(actionParams || {}),
          status: result.success ? 'SUCCESS' : 'FAILED',
          result: JSON.stringify(result.data || result.error),
          deviceId: id,
        },
      })

      return NextResponse.json({
        success: result.success,
        data: result.data,
        error: result.error,
        duration: result.duration,
      })
    } catch (fetchError) {
      // Agent HTTP 不可达，尝试本地连接
      console.log(`[API] Agent at ${agentUrl} not reachable, trying localhost`)
      
      const localUrl = `http://localhost:${AGENT_HTTP_PORT}/execute`
      const localRes = await fetch(localUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin, action, params: actionParams }),
      })

      const result = await localRes.json()

      await prisma.task.create({
        data: {
          name: `${plugin}.${action}`,
          type: 'CUSTOM',
          plugin,
          action,
          params: JSON.stringify(actionParams || {}),
          status: result.success ? 'SUCCESS' : 'FAILED',
          result: JSON.stringify(result.data || result.error),
          deviceId: id,
        },
      })

      return NextResponse.json({
        success: result.success,
        data: result.data,
        error: result.error,
        duration: result.duration,
      })
    }
  } catch (error) {
    console.error('[API] POST /api/agents/[id]/execute error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to execute action: ' + String(error) },
      { status: 500 }
    )
  }
}
