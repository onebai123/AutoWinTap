using System.Runtime.InteropServices;
using WinTabAgent.Plugins.Abstractions;

namespace WinTabAgent.Services;

/// <summary>
/// 全局热键服务 - 监听 Alt+1~9 切换窗口组合
/// </summary>
public class HotkeyService : IDisposable
{
    private readonly PluginService _pluginService;
    private readonly IPluginContext _context;
    private readonly string _serverUrl;
    private readonly HttpClient _http = new();
    private readonly Dictionary<int, PresetInfo> _presets = new();
    private Thread? _messageThread;
    private IntPtr _windowHandle;
    private bool _running;

    // Win32 API
    [DllImport("user32.dll")]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll")]
    private static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern IntPtr CreateWindowEx(uint dwExStyle, string lpClassName, string lpWindowName,
        uint dwStyle, int x, int y, int nWidth, int nHeight, IntPtr hWndParent, IntPtr hMenu, IntPtr hInstance, IntPtr lpParam);

    [DllImport("user32.dll")]
    private static extern bool DestroyWindow(IntPtr hWnd);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public POINT pt;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int x;
        public int y;
    }

    private const uint MOD_ALT = 0x0001;
    private const uint WM_HOTKEY = 0x0312;
    private const uint VK_1 = 0x31;

    private class PresetInfo
    {
        public string Name { get; set; } = "";
        public List<long> Handles { get; set; } = new();
    }

    public HotkeyService(PluginService pluginService, IPluginContext context, string serverUrl)
    {
        _pluginService = pluginService;
        _context = context;
        _serverUrl = serverUrl;
    }

    public void Start()
    {
        _running = true;
        _messageThread = new Thread(MessageLoop) { IsBackground = true };
        _messageThread.Start();
        _context.Log("[Hotkey] 全局热键服务已启动 (Alt+1~9)");
    }

    public void Stop()
    {
        _running = false;
        if (_windowHandle != IntPtr.Zero)
        {
            // 注销所有热键
            for (int i = 1; i <= 9; i++)
            {
                UnregisterHotKey(_windowHandle, i);
            }
            DestroyWindow(_windowHandle);
        }
        _context.Log("[Hotkey] 全局热键服务已停止");
    }

    private void MessageLoop()
    {
        // 创建消息窗口
        _windowHandle = CreateWindowEx(0, "STATIC", "WinTabHotkeyWindow", 0, 0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);

        // 注册 Alt+1 到 Alt+9
        for (int i = 1; i <= 9; i++)
        {
            RegisterHotKey(_windowHandle, i, MOD_ALT, (uint)(VK_1 + i - 1));
        }

        // 加载预设
        _ = LoadPresetsAsync();

        // 消息循环
        while (_running)
        {
            if (GetMessage(out MSG msg, IntPtr.Zero, 0, 0) > 0)
            {
                if (msg.message == WM_HOTKEY)
                {
                    int id = (int)msg.wParam;
                    OnHotkey(id);
                }
            }
        }
    }

    private async Task LoadPresetsAsync()
    {
        try
        {
            var response = await _http.GetStringAsync($"{_serverUrl}/api/presets");
            var json = System.Text.Json.JsonDocument.Parse(response);
            
            if (json.RootElement.TryGetProperty("data", out var data))
            {
                _presets.Clear();
                foreach (var preset in data.EnumerateArray())
                {
                    var hotkey = preset.GetProperty("hotkey").GetString();
                    if (string.IsNullOrEmpty(hotkey)) continue;

                    // 解析 Alt+1 格式
                    if (hotkey.StartsWith("Alt+") && int.TryParse(hotkey[4..], out int num) && num >= 1 && num <= 9)
                    {
                        var handles = new List<long>();
                        foreach (var win in preset.GetProperty("windows").EnumerateArray())
                        {
                            handles.Add(win.GetProperty("handle").GetInt64());
                        }

                        _presets[num] = new PresetInfo
                        {
                            Name = preset.GetProperty("name").GetString() ?? "",
                            Handles = handles
                        };
                    }
                }
                _context.Log($"[Hotkey] 已加载 {_presets.Count} 个热键预设");
            }
        }
        catch (Exception ex)
        {
            _context.Log($"[Hotkey] 加载预设失败: {ex.Message}", LogLevel.Warning);
        }
    }

    public async Task ReloadPresetsAsync()
    {
        await LoadPresetsAsync();
    }

    private async void OnHotkey(int id)
    {
        _context.Log($"[Hotkey] 检测到 Alt+{id}");

        if (_presets.TryGetValue(id, out var preset))
        {
            _context.Log($"[Hotkey] 激活预设: {preset.Name}");
            
            // 执行窗口切换
            var handles = preset.Handles.Select(h => new IntPtr(h)).ToList();
            await _pluginService.ExecuteAsync("window-control", "switch-preset", 
                System.Text.Json.JsonSerializer.SerializeToElement(new { handles = preset.Handles }));
        }
        else
        {
            // 没有配置该热键，刷新预设
            await LoadPresetsAsync();
            if (_presets.TryGetValue(id, out preset))
            {
                _context.Log($"[Hotkey] 激活预设: {preset.Name}");
                await _pluginService.ExecuteAsync("window-control", "switch-preset",
                    System.Text.Json.JsonSerializer.SerializeToElement(new { handles = preset.Handles }));
            }
        }
    }

    public void Dispose()
    {
        Stop();
        _http.Dispose();
    }
}
