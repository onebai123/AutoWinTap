using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

namespace WinTabTest;

/// <summary>
/// RPA 能力验证测试
/// 1. 模拟点击
/// 2. 模拟键盘输入
/// 3. 屏幕截图
/// 4. 获取Chrome调试信息
/// 5. 进程监控
/// </summary>
class RpaTest
{
    #region Win32 API - 鼠标键盘模拟

    [DllImport("user32.dll")]
    static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);

    [DllImport("user32.dll")]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    static extern short GetAsyncKeyState(int vKey);

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    struct POINT { public int X; public int Y; }

    const int VK_LBUTTON = 0x01;  // 鼠标左键
    const int VK_ESCAPE = 0x1B;   // ESC键

    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;
    const int SW_RESTORE = 9;

    [StructLayout(LayoutKind.Sequential)]
    struct RECT
    {
        public int Left, Top, Right, Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT
    {
        public uint type;
        public InputUnion u;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT
    {
        public int dx, dy;
        public uint mouseData, dwFlags, time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT
    {
        public ushort wVk, wScan;
        public uint dwFlags, time;
        public IntPtr dwExtraInfo;
    }

    const uint INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_UNICODE = 0x0004;

    #endregion

    public static void Run()
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.WriteLine("=== RPA 能力验证测试 ===\n");

        while (true)
        {
            Console.WriteLine("选择测试项:");
            Console.WriteLine("1. 模拟鼠标点击 (点击屏幕指定位置)");
            Console.WriteLine("2. 模拟键盘输入 (在当前窗口输入文字)");
            Console.WriteLine("3. 截取窗口截图");
            Console.WriteLine("4. 启动Chrome调试模式 (获取页面日志)");
            Console.WriteLine("5. 进程监控测试");
            Console.WriteLine("6. 综合测试: 打开记事本并输入文字");
            Console.WriteLine("7. OCR文字识别 (截图并识别文字)");
            Console.WriteLine("8. Windsurf自动化: 点击右下角并输入");
            Console.WriteLine("9. 录制模式: 记录鼠标位置");
            Console.WriteLine("10. Windsurf完整流程: 输入→回车→等待→复制结果");
            Console.WriteLine("q. 退出");
            Console.Write("\n> ");

            var input = Console.ReadLine()?.Trim();
            if (input == "q") break;

            try
            {
                switch (input)
                {
                    case "1": TestMouseClick(); break;
                    case "2": TestKeyboardInput(); break;
                    case "3": TestScreenshot(); break;
                    case "4": TestChromeDebug(); break;
                    case "5": TestProcessMonitor(); break;
                    case "6": TestNotepadAutomation(); break;
                    case "7": TestOcr().Wait(); break;
                    case "8": TestWindsurfAutomation(); break;
                    case "9": TestRecordPosition(); break;
                    case "10": TestWindsurfFullFlow(); break;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ 错误: {ex.Message}");
            }

            Console.WriteLine();
        }
    }

    /// <summary>
    /// 测试1: 模拟鼠标点击
    /// </summary>
    static void TestMouseClick()
    {
        Console.WriteLine("\n【测试1】模拟鼠标点击");
        Console.Write("输入坐标 (格式: x,y 如 500,300): ");
        var pos = Console.ReadLine()?.Split(',');

        if (pos?.Length == 2 && int.TryParse(pos[0], out int x) && int.TryParse(pos[1], out int y))
        {
            Console.WriteLine($"3秒后点击位置 ({x}, {y})...");
            Thread.Sleep(3000);

            // 移动鼠标
            SetCursorPos(x, y);
            Thread.Sleep(100);

            // 点击
            mouse_event(MOUSEEVENTF_LEFTDOWN, x, y, 0, 0);
            mouse_event(MOUSEEVENTF_LEFTUP, x, y, 0, 0);

            Console.WriteLine($"✅ 已点击位置 ({x}, {y})");
        }
        else
        {
            Console.WriteLine("无效坐标");
        }
    }

    /// <summary>
    /// 测试2: 模拟键盘输入
    /// </summary>
    static void TestKeyboardInput()
    {
        Console.WriteLine("\n【测试2】模拟键盘输入");
        Console.Write("输入要发送的文字: ");
        var text = Console.ReadLine();

        if (string.IsNullOrEmpty(text)) return;

        Console.WriteLine("3秒后在当前活动窗口输入文字...");
        Console.WriteLine("请点击目标窗口!");
        Thread.Sleep(3000);

        var sw = Stopwatch.StartNew();

        // 使用 SendInput 发送 Unicode 字符
        foreach (char c in text)
        {
            var inputs = new INPUT[2];

            // Key down
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].u.ki.wVk = 0;
            inputs[0].u.ki.wScan = c;
            inputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE;

            // Key up
            inputs[1].type = INPUT_KEYBOARD;
            inputs[1].u.ki.wVk = 0;
            inputs[1].u.ki.wScan = c;
            inputs[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

            SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
            Thread.Sleep(10); // 字符间延迟
        }

        sw.Stop();
        Console.WriteLine($"✅ 已输入 {text.Length} 个字符");
        Console.WriteLine($"⏱️ 耗时: {sw.ElapsedMilliseconds}ms");
    }

    /// <summary>
    /// 测试3: 窗口截图
    /// </summary>
    static void TestScreenshot()
    {
        Console.WriteLine("\n【测试3】窗口截图");

        // 列出窗口
        var windows = new System.Collections.Generic.List<(IntPtr Handle, string Title)>();
        EnumWindows((hWnd, lParam) =>
        {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            var title = sb.ToString();
            if (!string.IsNullOrWhiteSpace(title))
                windows.Add((hWnd, title));
            return true;
        }, IntPtr.Zero);

        for (int i = 0; i < Math.Min(10, windows.Count); i++)
        {
            Console.WriteLine($"[{i + 1}] {windows[i].Title.Substring(0, Math.Min(50, windows[i].Title.Length))}");
        }

        Console.Write("选择窗口序号: ");
        if (int.TryParse(Console.ReadLine(), out int idx) && idx > 0 && idx <= windows.Count)
        {
            var hwnd = windows[idx - 1].Handle;

            // 获取窗口位置
            GetWindowRect(hwnd, out RECT rect);
            int width = rect.Right - rect.Left;
            int height = rect.Bottom - rect.Top;

            if (width > 0 && height > 0)
            {
                // 截图
                using var bmp = new Bitmap(width, height);
                using var g = Graphics.FromImage(bmp);
                g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height));

                var path = Path.Combine(AppContext.BaseDirectory, $"screenshot_{DateTime.Now:HHmmss}.png");
                bmp.Save(path, ImageFormat.Png);

                Console.WriteLine($"✅ 截图已保存: {path}");
                Console.WriteLine($"📐 尺寸: {width}x{height}");
            }
        }
    }

    /// <summary>
    /// 测试4: Chrome 调试模式 - 获取页面和日志
    /// </summary>
    static void TestChromeDebug()
    {
        Console.WriteLine("\n【测试4】Chrome 调试模式");
        Console.WriteLine("1. 启动调试模式 Chrome");
        Console.WriteLine("2. 获取页面列表");
        Console.WriteLine("3. 连接页面获取 Console 日志");
        Console.Write("> ");

        var choice = Console.ReadLine()?.Trim();

        switch (choice)
        {
            case "1":
                LaunchChromeDebug();
                break;
            case "2":
                GetChromePages().Wait();
                break;
            case "3":
                ConnectChromeConsole().Wait();
                break;
        }
    }

    static void LaunchChromeDebug()
    {
        try
        {
            // 检查是否已有调试端口
            using var client = new System.Net.Http.HttpClient();
            client.Timeout = TimeSpan.FromSeconds(2);
            try
            {
                var test = client.GetStringAsync("http://localhost:9222/json/version").Result;
                Console.WriteLine("✅ Chrome 调试模式已在运行");
                Console.WriteLine(test);
                return;
            }
            catch { }

            // 启动新的 Chrome
            var psi = new ProcessStartInfo
            {
                FileName = @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                Arguments = "--remote-debugging-port=9222 --user-data-dir=C:\\ChromeDebug",
                UseShellExecute = true
            };
            Process.Start(psi);
            Console.WriteLine("✅ Chrome 调试模式已启动");
            Console.WriteLine("📍 端口: 9222");
            Thread.Sleep(2000);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ 启动失败: {ex.Message}");
        }
    }

    static async Task GetChromePages()
    {
        try
        {
            using var client = new System.Net.Http.HttpClient();
            var json = await client.GetStringAsync("http://localhost:9222/json");

            Console.WriteLine("\n📄 Chrome 页面列表:");
            Console.WriteLine("─".PadRight(60, '─'));

            // 简单解析 JSON
            var pages = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement[]>(json);
            int idx = 1;
            foreach (var page in pages!)
            {
                var type = page.GetProperty("type").GetString();
                if (type != "page") continue;

                var title = page.GetProperty("title").GetString();
                var url = page.GetProperty("url").GetString();
                var wsUrl = page.GetProperty("webSocketDebuggerUrl").GetString();

                Console.WriteLine($"[{idx++}] {title}");
                Console.WriteLine($"    URL: {url}");
                Console.WriteLine($"    WS:  {wsUrl}");
                Console.WriteLine();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ 获取失败: {ex.Message}");
            Console.WriteLine("请先用选项1启动调试模式 Chrome");
        }
    }

    static async Task ConnectChromeConsole()
    {
        try
        {
            using var httpClient = new System.Net.Http.HttpClient();
            var json = await httpClient.GetStringAsync("http://localhost:9222/json");
            var pages = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement[]>(json);

            // 找到第一个页面
            string? wsUrl = null;
            string? pageTitle = null;
            foreach (var page in pages!)
            {
                if (page.GetProperty("type").GetString() == "page")
                {
                    wsUrl = page.GetProperty("webSocketDebuggerUrl").GetString();
                    pageTitle = page.GetProperty("title").GetString();
                    break;
                }
            }

            if (wsUrl == null)
            {
                Console.WriteLine("❌ 没有找到可用页面");
                return;
            }

            Console.WriteLine($"📄 连接页面: {pageTitle}");
            Console.WriteLine($"🔗 WebSocket: {wsUrl}");
            Console.WriteLine("正在监听 Console 日志 (10秒)...");
            Console.WriteLine("─".PadRight(60, '─'));

            using var ws = new System.Net.WebSockets.ClientWebSocket();
            await ws.ConnectAsync(new Uri(wsUrl), CancellationToken.None);

            // 启用 Console 和 Log 域
            await SendCdpCommand(ws, 1, "Console.enable", null);
            await SendCdpCommand(ws, 2, "Log.enable", null);
            await SendCdpCommand(ws, 3, "Runtime.enable", null);

            Console.WriteLine("✅ 已连接，等待日志...");
            Console.WriteLine("(在 Chrome 页面执行 console.log('test') 测试)\n");

            // 接收消息
            var buffer = new byte[8192];
            var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));

            try
            {
                while (!cts.Token.IsCancellationRequested)
                {
                    var result = await ws.ReceiveAsync(buffer, cts.Token);
                    if (result.MessageType == System.Net.WebSockets.WebSocketMessageType.Text)
                    {
                        var msg = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        
                        // 解析并显示日志
                        try
                        {
                            var msgJson = System.Text.Json.JsonDocument.Parse(msg);
                            var method = msgJson.RootElement.TryGetProperty("method", out var m) ? m.GetString() : null;

                            if (method == "Console.messageAdded")
                            {
                                var message = msgJson.RootElement.GetProperty("params").GetProperty("message");
                                var level = message.GetProperty("level").GetString();
                                var text = message.GetProperty("text").GetString();
                                Console.WriteLine($"[{level?.ToUpper()}] {text}");
                            }
                            else if (method == "Runtime.consoleAPICalled")
                            {
                                var type = msgJson.RootElement.GetProperty("params").GetProperty("type").GetString();
                                var args = msgJson.RootElement.GetProperty("params").GetProperty("args");
                                var text = args[0].TryGetProperty("value", out var v) ? v.ToString() : args.ToString();
                                Console.WriteLine($"[{type?.ToUpper()}] {text}");
                            }
                            else if (method == "Log.entryAdded")
                            {
                                var entry = msgJson.RootElement.GetProperty("params").GetProperty("entry");
                                var level = entry.GetProperty("level").GetString();
                                var text = entry.GetProperty("text").GetString();
                                Console.WriteLine($"[{level?.ToUpper()}] {text}");
                            }
                        }
                        catch { }
                    }
                }
            }
            catch (OperationCanceledException)
            {
                Console.WriteLine("\n⏱️ 监听结束");
            }

            await ws.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ 连接失败: {ex.Message}");
        }
    }

    static async Task SendCdpCommand(System.Net.WebSockets.ClientWebSocket ws, int id, string method, object? parameters)
    {
        var cmd = new { id, method, @params = parameters ?? new { } };
        var json = System.Text.Json.JsonSerializer.Serialize(cmd);
        var bytes = Encoding.UTF8.GetBytes(json);
        await ws.SendAsync(bytes, System.Net.WebSockets.WebSocketMessageType.Text, true, CancellationToken.None);
    }

    /// <summary>
    /// 测试5: 进程监控
    /// </summary>
    static void TestProcessMonitor()
    {
        Console.WriteLine("\n【测试5】进程监控");
        Console.Write("输入要监控的进程名 (如 notepad, chrome): ");
        var procName = Console.ReadLine()?.Trim();

        if (string.IsNullOrEmpty(procName)) return;

        Console.WriteLine($"监控进程: {procName} (10秒内，按任意键停止)");
        Console.WriteLine("---");

        var startTime = DateTime.Now;
        while ((DateTime.Now - startTime).TotalSeconds < 10)
        {
            var procs = Process.GetProcessesByName(procName);

            Console.Write($"\r[{DateTime.Now:HH:mm:ss}] 运行中: {procs.Length} 个实例");

            if (procs.Length > 0)
            {
                var proc = procs[0];
                try
                {
                    Console.Write($" | CPU时间: {proc.TotalProcessorTime.TotalSeconds:F1}s");
                    Console.Write($" | 内存: {proc.WorkingSet64 / 1024 / 1024}MB");
                    Console.Write($" | 响应: {(proc.Responding ? "正常" : "⚠️无响应")}");
                }
                catch { }
            }
            Console.Write("          "); // 清除残留字符

            if (Console.KeyAvailable)
            {
                Console.ReadKey(true);
                break;
            }

            Thread.Sleep(1000);
        }

        Console.WriteLine("\n✅ 监控结束");
    }

    /// <summary>
    /// 测试6: 综合自动化测试 - 打开记事本并输入
    /// </summary>
    static void TestNotepadAutomation()
    {
        Console.WriteLine("\n【测试6】综合自动化: 打开记事本并输入文字");

        // 1. 启动记事本
        Console.WriteLine("1. 启动记事本...");
        var proc = Process.Start("notepad.exe");
        Thread.Sleep(1000);

        // 2. 获取窗口句柄
        IntPtr hwnd = IntPtr.Zero;
        EnumWindows((h, _) =>
        {
            GetWindowThreadProcessId(h, out uint pid);
            if (pid == proc.Id)
            {
                hwnd = h;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        if (hwnd == IntPtr.Zero)
        {
            Console.WriteLine("❌ 未找到记事本窗口");
            return;
        }

        // 3. 激活窗口
        Console.WriteLine("2. 激活窗口...");
        ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd);
        Thread.Sleep(500);

        // 4. 输入文字
        Console.WriteLine("3. 输入文字...");
        var text = $"Hello WinTab! 自动化测试成功！\n时间: {DateTime.Now:yyyy-MM-dd HH:mm:ss}\n这是自动输入的文字。";

        foreach (char c in text)
        {
            var inputs = new INPUT[2];
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].u.ki.wScan = c;
            inputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE;

            inputs[1].type = INPUT_KEYBOARD;
            inputs[1].u.ki.wScan = c;
            inputs[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

            SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
            Thread.Sleep(20);
        }

        Console.WriteLine("✅ 自动化测试完成!");
        Console.WriteLine("📝 请查看记事本窗口中的内容");
    }

    /// <summary>
    /// 测试7: OCR 文字识别
    /// </summary>
    static async Task TestOcr()
    {
        Console.WriteLine("\n【测试7】OCR 文字识别");
        Console.WriteLine("选择识别方式:");
        Console.WriteLine("1. 识别指定窗口");
        Console.WriteLine("2. 识别屏幕区域 (输入坐标)");
        Console.WriteLine("3. 识别已有截图文件");
        Console.Write("> ");

        var choice = Console.ReadLine()?.Trim();
        Bitmap? bmp = null;

        try
        {
            switch (choice)
            {
                case "1":
                    bmp = CaptureWindowForOcr();
                    break;
                case "2":
                    bmp = CaptureRegionForOcr();
                    break;
                case "3":
                    bmp = LoadImageForOcr();
                    break;
                default:
                    Console.WriteLine("无效选择");
                    return;
            }

            if (bmp == null) return;

            Console.WriteLine($"📐 图片尺寸: {bmp.Width}x{bmp.Height}");
            Console.WriteLine("正在识别文字...");

            var sw = Stopwatch.StartNew();

            // 转换为 Windows Runtime SoftwareBitmap
            var text = await RecognizeTextFromBitmap(bmp);

            sw.Stop();

            Console.WriteLine($"\n⏱️ 识别耗时: {sw.ElapsedMilliseconds}ms");
            Console.WriteLine("─".PadRight(50, '─'));
            Console.WriteLine("📄 识别结果:");
            Console.WriteLine("─".PadRight(50, '─'));
            Console.WriteLine(text);
            Console.WriteLine("─".PadRight(50, '─'));

            // 保存结果到文件
            var resultPath = Path.Combine(AppContext.BaseDirectory, $"ocr_result_{DateTime.Now:HHmmss}.txt");
            File.WriteAllText(resultPath, text, Encoding.UTF8);
            Console.WriteLine($"💾 结果已保存: {resultPath}");
        }
        finally
        {
            bmp?.Dispose();
        }
    }

    static Bitmap? CaptureWindowForOcr()
    {
        var windows = new System.Collections.Generic.List<(IntPtr Handle, string Title)>();
        EnumWindows((hWnd, lParam) =>
        {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            var title = sb.ToString();
            if (!string.IsNullOrWhiteSpace(title))
                windows.Add((hWnd, title));
            return true;
        }, IntPtr.Zero);

        Console.WriteLine("\n选择窗口:");
        for (int i = 0; i < Math.Min(15, windows.Count); i++)
        {
            var title = windows[i].Title;
            if (title.Length > 50) title = title.Substring(0, 47) + "...";
            Console.WriteLine($"[{i + 1,2}] {title}");
        }

        Console.Write("> ");
        if (int.TryParse(Console.ReadLine(), out int idx) && idx > 0 && idx <= windows.Count)
        {
            var hwnd = windows[idx - 1].Handle;
            GetWindowRect(hwnd, out RECT rect);
            int width = rect.Right - rect.Left;
            int height = rect.Bottom - rect.Top;

            if (width > 0 && height > 0)
            {
                var bmp = new Bitmap(width, height);
                using var g = Graphics.FromImage(bmp);
                g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height));
                return bmp;
            }
        }
        return null;
    }

    static Bitmap? CaptureRegionForOcr()
    {
        Console.Write("输入区域 (格式: x,y,宽,高 如 100,100,800,600): ");
        var parts = Console.ReadLine()?.Split(',');

        if (parts?.Length == 4 &&
            int.TryParse(parts[0], out int x) &&
            int.TryParse(parts[1], out int y) &&
            int.TryParse(parts[2], out int w) &&
            int.TryParse(parts[3], out int h))
        {
            var bmp = new Bitmap(w, h);
            using var g = Graphics.FromImage(bmp);
            g.CopyFromScreen(x, y, 0, 0, new Size(w, h));
            return bmp;
        }

        Console.WriteLine("无效输入");
        return null;
    }

    static Bitmap? LoadImageForOcr()
    {
        Console.Write("输入图片路径: ");
        var path = Console.ReadLine()?.Trim().Trim('"');

        if (!string.IsNullOrEmpty(path) && File.Exists(path))
        {
            return new Bitmap(path);
        }

        Console.WriteLine("文件不存在");
        return null;
    }

    static async Task<string> RecognizeTextFromBitmap(Bitmap bitmap)
    {
        // 将 System.Drawing.Bitmap 转换为 byte[]
        using var ms = new MemoryStream();
        bitmap.Save(ms, ImageFormat.Png);
        var bytes = ms.ToArray();

        // 创建 SoftwareBitmap
        using var stream = new InMemoryRandomAccessStream();
        await stream.WriteAsync(bytes.AsBuffer());
        stream.Seek(0);

        var decoder = await BitmapDecoder.CreateAsync(stream);
        var softwareBitmap = await decoder.GetSoftwareBitmapAsync(
            BitmapPixelFormat.Bgra8,
            BitmapAlphaMode.Premultiplied);

        // 创建 OCR 引擎 (使用系统语言，支持中文)
        var ocrEngine = OcrEngine.TryCreateFromUserProfileLanguages();
        if (ocrEngine == null)
        {
            // 尝试使用简体中文
            var language = new Windows.Globalization.Language("zh-Hans-CN");
            ocrEngine = OcrEngine.TryCreateFromLanguage(language);
        }

        if (ocrEngine == null)
        {
            return "❌ 无法创建 OCR 引擎，请检查系统语言包";
        }

        // 执行 OCR
        var result = await ocrEngine.RecognizeAsync(softwareBitmap);

        // 提取文字
        var sb = new StringBuilder();
        foreach (var line in result.Lines)
        {
            sb.AppendLine(line.Text);
        }

        return sb.ToString();
    }

    /// <summary>
    /// 测试8: Windsurf 自动化 - 点击左下角输入框并输入文字
    /// </summary>
    static void TestWindsurfAutomation()
    {
        Console.WriteLine("\n【测试8】Windsurf 自动化");

        // 查找 Windsurf 窗口
        IntPtr windsurfHwnd = IntPtr.Zero;
        string windsurfTitle = "";

        EnumWindows((hWnd, lParam) =>
        {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            var title = sb.ToString();
            
            // 匹配 Windsurf 窗口 (标题通常包含 "Windsurf" 或文件路径)
            if (title.Contains("Windsurf", StringComparison.OrdinalIgnoreCase) ||
                title.Contains("- Windsurf", StringComparison.OrdinalIgnoreCase))
            {
                windsurfHwnd = hWnd;
                windsurfTitle = title;
                return false; // 停止枚举
            }
            return true;
        }, IntPtr.Zero);

        if (windsurfHwnd == IntPtr.Zero)
        {
            Console.WriteLine("❌ 未找到 Windsurf 窗口");
            return;
        }

        Console.WriteLine($"✅ 找到 Windsurf: {windsurfTitle.Substring(0, Math.Min(50, windsurfTitle.Length))}...");

        // 获取窗口位置
        GetWindowRect(windsurfHwnd, out RECT rect);
        int windowWidth = rect.Right - rect.Left;
        int windowHeight = rect.Bottom - rect.Top;

        Console.WriteLine($"📐 窗口位置: ({rect.Left}, {rect.Top}) 大小: {windowWidth}x{windowHeight}");

        int clickX, clickY;

        // 优先使用录制的位置
        if (_recordedPosition.HasValue)
        {
            clickX = _recordedPosition.Value.X;
            clickY = _recordedPosition.Value.Y;
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"🎯 使用录制位置: ({clickX}, {clickY})");
            Console.ResetColor();
        }
        else
        {
            // 默认: 右下角 Cascade 输入框位置 (用户录制)
            clickX = 1700;
            clickY = 1042;
            Console.WriteLine($"🎯 使用默认位置: ({clickX}, {clickY})");
            Console.WriteLine("💡 提示: 用选项9录制精确位置");
        }

        Console.Write("输入要发送的文字 (默认123): ");
        var text = Console.ReadLine()?.Trim();
        if (string.IsNullOrEmpty(text)) text = "123";

        Console.WriteLine("\n⏰ 2秒后开始操作...");
        Thread.Sleep(2000);

        // 1. 激活窗口
        SetForegroundWindow(windsurfHwnd);
        ShowWindow(windsurfHwnd, SW_RESTORE);
        Thread.Sleep(300);

        // 2. 点击左下角输入框
        Console.WriteLine("🖱️ 点击输入框...");
        SetCursorPos(clickX, clickY);
        Thread.Sleep(100);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        Thread.Sleep(500);

        // 3. 输入文字
        Console.WriteLine($"⌨️ 输入: {text}");
        foreach (char c in text)
        {
            var inputs = new INPUT[2];

            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].u.ki.wVk = 0;
            inputs[0].u.ki.wScan = c;
            inputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE;

            inputs[1].type = INPUT_KEYBOARD;
            inputs[1].u.ki.wVk = 0;
            inputs[1].u.ki.wScan = c;
            inputs[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

            SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
            Thread.Sleep(30);
        }

        Console.WriteLine("✅ 完成!");
    }

    // 保存录制的位置
    static POINT? _recordedPosition = null;

    /// <summary>
    /// 测试9: 录制模式 - 记录鼠标点击位置
    /// </summary>
    static void TestRecordPosition()
    {
        Console.WriteLine("\n【测试9】录制模式");
        Console.WriteLine("─".PadRight(50, '─'));
        Console.WriteLine("🎯 移动鼠标到目标位置，然后按 鼠标左键 记录");
        Console.WriteLine("📍 实时显示鼠标坐标");
        Console.WriteLine("⏹️  按 ESC 退出录制");
        Console.WriteLine("─".PadRight(50, '─'));
        Console.WriteLine();

        var recorded = new List<POINT>();
        bool wasPressed = false;

        while (true)
        {
            // 检查 ESC
            if ((GetAsyncKeyState(VK_ESCAPE) & 0x8000) != 0)
            {
                break;
            }

            // 获取当前鼠标位置
            GetCursorPos(out POINT pos);

            // 检查鼠标左键点击
            bool isPressed = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
            if (isPressed && !wasPressed)
            {
                // 记录位置
                recorded.Add(pos);
                _recordedPosition = pos;

                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine($"\n✅ 已记录位置 #{recorded.Count}: ({pos.X}, {pos.Y})");
                Console.ResetColor();
            }
            wasPressed = isPressed;

            // 显示当前位置
            Console.Write($"\r🖱️ 当前位置: ({pos.X,5}, {pos.Y,5})  已记录: {recorded.Count} 个    ");

            Thread.Sleep(50);
        }

        Console.WriteLine("\n\n📋 录制结果:");
        Console.WriteLine("─".PadRight(50, '─'));

        if (recorded.Count > 0)
        {
            for (int i = 0; i < recorded.Count; i++)
            {
                Console.WriteLine($"  位置 {i + 1}: ({recorded[i].X}, {recorded[i].Y})");
            }

            Console.WriteLine();
            Console.WriteLine("💡 最后录制的位置将用于 Windsurf 自动化 (选项8)");
        }
        else
        {
            Console.WriteLine("  未录制任何位置");
        }
    }

    // 结果文件路径
    static readonly string ResultFilePath = @"D:\git\wintab\ai_result.txt";

    /// <summary>
    /// 测试10: Windsurf 完整流程
    /// 输入任务 → 回车 → 等待 → 输入总结指令 → 读取结果
    /// </summary>
    static void TestWindsurfFullFlow()
    {
        Console.WriteLine("\n【测试10】Windsurf 完整自动化流程");
        Console.WriteLine("─".PadRight(60, '─'));

        // 1. 输入任务
        Console.Write("输入任务指令: ");
        var task = Console.ReadLine()?.Trim();
        if (string.IsNullOrEmpty(task))
        {
            Console.WriteLine("任务不能为空");
            return;
        }

        // 2. 输入等待时间
        Console.Write("AI执行等待时间(秒, 默认30): ");
        var waitStr = Console.ReadLine()?.Trim();
        int waitSeconds = string.IsNullOrEmpty(waitStr) ? 30 : int.Parse(waitStr);

        // 3. 清空旧结果文件
        if (File.Exists(ResultFilePath))
        {
            File.Delete(ResultFilePath);
        }

        Console.WriteLine($"\n📋 任务: {task}");
        Console.WriteLine($"⏱️ 等待时间: {waitSeconds}秒");
        Console.WriteLine($"📁 结果文件: {ResultFilePath}");
        Console.WriteLine("\n⏰ 3秒后开始执行...");
        Thread.Sleep(3000);

        // 4. 激活 Windsurf 并点击输入框
        ActivateWindsurfAndClick();

        // 5. 输入任务
        Console.WriteLine($"⌨️ 输入任务...");
        TypeText(task);
        Thread.Sleep(300);

        // 6. 按回车
        Console.WriteLine("↵ 按回车执行...");
        PressKey(0x0D); // VK_RETURN
        Thread.Sleep(500);

        // 7. 等待 AI 执行
        Console.WriteLine($"⏳ 等待 AI 执行 ({waitSeconds}秒)...");
        for (int i = waitSeconds; i > 0; i--)
        {
            Console.Write($"\r   剩余 {i} 秒...    ");
            Thread.Sleep(1000);
        }
        Console.WriteLine();

        // 8. 输入总结指令
        Console.WriteLine("\n📝 输入总结指令...");
        ActivateWindsurfAndClick();
        Thread.Sleep(300);

        var summaryTask = $"请把刚才的修改用300字总结，直接写入文件 {ResultFilePath}，不要解释";
        TypeText(summaryTask);
        Thread.Sleep(300);
        PressKey(0x0D); // 回车

        // 9. 等待写入
        Console.WriteLine("⏳ 等待写入结果 (15秒)...");
        Thread.Sleep(15000);

        // 10. 读取结果
        Console.WriteLine("\n📖 读取结果...");
        if (File.Exists(ResultFilePath))
        {
            var result = File.ReadAllText(ResultFilePath, Encoding.UTF8);
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("─".PadRight(60, '─'));
            Console.WriteLine("✅ AI 执行结果:");
            Console.WriteLine("─".PadRight(60, '─'));
            Console.ResetColor();
            Console.WriteLine(result);
            Console.WriteLine("─".PadRight(60, '─'));
        }
        else
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("⚠️ 结果文件未生成，可能 AI 还在执行");
            Console.WriteLine($"   请稍后手动查看: {ResultFilePath}");
            Console.ResetColor();
        }
    }

    static void ActivateWindsurfAndClick()
    {
        // 查找 Windsurf 窗口
        IntPtr hwnd = IntPtr.Zero;
        EnumWindows((hWnd, lParam) =>
        {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            if (sb.ToString().Contains("Windsurf", StringComparison.OrdinalIgnoreCase))
            {
                hwnd = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        if (hwnd != IntPtr.Zero)
        {
            SetForegroundWindow(hwnd);
            ShowWindow(hwnd, SW_RESTORE);
            Thread.Sleep(200);

            // 点击输入框 (使用录制位置或默认位置)
            int x = _recordedPosition?.X ?? 1700;
            int y = _recordedPosition?.Y ?? 1042;
            SetCursorPos(x, y);
            Thread.Sleep(100);
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
            Thread.Sleep(300);
        }
    }

    static void TypeText(string text)
    {
        foreach (char c in text)
        {
            var inputs = new INPUT[2];
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].u.ki.wScan = c;
            inputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE;
            inputs[1].type = INPUT_KEYBOARD;
            inputs[1].u.ki.wScan = c;
            inputs[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
            SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
            Thread.Sleep(20);
        }
    }

    static void PressKey(ushort vk)
    {
        var inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].u.ki.wVk = vk;
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].u.ki.wVk = vk;
        inputs[1].u.ki.dwFlags = KEYEVENTF_KEYUP;
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
}
