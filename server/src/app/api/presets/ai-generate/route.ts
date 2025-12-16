/**
 * AI 智能生成窗口组合
 * POST /api/presets/ai-generate
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface WindowInfo {
  handle: number
  title: string
  processName: string
  processId: number
}

interface ComboSuggestion {
  name: string
  description: string
  windows: WindowInfo[]
  shortcut: string
  priority: number
}

// 快捷键池
const SHORTCUT_POOL = ['Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5', 'Alt+6', 'Alt+7', 'Alt+8', 'Alt+9']

// 窗口分类规则
const CATEGORIES: Record<string, { keywords: string[]; priority: number }> = {
  IDE: { keywords: ['Visual Studio', 'VS Code', 'Code', 'WebStorm', 'PyCharm', 'IntelliJ', 'Windsurf', 'Cursor'], priority: 1 },
  TERMINAL: { keywords: ['Terminal', 'PowerShell', 'cmd', 'Git Bash', 'Windows Terminal', 'WindowsTerminal'], priority: 2 },
  BROWSER_DEV: { keywords: ['DevTools', 'Developer Tools', 'localhost'], priority: 3 },
  BROWSER: { keywords: ['Chrome', 'Firefox', 'Edge', 'msedge', 'Safari'], priority: 4 },
  DATABASE: { keywords: ['DBeaver', 'DataGrip', 'MySQL', 'pgAdmin', 'MongoDB', 'Navicat'], priority: 5 },
  API: { keywords: ['Postman', 'Insomnia', 'Bruno'], priority: 6 },
  DOCS: { keywords: ['Word', 'Notion', 'Obsidian', 'OneNote', 'Typora'], priority: 7 },
  CHAT: { keywords: ['Weixin', 'WeChat', 'Slack', 'Discord', 'Teams'], priority: 8 },
  OTHER: { keywords: [], priority: 99 },
}

// 分类窗口
function categorizeWindow(window: WindowInfo): string {
  const searchText = `${window.processName} ${window.title}`.toLowerCase()
  for (const [category, config] of Object.entries(CATEGORIES)) {
    if (config.keywords.some(k => searchText.includes(k.toLowerCase()))) {
      return category
    }
  }
  return 'OTHER'
}

// 获取 AI 配置
async function getAISettings(): Promise<Record<string, string>> {
  try {
    const settings = await prisma.systemSetting.findMany()
    const result: Record<string, string> = {}
    settings.forEach((s: { key: string; value: string }) => { result[s.key] = s.value })
    return result
  } catch {
    return {}
  }
}

// 调用 AI 生成组合
async function generateWithAI(windows: WindowInfo[], preference: string, settings: Record<string, string>): Promise<ComboSuggestion[]> {
  const apiUrl = settings.ai_api_url
  const apiKey = settings.ai_api_key
  const model = settings.ai_model || 'gpt-4o-mini'

  if (!apiUrl || !apiKey) {
    throw new Error('未配置 AI 接口，请在设置页面配置')
  }

  const windowList = windows.map(w => `- ${w.processName}: ${w.title}`).join('\n')

  const systemPrompt = `你是一个桌面窗口管理助手，帮助用户按【项目】组织窗口组合。

**核心规则：按项目分组，不是按类别分组！**

分组逻辑：
1. 分析每个窗口标题中的项目名、文件夹路径、localhost端口
2. 将属于同一项目的 IDE + 浏览器 + 终端 放在一个组合
3. 例如：Windsurf 打开 "AutoWinTap" 项目，Chrome 打开 "localhost:3000"，它们是同一项目，应该放一组
4. 组合名称用项目名（如 "AutoWinTap"、"MyProject"）
5. 最后，无法归属项目的同类窗口才放一起（如多个无关的浏览器）

**错误示例（不要这样做）：**
- 把所有 IDE 放一组、所有浏览器放一组 ❌

**正确示例：**
- AutoWinTap: Windsurf(AutoWinTap) + Chrome(localhost:3000) + Terminal(AutoWinTap) ✓
- PythonProject: PyCharm(my-api) + Chrome(localhost:8000) ✓
- 浏览器: 剩余的 Chrome 窗口 ✓

返回 JSON 数组格式：
[
  {
    "name": "项目名或组合名",
    "description": "简短描述",
    "windowIndices": [0, 1, 2],
    "priority": 1
  }
]

只返回 JSON，不要其他内容。`

  const userMessage = `当前打开的窗口（按索引）：
${windows.map((w, i) => `${i}. ${w.processName}: ${w.title}`).join('\n')}

用户偏好：${preference || '编程开发优先，开发项目优先'}

请生成窗口组合建议。`

  let fullApiUrl = apiUrl.replace(/\/$/, '')
  if (!fullApiUrl.endsWith('/v1')) {
    fullApiUrl += '/v1'
  }

  const response = await fetch(`${fullApiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  })

  if (!response.ok) {
    throw new Error(`AI API 调用失败 (${response.status})`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''

  // 解析 JSON
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Invalid JSON')
    
    const parsed = JSON.parse(jsonMatch[0])
    return parsed.map((item: { name: string; description: string; windowIndices: number[]; priority: number }, index: number) => ({
      name: item.name,
      description: item.description || '',
      windows: item.windowIndices.map((i: number) => windows[i]).filter(Boolean),
      shortcut: SHORTCUT_POOL[index] || '',
      priority: item.priority || index + 1
    })).filter((c: ComboSuggestion) => c.windows.length > 0)
  } catch {
    throw new Error('AI 返回格式错误，请重试')
  }
}

// 从窗口标题提取项目关键词
function extractProjectKeywords(title: string): string[] {
  const keywords: string[] = []
  
  // 常见项目路径模式: "xxx - ProjectName" 或 "ProjectName - xxx"
  const dashParts = title.split(' - ')
  dashParts.forEach(part => {
    // 提取文件夹/项目名（通常是英文+数字+下划线/横杠）
    const matches = part.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g)
    if (matches) keywords.push(...matches.map(m => m.toLowerCase()))
  })
  
  // 提取路径中的文件夹名
  const pathMatch = title.match(/[\\\/]([A-Za-z][A-Za-z0-9_-]+)[\\\/]/g)
  if (pathMatch) {
    pathMatch.forEach(p => {
      const name = p.replace(/[\\\/]/g, '').toLowerCase()
      if (name.length > 2) keywords.push(name)
    })
  }
  
  // localhost:端口 可能是同一项目
  const portMatch = title.match(/localhost:(\d+)/i)
  if (portMatch) keywords.push(`port${portMatch[1]}`)
  
  return [...new Set(keywords)]
}

// 计算两个窗口的项目关联度
function getProjectSimilarity(w1: WindowInfo, w2: WindowInfo): number {
  const k1 = extractProjectKeywords(w1.title)
  const k2 = extractProjectKeywords(w2.title)
  
  let score = 0
  k1.forEach(k => {
    if (k2.includes(k)) score += 1
  })
  return score
}

// 本地智能生成（按项目优先分组）
function generateLocally(windows: WindowInfo[]): ComboSuggestion[] {
  const combos: ComboSuggestion[] = []
  const usedHandles = new Set<number>()
  
  // 1. 先找出所有 IDE 窗口，作为项目锚点
  const ideWindows = windows.filter(w => categorizeWindow(w) === 'IDE')
  const otherWindows = windows.filter(w => categorizeWindow(w) !== 'IDE')
  
  // 2. 为每个 IDE 窗口找相关的浏览器和终端
  for (const ide of ideWindows) {
    if (usedHandles.has(ide.handle)) continue
    
    const projectWindows: WindowInfo[] = [ide]
    usedHandles.add(ide.handle)
    
    // 找与这个 IDE 相关的其他窗口
    const ideKeywords = extractProjectKeywords(ide.title)
    
    // 按关联度排序其他窗口
    const related = otherWindows
      .filter(w => !usedHandles.has(w.handle))
      .map(w => ({ w, score: getProjectSimilarity(ide, w), cat: categorizeWindow(w) }))
      .filter(x => x.score > 0 || ['TERMINAL', 'BROWSER', 'BROWSER_DEV'].includes(x.cat))
      .sort((a, b) => b.score - a.score)
    
    // 优先取关联度高的，每类最多取1-2个
    const catCount: Record<string, number> = {}
    for (const r of related) {
      if (projectWindows.length >= 4) break
      catCount[r.cat] = (catCount[r.cat] || 0) + 1
      if (catCount[r.cat] <= 2) {
        projectWindows.push(r.w)
        usedHandles.add(r.w.handle)
      }
    }
    
    // 只有多于1个窗口才创建组合
    if (projectWindows.length > 1) {
      // 尝试从标题提取项目名
      let projectName = '项目'
      for (const kw of ideKeywords) {
        if (kw.length > 3 && !['code', 'visual', 'studio', 'windsurf', 'cursor', 'pycharm'].includes(kw)) {
          projectName = kw.charAt(0).toUpperCase() + kw.slice(1)
          break
        }
      }
      
      combos.push({
        name: projectName,
        description: `${ide.processName} + 相关窗口`,
        windows: projectWindows,
        shortcut: SHORTCUT_POOL[combos.length] || '',
        priority: combos.length + 1
      })
    }
  }
  
  // 3. 剩余窗口按类别分组
  const remaining = windows.filter(w => !usedHandles.has(w.handle))
  const groups: Record<string, WindowInfo[]> = {}
  remaining.forEach(w => {
    const cat = categorizeWindow(w)
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(w)
  })
  
  // 为每个类别创建组合（如果超过2个窗口）
  const catNames: Record<string, string> = {
    'BROWSER': '浏览器',
    'TERMINAL': '终端',
    'DATABASE': '数据库',
    'API': 'API 工具',
    'DOCS': '文档',
    'OTHER': '其他'
  }
  
  for (const [cat, wins] of Object.entries(groups)) {
    if (wins.length >= 2 && combos.length < 5) {
      combos.push({
        name: catNames[cat] || cat,
        description: `${wins.length} 个${catNames[cat] || '窗口'}`,
        windows: wins.slice(0, 4),
        shortcut: SHORTCUT_POOL[combos.length] || '',
        priority: combos.length + 1
      })
    }
  }

  return combos.slice(0, 5)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, preference } = body

    if (!deviceId) {
      return NextResponse.json({ success: false, error: '缺少 deviceId' }, { status: 400 })
    }

    // 获取当前窗口列表
    const AGENT_HTTP_PORT = 5200
    let windowsData
    try {
      const windowsRes = await fetch(`http://localhost:${AGENT_HTTP_PORT}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'window-control', action: 'list' })
      })
      windowsData = await windowsRes.json()
    } catch (fetchError) {
      console.error('[AI-Combo] Agent 连接失败:', fetchError)
      return NextResponse.json({ 
        success: false, 
        error: 'Agent 未运行或无法连接，请确保 Agent 已启动在端口 5200' 
      }, { status: 503 })
    }

    if (!windowsData.success || !Array.isArray(windowsData.data)) {
      return NextResponse.json({ success: false, error: '获取窗口列表失败' }, { status: 500 })
    }

    // 过滤系统窗口
    const windows: WindowInfo[] = windowsData.data.filter((w: WindowInfo) => 
      w.title && 
      !w.title.includes('Program Manager') && 
      !w.title.includes('Windows 输入体验') &&
      !w.title.includes('NVIDIA GeForce')
    )

    if (windows.length === 0) {
      return NextResponse.json({ success: false, error: '没有可用的窗口' }, { status: 400 })
    }

    // 尝试使用 AI 生成，失败则本地生成
    let combos: ComboSuggestion[]
    try {
      const settings = await getAISettings()
      if (settings.ai_api_url && settings.ai_api_key) {
        combos = await generateWithAI(windows, preference || '', settings)
      } else {
        combos = generateLocally(windows)
      }
    } catch (error) {
      console.log('[AI-Combo] AI 生成失败，使用本地生成:', error)
      combos = generateLocally(windows)
    }

    return NextResponse.json({
      success: true,
      data: {
        combos,
        availableShortcuts: SHORTCUT_POOL
      }
    })

  } catch (error) {
    console.error('[AI-Combo] Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : '生成失败' 
    }, { status: 500 })
  }
}
