/**
 * 工作台详情 API
 * GET    /api/workstation/[id] - 获取详情
 * PUT    /api/workstation/[id] - 更新
 * DELETE /api/workstation/[id] - 删除
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const workstation = await prisma.workstation.findUnique({ where: { id } }) as DbWorkstation | null
    if (!workstation) {
      return NextResponse.json({ success: false, error: '工作台不存在' }, { status: 404 })
    }
    // 解析 JSON 字符串
    const parsed = {
      ...workstation,
      windows: JSON.parse(workstation.windows || '[]'),
      commands: JSON.parse(workstation.commands || '[]'),
    }
    return NextResponse.json({ success: true, data: parsed })
  } catch (error) {
    console.error('Get workstation error:', error)
    return NextResponse.json({ success: false, error: 'Failed to get workstation' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const workstation = await prisma.workstation.update({
      where: { id },
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
    console.error('Update workstation error:', error)
    return NextResponse.json({ success: false, error: 'Failed to update workstation' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await prisma.workstation.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete workstation error:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete workstation' }, { status: 500 })
  }
}
