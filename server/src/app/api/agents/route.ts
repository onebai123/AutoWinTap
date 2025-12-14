import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET /api/agents - 获取所有设备列表
export async function GET() {
  try {
    const devices = await prisma.device.findMany({
      orderBy: { lastSeen: 'desc' },
    })

    // 解析 JSON 字段
    const result = devices.map((d) => ({
      ...d,
      plugins: JSON.parse(d.plugins),
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('[API] GET /api/agents error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch devices' },
      { status: 500 }
    )
  }
}
