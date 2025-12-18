import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET: 获取所有定位点
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const target = searchParams.get('target')

    const where = target ? { target } : {}
    const locations = await prisma.ideLocation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, data: locations })
  } catch (error) {
    console.error('Failed to get locations:', error)
    return NextResponse.json({ success: false, error: 'Failed to get locations' }, { status: 500 })
  }
}

// POST: 创建定位点
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, x, y, target = 'windsurf', description, screenshot, tags = [] } = body

    if (!name || x === undefined || y === undefined) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const location = await prisma.ideLocation.create({
      data: {
        name,
        x,
        y,
        target,
        description,
        screenshot,
        tags: JSON.stringify(tags),
      },
    })

    return NextResponse.json({ success: true, data: location })
  } catch (error) {
    console.error('Failed to create location:', error)
    return NextResponse.json({ success: false, error: 'Failed to create location' }, { status: 500 })
  }
}

// DELETE: 删除定位点
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })
    }

    await prisma.ideLocation.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete location:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete location' }, { status: 500 })
  }
}

// PUT: 更新定位点
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, x, y, target, description, screenshot, tags } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (x !== undefined) updateData.x = x
    if (y !== undefined) updateData.y = y
    if (target !== undefined) updateData.target = target
    if (description !== undefined) updateData.description = description
    if (screenshot !== undefined) updateData.screenshot = screenshot
    if (tags !== undefined) updateData.tags = JSON.stringify(tags)

    const location = await prisma.ideLocation.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, data: location })
  } catch (error) {
    console.error('Failed to update location:', error)
    return NextResponse.json({ success: false, error: 'Failed to update location' }, { status: 500 })
  }
}
