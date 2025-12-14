import { NextRequest, NextResponse } from 'next/server'

// WebSocket 连接存储
const connections = new Map<string, {
  deviceId: string
  lastSeen: Date
}>()

// 屏幕帧缓存
const screenFrames = new Map<string, {
  data: string
  timestamp: Date
}>()

// GET /api/ws - WebSocket 状态
export async function GET() {
  const devices = Array.from(connections.entries()).map(([id, conn]) => ({
    connectionId: id,
    deviceId: conn.deviceId,
    lastSeen: conn.lastSeen,
  }))

  return NextResponse.json({
    success: true,
    data: {
      connections: devices.length,
      devices,
    },
  })
}

// POST /api/ws/screen - 接收屏幕帧
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, data } = body

    if (!deviceId || !data) {
      return NextResponse.json(
        { success: false, error: 'Missing deviceId or data' },
        { status: 400 }
      )
    }

    // 缓存屏幕帧
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
