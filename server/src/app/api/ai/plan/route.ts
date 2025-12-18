import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface PlanRequest {
  prompt: string
  modelId?: string
  context?: {
    screenshot?: string
    projectInfo?: string
  }
}

interface TaskStep {
  id: string
  description: string
  action: string
  params?: { message: string }
  status: 'pending' | 'running' | 'done' | 'failed'
}

interface TaskPlan {
  goal: string
  analysis: {
    understood: string[]
    missing: string[]
    questions: string[]
  }
  steps: TaskStep[]
  ready: boolean
}

interface ModelConfig {
  id: string
  name: string
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}

/**
 * 生成任务规划
 * POST /api/ai/plan
 */
export async function POST(request: Request) {
  try {
    const body: PlanRequest = await request.json()
    const { prompt, modelId, context } = body

    if (!prompt?.trim()) {
      return NextResponse.json({ success: false, error: '请输入任务描述' }, { status: 400 })
    }

    // 获取模型配置
    const modelConfig = await getModelConfig(modelId)
    
    // 调用真实 AI 或回退到模拟
    let plan: TaskPlan
    if (modelConfig) {
      plan = await generatePlanWithRealAI(prompt, modelConfig, context?.screenshot)
    } else {
      plan = generatePlanFallback(prompt)
    }

    return NextResponse.json({ success: true, plan })
  } catch (error) {
    console.error('Plan generation error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '规划生成失败' },
      { status: 500 }
    )
  }
}

/**
 * 获取模型配置
 */
async function getModelConfig(modelId?: string): Promise<ModelConfig | null> {
  try {
    const models = await prisma.systemSetting.findMany({
      where: { key: { startsWith: 'advanced_model_' } },
    })

    for (const m of models) {
      try {
        const config = JSON.parse(m.value)
        if (modelId && config.id === modelId) return config
        if (!modelId && config.isDefault) return config
      } catch { /* ignore */ }
    }

    // 返回第一个可用的
    if (models.length > 0) {
      try {
        return JSON.parse(models[0].value)
      } catch { /* ignore */ }
    }
  } catch (error) {
    console.error('Get model config error:', error)
  }
  return null
}

/**
 * 使用真实 AI 生成规划
 */
async function generatePlanWithRealAI(
  prompt: string, 
  config: ModelConfig,
  screenshot?: string
): Promise<TaskPlan> {
  const systemPrompt = `你是一个专业的编程助手，帮助用户规划和执行开发任务。

# 任务
分析用户的需求，生成可执行的步骤计划。

# 输出格式
请以 JSON 格式输出，格式如下：
{
  "goal": "任务目标的简洁描述",
  "analysis": {
    "understood": ["已理解的需求点"],
    "missing": ["缺少的信息"],
    "questions": ["需要确认的问题"]
  },
  "steps": [
    {
      "id": "1",
      "description": "步骤描述",
      "action": "windsurf:send-message",
      "params": { "message": "发送给 Windsurf IDE 的具体指令" }
    }
  ],
  "ready": true
}

# 步骤规划原则
1. 每个步骤应该是具体、可执行的
2. params.message 是发送给 Windsurf IDE 的指令，要清晰明确
3. 如果缺少关键信息，设置 ready 为 false，并在 questions 中列出问题
4. 步骤数量控制在 3-6 个

只输出 JSON，不要有其他内容。`

  const userMessage = screenshot 
    ? `${prompt}\n\n[当前 IDE 已截图，可参考分析]`
    : prompt

  // 构建请求
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const url = `${baseUrl}/chat/completions`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('AI API error:', errorText)
    throw new Error(`AI 调用失败: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''
  
  // 解析 JSON
  try {
    // 提取 JSON 部分
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      // 确保步骤有正确的状态
      if (parsed.steps) {
        parsed.steps = parsed.steps.map((s: TaskStep, i: number) => ({
          ...s,
          id: s.id || String(i + 1),
          status: 'pending',
          action: s.action || 'windsurf:send-message',
        }))
      }
      return parsed
    }
  } catch (e) {
    console.error('Parse AI response error:', e, content)
  }

  // 解析失败，回退
  return generatePlanFallback(prompt)
}

/**
 * 回退：简单规划（无 AI）
 */
function generatePlanFallback(prompt: string): TaskPlan {
  const steps: TaskStep[] = [
    { 
      id: '1', 
      description: '分析需求并开始实现', 
      action: 'windsurf:send-message',
      params: { message: prompt },
      status: 'pending' 
    },
  ]

  return {
    goal: prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt,
    analysis: {
      understood: ['任务已接收'],
      missing: [],
      questions: [],
    },
    steps,
    ready: true,
  }
}
