/**
 * 高级模型配置
 * 用于复杂推理、规划、代码生成等任务
 */

export interface AdvancedModel {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'deepseek' | 'openrouter' | 'custom'
  apiKey: string
  baseUrl?: string
  model: string
  capabilities: ModelCapability[]
  isAdvanced: boolean
  priority: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type ModelCapability = 'reasoning' | 'planning' | 'coding' | 'vision'

export const CAPABILITY_LABELS: Record<ModelCapability, { label: string; color: string; icon: string }> = {
  reasoning: { label: '推理', color: 'purple', icon: '🧠' },
  planning: { label: '规划', color: 'blue', icon: '📋' },
  coding: { label: '代码', color: 'green', icon: '💻' },
  vision: { label: '视觉', color: 'orange', icon: '👁️' },
}

export const PROVIDER_PRESETS: Record<string, { name: string; baseUrl: string; models: string[] }> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4-turbo', 'o1-preview', 'o1-mini'],
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-3.5-sonnet', 'openai/o1-preview', 'deepseek/deepseek-r1'],
  },
}

/**
 * 任务规划
 */
export interface TaskPlan {
  id: string
  prompt: string
  analysis: {
    goal: string
    context: string[]
    missing: string[]
    questions: string[]
  }
  steps: TaskStep[]
  status: 'planning' | 'ready' | 'executing' | 'completed' | 'failed'
  createdAt: string
  updatedAt: string
}

export interface TaskStep {
  id: string
  description: string
  action: string
  params?: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: string
  error?: string
}

/**
 * 规划请求
 */
export interface PlanRequest {
  prompt: string
  modelId?: string
  context?: {
    screenshot?: string
    projectInfo?: string
  }
}

/**
 * 规划响应
 */
export interface PlanResponse {
  success: boolean
  plan?: TaskPlan
  error?: string
}

/**
 * 默认规划 Prompt 模板
 */
export const PLANNING_PROMPT_TEMPLATE = `# 角色
你是一个专业的编程助手，协助用户完成开发任务。

# 能力
- 分析用户需求，理解任务目标
- 规划实现步骤，生成可执行的操作序列
- 识别缺失信息，提出澄清问题

# 用户输入
{{prompt}}

{{#if screenshot_analysis}}
# 当前 IDE 状态
{{screenshot_analysis}}
{{/if}}

{{#if project_info}}
# 项目信息
{{project_info}}
{{/if}}

# 输出要求
请以 JSON 格式输出分析结果：

\`\`\`json
{
  "goal": "任务目标的简洁描述",
  "analysis": {
    "understood": ["已理解的需求点1", "已理解的需求点2"],
    "missing": ["缺少的信息1", "缺少的信息2"],
    "questions": ["需要确认的问题1", "需要确认的问题2"]
  },
  "steps": [
    {
      "description": "步骤描述",
      "action": "windsurf:send-message",
      "params": { "message": "发送给 IDE 的具体指令" }
    }
  ],
  "ready": true或false
}
\`\`\`

如果缺少关键信息无法规划，将 ready 设为 false，并在 questions 中列出需要用户回答的问题。
`
