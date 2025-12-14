using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace WinTabTest;

/// <summary>
/// Chrome 网络请求详细监听 - 获取完整请求和响应
/// </summary>
class ChromeNetworkDetail
{
    static ClientWebSocket? _ws;
    static readonly ConcurrentDictionary<string, RequestDetail> _requests = new();
    static readonly ConcurrentDictionary<int, TaskCompletionSource<JsonElement>> _pending = new();
    static int _cmdId = 1;
    static bool _verbose = true; // 详细模式
    static string? _urlFilter = null; // URL 过滤

    class RequestDetail
    {
        public string? RequestId { get; set; }
        public string? Url { get; set; }
        public string? Method { get; set; }
        public string? Type { get; set; }
        public int Status { get; set; }
        public string? StatusText { get; set; }
        public Dictionary<string, string>? RequestHeaders { get; set; }
        public Dictionary<string, string>? ResponseHeaders { get; set; }
        public string? PostData { get; set; }
        public string? ResponseBody { get; set; }
        public long Size { get; set; }
        public DateTime StartTime { get; set; }
        public double Duration { get; set; }
        public bool HasPostData { get; set; }
    }

    public static async Task Run()
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.WriteLine("=== Chrome 网络请求详细监听 ===\n");

        var cts = new CancellationTokenSource();

        try
        {
            using var http = new HttpClient();
            http.Timeout = TimeSpan.FromSeconds(3);

            var json = await http.GetStringAsync("http://localhost:9222/json");
            var pages = JsonSerializer.Deserialize<JsonElement[]>(json);

            Console.WriteLine("📄 可用页面:");
            var availablePages = new List<(string WsUrl, string Title)>();

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

                availablePages.Add((wsUrl, title));
                Console.WriteLine($"[{availablePages.Count}] {title}");
            }

            if (availablePages.Count == 0)
            {
                Console.WriteLine("❌ 没有可用页面");
                return;
            }

            Console.Write("\n选择页面 (回车选第1个): ");
            var input = Console.ReadLine()?.Trim();
            int choice = string.IsNullOrEmpty(input) ? 1 : int.Parse(input);

            var selected = availablePages[Math.Clamp(choice - 1, 0, availablePages.Count - 1)];
            Console.WriteLine($"\n🔗 连接: {selected.Title}");

            // 连接
            _ws = new ClientWebSocket();
            await _ws.ConnectAsync(new Uri(selected.WsUrl), cts.Token);
            Console.WriteLine("✅ 已连接\n");

            // 启动接收任务
            _ = ReceiveLoop(cts.Token);

            // 启用 Network 域
            await SendCommand(_cmdId++, "Network.enable", new { maxTotalBufferSize = 10000000 });

            Console.Write("输入 URL 过滤关键词 (回车显示全部): ");
            _urlFilter = Console.ReadLine()?.Trim();
            if (string.IsNullOrEmpty(_urlFilter)) _urlFilter = null;

            Console.WriteLine();
            Console.WriteLine("📡 监听中...");
            if (_urlFilter != null)
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine($"🔍 过滤: {_urlFilter}");
                Console.ResetColor();
            }
            Console.WriteLine("─".PadRight(80, '─'));
            Console.WriteLine("按 [Q] 退出 | [F] 修改过滤 | [A] 显示全部");
            Console.WriteLine("─".PadRight(80, '─'));
            Console.WriteLine();

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
                    else if (key.Key == ConsoleKey.F)
                    {
                        Console.Write("\n输入新的 URL 过滤: ");
                        _urlFilter = Console.ReadLine()?.Trim();
                        if (string.IsNullOrEmpty(_urlFilter)) _urlFilter = null;
                        Console.WriteLine(_urlFilter != null ? $"🔍 过滤: {_urlFilter}\n" : "📋 显示全部请求\n");
                    }
                    else if (key.Key == ConsoleKey.A)
                    {
                        _urlFilter = null;
                        Console.WriteLine("\n📋 显示全部请求\n");
                    }
                }
                await Task.Delay(100);
            }

            await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ 错误: {ex.Message}");
        }
    }

    static async Task ReceiveLoop(CancellationToken ct)
    {
        var buffer = new byte[1024 * 1024]; // 1MB buffer

        try
        {
            while (!ct.IsCancellationRequested && _ws?.State == WebSocketState.Open)
            {
                var result = await _ws.ReceiveAsync(buffer, ct);
                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var msg = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    _ = ProcessMessage(msg);
                }
            }
        }
        catch { }
    }

    static async Task ProcessMessage(string msg)
    {
        try
        {
            var doc = JsonDocument.Parse(msg);
            var root = doc.RootElement;

            // 检查是否是命令响应
            if (root.TryGetProperty("id", out var idProp))
            {
                var id = idProp.GetInt32();
                if (_pending.TryRemove(id, out var tcs))
                {
                    tcs.SetResult(root);
                }
                return;
            }

            // 检查是否是事件
            if (!root.TryGetProperty("method", out var methodProp)) return;
            var method = methodProp.GetString();

            switch (method)
            {
                case "Network.requestWillBeSent":
                    await HandleRequestWillBeSent(root);
                    break;

                case "Network.responseReceived":
                    HandleResponseReceived(root);
                    break;

                case "Network.loadingFinished":
                    await HandleLoadingFinished(root);
                    break;
            }
        }
        catch { }
    }

    static async Task HandleRequestWillBeSent(JsonElement root)
    {
        var p = root.GetProperty("params");
        var requestId = p.GetProperty("requestId").GetString();
        var request = p.GetProperty("request");
        var url = request.GetProperty("url").GetString();
        var httpMethod = request.GetProperty("method").GetString();
        var type = p.TryGetProperty("type", out var t) ? t.GetString() : "Other";
        var hasPostData = request.TryGetProperty("hasPostData", out var hpd) && hpd.GetBoolean();

        if (requestId == null) return;

        // 解析请求头
        var headers = new Dictionary<string, string>();
        if (request.TryGetProperty("headers", out var headersEl))
        {
            foreach (var h in headersEl.EnumerateObject())
            {
                headers[h.Name] = h.Value.GetString() ?? "";
            }
        }

        var detail = new RequestDetail
        {
            RequestId = requestId,
            Url = url,
            Method = httpMethod,
            Type = type,
            RequestHeaders = headers,
            StartTime = DateTime.Now,
            HasPostData = hasPostData
        };

        // 获取 POST 数据
        if (hasPostData && (httpMethod == "POST" || httpMethod == "PUT" || httpMethod == "PATCH"))
        {
            try
            {
                var response = await SendCommandAsync(_cmdId++, "Network.getRequestPostData", new { requestId });
                if (response.TryGetProperty("result", out var result) && result.TryGetProperty("postData", out var pd))
                {
                    detail.PostData = pd.GetString();
                }
            }
            catch { }
        }

        _requests[requestId] = detail;
    }

    static void HandleResponseReceived(JsonElement root)
    {
        var p = root.GetProperty("params");
        var requestId = p.GetProperty("requestId").GetString();
        var response = p.GetProperty("response");
        var status = response.GetProperty("status").GetInt32();
        var statusText = response.TryGetProperty("statusText", out var st) ? st.GetString() : "";

        if (requestId == null || !_requests.TryGetValue(requestId, out var detail)) return;

        detail.Status = status;
        detail.StatusText = statusText;

        // 解析响应头
        var headers = new Dictionary<string, string>();
        if (response.TryGetProperty("headers", out var headersEl))
        {
            foreach (var h in headersEl.EnumerateObject())
            {
                headers[h.Name] = h.Value.GetString() ?? "";
            }
        }
        detail.ResponseHeaders = headers;
    }

    static async Task HandleLoadingFinished(JsonElement root)
    {
        var p = root.GetProperty("params");
        var requestId = p.GetProperty("requestId").GetString();
        var size = p.TryGetProperty("encodedDataLength", out var len) ? len.GetInt64() : 0;

        if (requestId == null || !_requests.TryGetValue(requestId, out var detail)) return;

        detail.Size = size;
        detail.Duration = (DateTime.Now - detail.StartTime).TotalMilliseconds;

        // 获取响应体 (只对 XHR/Fetch 类型)
        if (detail.Type == "XHR" || detail.Type == "Fetch")
        {
            try
            {
                var response = await SendCommandAsync(_cmdId++, "Network.getResponseBody", new { requestId });
                if (response.TryGetProperty("result", out var result) && result.TryGetProperty("body", out var body))
                {
                    detail.ResponseBody = body.GetString();
                }
            }
            catch { }
        }

        // 打印详细信息
        PrintRequestDetail(detail);
    }

    static void PrintRequestDetail(RequestDetail detail)
    {
        // URL 过滤
        if (_urlFilter != null && !(detail.Url?.Contains(_urlFilter, StringComparison.OrdinalIgnoreCase) ?? false))
            return;

        // 类型过滤
        if (detail.Type != "XHR" && detail.Type != "Fetch" && detail.Type != "Document") return;

        var time = DateTime.Now.ToString("HH:mm:ss");

        // 状态颜色
        var statusColor = detail.Status switch
        {
            >= 200 and < 300 => ConsoleColor.Green,
            >= 400 => ConsoleColor.Red,
            _ => ConsoleColor.Yellow
        };

        Console.WriteLine();
        Console.WriteLine("═".PadRight(80, '═'));

        // 请求行
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.Write($"[{time}] ");
        Console.ForegroundColor = ConsoleColor.White;
        Console.Write($"{detail.Method} ");
        Console.ForegroundColor = statusColor;
        Console.Write($"{detail.Status} ");
        Console.ResetColor();
        Console.WriteLine($"({detail.Duration:F0}ms, {FormatSize(detail.Size)})");

        // URL
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine($"URL: {detail.Url}");
        Console.ResetColor();

        // 请求体
        if (!string.IsNullOrEmpty(detail.PostData))
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("\n📤 Request Body:");
            Console.ResetColor();
            PrintJson(detail.PostData);
        }

        // 响应体
        if (!string.IsNullOrEmpty(detail.ResponseBody))
        {
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("\n📥 Response Body:");
            Console.ResetColor();
            PrintJson(detail.ResponseBody, 2000); // 限制长度
        }

        Console.WriteLine("═".PadRight(80, '═'));
    }

    static void PrintJson(string? json, int maxLength = 5000)
    {
        if (string.IsNullOrEmpty(json)) return;

        try
        {
            // 尝试格式化 JSON
            var doc = JsonDocument.Parse(json);
            var formatted = JsonSerializer.Serialize(doc, new JsonSerializerOptions { WriteIndented = true });

            if (formatted.Length > maxLength)
            {
                Console.WriteLine(formatted.Substring(0, maxLength));
                Console.ForegroundColor = ConsoleColor.DarkGray;
                Console.WriteLine($"... (截断, 共 {formatted.Length} 字符)");
                Console.ResetColor();
            }
            else
            {
                Console.WriteLine(formatted);
            }
        }
        catch
        {
            // 不是 JSON，直接输出
            if (json.Length > maxLength)
            {
                Console.WriteLine(json.Substring(0, maxLength) + "...");
            }
            else
            {
                Console.WriteLine(json);
            }
        }
    }

    static string FormatSize(long bytes)
    {
        if (bytes < 1024) return $"{bytes}B";
        if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1}KB";
        return $"{bytes / (1024.0 * 1024):F1}MB";
    }

    static async Task<JsonElement> SendCommandAsync(int id, string method, object? parameters = null)
    {
        var tcs = new TaskCompletionSource<JsonElement>();
        _pending[id] = tcs;

        await SendCommand(id, method, parameters);

        using var cts = new CancellationTokenSource(5000);
        cts.Token.Register(() => tcs.TrySetCanceled());

        return await tcs.Task;
    }

    static async Task SendCommand(int id, string method, object? parameters = null)
    {
        if (_ws == null) return;
        var cmd = new { id, method, @params = parameters ?? new { } };
        var json = JsonSerializer.Serialize(cmd);
        var bytes = Encoding.UTF8.GetBytes(json);
        await _ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
    }
}
