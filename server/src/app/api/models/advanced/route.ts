import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface AdvancedModelInput {
  name: string
  provider: string
  apiKey: string
  baseUrl: string
  model: string
  capabilities: string[]
}

interface SystemSetting {
  key: string
  value: string
}

/**
 * 获取高级模型列表
 * GET /api/models/advanced
 */
export async function GET() {
  try {
    const models = await prisma.systemSetting.findMany({
      where: {
        key: {
          startsWith: 'advanced_model_',
        },
      },
    })

    const result = models.map((m: SystemSetting) => {
      try {
        return JSON.parse(m.value)
      } catch {
        return null
      }
    }).filter(Boolean)

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Get advanced models error:', error)
    return NextResponse.json({ success: false, error: 'Failed to get models' }, { status: 500 })
  }
}

/**
 * 添加高级模型
 * POST /api/models/advanced
 */
export async function POST(request: Request) {
  try {
    const body: AdvancedModelInput = await request.json()
    
    if (!body.name || !body.provider || !body.apiKey || !body.model) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 })
    }

    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const modelData = {
      id,
      name: body.name,
      provider: body.provider,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl || '',
      model: body.model,
      capabilities: body.capabilities || [],
      isDefault: false,
      createdAt: new Date().toISOString(),
    }

    // 检查是否是第一个模型，如果是则设为默认
    const existingModels = await prisma.systemSetting.count({
      where: {
        key: {
          startsWith: 'advanced_model_',
        },
      },
    })

    if (existingModels === 0) {
      modelData.isDefault = true
    }

    await prisma.systemSetting.create({
      data: {
        key: `advanced_model_${id}`,
        value: JSON.stringify(modelData),
      },
    })

    return NextResponse.json({ success: true, data: modelData })
  } catch (error) {
    console.error('Create advanced model error:', error)
    return NextResponse.json({ success: false, error: 'Failed to create model' }, { status: 500 })
  }
}

/**
 * 删除高级模型
 * DELETE /api/models/advanced?id=xxx
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少 id 参数' }, { status: 400 })
    }

    await prisma.systemSetting.delete({
      where: {
        key: `advanced_model_${id}`,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete advanced model error:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete model' }, { status: 500 })
  }
}
