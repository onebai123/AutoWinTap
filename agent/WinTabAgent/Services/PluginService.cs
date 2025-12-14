using System.Reflection;
using System.Text.Json;
using WinTabAgent.Plugins.Abstractions;

namespace WinTabAgent.Services;

/// <summary>
/// 插件管理服务
/// </summary>
public class PluginService
{
    private readonly Dictionary<string, IPlugin> _plugins = new();
    private readonly IPluginContext _context;
    private readonly string _pluginsPath;

    public PluginService(IPluginContext context, string? pluginsPath = null)
    {
        _context = context;
        _pluginsPath = pluginsPath ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "plugins");
    }

    /// <summary>
    /// 加载所有插件
    /// </summary>
    public async Task LoadPluginsAsync()
    {
        _context.Log($"Loading plugins from {_pluginsPath}");

        if (!Directory.Exists(_pluginsPath))
        {
            Directory.CreateDirectory(_pluginsPath);
            _context.Log("Plugins directory created");
            return;
        }

        // 扫描插件目录
        var pluginDirs = Directory.GetDirectories(_pluginsPath);
        foreach (var dir in pluginDirs)
        {
            await LoadPluginFromDirectoryAsync(dir);
        }

        _context.Log($"Loaded {_plugins.Count} plugins");
    }

    private async Task LoadPluginFromDirectoryAsync(string directory)
    {
        var pluginJsonPath = Path.Combine(directory, "plugin.json");
        if (!File.Exists(pluginJsonPath))
        {
            _context.Log($"No plugin.json found in {directory}", LogLevel.Warning);
            return;
        }

        try
        {
            var json = await File.ReadAllTextAsync(pluginJsonPath);
            var manifest = JsonSerializer.Deserialize<PluginManifest>(json);

            if (manifest == null)
            {
                _context.Log($"Invalid plugin.json in {directory}", LogLevel.Error);
                return;
            }

            var dllPath = Path.Combine(directory, manifest.Entry);
            if (!File.Exists(dllPath))
            {
                _context.Log($"Plugin DLL not found: {dllPath}", LogLevel.Error);
                return;
            }

            // 加载程序集
            var assembly = Assembly.LoadFrom(dllPath);
            var pluginType = assembly.GetTypes()
                .FirstOrDefault(t => typeof(IPlugin).IsAssignableFrom(t) && !t.IsInterface);

            if (pluginType == null)
            {
                _context.Log($"No IPlugin implementation found in {dllPath}", LogLevel.Error);
                return;
            }

            // 创建插件实例
            var plugin = (IPlugin?)Activator.CreateInstance(pluginType);
            if (plugin == null)
            {
                _context.Log($"Failed to create plugin instance: {pluginType.Name}", LogLevel.Error);
                return;
            }

            // 初始化插件
            await plugin.InitializeAsync(_context);
            _plugins[plugin.Id] = plugin;

            _context.Log($"Loaded plugin: {plugin.Name} v{plugin.Version}");
        }
        catch (Exception ex)
        {
            _context.Log($"Failed to load plugin from {directory}: {ex.Message}", LogLevel.Error);
        }
    }

    /// <summary>
    /// 注册内置插件
    /// </summary>
    public async Task RegisterBuiltinPluginAsync(IPlugin plugin)
    {
        await plugin.InitializeAsync(_context);
        _plugins[plugin.Id] = plugin;
        _context.Log($"Registered builtin plugin: {plugin.Name} v{plugin.Version}");
    }

    /// <summary>
    /// 获取插件
    /// </summary>
    public IPlugin? GetPlugin(string id)
    {
        return _plugins.TryGetValue(id, out var plugin) ? plugin : null;
    }

    /// <summary>
    /// 获取所有已加载的插件
    /// </summary>
    public IEnumerable<IPlugin> GetAllPlugins()
    {
        return _plugins.Values;
    }

    /// <summary>
    /// 获取已加载插件的 ID 列表
    /// </summary>
    public List<string> GetPluginIds()
    {
        return _plugins.Keys.ToList();
    }

    /// <summary>
    /// 执行插件动作
    /// </summary>
    public async Task<PluginResult> ExecuteAsync(string pluginId, string action, JsonElement parameters)
    {
        var plugin = GetPlugin(pluginId);
        if (plugin == null)
        {
            return PluginResult.Fail($"Plugin not found: {pluginId}");
        }

        try
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var result = await plugin.ExecuteAsync(action, parameters);
            sw.Stop();
            result.Duration = sw.ElapsedMilliseconds;
            return result;
        }
        catch (Exception ex)
        {
            return PluginResult.Fail($"Plugin execution failed: {ex.Message}");
        }
    }

    /// <summary>
    /// 关闭所有插件
    /// </summary>
    public async Task ShutdownAllAsync()
    {
        foreach (var plugin in _plugins.Values)
        {
            try
            {
                await plugin.ShutdownAsync();
                _context.Log($"Shutdown plugin: {plugin.Name}");
            }
            catch (Exception ex)
            {
                _context.Log($"Failed to shutdown plugin {plugin.Name}: {ex.Message}", LogLevel.Error);
            }
        }
        _plugins.Clear();
    }
}

/// <summary>
/// 插件清单
/// </summary>
public class PluginManifest
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Author { get; set; } = string.Empty;
    public string Entry { get; set; } = string.Empty;
    public List<string> Dependencies { get; set; } = new();
    public List<string> Capabilities { get; set; } = new();
}
