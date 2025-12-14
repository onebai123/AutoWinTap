import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const AGENT_HTTP_PORT = 5100

// 屏幕帧缓存
const screenFrames = new Map<string, {
  data: string
  timestamp: Date
}>()

// GET /api/screen/[deviceId] - 获取设备屏幕 (直接从 Agent 获取)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const { deviceId } = await params

    // 获取设备信息
    const device = await prisma.device.findUnique({ where: { id: deviceId } })
    if (!device) {
      return NextResponse.json({ success: false, error: 'Device not found' }, { status: 404 })
    }

    // 先检查缓存 (5秒内有效)
    const cached = screenFrames.get(deviceId)
    if (cached && Date.now() - cached.timestamp.getTime() < 5000) {
      return NextResponse.json({
        success: true,
        data: cached.data,
        timestamp: cached.timestamp,
        cached: true,
      })
    }

    // 直接从 Agent 获取屏幕
    const agentIp = device.ip || 'localhost'
    try {
      const agentUrl = `http://${agentIp}:${AGENT_HTTP_PORT}/execute`
      const res = await fetch(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'capture-screen' }),
        signal: AbortSignal.timeout(10000), // 10秒超时
      })

      const result = await res.json()
      if (result.success && result.data?.image) {
        // 缓存结果
        screenFrames.set(deviceId, {
          data: result.data.image,
          timestamp: new Date(),
        })

        return NextResponse.json({
          success: true,
          data: result.data.image,
          width: result.data.width,
          height: result.data.height,
          timestamp: new Date(),
        })
      }

      return NextResponse.json(
        { success: false, error: result.error || 'Failed to capture screen' },
        { status: 500 }
      )
    } catch {
      // Agent 不可达，返回缓存（如有）
      if (cached) {
        return NextResponse.json({
          success: true,
          data: cached.data,
          timestamp: cached.timestamp,
          cached: true,
          stale: true,
        })
      }
      return NextResponse.json(
        { success: false, error: 'Agent not reachable' },
        { status: 503 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

// POST /api/screen/[deviceId] - 上传屏幕帧
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const { deviceId } = await params
    const body = await request.json()
    const { data } = body

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Missing data' },
        { status: 400 }
      )
    }

    screenFrames.set(deviceId, {
      data,
      timestamp: new Date(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
