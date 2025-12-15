/**
 * AI 辅助级别配置
 * 参考自动驾驶 L1-L5 分级体系
 */

export interface AILevel {
  id: string
  name: string
  icon: string
  color: string
  description: string
  capabilities: string[]
  confirmRequired: boolean
  autoExecute: boolean
}

export const AI_LEVELS: Record<string, AILevel> = {
  L1: {
    id: 'L1',
    name: '编码辅助',
    icon: '🔍',
    color: '#52c41a',
    description: 'AI 仅分析和建议，不执行操作',
    capabilities: ['屏幕分析', 'OCR识别', '问题诊断', '操作建议'],
    confirmRequired: true,
    autoExecute: false
  },
  L2: {
    id: 'L2',
    name: '任务辅助',
    icon: '🤝',
    color: '#1890ff',
    description: 'AI 可执行操作，但需要确认',
    capabilities: ['L1全部', '窗口管理', '按键发送', '命令执行'],
    confirmRequired: true,
    autoExecute: false
  },
  L3: {
    id: 'L3',
    name: '场景自动',
    icon: '⚡',
    color: '#faad14',
    description: '预设场景自动执行，异常时请求接管',
    capabilities: ['L2全部', '工作流自动', '错误重试', '超时处理'],
    confirmRequired: false,
    autoExecute: true
  },
  L4: {
    id: 'L4',
    name: '智能托管',
    icon: '🚀',
    color: '#ff4d4f',
    description: 'AI 自动处理，仅关键操作确认',
    capabilities: ['L3全部', '主动发现', '智能调度', '自动恢复'],
    confirmRequired: false,
    autoExecute: true
  },
  L5: {
    id: 'L5',
    name: '完全自主',
    icon: '🌟',
    color: '#722ed1',
    description: 'AI 完全自主运行，无需人类干预（即将推出）',
    capabilities: ['L4全部', '自主决策', '自主学习', '全链路自动'],
    confirmRequired: false,
    autoExecute: true
  }
}

export const DEFAULT_LEVEL = 'L2'

export type AILevelId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

// L5 暂不可选
export const DISABLED_LEVELS = ['L5']

/**
 * 检查操作是否允许执行
 */
export function canExecute(level: AILevelId, operation?: string): { 
  allowed: boolean
  confirmRequired: boolean 
  message?: string
} {
  const config = AI_LEVELS[level]
  
  if (!config) {
    return { allowed: false, confirmRequired: false, message: '无效的级别' }
  }

  // L1: 不允许任何执行操作
  if (level === 'L1') {
    return { 
      allowed: false, 
      confirmRequired: false,
      message: '当前 L1 级别仅提供分析建议，不执行操作。提升到 L2 可执行操作。'
    }
  }

  // L2: 允许但需要确认
  if (level === 'L2') {
    return { 
      allowed: true, 
      confirmRequired: true,
      message: '当前 L2 级别，操作需要确认。'
    }
  }

  // L3/L4: 允许自动执行
  return { 
    allowed: true, 
    confirmRequired: false 
  }
}

/**
 * 获取级别列表（用于选择器）
 */
export function getLevelList(): AILevel[] {
  return Object.values(AI_LEVELS)
}

/**
 * 获取级别配置
 */
export function getLevelConfig(level: AILevelId): AILevel {
  return AI_LEVELS[level] || AI_LEVELS[DEFAULT_LEVEL]
}
