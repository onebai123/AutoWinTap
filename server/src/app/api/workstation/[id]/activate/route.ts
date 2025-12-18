/**
 * 工作台激活 API
 * POST /api/workstation/[id]/activate - 激活工作台（按特征匹配窗口）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface WindowConfig {
  handle: number
  name: string
  role: string
  processName?: string
  titlePattern?: string
}

interface DbWorkstation {
  id: string
  name: string
  deviceId: string
  hotkey: string | null
  windows: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    // 1. 获取工作台配置
    const workstation = await prisma.workstation.findUnique({ where: { id } }) as DbWorkstation | null
    if (!workstation) {
      return NextResponse.json({ success: false, error: '工作台不存在' }, { status: 404 })
    }
    
    const windows: WindowConfig[] = JSON.parse(workstation.windows || '[]')
    if (windows.length === 0) {
      return NextResponse.json({ success: false, error: '工作台没有配置窗口' }, { status: 400 })
    }
    
    // 2. 获取设备信息
    const device = await prisma.device.findUnique({ where: { id: workstation.deviceId } })
    if (!device || device.status !== 'ONLINE') {
      return NextResponse.json({ success: false, error: '设备不在线' }, { status: 400 })
    }
    
    // 3. 调用 agent 激活窗口（按特征匹配）
    const agentUrl = `http://${device.ip}:5100`
    
    // 构建匹配模式
    const patterns = windows.map(w => ({
      processName: w.processName,
      titlePattern: w.titlePattern,
      handle: w.handle,  // 备用，如果特征匹配失败则尝试直接用 handle
    }))
    
    const res = await fetch(`${agentUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plugin: 'window-control',
        action: 'activate-by-pattern',
        params: { patterns }
      }),
    })
    
    const data = await res.json()
    
    if (data.success) {
      return NextResponse.json({ 
        success: true, 
        data: { 
          workstation: workstation.name,
          matched: data.data?.matched || [],
          failed: data.data?.failed || []
        }
      })
    } else {
      return NextResponse.json({ success: false, error: data.error || '激活失败' })
    }
  } catch (error) {
    console.error('Activate workstation error:', error)
    return NextResponse.json({ success: false, error: 'Failed to activate workstation' }, { status: 500 })
  }
}
