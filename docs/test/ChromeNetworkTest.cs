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
/// Chrome 网络请求监听
/// </summary>
class ChromeNetworkTest
{
    static readonly Dictionary<string, RequestInfo> _requests = new();
    static readonly object _lock = new();
    static int _cmdId = 1;

    class RequestInfo
    {
        public string? Url { get; set; }
        public string? Method { get; set; }
        public string? Type { get; set; }
        public int Status { get; set; }
        public long Size { get; set; }
        public DateTime StartTime { get; set; }
        public double Duration { get; set; }
    }

    public static async Task Run()
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.WriteLine("=== Chrome 网络请求监听 ===\n");

        var cts = new CancellationTokenSource();

        try
        {
            using var http = new HttpClient();
            http.Timeout = TimeSpan.FromSeconds(3);
            
            var json = await http.GetStringAsync("http://localhost:9222/json");
            var pages = JsonSerializer.Deserialize<JsonElement[]>(json);

            // 找到可用页面
            Console.WriteLine("📄 可用页面:");
            var availablePages = new List<(string WsUrl, string Title, string Url)>();
            
            foreach (var page in pages!)
            {
                var type = page.GetProperty("type").GetString();
                if (type != "page") continue;

                var url = page.GetProperty("url").GetString();
                if (url?.StartsWith("devtools://") == true) continue;
                if (url?.StartsWith("chrome://") == true) continue;

                var wsUrl = page.GetProperty("webSocketDebuggerUrl").GetString();
                var title = page.GetProperty("title").GetString() ?? "Unknown";

                if (wsUrl == null) continue;

                availablePages.Add((wsUrl, title, url ?? ""));
                Console.WriteLine($"[{availablePages.Count}] {Truncate(title, 40)}");
                Console.WriteLine($"    {Truncate(url ?? "", 60)}\n");
            }

            if (availablePages.Count == 0)
            {
                Console.WriteLine("❌ 没有可用页面");
                return;
            }

            Console.Write("选择页面 (直接回车选第1个): ");
            var input = Console.ReadLine()?.Trim();
            int choice = string.IsNullOrEmpty(input) ? 1 : int.Parse(input);

            if (choice < 1 || choice > availablePages.Count)
            {
                Console.WriteLine("无效选择");
                return;
            }

            var selected = availablePages[choice - 1];
            Console.WriteLine($"\n🔗 连接: {selected.Title}");

            // 连接 WebSocket
            using var ws = new ClientWebSocket();
            await ws.ConnectAsync(new Uri(selected.WsUrl), cts.Token);
            Console.WriteLine("✅ 已连接\n");

            // 启用 Network 域
            await SendCommand(ws, _cmdId++, "Network.enable", new { maxTotalBufferSize = 10000000 });
            
            Console.WriteLine("📡 开始监听网络请求...");
            Console.WriteLine("─".PadRight(100, '─'));
            Console.WriteLine($"{"时间",-10} {"方法",-6} {"状态",-6} {"类型",-10} {"大小",-10} {"耗时",-10} URL");
            Console.WriteLine("─".PadRight(100, '─'));

            // 启动接收任务
            var receiveTask = ReceiveNetworkEvents(ws, cts.Token);

            // 等待用户退出
            Console.WriteLine("按 [Q] 退出 | [R] 刷新页面 | [C] 清空记录\n");
            
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
                    else if (key.Key == ConsoleKey.R)
                    {
                        // 刷新页面
                        await SendCommand(ws, _cmdId++, "Page.reload");
                        Console.WriteLine("\n🔄 页面已刷新\n");
                    }
                    else if (key.Key == ConsoleKey.C)
                    {
                        lock (_lock) { _requests.Clear(); }
                        Console.Clear();
                        Console.WriteLine("🗑️ 已清空记录\n");
                    }
                }
                await Task.Delay(100);
            }

            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
            Console.WriteLine("\n✅ 已退出监听");
        }
        catch (HttpRequestException)
        {
            Console.WriteLine("❌ 无法连接 Chrome 调试端口");
            Console.WriteLine("请先启动调试模式 Chrome: chrome.exe --remote-debugging-port=9222");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ 错误: {ex.Message}");
        }
    }

    static async Task ReceiveNetworkEvents(ClientWebSocket ws, CancellationToken ct)
    {
        var buffer = new byte[65536];

        try
        {
            while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                var result = await ws.ReceiveAsync(buffer, ct);
                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var msg = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    ProcessNetworkEvent(msg);
                }
            }
        }
        catch (OperationCanceledException) { }
        catch { }
    }

    static void ProcessNetworkEvent(string msg)
    {
        try
        {
            var doc = JsonDocument.Parse(msg);
            var root = doc.RootElement;

            if (!root.TryGetProperty("method", out var methodProp)) return;
            var method = methodProp.GetString();

            switch (method)
            {
                case "Network.requestWillBeSent":
                    HandleRequestWillBeSent(root);
                    break;

                case "Network.responseReceived":
                    HandleResponseReceived(root);
                    break;

                case "Network.loadingFinished":
                    HandleLoadingFinished(root);
                    break;

                case "Network.loadingFailed":
                    HandleLoadingFailed(root);
                    break;
            }
        }
        catch { }
    }

    static void HandleRequestWillBeSent(JsonElement root)
    {
        var p = root.GetProperty("params");
        var requestId = p.GetProperty("requestId").GetString();
        var request = p.GetProperty("request");
        var url = request.GetProperty("url").GetString();
        var httpMethod = request.GetProperty("method").GetString();
        var type = p.TryGetProperty("type", out var t) ? t.GetString() : "Other";

        if (requestId == null) return;

        lock (_lock)
        {
            _requests[requestId] = new RequestInfo
            {
                Url = url,
                Method = httpMethod,
                Type = type,
                StartTime = DateTime.Now
            };
        }
    }

    static void HandleResponseReceived(JsonElement root)
    {
        var p = root.GetProperty("params");
        var requestId = p.GetProperty("requestId").GetString();
        var response = p.GetProperty("response");
        var status = response.GetProperty("status").GetInt32();
        var type = p.TryGetProperty("type", out var t) ? t.GetString() : null;

        if (requestId == null) return;

        lock (_lock)
        {
            if (_requests.TryGetValue(requestId, out var info))
            {
                info.Status = status;
                if (type != null) info.Type = type;
            }
        }
    }

    static void HandleLoadingFinished(JsonElement root)
    {
        var p = root.GetProperty("params");
        var requestId = p.GetProperty("requestId").GetString();
        var encodedLength = p.TryGetProperty("encodedDataLength", out var len) ? len.GetInt64() : 0;

        if (requestId == null) return;

        RequestInfo? info;
        lock (_lock)
        {
            if (!_requests.TryGetValue(requestId, out info)) return;
            info.Size = encodedLength;
            info.Duration = (DateTime.Now - info.StartTime).TotalMilliseconds;
        }

        PrintRequest(info);
    }

    static void HandleLoadingFailed(JsonElement root)
    {
        var p = root.GetProperty("params");
        var requestId = p.GetProperty("requestId").GetString();
        var errorText = p.TryGetProperty("errorText", out var err) ? err.GetString() : "Failed";

        if (requestId == null) return;

        RequestInfo? info;
        lock (_lock)
        {
            if (!_requests.TryGetValue(requestId, out info)) return;
            info.Status = -1;
            info.Duration = (DateTime.Now - info.StartTime).TotalMilliseconds;
        }

        // 打印失败请求
        var time = DateTime.Now.ToString("HH:mm:ss");
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine($"{time,-10} {info.Method,-6} {"FAIL",-6} {info.Type,-10} {"-",-10} {info.Duration:F0}ms".PadRight(60) + $" {Truncate(info.Url ?? "", 80)}");
        Console.ResetColor();
    }

    static void PrintRequest(RequestInfo info)
    {
        var time = DateTime.Now.ToString("HH:mm:ss");
        var sizeStr = FormatSize(info.Size);
        var durationStr = $"{info.Duration:F0}ms";

        // 根据状态码设置颜色
        var color = info.Status switch
        {
            >= 200 and < 300 => ConsoleColor.Green,
            >= 300 and < 400 => ConsoleColor.Cyan,
            >= 400 and < 500 => ConsoleColor.Yellow,
            >= 500 => ConsoleColor.Red,
            _ => ConsoleColor.White
        };

        // 只显示 XHR/Fetch 请求，或者全部显示（可配置）
        var showTypes = new HashSet<string> { "XHR", "Fetch", "Document", "Script", "Stylesheet" };
        if (!showTypes.Contains(info.Type ?? "")) return;

        Console.ForegroundColor = color;
        Console.Write($"{time,-10} ");
        Console.ResetColor();

        Console.Write($"{info.Method,-6} ");

        Console.ForegroundColor = color;
        Console.Write($"{info.Status,-6} ");
        Console.ResetColor();

        Console.Write($"{info.Type,-10} {sizeStr,-10} {durationStr,-10} ");
        Console.WriteLine(Truncate(info.Url ?? "", 80));
    }

    static string FormatSize(long bytes)
    {
        if (bytes < 1024) return $"{bytes} B";
        if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1} KB";
        return $"{bytes / (1024.0 * 1024):F1} MB";
    }

    static string Truncate(string s, int max) => s.Length <= max ? s : s.Substring(0, max - 3) + "...";

    static async Task SendCommand(ClientWebSocket ws, int id, string method, object? parameters = null)
    {
        var cmd = new { id, method, @params = parameters ?? new { } };
        var json = JsonSerializer.Serialize(cmd);
        var bytes = Encoding.UTF8.GetBytes(json);
        await ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
    }
}
