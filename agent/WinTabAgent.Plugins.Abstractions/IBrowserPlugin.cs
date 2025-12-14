namespace WinTabAgent.Plugins.Abstractions;

/// <summary>
/// 浏览器调试插件接口
/// </summary>
public interface IBrowserPlugin : IPlugin
{
    /// <summary>
    /// 获取所有浏览器页面
    /// </summary>
    Task<List<BrowserPage>> GetPagesAsync();

    /// <summary>
    /// 连接到页面
    /// </summary>
    Task ConnectPageAsync(string pageId);

    /// <summary>
    /// 断开页面连接
    /// </summary>
    Task DisconnectPageAsync(string pageId);

    /// <summary>
    /// 执行 JavaScript
    /// </summary>
    Task<string> ExecuteScriptAsync(string pageId, string script);

    /// <summary>
    /// 获取 Console 日志
    /// </summary>
    Task<List<ConsoleMessage>> GetConsoleMessagesAsync(string pageId);

    /// <summary>
    /// 获取网络请求
    /// </summary>
    Task<List<NetworkRequest>> GetNetworkRequestsAsync(string pageId, string? urlFilter = null);
}

/// <summary>
/// 浏览器页面信息
/// </summary>
public class BrowserPage
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string WebSocketDebuggerUrl { get; set; } = string.Empty;
    public bool IsConnected { get; set; }
}

/// <summary>
/// Console 消息
/// </summary>
public class ConsoleMessage
{
    public string Level { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}

/// <summary>
/// 网络请求
/// </summary>
public class NetworkRequest
{
    public string RequestId { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Method { get; set; } = string.Empty;
    public int StatusCode { get; set; }
    public string Type { get; set; } = string.Empty;
    public long Duration { get; set; }
    public string? RequestBody { get; set; }
    public string? ResponseBody { get; set; }
}
