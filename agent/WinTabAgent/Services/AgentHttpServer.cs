using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using WinTabAgent.Plugins.Abstractions;

namespace WinTabAgent.Services;

/// <summary>
/// IntPtr JSON 转换器
/// </summary>
public class IntPtrConverter : JsonConverter<IntPtr>
{
    public override IntPtr Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return new IntPtr(reader.GetInt64());
    }

    public override void Write(Utf8JsonWriter writer, IntPtr value, JsonSerializerOptions options)
    {
        writer.WriteNumberValue(value.ToInt64());
    }
}

/// <summary>
/// Agent HTTP 服务器 - 接收来自 Server 的命令
/// </summary>
public class AgentHttpServer : IDisposable
{
    private readonly PluginService _pluginService;
    private readonly IPluginContext _context;
    private readonly HttpListener _listener;
    private readonly int _port;
    private readonly JsonSerializerOptions _jsonOptions;
    private CancellationTokenSource? _cts;
    private Task? _listenTask;

    public int Port => _port;

    public AgentHttpServer(PluginService pluginService, IPluginContext context, int port = 5100)
    {
        _pluginService = pluginService;
        _context = context;
        _port = port;
        _listener = new HttpListener();
        _listener.Prefixes.Add($"http://+:{_port}/");
        _jsonOptions = new JsonSerializerOptions
        {
            Converters = { new IntPtrConverter() },
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };
    }

    public void Start()
    {
        try
        {
            _listener.Start();
            _cts = new CancellationTokenSource();
            _listenTask = ListenAsync(_cts.Token);
            _context.Log($"Agent HTTP Server started on port {_port}");
        }
        catch (HttpListenerException ex)
        {
            _context.Log($"Failed to start HTTP server: {ex.Message}", LogLevel.Error);
            _context.Log("Try running as Administrator or use: netsh http add urlacl url=http://+:5100/ user=Everyone", LogLevel.Warning);
        }
    }

    public void Stop()
    {
        _cts?.Cancel();
        _listener.Stop();
        _context.Log("Agent HTTP Server stopped");
    }

    private async Task ListenAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var ctx = await _listener.GetContextAsync();
                _ = HandleRequestAsync(ctx);
            }
            catch (HttpListenerException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _context.Log($"HTTP error: {ex.Message}", LogLevel.Error);
            }
        }
    }

    private async Task HandleRequestAsync(HttpListenerContext ctx)
    {
        var req = ctx.Request;
        var resp = ctx.Response;

        try
        {
            // CORS
            resp.Headers.Add("Access-Control-Allow-Origin", "*");
            resp.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            resp.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

            if (req.HttpMethod == "OPTIONS")
            {
                resp.StatusCode = 200;
                resp.Close();
                return;
            }

            var path = req.Url?.AbsolutePath ?? "/";
            _context.Log($"HTTP {req.HttpMethod} {path}", LogLevel.Debug);

            object result;

            if (path == "/health")
            {
                result = new { status = "ok", plugins = _pluginService.GetPluginIds() };
            }
            else if (path == "/execute" && req.HttpMethod == "POST")
            {
                result = await HandleExecuteAsync(req);
            }
            else if (path == "/screen" && req.HttpMethod == "GET")
            {
                result = await HandleScreenAsync();
            }
            else
            {
                resp.StatusCode = 404;
                result = new { error = "Not found" };
            }

            var json = JsonSerializer.Serialize(result, _jsonOptions);
            var buffer = Encoding.UTF8.GetBytes(json);
            resp.ContentType = "application/json";
            resp.ContentLength64 = buffer.Length;
            await resp.OutputStream.WriteAsync(buffer);
        }
        catch (Exception ex)
        {
            _context.Log($"Request error: {ex.Message}", LogLevel.Error);
            resp.StatusCode = 500;
            var error = Encoding.UTF8.GetBytes($"{{\"error\":\"{ex.Message}\"}}");
            resp.ContentType = "application/json";
            await resp.OutputStream.WriteAsync(error);
        }
        finally
        {
            resp.Close();
        }
    }

    private async Task<object> HandleExecuteAsync(HttpListenerRequest req)
    {
        using var reader = new StreamReader(req.InputStream);
        var body = await reader.ReadToEndAsync();
        
        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;

        var plugin = root.GetProperty("plugin").GetString()!;
        var action = root.GetProperty("action").GetString()!;
        var parameters = root.TryGetProperty("params", out var p) ? p : default;

        _context.Log($"Execute: {plugin}.{action}");
        var result = await _pluginService.ExecuteAsync(plugin, action, parameters);

        return new
        {
            success = result.Success,
            data = result.Data,
            error = result.Error,
            duration = result.Duration
        };
    }

    private async Task<object> HandleScreenAsync()
    {
        var plugin = _pluginService.GetPlugin("window-control");
        if (plugin == null)
        {
            return new { success = false, error = "window-control plugin not found" };
        }

        var result = await plugin.ExecuteAsync("capture-screen", default);
        return new
        {
            success = result.Success,
            data = result.Data,
            error = result.Error
        };
    }

    public void Dispose()
    {
        Stop();
        _listener.Close();
    }
}
