/**
 * AI 分析 API
 * POST /api/ai/analyze
 * 
 * 接收屏幕文字或图片，调用配置的 LLM 进行分析
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface AnalyzeRequest {
  text: string
  context?: string
  promptType?: 'dev' | 'debug' | 'review' | 'general'
}

interface Setting {
  key: string
  value: string
}

// 内置提示词模板
const PROMPTS = {
  dev: `你是一个开发助手，帮助分析屏幕内容。请根据提供的屏幕文字，分析：
1. 当前状态：用户正在做什么
2. 检测问题：是否有错误、警告或异常
3. 建议操作：下一步应该做什么

请用简洁的中文回答，格式如下：
【状态】...
【问题】...（如果没有问题就说"无"）
【建议】...`,

  debug: `你是一个调试专家，帮助分析错误信息。请根据屏幕内容：
1. 识别错误类型和原因
2. 定位问题根源
3. 提供修复建议

格式：
【状态】...
【问题】...
【建议】...`,

  review: `你是一个代码审查专家，请分析屏幕中的代码：
1. 代码质量评估
2. 潜在问题
3. 改进建议

格式：
【状态】...
【问题】...
【建议】...`,

  general: `分析以下屏幕内容，简要说明当前状态和建议操作：

格式：
【状态】...
【问题】...
【建议】...`,
}

// 获取设置
async function getSettings(): Promise<Record<string, string>> {
  try {
    const settings = await prisma.systemSetting.findMany()
    const result: Record<string, string> = {}
    settings.forEach((s: Setting) => { result[s.key] = s.value })
    return result
  } catch (error) {
    console.error('Failed to get settings from DB:', error)
    return {}
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json()
    
    if (!body.text) {
      return NextResponse.json({ success: false, error: '缺少 text 参数' }, { status: 400 })
    }

    // 读取 AI 配置
    const settings = await getSettings()
    const apiUrl = settings.ai_api_url
    const apiKey = settings.ai_api_key
    const model = settings.ai_model || 'gpt-4o'
    
    // 选择提示词：优先使用用户自定义，否则使用内置模板
    const promptType = body.promptType || 'dev'
    const systemPrompt = settings.ai_system_prompt || PROMPTS[promptType] || PROMPTS.dev

    if (!apiUrl || !apiKey) {
      return NextResponse.json({ 
        success: false, 
        error: '未配置 AI 接口，请在设置页面配置 API 地址和密钥' 
      }, { status: 400 })
    }

    // 构建请求
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请分析以下屏幕内容：\n\n${body.text}${body.context ? `\n\n上下文：${body.context}` : ''}` }
    ]

    // 构建完整 API URL（自动补全 /v1）
    let fullApiUrl = apiUrl.replace(/\/$/, '')  // 移除末尾斜杠
    if (!fullApiUrl.endsWith('/v1')) {
      fullApiUrl += '/v1'
    }
    
    console.log('[AI] 调用 API:', { url: `${fullApiUrl}/chat/completions`, model, textLength: body.text.length })

    // 调用 OpenAI 兼容 API
    const response = await fetch(`${fullApiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[AI] API 错误:', response.status, errorText)
      return NextResponse.json({ 
        success: false, 
        error: `AI API 调用失败 (${response.status})` 
      }, { status: response.status })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // 解析结果
    const result = parseAnalysisResult(content)

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        raw: content,
        model,
        usage: data.usage
      }
    })

  } catch (error) {
    console.error('[AI] 分析错误:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'AI 分析失败' 
    }, { status: 500 })
  }
}

// 解析 AI 返回的分析结果
function parseAnalysisResult(content: string): { status: string; problems: string[]; suggestions: string[] } {
  const result = {
    status: '',
    problems: [] as string[],
    suggestions: [] as string[]
  }

  // 尝试解析格式化的结果
  const statusMatch = content.match(/【状态】([\s\S]+?)(?=【|$)/)
  const problemMatch = content.match(/【问题】([\s\S]+?)(?=【|$)/)
  const suggestionMatch = content.match(/【建议】([\s\S]+?)(?=【|$)/)

  if (statusMatch) {
    result.status = statusMatch[1].trim()
  }

  if (problemMatch) {
    const problems = problemMatch[1].trim()
    if (problems !== '无' && problems !== '没有' && problems !== '暂无') {
      result.problems = problems.split(/[，,\n]/).map(s => s.trim()).filter(Boolean)
    }
  }

  if (suggestionMatch) {
    result.suggestions = suggestionMatch[1].trim().split(/[，,\n]/).map(s => s.trim()).filter(Boolean)
  }

  // 如果没有解析到格式化结果，直接返回原文
  if (!result.status) {
    result.status = content.substring(0, 200)
  }

  return result
}
