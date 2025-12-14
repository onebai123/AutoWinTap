import { NextRequest, NextResponse } from 'next/server'

interface LogEntry {
  id: string
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  source: string
  message: string
  deviceId?: string
}

// 内存日志存储 (实际应用中使用数据库)
const logs: LogEntry[] = []
const MAX_LOGS = 1000

// GET /api/logs
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const level = searchParams.get('level')
  const source = searchParams.get('source')
  const deviceId = searchParams.get('deviceId')
  const search = searchParams.get('search')
  const limit = parseInt(searchParams.get('limit') || '100')

  let filtered = [...logs]

  if (level) {
    filtered = filtered.filter(log => log.level === level)
  }
  if (source) {
    filtered = filtered.filter(log => log.source === source)
  }
  if (deviceId) {
    filtered = filtered.filter(log => log.deviceId === deviceId)
  }
  if (search) {
    const s = search.toLowerCase()
    filtered = filtered.filter(log => log.message.toLowerCase().includes(s))
  }

  // 最新的在前
  filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  filtered = filtered.slice(0, limit)

  return NextResponse.json({ success: true, data: filtered })
}

// POST /api/logs
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { level, source, message, deviceId } = body

    if (!level || !source || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const entry: LogEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      timestamp: new Date(),
      level,
      source,
      message,
      deviceId,
    }

    logs.unshift(entry)

    // 限制日志数量
    while (logs.length > MAX_LOGS) {
      logs.pop()
    }

    return NextResponse.json({ success: true, data: entry })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

// DELETE /api/logs
export async function DELETE() {
  logs.length = 0
  return NextResponse.json({ success: true })
}
