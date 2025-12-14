import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/presets/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const preset = await prisma.preset.findUnique({
      where: { id },
      include: { device: true },
    })

    if (!preset) {
      return NextResponse.json({ success: false, error: 'Preset not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: preset })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

// PATCH /api/presets/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    if (body.windows) {
      body.windows = JSON.stringify(body.windows)
    }

    const preset = await prisma.preset.update({
      where: { id },
      data: body,
    })

    return NextResponse.json({ success: true, data: preset })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

// DELETE /api/presets/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.preset.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
