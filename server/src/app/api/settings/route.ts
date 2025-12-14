/**
 * 系统设置 API
 * GET /api/settings - 获取设置
 * POST /api/settings - 保存设置
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Setting {
  key: string
  value: string
}

export async function GET() {
  try {
    const settings = await prisma.systemSetting.findMany()
    const result: Record<string, string> = {}
    settings.forEach((s: Setting) => { result[s.key] = s.value })
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Get settings error:', error)
    return NextResponse.json({ success: false, error: 'Failed to get settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // 批量更新设置
    for (const [key, value] of Object.entries(body)) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Save settings error:', error)
    return NextResponse.json({ success: false, error: 'Failed to save settings' }, { status: 500 })
  }
}
