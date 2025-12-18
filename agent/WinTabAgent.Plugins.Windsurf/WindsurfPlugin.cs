using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using WinTabAgent.Plugins.Abstractions;

namespace WinTabAgent.Plugins.Windsurf;

/// <summary>
/// Windsurf IDE 自动化插件
/// 通过窗口操作和键盘模拟实现
/// </summary>
public class WindsurfPlugin : IIdePlugin
{
    private IPluginContext? _context;
    private int _inputBoxX = 1700;
    private int _inputBoxY = 1042;
    private string _resultFilePath = @"D:\git\wintab\ai_result.txt";
    
    // 用户可配置的 Cascade 输入框坐标（0 表示使用自动计算）
    private int _customInputX = 0;
    private int _customInputY = 0;
    
    // 输入框相对于窗口的比例位置（基于窗口右下角）
    // 默认: 输入框在窗口右侧 25% 位置，底部往上 55 像素
    private double _inputBoxRatioX = 0.25;  // 距离右边界的比例
    private int _inputBoxOffsetY = 55;      // 距离底部的像素偏移

    #region Win32 API

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);
    
    private const int SM_CXSCREEN = 0;  // 屏幕宽度
    private const int SM_CYSCREEN = 1;  // 屏幕高度

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    private const int SW_RESTORE = 9;
    private const int SW_SHOW = 5;      // 显示窗口但不改变大小
    private const int SW_MAXIMIZE = 3;  // 最大化窗口
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const byte VK_RETURN = 0x0D;
    private const byte VK_CONTROL = 0x11;
    private const byte VK_SHIFT = 0x10;
    private const byte VK_ALT = 0x12;

    #endregion

    #region IPlugin

    public string Id => "windsurf";
    public string Name => "Windsurf IDE 插件";
    public string Version => "1.0.0";
    public string Description => "Windsurf IDE 自动化：输入任务、读取结果";
    public string Author => "WinTab Team";

    public Task InitializeAsync(IPluginContext context)
    {
        _context = context;
        var config = context.GetConfig<WindsurfConfig>("Plugins.Windsurf");
        if (config != null)
        {
            _inputBoxX = config.InputBoxPosition?.X ?? _inputBoxX;
            _inputBoxY = config.InputBoxPosition?.Y ?? _inputBoxY;
            _resultFilePath = config.ResultFilePath ?? _resultFilePath;
        }
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
            "is-running" => PluginResult.Ok(await IsRunningAsync()),
            "activate" => await ExecuteActivateAsync(),
            "click" => await ExecuteClickAsync(parameters),
            "double-click" => await ExecuteDoubleClickAsync(parameters),
            "right-click" => await ExecuteRightClickAsync(parameters),
            "type" => await ExecuteTypeAsync(parameters),
            "press-key" => await ExecutePressKeyAsync(parameters),
            "hotkey" => await ExecuteHotkeyAsync(parameters),
            "wait" => await ExecuteWaitAsync(parameters),
            "execute-task" => await ExecuteTaskActionAsync(parameters),
            "execute-steps" => await ExecuteStepsAsync(parameters),
            "scroll" => await ExecuteScrollAsync(parameters),
            "drag" => await ExecuteDragAsync(parameters),
            "get-mouse-position" => ExecuteGetMousePosition(),
            "capture-and-ocr" => await ExecuteCaptureAndOcrAsync(parameters),
            "get-window-info" => ExecuteGetWindowInfo(),
            "click-input-box" => await ExecuteClickInputBoxAsync(),
            "send-message" => await ExecuteSendMessageAsync(parameters),
            "set-input-position" => ExecuteSetInputPosition(parameters),
            "get-input-position" => ExecuteGetInputPosition(),
            "set-input-ratio" => ExecuteSetInputRatio(parameters),
            "calc-input-position" => ExecuteCalcInputPosition(),
            "auto-detect" => ExecuteAutoDetect(),
            "get-screen-info" => ExecuteGetScreenInfo(),
            _ => PluginResult.Fail($"Unknown action: {action}")
        };
    }

    public IEnumerable<string> GetSupportedActions()
    {
        return new[] { "is-running", "activate", "click", "double-click", "right-click", "type", "press-key", "hotkey", "wait", "execute-task", "execute-steps", "scroll", "drag" };
    }

    #endregion

    #region IIdePlugin

    public Task<bool> IsRunningAsync()
    {
        var handle = FindWindsurfWindow();
        return Task.FromResult(handle != IntPtr.Zero);
    }

    public async Task ActivateAsync()
    {
        var handle = FindWindsurfWindow();
        if (handle == IntPtr.Zero)
        {
            throw new Exception("Windsurf not found");
        }

        ShowWindow(handle, SW_SHOW);  // 不改变窗口大小
        SetForegroundWindow(handle);
        await Task.Delay(100);
    }

    public async Task ClickPositionAsync(int x, int y)
    {
        SetCursorPos(x, y);
        await Task.Delay(50);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        await Task.Delay(10);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        await Task.Delay(50);
    }

    public async Task TypeTextAsync(string text)
    {
        // 使用剪贴板（需要 STA 线程）
        var thread = new Thread(() => System.Windows.Forms.Clipboard.SetText(text));
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        await Task.Delay(50);
        
        // Ctrl+V
        keybd_event(0x11, 0, 0, UIntPtr.Zero); // Ctrl down
        keybd_event(0x56, 0, 0, UIntPtr.Zero); // V down
        keybd_event(0x56, 0, KEYEVENTF_KEYUP, UIntPtr.Zero); // V up
        keybd_event(0x11, 0, KEYEVENTF_KEYUP, UIntPtr.Zero); // Ctrl up
        await Task.Delay(100);
    }

    public async Task PressKeyAsync(string key)
    {
        byte vk = key.ToLower() switch
        {
            "enter" => VK_RETURN,
            "tab" => 0x09,
            "escape" => 0x1B,
            "backspace" => 0x08,
            _ => 0
        };

        if (vk != 0)
        {
            keybd_event(vk, 0, 0, UIntPtr.Zero);
            await Task.Delay(10);
            keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            await Task.Delay(50);
        }
    }

    public async Task<string> ExecuteTaskAsync(string task, int waitSeconds)
    {
        _context?.Log($"Executing task: {task}");

        // 1. 激活 Windsurf
        await ActivateAsync();
        await Task.Delay(200);

        // 2. 点击输入框
        await ClickPositionAsync(_inputBoxX, _inputBoxY);
        await Task.Delay(100);

        // 3. 输入任务
        await TypeTextAsync(task);
        await Task.Delay(100);

        // 4. 按回车
        await PressKeyAsync("enter");

        // 5. 等待结果
        _context?.Log($"Waiting {waitSeconds}s for result...");
        await Task.Delay(waitSeconds * 1000);

        // 6. 读取结果文件
        if (File.Exists(_resultFilePath))
        {
            var result = await File.ReadAllTextAsync(_resultFilePath);
            return result;
        }

        return "No result file found";
    }

    #endregion

    #region Private Methods

    private IntPtr FindWindsurfWindow()
    {
        IntPtr found = IntPtr.Zero;

        EnumWindows((hWnd, lParam) =>
        {
            var title = new StringBuilder(256);
            GetWindowText(hWnd, title, 256);
            var titleStr = title.ToString();

            if (titleStr.Contains("Windsurf") || titleStr.Contains("windsurf"))
            {
                found = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        return found;
    }

    private async Task<PluginResult> ExecuteActivateAsync()
    {
        await ActivateAsync();
        return PluginResult.Ok();
    }

    private async Task<PluginResult> ExecuteClickAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("x", out var x) && parameters.TryGetProperty("y", out var y))
        {
            await ClickPositionAsync(x.GetInt32(), y.GetInt32());
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'x' or 'y' parameter");
    }

    private async Task<PluginResult> ExecuteTypeAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("text", out var text))
        {
            await TypeTextAsync(text.GetString()!);
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'text' parameter");
    }

    private async Task<PluginResult> ExecutePressKeyAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("key", out var key))
        {
            await PressKeyAsync(key.GetString()!);
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'key' parameter");
    }

    private async Task<PluginResult> ExecuteTaskActionAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("task", out var task))
        {
            var wait = parameters.TryGetProperty("waitSeconds", out var w) ? w.GetInt32() : 30;
            var result = await ExecuteTaskAsync(task.GetString()!, wait);
            return PluginResult.Ok(result);
        }
        return PluginResult.Fail("Missing 'task' parameter");
    }

    private async Task<PluginResult> ExecuteDoubleClickAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("x", out var x) && parameters.TryGetProperty("y", out var y))
        {
            await DoubleClickPositionAsync(x.GetInt32(), y.GetInt32());
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'x' or 'y' parameter");
    }

    private async Task<PluginResult> ExecuteRightClickAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("x", out var x) && parameters.TryGetProperty("y", out var y))
        {
            await RightClickPositionAsync(x.GetInt32(), y.GetInt32());
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'x' or 'y' parameter");
    }

    private async Task<PluginResult> ExecuteHotkeyAsync(JsonElement parameters)
    {
        // 支持 ctrl+c, ctrl+shift+s, alt+f4 等
        if (parameters.TryGetProperty("keys", out var keys))
        {
            await PressHotkeyAsync(keys.GetString()!);
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'keys' parameter");
    }

    private async Task<PluginResult> ExecuteWaitAsync(JsonElement parameters)
    {
        var ms = parameters.TryGetProperty("ms", out var m) ? m.GetInt32() : 1000;
        await Task.Delay(ms);
        return PluginResult.Ok();
    }

    private async Task<PluginResult> ExecuteScrollAsync(JsonElement parameters)
    {
        var delta = parameters.TryGetProperty("delta", out var d) ? d.GetInt32() : -120; // 负数向下
        var x = parameters.TryGetProperty("x", out var xp) ? xp.GetInt32() : 0;
        var y = parameters.TryGetProperty("y", out var yp) ? yp.GetInt32() : 0;
        
        if (x > 0 && y > 0) SetCursorPos(x, y);
        await Task.Delay(50);
        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
        await Task.Delay(50);
        return PluginResult.Ok();
    }

    private async Task<PluginResult> ExecuteDragAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("fromX", out var fx) && parameters.TryGetProperty("fromY", out var fy) &&
            parameters.TryGetProperty("toX", out var tx) && parameters.TryGetProperty("toY", out var ty))
        {
            await DragAsync(fx.GetInt32(), fy.GetInt32(), tx.GetInt32(), ty.GetInt32());
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing drag parameters");
    }

    /// <summary>
    /// 执行多步骤操作序列
    /// </summary>
    private async Task<PluginResult> ExecuteStepsAsync(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("steps", out var steps) || steps.ValueKind != JsonValueKind.Array)
        {
            return PluginResult.Fail("Missing 'steps' array");
        }

        var results = new List<object>();
        var stepIndex = 0;

        foreach (var step in steps.EnumerateArray())
        {
            stepIndex++;
            var action = step.TryGetProperty("action", out var a) ? a.GetString() : null;
            if (string.IsNullOrEmpty(action))
            {
                results.Add(new { step = stepIndex, error = "Missing action" });
                continue;
            }

            _context?.Log($"[Step {stepIndex}] {action}");

            try
            {
                switch (action)
                {
                    case "activate":
                        await ActivateAsync();
                        break;

                    case "click":
                        if (step.TryGetProperty("x", out var cx) && step.TryGetProperty("y", out var cy))
                            await ClickPositionAsync(cx.GetInt32(), cy.GetInt32());
                        break;

                    case "double-click":
                        if (step.TryGetProperty("x", out var dcx) && step.TryGetProperty("y", out var dcy))
                            await DoubleClickPositionAsync(dcx.GetInt32(), dcy.GetInt32());
                        break;

                    case "right-click":
                        if (step.TryGetProperty("x", out var rcx) && step.TryGetProperty("y", out var rcy))
                            await RightClickPositionAsync(rcx.GetInt32(), rcy.GetInt32());
                        break;

                    case "type":
                        if (step.TryGetProperty("text", out var text))
                            await TypeTextAsync(text.GetString()!);
                        break;

                    case "press-key":
                        if (step.TryGetProperty("key", out var key))
                            await PressKeyAsync(key.GetString()!);
                        break;

                    case "hotkey":
                        if (step.TryGetProperty("keys", out var hk))
                            await PressHotkeyAsync(hk.GetString()!);
                        break;

                    case "wait":
                        var ms = step.TryGetProperty("ms", out var wms) ? wms.GetInt32() : 1000;
                        await Task.Delay(ms);
                        break;

                    case "scroll":
                        var delta = step.TryGetProperty("delta", out var sd) ? sd.GetInt32() : -120;
                        if (step.TryGetProperty("x", out var sx) && step.TryGetProperty("y", out var sy))
                            SetCursorPos(sx.GetInt32(), sy.GetInt32());
                        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
                        await Task.Delay(50);
                        break;

                    case "drag":
                        if (step.TryGetProperty("fromX", out var dfx) && step.TryGetProperty("fromY", out var dfy) &&
                            step.TryGetProperty("toX", out var dtx) && step.TryGetProperty("toY", out var dty))
                            await DragAsync(dfx.GetInt32(), dfy.GetInt32(), dtx.GetInt32(), dty.GetInt32());
                        break;

                    default:
                        results.Add(new { step = stepIndex, action, error = "Unknown action" });
                        continue;
                }

                results.Add(new { step = stepIndex, action, success = true });
            }
            catch (Exception ex)
            {
                results.Add(new { step = stepIndex, action, error = ex.Message });
            }
        }

        return PluginResult.Ok(new { totalSteps = stepIndex, results });
    }

    // 辅助方法
    private async Task DoubleClickPositionAsync(int x, int y)
    {
        SetCursorPos(x, y);
        await Task.Delay(50);
        for (int i = 0; i < 2; i++)
        {
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
            await Task.Delay(10);
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            await Task.Delay(50);
        }
    }

    private async Task RightClickPositionAsync(int x, int y)
    {
        SetCursorPos(x, y);
        await Task.Delay(50);
        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
        await Task.Delay(10);
        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
        await Task.Delay(50);
    }

    private async Task PressHotkeyAsync(string keys)
    {
        // 解析 ctrl+shift+s 格式
        var parts = keys.ToLower().Split('+');
        var modifiers = new List<byte>();
        byte mainKey = 0;

        foreach (var part in parts)
        {
            switch (part.Trim())
            {
                case "ctrl": modifiers.Add(VK_CONTROL); break;
                case "shift": modifiers.Add(VK_SHIFT); break;
                case "alt": modifiers.Add(VK_ALT); break;
                default: mainKey = GetVirtualKey(part.Trim()); break;
            }
        }

        // 按下修饰键
        foreach (var mod in modifiers)
            keybd_event(mod, 0, 0, UIntPtr.Zero);

        await Task.Delay(20);

        // 按下主键
        if (mainKey != 0)
        {
            keybd_event(mainKey, 0, 0, UIntPtr.Zero);
            await Task.Delay(10);
            keybd_event(mainKey, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }

        await Task.Delay(20);

        // 释放修饰键
        foreach (var mod in modifiers)
            keybd_event(mod, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

        await Task.Delay(50);
    }

    private async Task DragAsync(int fromX, int fromY, int toX, int toY)
    {
        SetCursorPos(fromX, fromY);
        await Task.Delay(50);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        await Task.Delay(50);

        // 平滑移动
        int steps = 10;
        for (int i = 1; i <= steps; i++)
        {
            int x = fromX + (toX - fromX) * i / steps;
            int y = fromY + (toY - fromY) * i / steps;
            SetCursorPos(x, y);
            await Task.Delay(20);
        }

        await Task.Delay(50);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        await Task.Delay(50);
    }

    private PluginResult ExecuteGetMousePosition()
    {
        if (GetCursorPos(out var point))
        {
            return PluginResult.Ok(new { x = point.X, y = point.Y });
        }
        return PluginResult.Fail("Failed to get cursor position");
    }

    private async Task<PluginResult> ExecuteCaptureAndOcrAsync(JsonElement parameters)
    {
        await Task.Delay(100);
        return PluginResult.Ok(new { 
            message = "请通过 window-control 插件执行 capture-screen 和 ocr-screen",
            steps = new[] {
                "1. window-control capture-screen",
                "2. window-control ocr-screen"
            }
        });
    }

    private PluginResult ExecuteGetWindowInfo()
    {
        var hWnd = FindWindsurfWindow();
        if (hWnd == IntPtr.Zero)
            return PluginResult.Fail("Windsurf window not found");

        if (GetWindowRect(hWnd, out var rect))
        {
            var width = rect.Right - rect.Left;
            var height = rect.Bottom - rect.Top;
            
            // Cascade 输入框通常在窗口右下角
            // 相对位置：右侧 15% 宽度区域，底部 5% 高度
            var inputX = rect.Right - (int)(width * 0.08);
            var inputY = rect.Bottom - (int)(height * 0.05);

            return PluginResult.Ok(new {
                handle = hWnd.ToInt64(),
                left = rect.Left,
                top = rect.Top,
                right = rect.Right,
                bottom = rect.Bottom,
                width = width,
                height = height,
                estimatedInputBox = new { x = inputX, y = inputY }
            });
        }
        return PluginResult.Fail("Failed to get window rect");
    }

    private async Task<PluginResult> ExecuteClickInputBoxAsync()
    {
        var hWnd = FindWindsurfWindow();
        if (hWnd == IntPtr.Zero)
            return PluginResult.Fail("Windsurf window not found");

        // 激活窗口（不改变大小）
        ShowWindow(hWnd, SW_SHOW);
        SetForegroundWindow(hWnd);
        await Task.Delay(100);

        if (GetWindowRect(hWnd, out var rect))
        {
            var width = rect.Right - rect.Left;
            var height = rect.Bottom - rect.Top;
            
            // Cascade 输入框位置：右侧面板底部
            // Cascade 面板宽度可变（25%-50%），输入框在面板底部中间
            // 使用右侧 25% 位置作为输入框 X 坐标（适配不同面板宽度）
            var inputX = rect.Right - (int)(width * 0.25);  // 右侧 25% 位置
            var inputY = rect.Bottom - 55; // 距离底部约 55 像素

            await ClickPositionAsync(inputX, inputY);
            return PluginResult.Ok(new { clickedAt = new { x = inputX, y = inputY } });
        }
        return PluginResult.Fail("Failed to get window rect");
    }

    private async Task<PluginResult> ExecuteSendMessageAsync(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("message", out var msgProp))
            return PluginResult.Fail("Missing 'message' parameter");

        var message = msgProp.GetString()!;
        
        // 支持直接传入坐标
        int? x = parameters.TryGetProperty("x", out var xp) ? xp.GetInt32() : null;
        int? y = parameters.TryGetProperty("y", out var yp) ? yp.GetInt32() : null;
        
        // 1. 激活窗口（不改变大小）
        var hWnd = FindWindsurfWindow();
        if (hWnd != IntPtr.Zero)
        {
            ShowWindow(hWnd, SW_SHOW);
            SetForegroundWindow(hWnd);
            await Task.Delay(100);
        }
        
        // 2. 点击输入框（优先级：直接坐标 > 自定义坐标 > 动态计算）
        int clickX, clickY;
        if (x.HasValue && y.HasValue)
        {
            clickX = x.Value;
            clickY = y.Value;
        }
        else if (_customInputX > 0 && _customInputY > 0)
        {
            clickX = _customInputX;
            clickY = _customInputY;
        }
        else
        {
            // 动态计算
            var calc = CalcInputPositionFromWindow();
            if (calc == null)
                return PluginResult.Fail("Cannot find Windsurf window");
            
            var calcObj = (dynamic)calc;
            clickX = (int)calcObj.x;
            clickY = (int)calcObj.y;
        }
        
        await ClickPositionAsync(clickX, clickY);

        await Task.Delay(200);

        // 3. 输入消息
        await TypeTextAsync(message);
        await Task.Delay(100);

        // 4. 按回车发送
        await PressKeyAsync("enter");

        return PluginResult.Ok(new { 
            sent = true, 
            message = message,
            timestamp = DateTime.Now.ToString("HH:mm:ss")
        });
    }

    private PluginResult ExecuteSetInputPosition(JsonElement parameters)
    {
        if (parameters.TryGetProperty("x", out var x) && parameters.TryGetProperty("y", out var y))
        {
            _customInputX = x.GetInt32();
            _customInputY = y.GetInt32();
            return PluginResult.Ok(new { 
                set = true, 
                x = _customInputX, 
                y = _customInputY,
                message = "Input position set. Use 'send-message' to send messages."
            });
        }
        return PluginResult.Fail("Missing 'x' or 'y' parameter");
    }

    private PluginResult ExecuteGetInputPosition()
    {
        return PluginResult.Ok(new { 
            customX = _customInputX, 
            customY = _customInputY,
            isCustomSet = _customInputX > 0 && _customInputY > 0,
            ratioX = _inputBoxRatioX,
            offsetY = _inputBoxOffsetY
        });
    }

    private PluginResult ExecuteSetInputRatio(JsonElement parameters)
    {
        if (parameters.TryGetProperty("ratioX", out var rx))
            _inputBoxRatioX = rx.GetDouble();
        if (parameters.TryGetProperty("offsetY", out var oy))
            _inputBoxOffsetY = oy.GetInt32();
        
        // 立即计算新坐标
        var calcResult = CalcInputPositionFromWindow();
        
        return PluginResult.Ok(new { 
            ratioX = _inputBoxRatioX,
            offsetY = _inputBoxOffsetY,
            calculatedPosition = calcResult
        });
    }

    private PluginResult ExecuteCalcInputPosition()
    {
        var result = CalcInputPositionFromWindow();
        if (result != null)
        {
            return PluginResult.Ok(result);
        }
        return PluginResult.Fail("Cannot calculate: Windsurf window not found");
    }

    private object? CalcInputPositionFromWindow()
    {
        var hWnd = FindWindsurfWindow();
        if (hWnd == IntPtr.Zero) return null;

        if (GetWindowRect(hWnd, out var rect))
        {
            var width = rect.Right - rect.Left;
            var height = rect.Bottom - rect.Top;
            
            // 基于比例计算输入框位置
            var inputX = rect.Right - (int)(width * _inputBoxRatioX);
            var inputY = rect.Bottom - _inputBoxOffsetY;

            return new {
                x = inputX,
                y = inputY,
                window = new {
                    left = rect.Left,
                    top = rect.Top,
                    right = rect.Right,
                    bottom = rect.Bottom,
                    width = width,
                    height = height
                },
                ratio = new {
                    ratioX = _inputBoxRatioX,
                    offsetY = _inputBoxOffsetY
                }
            };
        }
        return null;
    }

    private PluginResult ExecuteGetScreenInfo()
    {
        var screenWidth = GetSystemMetrics(SM_CXSCREEN);
        var screenHeight = GetSystemMetrics(SM_CYSCREEN);
        
        var hWnd = FindWindsurfWindow();
        object? windowInfo = null;
        
        if (hWnd != IntPtr.Zero && GetWindowRect(hWnd, out var rect))
        {
            var width = rect.Right - rect.Left;
            var height = rect.Bottom - rect.Top;
            var isFullScreen = rect.Left <= 0 && rect.Top <= 0 && 
                              width >= screenWidth - 20 && height >= screenHeight - 100;
            
            windowInfo = new {
                left = rect.Left,
                top = rect.Top,
                right = rect.Right,
                bottom = rect.Bottom,
                width = width,
                height = height,
                isFullScreen = isFullScreen
            };
        }
        
        return PluginResult.Ok(new {
            screen = new { width = screenWidth, height = screenHeight },
            window = windowInfo,
            currentRatio = new { ratioX = _inputBoxRatioX, offsetY = _inputBoxOffsetY }
        });
    }

    private PluginResult ExecuteAutoDetect()
    {
        var screenWidth = GetSystemMetrics(SM_CXSCREEN);
        var screenHeight = GetSystemMetrics(SM_CYSCREEN);
        
        var hWnd = FindWindsurfWindow();
        if (hWnd == IntPtr.Zero)
            return PluginResult.Fail("Windsurf window not found");

        if (!GetWindowRect(hWnd, out var rect))
            return PluginResult.Fail("Cannot get window rect");

        var width = rect.Right - rect.Left;
        var height = rect.Bottom - rect.Top;
        var isFullScreen = rect.Left <= 0 && rect.Top <= 0 && 
                          width >= screenWidth - 20 && height >= screenHeight - 100;

        // 根据窗口大小自动推算输入框位置
        // Windsurf Cascade 输入框通常在：
        // - 全屏时：距右边约 25%，距底部约 50-60px
        // - 半屏时：距右边约 15-20%，距底部约 50-60px
        
        double autoRatioX;
        int autoOffsetY;
        
        if (isFullScreen)
        {
            // 全屏模式 - Cascade 面板
            // 输入框在面板底部中间，避开右侧按钮（麦克风、模型选择）
            autoRatioX = 0.18;  // 距右边 18%，更往左避开右侧按钮
            autoOffsetY = 85;   // 距底部 85 像素，避开命令建议按钮
        }
        else
        {
            // 窗口模式 - 根据宽度调整
            var widthRatio = (double)width / screenWidth;
            if (widthRatio > 0.8)
            {
                autoRatioX = 0.15;
                autoOffsetY = 55;
            }
            else if (widthRatio > 0.5)
            {
                autoRatioX = 0.20;
                autoOffsetY = 55;
            }
            else
            {
                autoRatioX = 0.25;
                autoOffsetY = 50;
            }
        }
        
        // 计算坐标
        var inputX = rect.Right - (int)(width * autoRatioX);
        var inputY = rect.Bottom - autoOffsetY;
        
        // 自动更新配置
        _inputBoxRatioX = autoRatioX;
        _inputBoxOffsetY = autoOffsetY;

        return PluginResult.Ok(new {
            detected = true,
            screen = new { width = screenWidth, height = screenHeight },
            window = new {
                left = rect.Left,
                top = rect.Top,
                right = rect.Right,
                bottom = rect.Bottom,
                width = width,
                height = height,
                isFullScreen = isFullScreen
            },
            inputBox = new {
                x = inputX,
                y = inputY,
                ratioX = autoRatioX,
                offsetY = autoOffsetY
            },
            message = isFullScreen ? "全屏模式检测" : $"窗口模式检测 ({width}x{height})"
        });
    }

    private byte GetVirtualKey(string key)
    {
        return key.ToLower() switch
        {
            "enter" => 0x0D,
            "tab" => 0x09,
            "escape" or "esc" => 0x1B,
            "backspace" => 0x08,
            "delete" or "del" => 0x2E,
            "home" => 0x24,
            "end" => 0x23,
            "pageup" => 0x21,
            "pagedown" => 0x22,
            "up" => 0x26,
            "down" => 0x28,
            "left" => 0x25,
            "right" => 0x27,
            "space" => 0x20,
            "f1" => 0x70, "f2" => 0x71, "f3" => 0x72, "f4" => 0x73,
            "f5" => 0x74, "f6" => 0x75, "f7" => 0x76, "f8" => 0x77,
            "f9" => 0x78, "f10" => 0x79, "f11" => 0x7A, "f12" => 0x7B,
            // 字母 A-Z
            _ when key.Length == 1 && char.IsLetter(key[0]) => (byte)(char.ToUpper(key[0])),
            // 数字 0-9
            _ when key.Length == 1 && char.IsDigit(key[0]) => (byte)key[0],
            _ => 0
        };
    }

    #endregion
}

internal class WindsurfConfig
{
    public PositionConfig? InputBoxPosition { get; set; }
    public string? ResultFilePath { get; set; }
}

internal class PositionConfig
{
    public int X { get; set; }
    public int Y { get; set; }
}
