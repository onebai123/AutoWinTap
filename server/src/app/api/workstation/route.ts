/**
 * 工作台 API
 * GET  /api/workstation - 获取列表
 * POST /api/workstation - 创建工作台
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface DbWorkstation {
  id: string
  name: string
  deviceId: string
  presetId: string | null
  windows: string
  commands: string
}

export async function GET() {
  try {
    const workstations = await prisma.workstation.findMany({
      orderBy: { updatedAt: 'desc' }
    })
    // 解析 JSON 字符串
    const parsed = workstations.map((w: DbWorkstation) => ({
      ...w,
      windows: JSON.parse(w.windows || '[]'),
      commands: JSON.parse(w.commands || '[]'),
    }))
    return NextResponse.json({ success: true, data: parsed })
  } catch (error) {
    console.error('Get workstations error:', error)
    return NextResponse.json({ success: false, error: 'Failed to get workstations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    if (!body.name || !body.deviceId) {
      return NextResponse.json({ success: false, error: '缺少必填字段' }, { status: 400 })
    }

    const workstation = await prisma.workstation.create({
      data: {
        name: body.name,
        deviceId: body.deviceId,
        presetId: body.presetId || null,
        windows: JSON.stringify(body.windows || []),
        commands: JSON.stringify(body.commands || []),
      }
    })

    return NextResponse.json({ success: true, data: workstation })
  } catch (error) {
    console.error('Create workstation error:', error)
    return NextResponse.json({ success: false, error: 'Failed to create workstation' }, { status: 500 })
  }
}
