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
const SHORTCUT_POOL = ['Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5', 'Ctrl+6', 'Ctrl+7', 'Ctrl+8', 'Ctrl+9']

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

  const systemPrompt = `你是一个桌面窗口管理助手，帮助用户组织窗口组合。

优先级规则（从高到低）：
1. IDE/编辑器（VS Code, WebStorm, Cursor 等）
2. 终端（Terminal, PowerShell, CMD）
3. 浏览器开发工具（DevTools, localhost 页面）
4. 浏览器
5. 数据库工具
6. API 测试工具
7. 文档/笔记
8. 其他

生成规则：
- 生成 3-5 个合理的窗口组合
- 每个组合包含 2-4 个相关窗口
- 组合名称简洁明了（如"开发环境"、"前端调试"）
- 同类或相关窗口放在一起

返回 JSON 数组格式：
[
  {
    "name": "组合名称",
    "description": "简短描述",
    "windowIndices": [0, 1, 2],  // 窗口在列表中的索引（0开始）
    "priority": 1  // 优先级，1最高
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

// 本地智能生成（无 AI 时的备选）
function generateLocally(windows: WindowInfo[]): ComboSuggestion[] {
  // 按类别分组
  const groups: Record<string, WindowInfo[]> = {}
  windows.forEach(w => {
    const cat = categorizeWindow(w)
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(w)
  })

  const combos: ComboSuggestion[] = []

  // 开发环境组合：IDE + 终端
  const ideWindows = groups['IDE'] || []
  const terminalWindows = groups['TERMINAL'] || []
  if (ideWindows.length > 0) {
    combos.push({
      name: '开发环境',
      description: 'IDE 和终端',
      windows: [...ideWindows.slice(0, 2), ...terminalWindows.slice(0, 1)].slice(0, 4),
      shortcut: SHORTCUT_POOL[combos.length] || '',
      priority: 1
    })
  }

  // 前端调试：浏览器 + IDE
  const browserWindows = groups['BROWSER'] || []
  const devToolsWindows = groups['BROWSER_DEV'] || []
  if (browserWindows.length > 0 && ideWindows.length > 0) {
    combos.push({
      name: '前端调试',
      description: '浏览器和编辑器',
      windows: [...browserWindows.slice(0, 1), ...devToolsWindows.slice(0, 1), ...ideWindows.slice(0, 1)].slice(0, 3),
      shortcut: SHORTCUT_POOL[combos.length] || '',
      priority: 2
    })
  }

  // 数据库：数据库工具 + IDE
  const dbWindows = groups['DATABASE'] || []
  if (dbWindows.length > 0) {
    combos.push({
      name: '数据库操作',
      description: '数据库工具',
      windows: [...dbWindows.slice(0, 2), ...ideWindows.slice(0, 1)].slice(0, 3),
      shortcut: SHORTCUT_POOL[combos.length] || '',
      priority: 3
    })
  }

  // 文档：文档 + 浏览器
  const docWindows = groups['DOCS'] || []
  if (docWindows.length > 0) {
    combos.push({
      name: '文档编写',
      description: '文档工具',
      windows: [...docWindows.slice(0, 2), ...browserWindows.slice(0, 1)].slice(0, 3),
      shortcut: SHORTCUT_POOL[combos.length] || '',
      priority: 4
    })
  }

  // 如果组合太少，添加一个全部开发工具
  if (combos.length < 2 && windows.length >= 2) {
    const devWindows = windows
      .map(w => ({ w, cat: categorizeWindow(w) }))
      .filter(x => ['IDE', 'TERMINAL', 'BROWSER', 'BROWSER_DEV'].includes(x.cat))
      .map(x => x.w)
      .slice(0, 4)
    
    if (devWindows.length >= 2) {
      combos.push({
        name: '工作空间',
        description: '常用开发窗口',
        windows: devWindows,
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
