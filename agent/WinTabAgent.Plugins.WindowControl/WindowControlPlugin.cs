using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using WinTabAgent.Plugins.Abstractions;

namespace WinTabAgent.Plugins.WindowControl;

/// <summary>
/// 窗口控制插件
/// </summary>
public class WindowControlPlugin : IWindowPlugin
{
    private IPluginContext? _context;

    #region Win32 API

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd); // 检查窗口是否最小化

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hWnd); // 检查窗口是否存在

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    private static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);

    [DllImport("user32.dll")]
    private static extern IntPtr GetWindowDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

    private const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
    private const uint PW_RENDERFULLCONTENT = 0x00000002;

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left, Top, Right, Bottom;
    }

    private const int SW_SHOW = 5;
    private const int SW_MINIMIZE = 6;
    private const int SW_MAXIMIZE = 3;
    private const int SW_RESTORE = 9;
    private const int SM_CXSCREEN = 0;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public int type;
        public INPUTUNION u;
        public KEYBDINPUT ki { get => u.ki; set => u.ki = value; }
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct INPUTUNION
    {
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }
    private const int SM_CYSCREEN = 1;

    #endregion

    #region IPlugin

    public string Id => "window-control";
    public string Name => "窗口控制插件";
    public string Version => "1.0.0";
    public string Description => "Windows 窗口管理：枚举、激活、最小化、截图";
    public string Author => "WinTab Team";

    public Task InitializeAsync(IPluginContext context)
    {
        _context = context;
        _context.Log($"[{Name}] Initialized");
        return Task.CompletedTask;
    }

    public Task ShutdownAsync()
    {
        _context?.Log($"[{Name}] Shutdown");
        return Task.CompletedTask;
    }

    public async Task<PluginResult> ExecuteAsync(string action, JsonElement parameters)
    {
        return action switch
        {
            "list" => PluginResult.Ok(await GetWindowsAsync()),
            "list-processes" => PluginResult.Ok(GetProcessList()),
            "activate" => await ExecuteActivateAsync(parameters),
            "minimize" => await ExecuteMinimizeAsync(parameters),
            "maximize" => await ExecuteMaximizeAsync(parameters),
            "capture" => await ExecuteCaptureAsync(parameters),
            "capture-screen" => await ExecuteCaptureScreenAsync(),
            "send-keys" => ExecuteSendKeys(parameters),
            "mouse-click" => ExecuteMouseClick(parameters),
            "switch-preset" => await ExecuteSwitchPresetAsync(parameters),
            "switch-desktop" => ExecuteSwitchDesktop(parameters),
            "minimize-all" => ExecuteMinimizeAll(),
            "restore-all" => ExecuteRestoreAll(),
            "tile-windows" => await ExecuteTileWindowsAsync(parameters),
            "ocr" => await ExecuteOcrAsync(parameters),
            "ocr-screen" => await ExecuteOcrScreenAsync(),
            "list-ports" => await ExecuteListPortsAsync(),
            "kill-by-port" => ExecuteKillByPort(parameters),
            "open-url" => ExecuteOpenUrl(parameters),
            "activate-by-pattern" => await ExecuteActivateByPatternAsync(parameters),
            _ => PluginResult.Fail($"Unknown action: {action}")
        };
    }

    public IEnumerable<string> GetSupportedActions()
    {
        return new[] { "list", "list-processes", "activate", "minimize", "maximize", "capture", "capture-screen", "send-keys", "mouse-click", "switch-preset", "switch-desktop", "minimize-all", "restore-all", "tile-windows", "ocr", "ocr-screen", "list-ports", "kill-by-port", "open-url", "activate-by-pattern" };
    }

    #endregion

    #region IWindowPlugin

    public Task<List<WindowInfo>> GetWindowsAsync()
    {
        var windows = new List<WindowInfo>();

        EnumWindows((hWnd, lParam) =>
        {
            if (!IsWindowVisible(hWnd)) return true;

            var title = new StringBuilder(256);
            GetWindowText(hWnd, title, 256);

            if (string.IsNullOrWhiteSpace(title.ToString())) return true;

            GetWindowThreadProcessId(hWnd, out var processId);
            var processName = "";
            try
            {
                var process = Process.GetProcessById((int)processId);
                processName = process.ProcessName;
            }
            catch { }

            GetWindowRect(hWnd, out var rect);

            windows.Add(new WindowInfo
            {
                Handle = hWnd,
                Title = title.ToString(),
                ProcessName = processName,
                ProcessId = processId,
                IsVisible = true,
                Bounds = new WindowRect
                {
                    Left = rect.Left,
                    Top = rect.Top,
                    Right = rect.Right,
                    Bottom = rect.Bottom
                }
            });

            return true;
        }, IntPtr.Zero);

        return Task.FromResult(windows);
    }

    public Task ActivateWindowAsync(IntPtr handle)
    {
        // 检查窗口是否存在
        if (!IsWindow(handle))
        {
            _context?.Log($"[WindowControl] ❌ 窗口 {handle} 不存在（已关闭或 handle 过期）", LogLevel.Warning);
            return Task.CompletedTask;
        }

        // 获取窗口标题用于日志
        var title = new StringBuilder(256);
        GetWindowText(handle, title, 256);
        _context?.Log($"[WindowControl] 激活窗口: {handle} - {title}");

        // 只有最小化的窗口才恢复
        if (IsIconic(handle))
        {
            _context?.Log($"[WindowControl] 窗口已最小化，正在恢复...");
            ShowWindow(handle, SW_RESTORE);
        }

        // 绕过 Windows 前台窗口限制
        var foreThread = GetWindowThreadProcessId(GetForegroundWindow(), out _);
        var appThread = GetCurrentThreadId();
        
        bool attached = false;
        if (foreThread != appThread)
        {
            attached = AttachThreadInput(foreThread, appThread, true);
            BringWindowToTop(handle);
            ShowWindow(handle, SW_SHOW);
        }
        
        var result = SetForegroundWindow(handle);
        _context?.Log($"[WindowControl] SetForegroundWindow: {(result ? "✓ 成功" : "✗ 失败")}");
        
        if (attached)
        {
            AttachThreadInput(foreThread, appThread, false);
        }
        
        return Task.CompletedTask;
    }

    public Task MinimizeWindowAsync(IntPtr handle)
    {
        ShowWindow(handle, SW_MINIMIZE);
        return Task.CompletedTask;
    }

    public Task MaximizeWindowAsync(IntPtr handle)
    {
        ShowWindow(handle, SW_MAXIMIZE);
        return Task.CompletedTask;
    }

    public Task<byte[]> CaptureWindowAsync(IntPtr handle)
    {
        // 使用 DWM 获取更准确的窗口边界
        RECT rect;
        if (DwmGetWindowAttribute(handle, DWMWA_EXTENDED_FRAME_BOUNDS, out rect, Marshal.SizeOf<RECT>()) != 0)
        {
            GetWindowRect(handle, out rect);
        }

        var width = rect.Right - rect.Left;
        var height = rect.Bottom - rect.Top;

        if (width <= 0 || height <= 0)
        {
            return Task.FromResult(Array.Empty<byte>());
        }

        // 使用 PrintWindow API 截取窗口内容（即使被遮挡也能正确截图）
        using var bmp = new Bitmap(width, height);
        using var g = Graphics.FromImage(bmp);
        var hdc = g.GetHdc();
        
        try
        {
            // PW_RENDERFULLCONTENT 用于支持 DWM 渲染的窗口
            if (!PrintWindow(handle, hdc, PW_RENDERFULLCONTENT))
            {
                // 如果 PrintWindow 失败，回退到屏幕截图
                g.ReleaseHdc(hdc);
                g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height));
            }
        }
        finally
        {
            try { g.ReleaseHdc(hdc); } catch { }
        }

        using var ms = new MemoryStream();
        var encoder = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
        var encoderParams = new EncoderParameters(1);
        encoderParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 80L);
        bmp.Save(ms, encoder, encoderParams);
        return Task.FromResult(ms.ToArray());
    }

    public async Task SwitchPresetAsync(List<IntPtr> handles)
    {
        // 只激活目标窗口，不最小化其他窗口（避免闪屏）
        foreach (var handle in handles)
        {
            await ActivateWindowAsync(handle);
            await Task.Delay(30); // 减少延迟
        }
    }

    #endregion

    #region Execute Helpers

    private async Task<PluginResult> ExecuteActivateAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("handle", out var handleProp))
        {
            var handle = new IntPtr(handleProp.GetInt64());
            await ActivateWindowAsync(handle);
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'handle' parameter");
    }

    private async Task<PluginResult> ExecuteMinimizeAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("handle", out var handleProp))
        {
            var handle = new IntPtr(handleProp.GetInt64());
            await MinimizeWindowAsync(handle);
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'handle' parameter");
    }

    private async Task<PluginResult> ExecuteMaximizeAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("handle", out var handleProp))
        {
            var handle = new IntPtr(handleProp.GetInt64());
            await MaximizeWindowAsync(handle);
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'handle' parameter");
    }

    private async Task<PluginResult> ExecuteCaptureAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("handle", out var handleProp))
        {
            var handle = new IntPtr(handleProp.GetInt64());
            var bytes = await CaptureWindowAsync(handle);
            return PluginResult.Ok(new { image = Convert.ToBase64String(bytes) });
        }
        return PluginResult.Fail("Missing 'handle' parameter");
    }

    private Task<PluginResult> ExecuteCaptureScreenAsync()
    {
        // 获取主屏幕尺寸
        var screenWidth = GetSystemMetrics(SM_CXSCREEN);
        var screenHeight = GetSystemMetrics(SM_CYSCREEN);

        using var bmp = new Bitmap(screenWidth, screenHeight);
        using var g = Graphics.FromImage(bmp);
        g.CopyFromScreen(0, 0, 0, 0, new Size(screenWidth, screenHeight));

        using var ms = new MemoryStream();
        var encoder = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
        var encoderParams = new EncoderParameters(1);
        encoderParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 70L);
        bmp.Save(ms, encoder, encoderParams);

        var base64 = Convert.ToBase64String(ms.ToArray());
        return Task.FromResult(PluginResult.Ok(new { image = base64, width = screenWidth, height = screenHeight }));
    }

    private async Task<PluginResult> ExecuteSwitchPresetAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("handles", out var handlesProp))
        {
            var handles = new List<IntPtr>();
            foreach (var h in handlesProp.EnumerateArray())
            {
                handles.Add(new IntPtr(h.GetInt64()));
            }
            await SwitchPresetAsync(handles);
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'handles' parameter");
    }

    private object GetProcessList()
    {
        var processes = Process.GetProcesses()
            .Where(p => !string.IsNullOrEmpty(p.MainWindowTitle) || p.Id > 0)
            .Select(p => new
            {
                id = p.Id,
                name = p.ProcessName,
                title = p.MainWindowTitle,
                memory = p.WorkingSet64 / 1024 / 1024, // MB
            })
            .OrderBy(p => p.name)
            .Take(100)
            .ToList();

        return processes;
    }

    private PluginResult ExecuteSendKeys(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("keys", out var keysProp))
        {
            return PluginResult.Fail("Missing 'keys' parameter");
        }

        var keys = keysProp.GetString();
        if (string.IsNullOrEmpty(keys))
        {
            return PluginResult.Fail("Empty keys");
        }

        try
        {
            System.Windows.Forms.SendKeys.SendWait(keys);
            return PluginResult.Ok(new { sent = keys });
        }
        catch (Exception ex)
        {
            return PluginResult.Fail($"SendKeys failed: {ex.Message}");
        }
    }

    private PluginResult ExecuteMouseClick(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("x", out var xProp) || !parameters.TryGetProperty("y", out var yProp))
        {
            return PluginResult.Fail("Missing 'x' or 'y' parameter");
        }

        var x = xProp.GetInt32();
        var y = yProp.GetInt32();

        // 移动鼠标
        SetCursorPos(x, y);

        // 模拟点击
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);

        return PluginResult.Ok(new { clicked = true, x, y });
    }

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);

    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;

    // 切换虚拟桌面 (Win+Ctrl+Left/Right)
    private PluginResult ExecuteSwitchDesktop(JsonElement parameters)
    {
        var direction = parameters.TryGetProperty("direction", out var d) ? d.GetString() : "right";
        
        try
        {
            ushort arrowKey = (ushort)(direction == "left" ? 0x25 : 0x27);
            
            // 模拟 Win+Ctrl+Left/Right
            var inputs = new INPUT[]
            {
                CreateKeyInput(0x5B, false),  // Win down
                CreateKeyInput(0x11, false),  // Ctrl down
                CreateKeyInput(arrowKey, false),  // Arrow down
                CreateKeyInput(arrowKey, true),   // Arrow up
                CreateKeyInput(0x11, true),   // Ctrl up
                CreateKeyInput(0x5B, true),   // Win up
            };
            
            SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<INPUT>());
            
            return PluginResult.Ok(new { switched = true, direction });
        }
        catch (Exception ex)
        {
            return PluginResult.Fail($"Switch desktop failed: {ex.Message}");
        }
    }

    // 最小化所有窗口 (Win+D)
    private PluginResult ExecuteMinimizeAll()
    {
        try
        {
            var inputs = new INPUT[]
            {
                CreateKeyInput(0x5B, false),  // Win down
                CreateKeyInput(0x44, false),  // D down
                CreateKeyInput(0x44, true),   // D up
                CreateKeyInput(0x5B, true),   // Win up
            };
            
            SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<INPUT>());
            
            return PluginResult.Ok(new { minimized = true });
        }
        catch (Exception ex)
        {
            return PluginResult.Fail($"Minimize all failed: {ex.Message}");
        }
    }

    private static INPUT CreateKeyInput(ushort vk, bool keyUp)
    {
        var input = new INPUT { type = 1 };
        input.u.ki.wVk = vk;
        input.u.ki.dwFlags = keyUp ? 0x0002u : 0u;
        return input;
    }

    // 恢复所有窗口 (Win+D again)
    private PluginResult ExecuteRestoreAll()
    {
        return ExecuteMinimizeAll(); // 再按一次恢复
    }

    // 平铺窗口
    private async Task<PluginResult> ExecuteTileWindowsAsync(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("handles", out var handlesProp))
        {
            return PluginResult.Fail("Missing 'handles' parameter");
        }

        var handles = new List<nint>();
        foreach (var h in handlesProp.EnumerateArray())
        {
            handles.Add(new nint(h.GetInt64()));
        }

        if (handles.Count == 0)
        {
            return PluginResult.Fail("No windows to tile");
        }

        // 获取屏幕尺寸
        int screenWidth = GetSystemMetrics(SM_CXSCREEN);
        int screenHeight = GetSystemMetrics(SM_CYSCREEN);

        var layout = parameters.TryGetProperty("layout", out var l) ? l.GetString() : "grid";
        
        if (layout == "horizontal")
        {
            // 水平平铺
            int width = screenWidth / handles.Count;
            for (int i = 0; i < handles.Count; i++)
            {
                ShowWindow(handles[i], SW_RESTORE);
                SetWindowPos(handles[i], IntPtr.Zero, i * width, 0, width, screenHeight, 0);
            }
        }
        else if (layout == "vertical")
        {
            // 垂直平铺
            int height = screenHeight / handles.Count;
            for (int i = 0; i < handles.Count; i++)
            {
                ShowWindow(handles[i], SW_RESTORE);
                SetWindowPos(handles[i], IntPtr.Zero, 0, i * height, screenWidth, height, 0);
            }
        }
        else
        {
            // 网格平铺
            int cols = (int)Math.Ceiling(Math.Sqrt(handles.Count));
            int rows = (int)Math.Ceiling((double)handles.Count / cols);
            int cellWidth = screenWidth / cols;
            int cellHeight = screenHeight / rows;

            for (int i = 0; i < handles.Count; i++)
            {
                int row = i / cols;
                int col = i % cols;
                ShowWindow(handles[i], SW_RESTORE);
                SetWindowPos(handles[i], IntPtr.Zero, col * cellWidth, row * cellHeight, cellWidth, cellHeight, 0);
            }
        }

        await Task.Delay(100);
        return PluginResult.Ok(new { tiled = true, count = handles.Count, layout });
    }

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    // OCR 窗口截图
    private async Task<PluginResult> ExecuteOcrAsync(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("handle", out var handleProp))
        {
            return PluginResult.Fail("Missing 'handle' parameter");
        }

        var handle = new IntPtr(handleProp.GetInt64());
        
        try
        {
            // 先截图
            var captureResult = await ExecuteCaptureAsync(parameters);
            if (!captureResult.Success)
            {
                return captureResult;
            }
            
            // 从 base64 获取图像
            var resultObj = captureResult.Data as dynamic;
            var base64 = resultObj?.image as string;
            if (string.IsNullOrEmpty(base64))
            {
                return PluginResult.Fail("Failed to capture window");
            }
            
            var text = await PerformOcrAsync(base64);
            return PluginResult.Ok(new { text, handle = handle.ToInt64() });
        }
        catch (Exception ex)
        {
            return PluginResult.Fail($"OCR failed: {ex.Message}");
        }
    }

    // OCR 屏幕截图
    private async Task<PluginResult> ExecuteOcrScreenAsync()
    {
        try
        {
            var captureResult = await ExecuteCaptureScreenAsync();
            if (!captureResult.Success)
            {
                return captureResult;
            }
            
            var resultObj = captureResult.Data as dynamic;
            var base64 = resultObj?.image as string;
            if (string.IsNullOrEmpty(base64))
            {
                return PluginResult.Fail("Failed to capture screen");
            }
            
            var text = await PerformOcrAsync(base64);
            return PluginResult.Ok(new { text, source = "screen" });
        }
        catch (Exception ex)
        {
            return PluginResult.Fail($"OCR failed: {ex.Message}");
        }
    }

    // 执行 OCR
    private async Task<string> PerformOcrAsync(string base64Image)
    {
        var imageBytes = Convert.FromBase64String(base64Image);
        
        using var ms = new MemoryStream(imageBytes);
        using var bitmap = new Bitmap(ms);
        
        // 使用 Windows.Media.Ocr
        var ocrEngine = Windows.Media.Ocr.OcrEngine.TryCreateFromLanguage(
            new Windows.Globalization.Language("zh-Hans-CN")) 
            ?? Windows.Media.Ocr.OcrEngine.TryCreateFromUserProfileLanguages();
        
        if (ocrEngine == null)
        {
            throw new Exception("OCR engine not available");
        }

        // 转换为 SoftwareBitmap
        using var stream = new Windows.Storage.Streams.InMemoryRandomAccessStream();
        bitmap.Save(stream.AsStream(), ImageFormat.Png);
        stream.Seek(0);
        
        var decoder = await Windows.Graphics.Imaging.BitmapDecoder.CreateAsync(stream);
        var softwareBitmap = await decoder.GetSoftwareBitmapAsync();
        
        var result = await ocrEngine.RecognizeAsync(softwareBitmap);
        return result.Text;
    }

    #endregion

    #region Port Management

    /// <summary>
    /// 按特征模式激活窗口（用于工作台热键）
    /// </summary>
    private async Task<PluginResult> ExecuteActivateByPatternAsync(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("patterns", out var patternsProp))
        {
            return PluginResult.Fail("Missing 'patterns' parameter");
        }

        var windows = await GetWindowsAsync();
        var matched = new List<object>();
        var failed = new List<object>();

        foreach (var pattern in patternsProp.EnumerateArray())
        {
            var processName = pattern.TryGetProperty("processName", out var pn) ? pn.GetString() : null;
            var titlePattern = pattern.TryGetProperty("titlePattern", out var tp) ? tp.GetString() : null;
            var fallbackHandle = pattern.TryGetProperty("handle", out var h) ? h.GetInt64() : 0;

            // 1. 先尝试按特征匹配
            WindowInfo? matchedWindow = null;
            
            if (!string.IsNullOrEmpty(processName))
            {
                // 按进程名匹配
                matchedWindow = windows.FirstOrDefault(w => 
                    w.ProcessName.Equals(processName, StringComparison.OrdinalIgnoreCase));
                
                // 如果有标题模式，进一步筛选
                if (matchedWindow != null && !string.IsNullOrEmpty(titlePattern))
                {
                    matchedWindow = windows.FirstOrDefault(w =>
                        w.ProcessName.Equals(processName, StringComparison.OrdinalIgnoreCase) &&
                        w.Title.Contains(titlePattern, StringComparison.OrdinalIgnoreCase));
                }
            }
            
            // 2. 如果特征匹配失败，尝试用备用 handle
            if (matchedWindow == null && fallbackHandle != 0)
            {
                matchedWindow = windows.FirstOrDefault(w => w.Handle.ToInt64() == fallbackHandle);
            }

            // 3. 激活匹配到的窗口
            if (matchedWindow != null)
            {
                await ActivateWindowAsync(matchedWindow.Handle);
                matched.Add(new { 
                    handle = matchedWindow.Handle.ToInt64(), 
                    title = matchedWindow.Title,
                    processName = matchedWindow.ProcessName
                });
                await Task.Delay(50);
            }
            else
            {
                failed.Add(new { processName, titlePattern, handle = fallbackHandle });
            }
        }

        _context?.Log($"[activate-by-pattern] Matched: {matched.Count}, Failed: {failed.Count}");
        
        return PluginResult.Ok(new { matched, failed });
    }

    /// <summary>
    /// 获取所有监听端口列表
    /// </summary>
    private async Task<PluginResult> ExecuteListPortsAsync()
    {
        try
        {
            var ports = new List<object>();
            
            // 使用 netstat 获取端口信息
            var psi = new ProcessStartInfo
            {
                FileName = "netstat",
                Arguments = "-ano",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null)
            {
                return PluginResult.Fail("Failed to start netstat");
            }

            var output = await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();

            var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            var processCache = new Dictionary<int, string>();

            foreach (var line in lines)
            {
                // 解析 TCP/UDP 行
                var parts = line.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 4) continue;
                
                var protocol = parts[0].ToUpper();
                if (protocol != "TCP" && protocol != "UDP") continue;

                var localAddress = parts[1];
                var state = protocol == "TCP" && parts.Length >= 4 ? parts[3] : "N/A";
                var pidStr = parts[^1]; // 最后一列是 PID

                if (!int.TryParse(pidStr, out var pid)) continue;

                // 解析端口
                var colonIndex = localAddress.LastIndexOf(':');
                if (colonIndex == -1) continue;
                
                var portStr = localAddress[(colonIndex + 1)..];
                if (!int.TryParse(portStr, out var port)) continue;

                var address = localAddress[..colonIndex];

                // 获取进程名（缓存）
                if (!processCache.TryGetValue(pid, out var processName))
                {
                    try
                    {
                        var proc = Process.GetProcessById(pid);
                        processName = proc.ProcessName;
                    }
                    catch
                    {
                        processName = "Unknown";
                    }
                    processCache[pid] = processName;
                }

                ports.Add(new
                {
                    port,
                    protocol,
                    localAddress = address,
                    state,
                    processId = pid,
                    processName
                });
            }

            // 按端口排序，去重
            var uniquePorts = ports
                .GroupBy(p => ((dynamic)p).port + "_" + ((dynamic)p).protocol)
                .Select(g => g.First())
                .OrderBy(p => ((dynamic)p).port)
                .ToList();

            return PluginResult.Ok(uniquePorts);
        }
        catch (Exception ex)
        {
            return PluginResult.Fail($"Failed to list ports: {ex.Message}");
        }
    }

    /// <summary>
    /// 杀死占用指定端口的进程
    /// </summary>
    private PluginResult ExecuteKillByPort(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("port", out var portProp))
        {
            return PluginResult.Fail("Missing 'port' parameter");
        }

        var port = portProp.GetInt32();

        try
        {
            // 使用 netstat 找到占用端口的 PID
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c netstat -ano | findstr :{port}",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null)
            {
                return PluginResult.Fail("Failed to start netstat");
            }

            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();

            var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            var killedPids = new List<int>();

            foreach (var line in lines)
            {
                var parts = line.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 2) continue;

                // 检查是否是目标端口（本地地址列）
                var localAddr = parts[1];
                if (!localAddr.EndsWith($":{port}")) continue;

                var pidStr = parts[^1];
                if (!int.TryParse(pidStr, out var pid) || pid == 0) continue;

                try
                {
                    var proc = Process.GetProcessById(pid);
                    var procName = proc.ProcessName;
                    proc.Kill();
                    killedPids.Add(pid);
                    _context?.Log($"Killed process {procName} (PID: {pid}) on port {port}");
                }
                catch (Exception ex)
                {
                    _context?.Log($"Failed to kill PID {pid}: {ex.Message}", LogLevel.Warning);
                }
            }

            if (killedPids.Count == 0)
            {
                return PluginResult.Fail($"No process found on port {port}");
            }

            return PluginResult.Ok(new { port, killedPids, message = $"Killed {killedPids.Count} process(es)" });
        }
        catch (Exception ex)
        {
            return PluginResult.Fail($"Failed to kill process: {ex.Message}");
        }
    }

    /// <summary>
    /// 在浏览器中打开 URL
    /// </summary>
    private PluginResult ExecuteOpenUrl(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("url", out var urlProp))
        {
            return PluginResult.Fail("Missing 'url' parameter");
        }

        var url = urlProp.GetString();
        if (string.IsNullOrEmpty(url))
        {
            return PluginResult.Fail("Empty URL");
        }

        // 如果只是 ip:port 格式，自动加上 http://
        if (!url.StartsWith("http://") && !url.StartsWith("https://"))
        {
            url = "http://" + url;
        }

        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            _context?.Log($"Opened URL: {url}");
            return PluginResult.Ok(new { url, opened = true });
        }
        catch (Exception ex)
        {
            return PluginResult.Fail($"Failed to open URL: {ex.Message}");
        }
    }

    #endregion
}
