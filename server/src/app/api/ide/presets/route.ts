import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// 内置预设
const BUILTIN_PRESETS = [
  {
    id: 'builtin-send-task',
    name: '发送任务',
    category: 'windsurf',
    icon: '📤',
    steps: [
      { action: 'activate' },
      { action: 'click', location: 'input-box' },
      { action: 'wait', ms: 200 },
      { action: 'type', text: '${task}' },
      { action: 'press-key', key: 'enter' },
    ],
    variables: { task: '请输入任务内容' },
    description: '激活 Windsurf 并发送任务',
    isBuiltin: true,
  },
  {
    id: 'builtin-save',
    name: '保存文件',
    category: 'common',
    icon: '💾',
    steps: [{ action: 'hotkey', keys: 'ctrl+s' }],
    description: '保存当前文件',
    isBuiltin: true,
  },
  {
    id: 'builtin-run',
    name: '运行调试',
    category: 'common',
    icon: '▶️',
    steps: [{ action: 'hotkey', keys: 'f5' }],
    description: '启动调试',
    isBuiltin: true,
  },
  {
    id: 'builtin-stop',
    name: '停止运行',
    category: 'common',
    icon: '⏹️',
    steps: [{ action: 'hotkey', keys: 'shift+f5' }],
    description: '停止调试',
    isBuiltin: true,
  },
  {
    id: 'builtin-copy-all',
    name: '全选复制',
    category: 'common',
    icon: '📋',
    steps: [
      { action: 'hotkey', keys: 'ctrl+a' },
      { action: 'wait', ms: 100 },
      { action: 'hotkey', keys: 'ctrl+c' },
    ],
    description: '全选并复制',
    isBuiltin: true,
  },
  {
    id: 'builtin-terminal',
    name: '打开终端',
    category: 'common',
    icon: '💻',
    steps: [{ action: 'hotkey', keys: 'ctrl+`' }],
    description: '打开/切换终端',
    isBuiltin: true,
  },
  {
    id: 'builtin-format',
    name: '格式化代码',
    category: 'common',
    icon: '✨',
    steps: [{ action: 'hotkey', keys: 'shift+alt+f' }],
    description: '格式化当前文件',
    isBuiltin: true,
  },
  {
    id: 'builtin-comment',
    name: '注释/取消注释',
    category: 'common',
    icon: '💬',
    steps: [{ action: 'hotkey', keys: 'ctrl+/' }],
    description: '切换行注释',
    isBuiltin: true,
  },
]

// GET: 获取所有预设
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    const where = category ? { category } : {}
    const dbPresets = await prisma.idePreset.findMany({
      where,
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    })

    // 合并内置预设和数据库预设
    const presets = [
      ...BUILTIN_PRESETS.filter(p => !category || p.category === category).map(p => ({
        ...p,
        steps: JSON.stringify(p.steps),
        variables: JSON.stringify(p.variables || {}),
        usageCount: 0,
        successCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      ...dbPresets,
    ]

    // 解析 JSON 字段
    const parsed = presets.map(p => ({
      ...p,
      steps: typeof p.steps === 'string' ? JSON.parse(p.steps) : p.steps,
      variables: typeof p.variables === 'string' ? JSON.parse(p.variables) : p.variables,
    }))

    return NextResponse.json({ success: true, data: parsed })
  } catch (error) {
    console.error('Failed to get presets:', error)
    return NextResponse.json({ success: false, error: 'Failed to get presets' }, { status: 500 })
  }
}

// POST: 创建预设
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, category = 'windsurf', icon, hotkey, steps = [], variables = {}, description } = body

    if (!name || steps.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const preset = await prisma.idePreset.create({
      data: {
        name,
        category,
        icon,
        hotkey,
        steps: JSON.stringify(steps),
        variables: JSON.stringify(variables),
        description,
      },
    })

    return NextResponse.json({ 
      success: true, 
      data: {
        ...preset,
        steps: JSON.parse(preset.steps),
        variables: JSON.parse(preset.variables),
      }
    })
  } catch (error) {
    console.error('Failed to create preset:', error)
    return NextResponse.json({ success: false, error: 'Failed to create preset' }, { status: 500 })
  }
}

// DELETE: 删除预设
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })
    }

    // 不能删除内置预设
    if (id.startsWith('builtin-')) {
      return NextResponse.json({ success: false, error: 'Cannot delete builtin preset' }, { status: 400 })
    }

    await prisma.idePreset.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete preset:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete preset' }, { status: 500 })
  }
}

// PUT: 更新预设
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, category, icon, hotkey, steps, variables, description } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })
    }

    // 不能修改内置预设
    if (id.startsWith('builtin-')) {
      return NextResponse.json({ success: false, error: 'Cannot modify builtin preset' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (category !== undefined) updateData.category = category
    if (icon !== undefined) updateData.icon = icon
    if (hotkey !== undefined) updateData.hotkey = hotkey
    if (steps !== undefined) updateData.steps = JSON.stringify(steps)
    if (variables !== undefined) updateData.variables = JSON.stringify(variables)
    if (description !== undefined) updateData.description = description

    const preset = await prisma.idePreset.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ 
      success: true, 
      data: {
        ...preset,
        steps: JSON.parse(preset.steps),
        variables: JSON.parse(preset.variables),
      }
    })
  } catch (error) {
    console.error('Failed to update preset:', error)
    return NextResponse.json({ success: false, error: 'Failed to update preset' }, { status: 500 })
  }
}
