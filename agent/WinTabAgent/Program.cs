using System.Text.Json;
using WinTabAgent.Models;
using WinTabAgent.Services;
using WinTabAgent.Plugins.WindowControl;
using WinTabAgent.Plugins.BrowserDebug;
using WinTabAgent.Plugins.Windsurf;
using WinTabAgent.Plugins.Shell;

namespace WinTabAgent;

class Program
{
    static async Task Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.WriteLine("╔═══════════════════════════════════════╗");
        Console.WriteLine("║       WinTab Agent v1.0.0             ║");
        Console.WriteLine("║   分布式窗口管理平台 - Agent 端       ║");
        Console.WriteLine("╚═══════════════════════════════════════╝");
        Console.WriteLine();

        // 检查自动连接模式
        bool autoConnect = args.Contains("--auto") || args.Contains("-a");

        // 加载配置
        var config = LoadConfig();
        Console.WriteLine($"[INFO] Agent Name: {config.Agent.Name}");
        Console.WriteLine($"[INFO] Server URL: {config.Server.Url}");

        // 创建插件上下文
        var context = new DefaultPluginContext(config);

        // 创建插件服务
        var pluginService = new PluginService(context);

        // 注册内置插件
        await pluginService.RegisterBuiltinPluginAsync(new WindowControlPlugin());
        await pluginService.RegisterBuiltinPluginAsync(new BrowserDebugPlugin());
        await pluginService.RegisterBuiltinPluginAsync(new WindsurfPlugin());
        await pluginService.RegisterBuiltinPluginAsync(new ShellPlugin());

        // 加载外部插件
        await pluginService.LoadPluginsAsync();

        Console.WriteLine($"[INFO] Loaded {pluginService.GetPluginIds().Count} plugins");
        foreach (var id in pluginService.GetPluginIds())
        {
            Console.WriteLine($"  - {id}");
        }

        // 自动连接模式
        if (autoConnect)
        {
            await AutoConnectMode(config, pluginService, context);
            return;
        }

        // 主菜单
        while (true)
        {
            Console.WriteLine();
            Console.WriteLine("═══════════════════════════════════════");
            Console.WriteLine("  1. 查看已加载插件");
            Console.WriteLine("  2. 测试窗口控制插件");
            Console.WriteLine("  3. 测试浏览器调试插件");
            Console.WriteLine("  4. 测试 Windsurf 插件");
            Console.WriteLine("  5. 连接 Server");
            Console.WriteLine("  q. 退出");
            Console.WriteLine("═══════════════════════════════════════");
            Console.Write("请选择: ");

            var input = Console.ReadLine()?.Trim().ToLower();

            switch (input)
            {
                case "1":
                    ShowPlugins(pluginService);
                    break;
                case "2":
                    await TestWindowControlPlugin(pluginService);
                    break;
                case "3":
                    await TestBrowserDebugPlugin(pluginService);
                    break;
                case "4":
                    await TestWindsurfPlugin(pluginService);
                    break;
                case "5":
                    await ConnectServer(config, pluginService, context);
                    break;
                case "q":
                    Console.WriteLine("正在退出...");
                    await pluginService.ShutdownAllAsync();
                    return;
                default:
                    Console.WriteLine("无效选项");
                    break;
            }
        }
    }

    static AgentConfig LoadConfig()
    {
        var configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
        if (File.Exists(configPath))
        {
            try
            {
                var json = File.ReadAllText(configPath);
                return JsonSerializer.Deserialize<AgentConfig>(json) ?? new AgentConfig();
            }
            catch
            {
                Console.WriteLine("[WARN] Failed to load config, using defaults");
            }
        }
        return new AgentConfig();
    }

    static void ShowPlugins(PluginService pluginService)
    {
        var plugins = pluginService.GetAllPlugins().ToList();
        if (plugins.Count == 0)
        {
            Console.WriteLine("没有加载任何插件");
            return;
        }

        Console.WriteLine();
        Console.WriteLine("已加载插件:");
        foreach (var plugin in plugins)
        {
            Console.WriteLine($"  [{plugin.Id}] {plugin.Name} v{plugin.Version}");
            Console.WriteLine($"    {plugin.Description}");
            Console.WriteLine($"    支持的动作: {string.Join(", ", plugin.GetSupportedActions())}");
        }
    }

    static async Task TestWindowControlPlugin(PluginService pluginService)
    {
        var plugin = pluginService.GetPlugin("window-control");
        if (plugin == null)
        {
            Console.WriteLine("[ERROR] 窗口控制插件未加载");
            Console.WriteLine("提示: 请确保插件已安装到 plugins/window-control/ 目录");
            return;
        }

        Console.WriteLine("测试窗口控制插件...");
        var result = await plugin.ExecuteAsync("list", JsonDocument.Parse("{}").RootElement);
        if (result.Success)
        {
            Console.WriteLine($"获取到窗口列表: {JsonSerializer.Serialize(result.Data)}");
        }
        else
        {
            Console.WriteLine($"执行失败: {result.Error}");
        }
    }

    static async Task TestBrowserDebugPlugin(PluginService pluginService)
    {
        var plugin = pluginService.GetPlugin("browser-debug");
        if (plugin == null)
        {
            Console.WriteLine("[ERROR] 浏览器调试插件未加载");
            return;
        }

        Console.WriteLine("测试浏览器调试插件...");
        var result = await plugin.ExecuteAsync("get-pages", JsonDocument.Parse("{}").RootElement);
        Console.WriteLine($"结果: {JsonSerializer.Serialize(result)}");
    }

    static async Task TestWindsurfPlugin(PluginService pluginService)
    {
        var plugin = pluginService.GetPlugin("windsurf");
        if (plugin == null)
        {
            Console.WriteLine("[ERROR] Windsurf 插件未加载");
            return;
        }

        Console.WriteLine("测试 Windsurf 插件...");
        var result = await plugin.ExecuteAsync("is-running", JsonDocument.Parse("{}").RootElement);
        Console.WriteLine($"结果: {JsonSerializer.Serialize(result)}");
    }

    static async Task ConnectServer(AgentConfig config, PluginService pluginService, DefaultPluginContext context)
    {
        Console.WriteLine($"正在连接 Server: {config.Server.Url}");
        
        using var connection = new ServerConnection(config, pluginService, context);
        
        try
        {
            await connection.ConnectAsync();
            Console.WriteLine();
            Console.WriteLine("✓ 已连接到 Server");
            Console.WriteLine($"  Device ID: {connection.DeviceId}");
            Console.WriteLine();
            Console.WriteLine("按 Enter 断开连接...");
            Console.ReadLine();
            
            await connection.DisconnectAsync();
            Console.WriteLine("已断开连接");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ERROR] 连接失败: {ex.Message}");
        }
    }

    static async Task AutoConnectMode(AgentConfig config, PluginService pluginService, DefaultPluginContext context)
    {
        Console.WriteLine();
        Console.WriteLine("[AUTO] 自动连接模式");

        // 启动 HTTP 服务器
        using var httpServer = new AgentHttpServer(pluginService, context, config.Agent.HttpPort);
        httpServer.Start();

        Console.WriteLine($"[AUTO] 正在连接 Server: {config.Server.Url}");

        using var connection = new ServerConnection(config, pluginService, context);
        var cts = new CancellationTokenSource();

        // 处理 Ctrl+C
        Console.CancelKeyPress += (s, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
            Console.WriteLine("\n[AUTO] 正在断开连接...");
        };

        try
        {
            await connection.ConnectAsync();
            
            // 启动热键服务
            using var hotkeyService = new HotkeyService(pluginService, context, config.Server.Url);
            hotkeyService.Start();
            
            Console.WriteLine();
            Console.WriteLine("✓ 已连接到 Server");
            Console.WriteLine($"  Device ID: {connection.DeviceId}");
            Console.WriteLine($"  Plugins: {pluginService.GetPluginIds().Count}");
            Console.WriteLine($"  HTTP API: http://localhost:{config.Agent.HttpPort}");
            Console.WriteLine($"  热键: Alt+1~9 切换窗口组合");
            Console.WriteLine();
            Console.WriteLine("[AUTO] 运行中... 按 Ctrl+C 退出");

            // 保持运行
            try
            {
                await Task.Delay(Timeout.Infinite, cts.Token);
            }
            catch (TaskCanceledException) { }

            hotkeyService.Stop();
            httpServer.Stop();
            await connection.DisconnectAsync();
            Console.WriteLine("[AUTO] 已断开连接");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ERROR] 连接失败: {ex.Message}");
            Console.WriteLine("[AUTO] 5秒后重试...");
            await Task.Delay(5000);
            await AutoConnectMode(config, pluginService, context);
        }
    }
}
