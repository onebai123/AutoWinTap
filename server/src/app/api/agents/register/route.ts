import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import type { AgentRegisterRequest } from '@/types'

// POST /api/agents/register - Agent 注册
export async function POST(request: NextRequest) {
  try {
    const body: AgentRegisterRequest = await request.json()

    const { machineId, hostname, ip, os, agentVersion, plugins } = body

    // 创建或更新设备
    const device = await prisma.device.upsert({
      where: { machineId },
      update: {
        hostname,
        ip,
        os,
        agentVersion,
        plugins: JSON.stringify(plugins),
        status: 'ONLINE',
        lastSeen: new Date(),
      },
      create: {
        machineId,
        hostname,
        ip,
        os,
        agentVersion,
        plugins: JSON.stringify(plugins),
        status: 'ONLINE',
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: device.id,
        machineId: device.machineId,
      },
    })
  } catch (error) {
    console.error('[API] POST /api/agents/register error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to register agent' },
      { status: 500 }
    )
  }
}
