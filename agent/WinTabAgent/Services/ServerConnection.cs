using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using WinTabAgent.Models;
using WinTabAgent.Plugins.Abstractions;

namespace WinTabAgent.Services;

/// <summary>
/// Server 连接服务
/// </summary>
public class ServerConnection : IDisposable
{
    private readonly AgentConfig _config;
    private readonly PluginService _pluginService;
    private readonly IPluginContext _context;
    private readonly HttpClient _http = new();
    private ClientWebSocket? _ws;
    private CancellationTokenSource? _cts;
    private bool _isConnected;
    private string? _deviceId;

    public bool IsConnected => _isConnected;
    public string? DeviceId => _deviceId;

    public event Action<string>? OnMessage;

    public ServerConnection(AgentConfig config, PluginService pluginService, IPluginContext context)
    {
        _config = config;
        _pluginService = pluginService;
        _context = context;
    }

    public async Task ConnectAsync()
    {
        if (_isConnected)
        {
            _context.Log("Already connected");
            return;
        }

        try
        {
            // 1. 注册
            await RegisterAsync();

            // 2. WebSocket
            await ConnectWebSocketAsync();

            // 3. 心跳
            StartHeartbeat();

            // 4. 接收消息
            _ = ReceiveMessagesAsync();

            _isConnected = true;
            _context.Log("Connected to Server!", LogLevel.Info);
        }
        catch (Exception ex)
        {
            _context.Log($"Connect failed: {ex.Message}", LogLevel.Error);
            throw;
        }
    }

    public async Task DisconnectAsync()
    {
        _cts?.Cancel();
        if (_ws?.State == WebSocketState.Open)
        {
            await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Bye", CancellationToken.None);
        }
        _ws?.Dispose();
        _ws = null;
        _isConnected = false;
        _context.Log("Disconnected");
    }

    private async Task RegisterAsync()
    {
        var baseUrl = _config.Server.Url.Replace("ws://", "http://").Replace("wss://", "https://");
        var url = $"{baseUrl}/api/agents/register";

        var payload = new
        {
            machineId = $"{Environment.MachineName}-{Environment.UserName}",
            hostname = Environment.MachineName,
            ip = GetLocalIp(),
            os = Environment.OSVersion.ToString(),
            agentVersion = "1.0.0",
            plugins = _pluginService.GetPluginIds()
        };

        var json = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        _context.Log($"Registering...");
        var resp = await _http.PostAsync(url, content);
        var respJson = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            throw new Exception($"Register failed: {resp.StatusCode}");

        using var doc = JsonDocument.Parse(respJson);
        if (doc.RootElement.TryGetProperty("data", out var data) &&
            data.TryGetProperty("id", out var id))
        {
            _deviceId = id.GetString();
            _context.Log($"Registered: {_deviceId}");
        }
    }

    private async Task ConnectWebSocketAsync()
    {
        _ws = new ClientWebSocket();
        _cts = new CancellationTokenSource();

        var wsUrl = _config.Server.Url.TrimEnd('/');
        _context.Log($"WebSocket connecting...");

        try
        {
            await _ws.ConnectAsync(new Uri(wsUrl), _cts.Token);
            _context.Log("WebSocket connected");

            await SendAsync(new { type = "agent:connect", deviceId = _deviceId });
        }
        catch (Exception ex)
        {
            _context.Log($"WebSocket failed: {ex.Message}", LogLevel.Warning);
        }
    }

    private void StartHeartbeat()
    {
        _ = Task.Run(async () =>
        {
            var baseUrl = _config.Server.Url.Replace("ws://", "http://").Replace("wss://", "https://");
            var url = $"{baseUrl}/api/agents/heartbeat";

            while (!_cts!.Token.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(_config.Server.ReconnectInterval, _cts.Token);
                    var json = JsonSerializer.Serialize(new { deviceId = _deviceId });
                    await _http.PostAsync(url, new StringContent(json, Encoding.UTF8, "application/json"), _cts.Token);
                }
                catch (TaskCanceledException) { break; }
                catch { }
            }
        });
    }

    private async Task ReceiveMessagesAsync()
    {
        if (_ws == null) return;
        var buffer = new byte[8192];

        try
        {
            while (_ws.State == WebSocketState.Open && !_cts!.Token.IsCancellationRequested)
            {
                var result = await _ws.ReceiveAsync(buffer, _cts.Token);
                if (result.MessageType == WebSocketMessageType.Close) break;

                var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                await HandleMessageAsync(json);
            }
        }
        catch (Exception ex)
        {
            _context.Log($"Receive error: {ex.Message}", LogLevel.Error);
        }
    }

    private async Task HandleMessageAsync(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var t)) return;

            var type = t.GetString();
            _context.Log($"Received: {type}", LogLevel.Debug);
            OnMessage?.Invoke(json);

            switch (type)
            {
                case "task:execute":
                    await HandleTaskAsync(root);
                    break;
                case "screen:request":
                    await HandleScreenRequestAsync();
                    break;
            }
        }
        catch { }
    }

    private async Task HandleTaskAsync(JsonElement msg)
    {
        if (!msg.TryGetProperty("taskId", out var tid) ||
            !msg.TryGetProperty("plugin", out var plug) ||
            !msg.TryGetProperty("action", out var act))
            return;

        var taskId = tid.GetString()!;
        var pluginId = plug.GetString()!;
        var action = act.GetString()!;
        var parameters = msg.TryGetProperty("params", out var p) ? p : default;

        _context.Log($"Task: {pluginId}.{action}");
        var result = await _pluginService.ExecuteAsync(pluginId, action, parameters);

        await SendAsync(new
        {
            type = "task:result",
            taskId,
            success = result.Success,
            data = result.Data,
            error = result.Error
        });
    }

    private async Task HandleScreenRequestAsync()
    {
        var plugin = _pluginService.GetPlugin("window-control");
        if (plugin == null) return;

        var result = await plugin.ExecuteAsync("capture-screen", default);
        if (result.Success && result.Data != null)
        {
            await SendAsync(new
            {
                type = "screen:frame",
                deviceId = _deviceId,
                data = result.Data
            });
        }
    }

    public async Task SendAsync(object data)
    {
        if (_ws?.State != WebSocketState.Open) return;
        var json = JsonSerializer.Serialize(data);
        var bytes = Encoding.UTF8.GetBytes(json);
        await _ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
    }

    private static string GetLocalIp()
    {
        try
        {
            var host = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
            foreach (var ip in host.AddressList)
            {
                if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    return ip.ToString();
            }
        }
        catch { }
        return "127.0.0.1";
    }

    public void Dispose()
    {
        _cts?.Cancel();
        _ws?.Dispose();
        _http.Dispose();
    }
}
