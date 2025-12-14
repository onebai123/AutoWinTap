using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace WinTabTest;

/// <summary>
/// Chrome 日志获取测试 - 自动连接所有页面
/// </summary>
class ChromeLogTest
{
    static List<(ClientWebSocket Ws, string Title, string Id)> _connections = new();
    static HashSet<string> _connectedIds = new();
    static int _cmdId = 1;
    static readonly object _lock = new();

    public static async Task Run()
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.WriteLine("=== Chrome 日志自动监听 ===\n");

        var cts = new CancellationTokenSource();

        try
        {
            Console.WriteLine("🔍 正在自动连接所有 Chrome 页面...\n");

            // 1. 首次连接所有页面
            await ConnectNewPages(cts.Token);

            if (_connections.Count == 0)
            {
                Console.WriteLine("❌ 没有可连接的页面");
                Console.WriteLine("请确保 Chrome 调试模式已启动且有打开的网页");
                return;
            }

            Console.WriteLine($"\n📡 共连接 {_connections.Count} 个页面");
            Console.WriteLine("─".PadRight(70, '─'));
            Console.WriteLine("🔄 自动监听新页面 | 按 [Q] 退出");
            Console.WriteLine("─".PadRight(70, '─'));
            Console.WriteLine();

            // 2. 启动自动刷新任务 (每3秒检查新页面)
            _ = AutoRefreshPages(cts.Token);

            // 3. 等待用户退出
            while (!cts.Token.IsCancellationRequested)
            {
                if (Console.KeyAvailable)
                {
                    var key = Console.ReadKey(true);
                    if (key.Key == ConsoleKey.Q)
                    {
                        cts.Cancel();
                        break;
                    }
                }
                await Task.Delay(100);
            }

            // 关闭所有连接
            lock (_lock)
            {
                foreach (var (ws, _, _) in _connections)
                {
                    try
                    {
                        if (ws.State == WebSocketState.Open)
                            ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None).Wait(1000);
                        ws.Dispose();
                    }
                    catch { }
                }
            }

            Console.WriteLine("\n✅ 已退出监听");
        }
        catch (HttpRequestException)
        {
            Console.WriteLine("❌ 无法连接 Chrome 调试端口");
            Console.WriteLine("\n请先启动调试模式 Chrome:");
            Console.WriteLine("  chrome.exe --remote-debugging-port=9222");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ 错误: {ex.Message}");
        }
    }

    /// <summary>
    /// 自动刷新，发现并连接新页面
    /// </summary>
    static async Task AutoRefreshPages(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            await Task.Delay(3000, ct);
            try
            {
                await ConnectNewPages(ct);
            }
            catch { }
        }
    }

    /// <summary>
    /// 连接新发现的页面
    /// </summary>
    static async Task ConnectNewPages(CancellationToken ct)
    {
        using var http = new HttpClient();
        http.Timeout = TimeSpan.FromSeconds(3);
        
        var json = await http.GetStringAsync("http://localhost:9222/json", ct);
        var pages = JsonSerializer.Deserialize<JsonElement[]>(json);

        foreach (var page in pages!)
        {
            var type = page.GetProperty("type").GetString();
            if (type != "page") continue;

            var url = page.GetProperty("url").GetString();
            if (url?.StartsWith("devtools://") == true) continue;
            if (url?.StartsWith("chrome://") == true) continue;
            if (url?.StartsWith("chrome-extension://") == true) continue;

            var id = page.GetProperty("id").GetString();
            if (id == null) continue;

            // 检查是否已连接
            lock (_lock)
            {
                if (_connectedIds.Contains(id)) continue;
            }

            var wsUrl = page.GetProperty("webSocketDebuggerUrl").GetString();
            var title = page.GetProperty("title").GetString() ?? "Unknown";

            if (wsUrl == null) continue;

            try
            {
                var ws = new ClientWebSocket();
                await ws.ConnectAsync(new Uri(wsUrl), ct);

                // 启用日志监听
                await SendCommand(ws, Interlocked.Increment(ref _cmdId), "Runtime.enable");
                await SendCommand(ws, Interlocked.Increment(ref _cmdId), "Console.enable");
                await SendCommand(ws, Interlocked.Increment(ref _cmdId), "Log.enable");

                lock (_lock)
                {
                    _connections.Add((ws, title, id));
                    _connectedIds.Add(id);
                }

                Console.WriteLine($"✅ 已连接: {Truncate(title, 50)}");

                // 启动接收任务
                _ = ReceiveMessagesWithTitle(ws, title, ct);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ 连接失败 [{Truncate(title, 30)}]: {ex.Message}");
            }
        }
    }

    static string Truncate(string s, int max) => s.Length <= max ? s : s.Substring(0, max - 3) + "...";

    static async Task SendCommand(ClientWebSocket ws, int id, string method, object? parameters = null)
    {
        var cmd = new { id, method, @params = parameters ?? new { } };
        var json = JsonSerializer.Serialize(cmd);
        var bytes = Encoding.UTF8.GetBytes(json);
        await ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
    }

    static async Task ReceiveMessagesWithTitle(ClientWebSocket ws, string pageTitle, CancellationToken ct)
    {
        var buffer = new byte[65536];
        var shortTitle = Truncate(pageTitle, 20);
        
        try
        {
            while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                var result = await ws.ReceiveAsync(buffer, ct);
                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var msg = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    ProcessMessage(msg, shortTitle);
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        catch (Exception ex)
        {
            Console.WriteLine($"[{shortTitle}] 连接断开: {ex.Message}");
        }
    }

    static void ProcessMessage(string msg, string pageTitle)
    {
        try
        {
            var doc = JsonDocument.Parse(msg);
            var root = doc.RootElement;

            // 检查是否是事件
            if (!root.TryGetProperty("method", out var methodProp)) return;
            var method = methodProp.GetString();

            string? level = null;
            string? text = null;
            string? source = null;

            switch (method)
            {
                case "Runtime.consoleAPICalled":
                    var type = root.GetProperty("params").GetProperty("type").GetString();
                    var args = root.GetProperty("params").GetProperty("args");
                    
                    var sb = new StringBuilder();
                    foreach (var arg in args.EnumerateArray())
                    {
                        if (arg.TryGetProperty("value", out var val))
                            sb.Append(val.ToString()).Append(" ");
                        else if (arg.TryGetProperty("description", out var desc))
                            sb.Append(desc.GetString()).Append(" ");
                    }
                    
                    level = type?.ToUpper();
                    text = sb.ToString().Trim();
                    break;

                case "Console.messageAdded":
                    var message = root.GetProperty("params").GetProperty("message");
                    level = message.GetProperty("level").GetString()?.ToUpper();
                    text = message.GetProperty("text").GetString();
                    source = message.TryGetProperty("source", out var s) ? s.GetString() : null;
                    break;

                case "Log.entryAdded":
                    var entry = root.GetProperty("params").GetProperty("entry");
                    level = entry.GetProperty("level").GetString()?.ToUpper();
                    text = entry.GetProperty("text").GetString();
                    source = entry.TryGetProperty("source", out var src) ? src.GetString() : null;
                    break;

                default:
                    return;
            }

            if (text != null)
            {
                var color = level switch
                {
                    "ERROR" => ConsoleColor.Red,
                    "WARNING" or "WARN" => ConsoleColor.Yellow,
                    "INFO" => ConsoleColor.Cyan,
                    _ => ConsoleColor.White
                };

                var time = DateTime.Now.ToString("HH:mm:ss");
                var oldColor = Console.ForegroundColor;
                
                // 时间
                Console.ForegroundColor = ConsoleColor.DarkGray;
                Console.Write($"[{time}]");
                
                // 页面
                Console.ForegroundColor = ConsoleColor.DarkCyan;
                Console.Write($"[{pageTitle}]");
                
                // 级别
                Console.ForegroundColor = color;
                Console.Write($"[{level}]");
                
                // 内容
                Console.ForegroundColor = oldColor;
                Console.WriteLine($" {text}");
            }
        }
        catch { }
    }
}
