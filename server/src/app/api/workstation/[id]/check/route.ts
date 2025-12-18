import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface WindowConfig {
  handle: number
  role: string
  name: string
  processName?: string
  className?: string
}

interface WindowInfo {
  handle: number
  title: string
  processName: string
  className?: string
}

interface CheckResult {
  window: WindowConfig
  status: 'valid' | 'invalid'
  candidates: {
    window: WindowInfo
    matchScore: number
    matchReason: string
  }[]
  aiSuggestion?: {
    handle: number
    confidence: number
    reason: string
  }
}

/**
 * 检查工作台窗口有效性
 * POST /api/workstation/[id]/check
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // 获取工作台
    const workstation = await prisma.workstation.findUnique({
      where: { id },
    })
    
    if (!workstation) {
      return NextResponse.json({ success: false, error: '工作台不存在' }, { status: 404 })
    }
    
    const windows = JSON.parse(workstation.windows) as WindowConfig[]
    const body = await request.json()
    const { currentWindows, useAI = false } = body as { 
      currentWindows: WindowInfo[]
      useAI?: boolean 
    }
    
    if (!currentWindows || !Array.isArray(currentWindows)) {
      return NextResponse.json({ success: false, error: '缺少当前窗口列表' }, { status: 400 })
    }
    
    const results: CheckResult[] = []
    
    for (const savedWindow of windows) {
      // 检查句柄是否仍然有效
      const stillExists = currentWindows.some(w => w.handle === savedWindow.handle)
      
      if (stillExists) {
        // 窗口仍有效
        results.push({
          window: savedWindow,
          status: 'valid',
          candidates: [],
        })
      } else {
        // 窗口已失效，寻找候选匹配
        const candidates = findCandidates(savedWindow, currentWindows)
        
        results.push({
          window: savedWindow,
          status: 'invalid',
          candidates,
        })
      }
    }
    
    // 如果启用 AI，进行智能匹配建议
    if (useAI) {
      const invalidResults = results.filter(r => r.status === 'invalid' && r.candidates.length > 0)
      if (invalidResults.length > 0) {
        await addAISuggestions(invalidResults, workstation.deviceId)
      }
    }
    
    const validCount = results.filter(r => r.status === 'valid').length
    const invalidCount = results.filter(r => r.status === 'invalid').length
    
    return NextResponse.json({
      success: true,
      data: {
        results,
        summary: {
          total: windows.length,
          valid: validCount,
          invalid: invalidCount,
        },
      },
    })
  } catch (error) {
    console.error('Check windows error:', error)
    return NextResponse.json({ success: false, error: '检查失败' }, { status: 500 })
  }
}

/**
 * 寻找候选匹配窗口
 */
function findCandidates(savedWindow: WindowConfig, currentWindows: WindowInfo[]) {
  const candidates: CheckResult['candidates'] = []
  
  for (const current of currentWindows) {
    let score = 0
    const reasons: string[] = []
    
    // 1. 标题完全匹配
    if (current.title === savedWindow.name) {
      score += 100
      reasons.push('标题完全匹配')
    }
    // 2. 标题包含
    else if (current.title.includes(savedWindow.name) || savedWindow.name.includes(current.title)) {
      score += 60
      reasons.push('标题部分匹配')
    }
    // 3. 标题相似度（简单的词匹配）
    else {
      const savedWords = savedWindow.name.toLowerCase().split(/[\s\-_./\\]+/)
      const currentWords = current.title.toLowerCase().split(/[\s\-_./\\]+/)
      const commonWords = savedWords.filter(w => currentWords.some(cw => cw.includes(w) || w.includes(cw)))
      if (commonWords.length > 0) {
        score += commonWords.length * 15
        reasons.push(`关键词匹配: ${commonWords.join(', ')}`)
      }
    }
    
    // 4. 进程名匹配
    if (savedWindow.processName && current.processName) {
      if (current.processName.toLowerCase() === savedWindow.processName.toLowerCase()) {
        score += 40
        reasons.push('进程名匹配')
      } else if (current.processName.toLowerCase().includes(savedWindow.processName.toLowerCase())) {
        score += 20
        reasons.push('进程名部分匹配')
      }
    }
    
    // 5. 角色推断（通过进程名推断角色）
    const inferredRole = inferRole(current.processName, current.title)
    if (inferredRole === savedWindow.role) {
      score += 30
      reasons.push(`角色匹配: ${savedWindow.role}`)
    }
    
    // 只保留有一定匹配度的候选
    if (score > 0) {
      candidates.push({
        window: current,
        matchScore: score,
        matchReason: reasons.join('; '),
      })
    }
  }
  
  // 按匹配度排序
  candidates.sort((a, b) => b.matchScore - a.matchScore)
  
  // 只返回前5个最佳匹配
  return candidates.slice(0, 5)
}

/**
 * 推断窗口角色
 */
function inferRole(processName: string, title: string): string {
  const pn = processName.toLowerCase()
  const t = title.toLowerCase()
  
  if (pn.includes('chrome') || pn.includes('firefox') || pn.includes('edge') || pn.includes('msedge')) {
    return 'browser'
  }
  if (pn.includes('code') || pn.includes('windsurf') || pn.includes('idea') || pn.includes('studio') || pn.includes('vim') || pn.includes('notepad')) {
    return 'editor'
  }
  if (pn.includes('terminal') || pn.includes('powershell') || pn.includes('cmd') || pn.includes('wt') || pn.includes('conhost') || t.includes('命令提示符')) {
    return 'terminal'
  }
  return 'other'
}

/**
 * 添加 AI 智能匹配建议
 */
async function addAISuggestions(results: CheckResult[], deviceId: string) {
  try {
    // 获取 AI 配置
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: ['ai_api_url', 'ai_api_key', 'ai_model'] } },
    })
    const config: Record<string, string> = {}
    settings.forEach(s => { config[s.key] = s.value })
    
    if (!config.ai_api_url || !config.ai_api_key) {
      return // 没有配置 AI，跳过
    }
    
    // 构建提示
    const prompt = `你是一个窗口匹配助手。用户的工作台保存了一些窗口配置，但电脑重启后窗口句柄失效了。
请帮助匹配最可能对应的当前窗口。

失效的窗口配置：
${results.map((r, i) => `${i + 1}. 名称: "${r.window.name}", 角色: ${r.window.role}`).join('\n')}

当前可用的候选窗口：
${results.flatMap(r => r.candidates.map(c => `- 句柄: ${c.window.handle}, 标题: "${c.window.title}", 进程: ${c.window.processName}, 匹配分: ${c.matchScore}`)).join('\n')}

请为每个失效窗口推荐最佳匹配。输出 JSON 格式：
{
  "suggestions": [
    { "windowIndex": 0, "recommendedHandle": 12345, "confidence": 0.9, "reason": "..." }
  ]
}
只输出 JSON，不要其他内容。`

    const baseUrl = config.ai_api_url.replace(/\/+$/, '')
    const url = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ai_api_key}`,
      },
      body: JSON.stringify({
        model: config.ai_model || 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    })
    
    if (!response.ok) return
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    
    // 解析 AI 响应
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.suggestions) {
        for (const suggestion of parsed.suggestions) {
          const idx = suggestion.windowIndex
          if (idx >= 0 && idx < results.length) {
            results[idx].aiSuggestion = {
              handle: suggestion.recommendedHandle,
              confidence: suggestion.confidence,
              reason: suggestion.reason,
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('AI suggestion error:', error)
  }
}
