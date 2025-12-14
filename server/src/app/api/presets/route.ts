import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { v4 as uuid } from 'uuid'

// GET /api/presets
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('deviceId')

    const presets = await prisma.preset.findMany({
      where: deviceId ? { deviceId } : undefined,
      include: { device: true },
      orderBy: { createdAt: 'desc' },
    })

    // 解析 windows JSON
    const result = presets.map(p => ({
      ...p,
      windows: JSON.parse(p.windows),
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

// POST /api/presets
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, hotkey, windows, deviceId } = body

    if (!name || !deviceId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const preset = await prisma.preset.create({
      data: {
        id: uuid(),
        name,
        hotkey: hotkey || null,
        windows: JSON.stringify(windows || []),
        deviceId,
      },
    })

    return NextResponse.json({ success: true, data: preset })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
