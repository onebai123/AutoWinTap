using System.Text.Json;

namespace WinTabAgent.Plugins.Abstractions;

/// <summary>
/// 插件基础接口
/// </summary>
public interface IPlugin
{
    /// <summary>
    /// 插件唯一标识
    /// </summary>
    string Id { get; }

    /// <summary>
    /// 插件名称
    /// </summary>
    string Name { get; }

    /// <summary>
    /// 插件版本
    /// </summary>
    string Version { get; }

    /// <summary>
    /// 插件描述
    /// </summary>
    string Description { get; }

    /// <summary>
    /// 插件作者
    /// </summary>
    string Author { get; }

    /// <summary>
    /// 初始化插件
    /// </summary>
    Task InitializeAsync(IPluginContext context);

    /// <summary>
    /// 关闭插件
    /// </summary>
    Task ShutdownAsync();

    /// <summary>
    /// 执行插件动作
    /// </summary>
    /// <param name="action">动作名称</param>
    /// <param name="parameters">参数 (JSON)</param>
    /// <returns>执行结果</returns>
    Task<PluginResult> ExecuteAsync(string action, JsonElement parameters);

    /// <summary>
    /// 获取支持的动作列表
    /// </summary>
    IEnumerable<string> GetSupportedActions();
}

/// <summary>
/// 插件执行结果
/// </summary>
public class PluginResult
{
    public bool Success { get; set; }
    public object? Data { get; set; }
    public string? Error { get; set; }
    public long Duration { get; set; }

    public static PluginResult Ok(object? data = null) => new() { Success = true, Data = data };
    public static PluginResult Fail(string error) => new() { Success = false, Error = error };
}

/// <summary>
/// 插件上下文
/// </summary>
public interface IPluginContext
{
    /// <summary>
    /// 获取配置值
    /// </summary>
    T? GetConfig<T>(string key);

    /// <summary>
    /// 日志记录
    /// </summary>
    void Log(string message, LogLevel level = LogLevel.Info);

    /// <summary>
    /// 发布事件
    /// </summary>
    void PublishEvent(string eventName, object data);

    /// <summary>
    /// 订阅事件
    /// </summary>
    void SubscribeEvent(string eventName, Action<object> handler);
}

/// <summary>
/// 日志级别
/// </summary>
public enum LogLevel
{
    Debug,
    Info,
    Warning,
    Error
}
