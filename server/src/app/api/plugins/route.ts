import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// 模拟插件商店数据
const pluginStore = [
  {
    id: 'window-control',
    name: '窗口控制',
    version: '1.0.0',
    description: 'Windows 窗口枚举、激活、截图等功能',
    author: 'WinTab',
    category: 'system',
    downloads: 1250,
    isBuiltin: true,
  },
  {
    id: 'browser-debug',
    name: '浏览器调试',
    version: '1.0.0',
    description: 'Chrome DevTools Protocol 调试',
    author: 'WinTab',
    category: 'browser',
    downloads: 890,
    isBuiltin: true,
  },
  {
    id: 'windsurf',
    name: 'Windsurf 自动化',
    version: '1.0.0',
    description: 'Windsurf IDE 自动化控制',
    author: 'WinTab',
    category: 'ide',
    downloads: 456,
    isBuiltin: true,
  },
  {
    id: 'clipboard',
    name: '剪贴板管理',
    version: '1.0.0',
    description: '剪贴板读写、历史记录',
    author: 'Community',
    category: 'system',
    downloads: 320,
    isBuiltin: false,
  },
  {
    id: 'screenshot-ocr',
    name: '截图 OCR',
    version: '1.0.0',
    description: '截图文字识别',
    author: 'Community',
    category: 'ai',
    downloads: 210,
    isBuiltin: false,
  },
]

// GET /api/plugins - 获取插件列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const source = searchParams.get('source') // 'store' | 'installed'
    const category = searchParams.get('category')

    if (source === 'store') {
      let plugins = pluginStore
      if (category && category !== 'all') {
        plugins = plugins.filter((p) => p.category === category)
      }
      return NextResponse.json({ success: true, data: plugins })
    }

    // 从数据库获取已安装插件
    const installed = await prisma.plugin.findMany()
    return NextResponse.json({ success: true, data: installed })
  } catch (error) {
    console.error('[API] GET /api/plugins error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch plugins' },
      { status: 500 }
    )
  }
}

// POST /api/plugins - 安装插件
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pluginId } = body

    // 检查商店中是否存在
    const storePlugin = pluginStore.find((p) => p.id === pluginId)
    if (!storePlugin) {
      return NextResponse.json(
        { success: false, error: 'Plugin not found in store' },
        { status: 404 }
      )
    }

    // 检查是否已安装
    const existing = await prisma.plugin.findUnique({ where: { id: pluginId } })
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Plugin already installed' },
        { status: 400 }
      )
    }

    // 安装插件 (记录到数据库)
    const plugin = await prisma.plugin.create({
      data: {
        id: storePlugin.id,
        name: storePlugin.name,
        version: storePlugin.version,
        description: storePlugin.description,
        author: storePlugin.author,
        category: storePlugin.category,
        downloads: storePlugin.downloads,
        isBuiltin: storePlugin.isBuiltin,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Plugin ${plugin.name} installed successfully`,
      data: plugin,
    })
  } catch (error) {
    console.error('[API] POST /api/plugins error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to install plugin' },
      { status: 500 }
    )
  }
}

// DELETE /api/plugins - 卸载插件
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pluginId = searchParams.get('id')

    if (!pluginId) {
      return NextResponse.json(
        { success: false, error: 'Plugin ID is required' },
        { status: 400 }
      )
    }

    // 检查是否存在
    const plugin = await prisma.plugin.findUnique({ where: { id: pluginId } })
    if (!plugin) {
      return NextResponse.json(
        { success: false, error: 'Plugin not found' },
        { status: 404 }
      )
    }

    // 内置插件不能卸载
    if (plugin.isBuiltin) {
      return NextResponse.json(
        { success: false, error: 'Cannot uninstall builtin plugin' },
        { status: 400 }
      )
    }

    // 卸载插件
    await prisma.plugin.delete({ where: { id: pluginId } })

    return NextResponse.json({
      success: true,
      message: `Plugin ${plugin.name} uninstalled successfully`,
    })
  } catch (error) {
    console.error('[API] DELETE /api/plugins error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to uninstall plugin' },
      { status: 500 }
    )
  }
}
