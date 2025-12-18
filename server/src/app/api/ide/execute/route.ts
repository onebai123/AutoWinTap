import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Step {
  action: string
  location?: string
  x?: number
  y?: number
  text?: string
  key?: string
  keys?: string
  ms?: number
}

// POST: 执行 IDE 操作
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, presetId, steps: rawSteps, variables = {} } = body

    if (!deviceId) {
      return NextResponse.json({ success: false, error: 'Missing deviceId' }, { status: 400 })
    }

    let steps: Step[] = rawSteps || []
    let presetName: string | undefined

    // 如果传了 presetId，从数据库或内置预设获取步骤
    if (presetId && !rawSteps) {
      if (presetId.startsWith('builtin-')) {
        // 内置预设直接使用
        const builtinPresets: Record<string, { name: string; steps: Step[] }> = {
          'builtin-send-task': {
            name: '发送任务',
            steps: [
              { action: 'activate' },
              { action: 'click', location: 'input-box' },
              { action: 'wait', ms: 200 },
              { action: 'type', text: '${task}' },
              { action: 'press-key', key: 'enter' },
            ],
          },
          'builtin-save': { name: '保存文件', steps: [{ action: 'hotkey', keys: 'ctrl+s' }] },
          'builtin-run': { name: '运行调试', steps: [{ action: 'hotkey', keys: 'f5' }] },
          'builtin-stop': { name: '停止运行', steps: [{ action: 'hotkey', keys: 'shift+f5' }] },
          'builtin-copy-all': {
            name: '全选复制',
            steps: [
              { action: 'hotkey', keys: 'ctrl+a' },
              { action: 'wait', ms: 100 },
              { action: 'hotkey', keys: 'ctrl+c' },
            ],
          },
          'builtin-terminal': { name: '打开终端', steps: [{ action: 'hotkey', keys: 'ctrl+`' }] },
          'builtin-format': { name: '格式化代码', steps: [{ action: 'hotkey', keys: 'shift+alt+f' }] },
          'builtin-comment': { name: '注释/取消注释', steps: [{ action: 'hotkey', keys: 'ctrl+/' }] },
        }
        const preset = builtinPresets[presetId]
        if (preset) {
          steps = preset.steps
          presetName = preset.name
        }
      } else {
        // 从数据库获取
        try {
          const preset = await prisma.idePreset.findUnique({ where: { id: presetId } })
          if (preset) {
            steps = JSON.parse(preset.steps)
            presetName = preset.name
          }
        } catch {
          // 数据库还没迁移，跳过
        }
      }
    }

    if (steps.length === 0) {
      return NextResponse.json({ success: false, error: 'No steps to execute' }, { status: 400 })
    }

    // 获取定位点映射
    let locationMap: Record<string, { x: number; y: number }> = {}
    try {
      const locations = await prisma.ideLocation.findMany()
      locationMap = locations.reduce((acc: Record<string, { x: number; y: number }>, loc: { name: string; x: number; y: number }) => {
        acc[loc.name] = { x: loc.x, y: loc.y }
        return acc
      }, {} as Record<string, { x: number; y: number }>)
    } catch {
      // 数据库还没迁移，使用默认定位点
      locationMap = {
        'input-box': { x: 1700, y: 1042 },
        'send-button': { x: 1850, y: 1042 },
      }
    }

    // 替换变量和定位点
    const processedSteps = steps.map(step => {
      const newStep = { ...step }

      // 替换变量
      if (newStep.text) {
        for (const [key, value] of Object.entries(variables)) {
          newStep.text = newStep.text.replace(`\${${key}}`, String(value))
        }
      }

      // 替换命名定位点为坐标
      if (newStep.location && locationMap[newStep.location]) {
        const loc = locationMap[newStep.location]
        newStep.x = loc.x
        newStep.y = loc.y
        delete newStep.location
      }

      return newStep
    })

    // 调用 Agent 执行
    const startTime = Date.now()
    const agentRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/agents/${deviceId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plugin: 'windsurf',
        action: 'execute-steps',
        params: { steps: processedSteps },
      }),
    })

    const agentData = await agentRes.json()
    const duration = Date.now() - startTime

    // 记录执行日志
    try {
      await prisma.ideExecutionLog.create({
        data: {
          presetId: presetId || null,
          presetName: presetName || null,
          steps: JSON.stringify(steps),
          results: JSON.stringify(agentData.data?.results || []),
          success: agentData.success,
          error: agentData.error || null,
          duration,
        },
      })

      // 更新预设使用次数
      if (presetId && !presetId.startsWith('builtin-')) {
        await prisma.idePreset.update({
          where: { id: presetId },
          data: {
            usageCount: { increment: 1 },
            successCount: agentData.success ? { increment: 1 } : undefined,
          },
        })
      }
    } catch {
      // 数据库还没迁移，跳过
    }

    return NextResponse.json({
      success: agentData.success,
      data: agentData.data,
      duration,
      error: agentData.error,
    })
  } catch (error) {
    console.error('Failed to execute:', error)
    return NextResponse.json({ success: false, error: 'Failed to execute' }, { status: 500 })
  }
}
