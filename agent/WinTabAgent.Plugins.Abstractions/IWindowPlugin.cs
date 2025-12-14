namespace WinTabAgent.Plugins.Abstractions;

/// <summary>
/// 窗口控制插件接口
/// </summary>
public interface IWindowPlugin : IPlugin
{
    /// <summary>
    /// 获取所有窗口列表
    /// </summary>
    Task<List<WindowInfo>> GetWindowsAsync();

    /// <summary>
    /// 激活窗口
    /// </summary>
    Task ActivateWindowAsync(IntPtr handle);

    /// <summary>
    /// 最小化窗口
    /// </summary>
    Task MinimizeWindowAsync(IntPtr handle);

    /// <summary>
    /// 最大化窗口
    /// </summary>
    Task MaximizeWindowAsync(IntPtr handle);

    /// <summary>
    /// 截取窗口图像
    /// </summary>
    Task<byte[]> CaptureWindowAsync(IntPtr handle);

    /// <summary>
    /// 切换窗口组合
    /// </summary>
    Task SwitchPresetAsync(List<IntPtr> handles);
}

/// <summary>
/// 窗口信息
/// </summary>
public class WindowInfo
{
    public IntPtr Handle { get; set; }
    public string Title { get; set; } = string.Empty;
    public string ProcessName { get; set; } = string.Empty;
    public uint ProcessId { get; set; }
    public bool IsVisible { get; set; }
    public WindowRect Bounds { get; set; } = new();
}

/// <summary>
/// 窗口矩形
/// </summary>
public class WindowRect
{
    public int Left { get; set; }
    public int Top { get; set; }
    public int Right { get; set; }
    public int Bottom { get; set; }

    public int Width => Right - Left;
    public int Height => Bottom - Top;
}
