import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// POST /api/agents/heartbeat - Agent 心跳
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, machineId } = body

    // 支持 deviceId 或 machineId
    const where = deviceId ? { id: deviceId } : machineId ? { machineId } : null
    if (!where) {
      return NextResponse.json(
        { success: false, error: 'Missing deviceId or machineId' },
        { status: 400 }
      )
    }

    // 更新最后在线时间
    await prisma.device.update({
      where,
      data: {
        status: 'ONLINE',
        lastSeen: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] POST /api/agents/heartbeat error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update heartbeat' },
      { status: 500 }
    )
  }
}
