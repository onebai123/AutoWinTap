import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface SystemSetting {
  key: string
  value: string
}

/**
 * 设置默认高级模型
 * POST /api/models/advanced/[id]/default
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 获取所有高级模型
    const models = await prisma.systemSetting.findMany({
      where: {
        key: {
          startsWith: 'advanced_model_',
        },
      },
    })

    // 更新所有模型，将指定 ID 设为默认
    for (const model of models) {
      try {
        const data = JSON.parse(model.value)
        data.isDefault = model.key === `advanced_model_${id}`
        
        await prisma.systemSetting.update({
          where: { key: model.key },
          data: { value: JSON.stringify(data) },
        })
      } catch {
        // 忽略解析错误
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Set default model error:', error)
    return NextResponse.json({ success: false, error: 'Failed to set default' }, { status: 500 })
  }
}
