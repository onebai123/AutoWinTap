/**
 * 批量保存窗口组合
 * POST /api/presets/batch-save
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { v4 as uuid } from 'uuid'

interface WindowInfo {
  handle: number
  title: string
  processName: string
}

interface ComboInput {
  name: string
  windows: WindowInfo[]
  shortcut: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, combos, overwrite = true } = body as {
      deviceId: string
      combos: ComboInput[]
      overwrite?: boolean
    }

    if (!deviceId || !combos || !Array.isArray(combos)) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 })
    }

    // 如果覆盖模式，先删除该设备已有的所有快捷键冲突的组合
    if (overwrite) {
      const shortcuts = combos.map(c => c.shortcut).filter(Boolean)
      if (shortcuts.length > 0) {
        await prisma.preset.deleteMany({
          where: {
            deviceId,
            hotkey: { in: shortcuts }
          }
        })
      }
    }

    // 批量创建
    const created = []
    for (const combo of combos) {
      if (!combo.name || !combo.windows || combo.windows.length === 0) continue

      const preset = await prisma.preset.create({
        data: {
          id: uuid(),
          name: combo.name,
          hotkey: combo.shortcut || null,
          windows: JSON.stringify(combo.windows),
          deviceId,
        }
      })
      created.push(preset)
    }

    return NextResponse.json({
      success: true,
      data: {
        count: created.length,
        presets: created
      }
    })

  } catch (error) {
    console.error('[Batch-Save] Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : '保存失败' 
    }, { status: 500 })
  }
}
