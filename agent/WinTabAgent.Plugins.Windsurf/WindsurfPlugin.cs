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

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    private const int SW_RESTORE = 9;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const byte VK_RETURN = 0x0D;

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
            "type" => await ExecuteTypeAsync(parameters),
            "press-key" => await ExecutePressKeyAsync(parameters),
            "execute-task" => await ExecuteTaskActionAsync(parameters),
            _ => PluginResult.Fail($"Unknown action: {action}")
        };
    }

    public IEnumerable<string> GetSupportedActions()
    {
        return new[] { "is-running", "activate", "click", "type", "press-key", "execute-task" };
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

        ShowWindow(handle, SW_RESTORE);
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
        // 使用 SendKeys 或剪贴板
        System.Windows.Forms.Clipboard.SetText(text);
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
