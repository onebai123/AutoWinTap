import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data } = body

    // 获取 AI 设置
    const settingsArr = await prisma.systemSetting.findMany()
    const settings: Record<string, string> = {}
    settingsArr.forEach((s: { key: string; value: string }) => { settings[s.key] = s.value })
    
    const aiApiKey = settings['aiApiKey']
    const aiBaseUrl = settings['aiBaseUrl']
    const aiModel = settings['aiModel'] || 'gpt-4o-mini'
    
    if (!aiApiKey || !aiBaseUrl) {
      return NextResponse.json({ 
        success: false, 
        error: '请先配置 AI 设置' 
      })
    }

    // 构建分析提示词
    let prompt = '你是一个专业的前端开发调试助手。请分析以下问题并给出解决建议：\n\n'
    
    if (type === 'error' || type === 'all') {
      const errors = data.errors || []
      if (errors.length > 0) {
        prompt += '## 控制台错误/警告\n'
        errors.slice(0, 10).forEach((e: { type: string; text: string }, i: number) => {
          prompt += `${i + 1}. [${e.type}] ${e.text}\n`
        })
        prompt += '\n'
      }
    }

    if (type === 'request' || type === 'all') {
      const requests = data.requests || []
      if (requests.length > 0) {
        prompt += '## 失败的网络请求\n'
        requests.slice(0, 10).forEach((r: { method: string; url: string; status: number }, i: number) => {
          prompt += `${i + 1}. [${r.method}] ${r.url} - 状态码: ${r.status}\n`
        })
        prompt += '\n'
      }
    }

    if (type === 'layout') {
      prompt += '## 布局问题\n'
      prompt += '请根据提供的截图分析页面布局问题。\n\n'
    }

    prompt += `请分析以上问题，给出：
1. **问题摘要**：简要描述发现了什么问题
2. **可能原因**：分析问题产生的原因
3. **解决建议**：给出具体的修复建议
4. **代码示例**：如果适用，给出修复代码示例

请用中文回复，格式清晰。`

    // 调用 AI API
    const aiResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiApiKey}`
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'system', content: '你是一个专业的前端开发调试助手，擅长分析浏览器控制台错误、网络请求问题和页面布局问题。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    })

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text()
      return NextResponse.json({ 
        success: false, 
        error: `AI API 调用失败: ${errorText}` 
      })
    }

    const aiResult = await aiResponse.json()
    const content = aiResult.choices?.[0]?.message?.content || '分析完成，但未获取到结果'

    return NextResponse.json({
      success: true,
      data: { content }
    })

  } catch (error) {
    console.error('AI analyze error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : '分析失败' 
    })
  }
}
