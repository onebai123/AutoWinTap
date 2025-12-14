using System.Text.Json;
using WinTabAgent.Plugins.Abstractions;
using WinTabAgent.Models;

namespace WinTabAgent.Services;

/// <summary>
/// 默认插件上下文实现
/// </summary>
public class DefaultPluginContext : IPluginContext
{
    private readonly AgentConfig _config;
    private readonly Dictionary<string, List<Action<object>>> _eventHandlers = new();

    public DefaultPluginContext(AgentConfig config)
    {
        _config = config;
    }

    public T? GetConfig<T>(string key)
    {
        try
        {
            var json = JsonSerializer.Serialize(_config);
            var doc = JsonDocument.Parse(json);
            
            if (doc.RootElement.TryGetProperty(key, out var element))
            {
                return JsonSerializer.Deserialize<T>(element.GetRawText());
            }
        }
        catch
        {
            // 忽略配置获取错误
        }
        return default;
    }

    public void Log(string message, LogLevel level = LogLevel.Info)
    {
        var prefix = level switch
        {
            LogLevel.Debug => "[DEBUG]",
            LogLevel.Info => "[INFO]",
            LogLevel.Warning => "[WARN]",
            LogLevel.Error => "[ERROR]",
            _ => "[INFO]"
        };

        var color = level switch
        {
            LogLevel.Debug => ConsoleColor.Gray,
            LogLevel.Info => ConsoleColor.White,
            LogLevel.Warning => ConsoleColor.Yellow,
            LogLevel.Error => ConsoleColor.Red,
            _ => ConsoleColor.White
        };

        var originalColor = Console.ForegroundColor;
        Console.ForegroundColor = color;
        Console.WriteLine($"{DateTime.Now:HH:mm:ss} {prefix} {message}");
        Console.ForegroundColor = originalColor;
    }

    public void PublishEvent(string eventName, object data)
    {
        if (_eventHandlers.TryGetValue(eventName, out var handlers))
        {
            foreach (var handler in handlers)
            {
                try
                {
                    handler(data);
                }
                catch (Exception ex)
                {
                    Log($"Event handler error: {ex.Message}", LogLevel.Error);
                }
            }
        }
    }

    public void SubscribeEvent(string eventName, Action<object> handler)
    {
        if (!_eventHandlers.ContainsKey(eventName))
        {
            _eventHandlers[eventName] = new List<Action<object>>();
        }
        _eventHandlers[eventName].Add(handler);
    }
}
