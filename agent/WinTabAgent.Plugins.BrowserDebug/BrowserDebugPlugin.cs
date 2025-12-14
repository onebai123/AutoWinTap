using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using WinTabAgent.Plugins.Abstractions;

namespace WinTabAgent.Plugins.BrowserDebug;

/// <summary>
/// Chrome 浏览器调试插件
/// 通过 Chrome DevTools Protocol (CDP) 实现
/// 
/// 使用前需要启动 Chrome:
/// chrome.exe --remote-debugging-port=9222
/// </summary>
public class BrowserDebugPlugin : IBrowserPlugin
{
    private IPluginContext? _context;
    private readonly HttpClient _http = new();
    private readonly Dictionary<string, ClientWebSocket> _connections = new();
    private readonly Dictionary<string, List<ConsoleMessage>> _consoleMessages = new();
    private readonly Dictionary<string, List<NetworkRequest>> _networkRequests = new();
    private readonly Dictionary<string, List<DomChange>> _domChanges = new();
    private int _messageId = 1;
    private int _debugPort = 9222;

    #region IPlugin

    public string Id => "browser-debug";
    public string Name => "浏览器调试插件";
    public string Version => "1.0.0";
    public string Description => "Chrome DevTools Protocol: Console 日志、网络请求、JS 执行";
    public string Author => "WinTab Team";

    public Task InitializeAsync(IPluginContext context)
    {
        _context = context;
        var config = context.GetConfig<BrowserDebugConfig>("Plugins.BrowserDebug");
        if (config != null)
        {
            _debugPort = config.Port;
        }
        _context.Log($"[{Name}] Initialized, debug port: {_debugPort}");
        return Task.CompletedTask;
    }

    public async Task ShutdownAsync()
    {
        foreach (var ws in _connections.Values)
        {
            if (ws.State == WebSocketState.Open)
            {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Shutdown", CancellationToken.None);
            }
            ws.Dispose();
        }
        _connections.Clear();
        _context?.Log($"[{Name}] Shutdown");
    }

    public async Task<PluginResult> ExecuteAsync(string action, JsonElement parameters)
    {
        return action switch
        {
            "get-pages" => PluginResult.Ok(await GetPagesAsync()),
            "connect" => await ExecuteConnectAsync(parameters),
            "disconnect" => await ExecuteDisconnectAsync(parameters),
            "execute-script" => await ExecuteScriptActionAsync(parameters),
            "get-console" => await ExecuteGetConsoleAsync(parameters),
            "get-network" => await ExecuteGetNetworkAsync(parameters),
            "get-dom-changes" => await ExecuteGetDomChangesAsync(parameters),
            "get-html" => await ExecuteGetHtmlAsync(parameters),
            "get-elements" => await ExecuteGetElementsAsync(parameters),
            "get-element-style" => await ExecuteGetElementStyleAsync(parameters),
            "highlight-element" => await ExecuteHighlightElementAsync(parameters),
            _ => PluginResult.Fail($"Unknown action: {action}")
        };
    }

    public IEnumerable<string> GetSupportedActions()
    {
        return new[] { "get-pages", "connect", "disconnect", "execute-script", "get-console", "get-network", "get-dom-changes", "get-html", "get-elements", "get-element-style", "highlight-element" };
    }

    #endregion

    #region IBrowserPlugin

    public async Task<List<BrowserPage>> GetPagesAsync()
    {
        try
        {
            var json = await _http.GetStringAsync($"http://localhost:{_debugPort}/json");
            var pages = JsonSerializer.Deserialize<List<ChromePage>>(json) ?? new();

            return pages
                .Where(p => p.Type == "page")
                .Select(p => new BrowserPage
                {
                    Id = p.Id,
                    Title = p.Title,
                    Url = p.Url,
                    Type = p.Type,
                    WebSocketDebuggerUrl = p.WebSocketDebuggerUrl,
                    IsConnected = _connections.ContainsKey(p.Id)
                })
                .ToList();
        }
        catch (Exception ex)
        {
            _context?.Log($"Failed to get pages: {ex.Message}", LogLevel.Error);
            return new List<BrowserPage>();
        }
    }

    public async Task ConnectPageAsync(string pageId)
    {
        if (_connections.ContainsKey(pageId))
        {
            _context?.Log($"Already connected to page: {pageId}");
            return;
        }

        var pages = await GetPagesAsync();
        var page = pages.FirstOrDefault(p => p.Id == pageId);
        if (page == null || string.IsNullOrEmpty(page.WebSocketDebuggerUrl))
        {
            throw new Exception($"Page not found: {pageId}");
        }

        var ws = new ClientWebSocket();
        await ws.ConnectAsync(new Uri(page.WebSocketDebuggerUrl), CancellationToken.None);
        _connections[pageId] = ws;
        _consoleMessages[pageId] = new List<ConsoleMessage>();
        _networkRequests[pageId] = new List<NetworkRequest>();
        _domChanges[pageId] = new List<DomChange>();

        // 启用 Console、Network 和 DOM
        await SendCommandAsync(ws, "Console.enable", new { });
        await SendCommandAsync(ws, "Network.enable", new { });
        await SendCommandAsync(ws, "DOM.enable", new { });
        
        // 注入 MutationObserver 监听 DOM 变化
        await SendCommandAsync(ws, "Runtime.evaluate", new
        {
            expression = @"
                if (!window.__wintabDomObserver) {
                    window.__wintabDomChanges = [];
                    window.__wintabDomObserver = new MutationObserver((mutations) => {
                        mutations.forEach(m => {
                            window.__wintabDomChanges.push({
                                type: m.type,
                                target: m.target.nodeName + (m.target.id ? '#' + m.target.id : ''),
                                added: m.addedNodes.length,
                                removed: m.removedNodes.length,
                                attribute: m.attributeName,
                                time: Date.now()
                            });
                            if (window.__wintabDomChanges.length > 100) {
                                window.__wintabDomChanges.shift();
                            }
                        });
                    });
                    window.__wintabDomObserver.observe(document.body, {
                        childList: true, subtree: true, attributes: true, characterData: true
                    });
                    'DOM Observer installed';
                }
            "
        });

        // 启动消息接收
        _ = ReceiveMessagesAsync(pageId, ws);

        _context?.Log($"Connected to page: {page.Title}");
    }

    public async Task DisconnectPageAsync(string pageId)
    {
        if (_connections.TryGetValue(pageId, out var ws))
        {
            if (ws.State == WebSocketState.Open)
            {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Disconnect", CancellationToken.None);
            }
            ws.Dispose();
            _connections.Remove(pageId);
            _consoleMessages.Remove(pageId);
            _networkRequests.Remove(pageId);
            _context?.Log($"Disconnected from page: {pageId}");
        }
    }

    public async Task<string> ExecuteScriptAsync(string pageId, string script)
    {
        if (!_connections.TryGetValue(pageId, out var ws))
        {
            throw new Exception($"Not connected to page: {pageId}");
        }

        var result = await SendCommandAsync(ws, "Runtime.evaluate", new
        {
            expression = script,
            returnByValue = true
        });

        return result;
    }

    public Task<List<ConsoleMessage>> GetConsoleMessagesAsync(string pageId)
    {
        if (_consoleMessages.TryGetValue(pageId, out var messages))
        {
            return Task.FromResult(messages.ToList());
        }
        return Task.FromResult(new List<ConsoleMessage>());
    }

    public Task<List<NetworkRequest>> GetNetworkRequestsAsync(string pageId, string? urlFilter = null)
    {
        if (_networkRequests.TryGetValue(pageId, out var requests))
        {
            var filtered = requests.AsEnumerable();
            if (!string.IsNullOrEmpty(urlFilter))
            {
                filtered = filtered.Where(r => r.Url.Contains(urlFilter));
            }
            return Task.FromResult(filtered.ToList());
        }
        return Task.FromResult(new List<NetworkRequest>());
    }

    #endregion

    #region Private Methods

    private async Task<string> SendCommandAsync(ClientWebSocket ws, string method, object parameters)
    {
        var id = _messageId++;
        var message = JsonSerializer.Serialize(new { id, method, @params = parameters });
        var bytes = Encoding.UTF8.GetBytes(message);
        await ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);

        // 等待响应 (简化实现)
        var buffer = new byte[8192];
        var result = await ws.ReceiveAsync(buffer, CancellationToken.None);
        return Encoding.UTF8.GetString(buffer, 0, result.Count);
    }

    private async Task ReceiveMessagesAsync(string pageId, ClientWebSocket ws)
    {
        var buffer = new byte[8192];
        try
        {
            while (ws.State == WebSocketState.Open)
            {
                var result = await ws.ReceiveAsync(buffer, CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close) break;

                var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                ProcessMessage(pageId, json);
            }
        }
        catch (Exception ex)
        {
            _context?.Log($"WebSocket error: {ex.Message}", LogLevel.Error);
        }
    }

    private void ProcessMessage(string pageId, string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (root.TryGetProperty("method", out var method))
            {
                var methodName = method.GetString();

                if (methodName == "Console.messageAdded" && _consoleMessages.ContainsKey(pageId))
                {
                    var msg = root.GetProperty("params").GetProperty("message");
                    _consoleMessages[pageId].Add(new ConsoleMessage
                    {
                        Level = msg.GetProperty("level").GetString() ?? "log",
                        Text = msg.GetProperty("text").GetString() ?? "",
                        Timestamp = DateTime.Now
                    });
                }
                else if (methodName == "Network.responseReceived" && _networkRequests.ContainsKey(pageId))
                {
                    var response = root.GetProperty("params").GetProperty("response");
                    var requestId = root.GetProperty("params").GetProperty("requestId").GetString() ?? "";
                    
                    var existing = _networkRequests[pageId].FirstOrDefault(r => r.RequestId == requestId);
                    if (existing != null)
                    {
                        existing.StatusCode = response.GetProperty("status").GetInt32();
                    }
                }
                else if (methodName == "Network.requestWillBeSent" && _networkRequests.ContainsKey(pageId))
                {
                    var request = root.GetProperty("params").GetProperty("request");
                    _networkRequests[pageId].Add(new NetworkRequest
                    {
                        RequestId = root.GetProperty("params").GetProperty("requestId").GetString() ?? "",
                        Url = request.GetProperty("url").GetString() ?? "",
                        Method = request.GetProperty("method").GetString() ?? "",
                        Type = root.GetProperty("params").TryGetProperty("type", out var t) ? t.GetString() ?? "" : ""
                    });
                }
            }
        }
        catch { }
    }

    private async Task<PluginResult> ExecuteConnectAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("pageId", out var pageIdProp))
        {
            await ConnectPageAsync(pageIdProp.GetString()!);
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'pageId' parameter");
    }

    private async Task<PluginResult> ExecuteDisconnectAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("pageId", out var pageIdProp))
        {
            await DisconnectPageAsync(pageIdProp.GetString()!);
            return PluginResult.Ok();
        }
        return PluginResult.Fail("Missing 'pageId' parameter");
    }

    private async Task<PluginResult> ExecuteScriptActionAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("pageId", out var pageIdProp) &&
            parameters.TryGetProperty("script", out var scriptProp))
        {
            var result = await ExecuteScriptAsync(pageIdProp.GetString()!, scriptProp.GetString()!);
            return PluginResult.Ok(result);
        }
        return PluginResult.Fail("Missing 'pageId' or 'script' parameter");
    }

    private async Task<PluginResult> ExecuteGetConsoleAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("pageId", out var pageIdProp))
        {
            var messages = await GetConsoleMessagesAsync(pageIdProp.GetString()!);
            return PluginResult.Ok(messages);
        }
        return PluginResult.Fail("Missing 'pageId' parameter");
    }

    private async Task<PluginResult> ExecuteGetNetworkAsync(JsonElement parameters)
    {
        if (parameters.TryGetProperty("pageId", out var pageIdProp))
        {
            var filter = parameters.TryGetProperty("urlFilter", out var f) ? f.GetString() : null;
            var requests = await GetNetworkRequestsAsync(pageIdProp.GetString()!, filter);
            return PluginResult.Ok(requests);
        }
        return PluginResult.Fail("Missing 'pageId' parameter");
    }

    private async Task<PluginResult> ExecuteGetDomChangesAsync(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("pageId", out var pageIdProp))
        {
            return PluginResult.Fail("Missing 'pageId' parameter");
        }

        var pageId = pageIdProp.GetString()!;
        if (!_connections.TryGetValue(pageId, out var ws))
        {
            return PluginResult.Fail($"Not connected to page: {pageId}");
        }

        // 从页面获取 DOM 变化
        var result = await SendCommandAsync(ws, "Runtime.evaluate", new
        {
            expression = "JSON.stringify(window.__wintabDomChanges || [])",
            returnByValue = true
        });

        try
        {
            var json = JsonDocument.Parse(result);
            if (json.RootElement.TryGetProperty("result", out var res) && 
                res.TryGetProperty("value", out var value))
            {
                var changes = JsonSerializer.Deserialize<List<DomChange>>(value.GetString() ?? "[]");
                return PluginResult.Ok(changes);
            }
        }
        catch { }

        return PluginResult.Ok(new List<DomChange>());
    }

    private async Task<PluginResult> ExecuteGetHtmlAsync(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("pageId", out var pageIdProp))
        {
            return PluginResult.Fail("Missing 'pageId' parameter");
        }

        var pageId = pageIdProp.GetString()!;
        if (!_connections.TryGetValue(pageId, out var ws))
        {
            return PluginResult.Fail($"Not connected to page: {pageId}");
        }

        // 获取选择器参数（可选）
        var selector = parameters.TryGetProperty("selector", out var s) ? s.GetString() : "body";

        var result = await SendCommandAsync(ws, "Runtime.evaluate", new
        {
            expression = $"document.querySelector('{selector}')?.outerHTML || ''",
            returnByValue = true
        });

        try
        {
            var json = JsonDocument.Parse(result);
            if (json.RootElement.TryGetProperty("result", out var res) && 
                res.TryGetProperty("value", out var value))
            {
                return PluginResult.Ok(new { html = value.GetString(), selector });
            }
        }
        catch { }

        return PluginResult.Fail("Failed to get HTML");
    }

    private async Task<PluginResult> ExecuteGetElementsAsync(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("pageId", out var pageIdProp))
        {
            return PluginResult.Fail("Missing 'pageId' parameter");
        }

        var pageId = pageIdProp.GetString()!;
        if (!_connections.TryGetValue(pageId, out var ws))
        {
            return PluginResult.Fail($"Not connected to page: {pageId}");
        }

        var selector = parameters.TryGetProperty("selector", out var s) ? s.GetString() : "body > *";

        var result = await SendCommandAsync(ws, "Runtime.evaluate", new
        {
            expression = $@"
                (function() {{
                    const elements = document.querySelectorAll('{selector}');
                    return JSON.stringify(Array.from(elements).slice(0, 50).map(el => {{
                        const rect = el.getBoundingClientRect();
                        const styles = window.getComputedStyle(el);
                        return {{
                            tag: el.tagName,
                            id: el.id || '',
                            className: el.className || '',
                            text: el.innerText?.slice(0, 50) || '',
                            rect: {{ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }},
                            display: styles.display,
                            position: styles.position,
                            margin: styles.margin,
                            padding: styles.padding,
                            children: el.children.length
                        }};
                    }}));
                }})()
            ",
            returnByValue = true
        });

        try
        {
            var json = JsonDocument.Parse(result);
            if (json.RootElement.TryGetProperty("result", out var res) && 
                res.TryGetProperty("value", out var value))
            {
                return PluginResult.Ok(JsonSerializer.Deserialize<object>(value.GetString() ?? "[]"));
            }
        }
        catch { }

        return PluginResult.Ok(new List<object>());
    }

    private async Task<PluginResult> ExecuteGetElementStyleAsync(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("pageId", out var pageIdProp))
        {
            return PluginResult.Fail("Missing 'pageId' parameter");
        }

        var pageId = pageIdProp.GetString()!;
        if (!_connections.TryGetValue(pageId, out var ws))
        {
            return PluginResult.Fail($"Not connected to page: {pageId}");
        }

        var selector = parameters.TryGetProperty("selector", out var s) ? s.GetString() : "body";

        var result = await SendCommandAsync(ws, "Runtime.evaluate", new
        {
            expression = $@"
                (function() {{
                    const el = document.querySelector('{selector}');
                    if (!el) return JSON.stringify({{ error: 'Element not found' }});
                    const rect = el.getBoundingClientRect();
                    const styles = window.getComputedStyle(el);
                    return JSON.stringify({{
                        tag: el.tagName,
                        id: el.id,
                        className: el.className,
                        rect: {{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }},
                        box: {{
                            margin: {{ top: styles.marginTop, right: styles.marginRight, bottom: styles.marginBottom, left: styles.marginLeft }},
                            padding: {{ top: styles.paddingTop, right: styles.paddingRight, bottom: styles.paddingBottom, left: styles.paddingLeft }},
                            border: {{ top: styles.borderTopWidth, right: styles.borderRightWidth, bottom: styles.borderBottomWidth, left: styles.borderLeftWidth }}
                        }},
                        layout: {{
                            display: styles.display,
                            position: styles.position,
                            flexDirection: styles.flexDirection,
                            justifyContent: styles.justifyContent,
                            alignItems: styles.alignItems,
                            gridTemplateColumns: styles.gridTemplateColumns
                        }},
                        size: {{
                            width: styles.width,
                            height: styles.height,
                            minWidth: styles.minWidth,
                            maxWidth: styles.maxWidth
                        }},
                        font: {{
                            family: styles.fontFamily,
                            size: styles.fontSize,
                            weight: styles.fontWeight,
                            color: styles.color
                        }},
                        background: styles.backgroundColor
                    }});
                }})()
            ",
            returnByValue = true
        });

        try
        {
            var json = JsonDocument.Parse(result);
            if (json.RootElement.TryGetProperty("result", out var res) && 
                res.TryGetProperty("value", out var value))
            {
                return PluginResult.Ok(JsonSerializer.Deserialize<object>(value.GetString() ?? "{}"));
            }
        }
        catch { }

        return PluginResult.Fail("Failed to get element style");
    }

    private async Task<PluginResult> ExecuteHighlightElementAsync(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("pageId", out var pageIdProp))
        {
            return PluginResult.Fail("Missing 'pageId' parameter");
        }

        var pageId = pageIdProp.GetString()!;
        if (!_connections.TryGetValue(pageId, out var ws))
        {
            return PluginResult.Fail($"Not connected to page: {pageId}");
        }

        var selector = parameters.TryGetProperty("selector", out var s) ? s.GetString() : "";
        if (string.IsNullOrEmpty(selector))
        {
            return PluginResult.Fail("Missing 'selector' parameter");
        }

        await SendCommandAsync(ws, "Runtime.evaluate", new
        {
            expression = $@"
                (function() {{
                    // 移除之前的高亮
                    document.querySelectorAll('.__wintab_highlight').forEach(el => el.remove());
                    
                    const target = document.querySelector('{selector}');
                    if (!target) return 'Element not found';
                    
                    const rect = target.getBoundingClientRect();
                    const highlight = document.createElement('div');
                    highlight.className = '__wintab_highlight';
                    highlight.style.cssText = `
                        position: fixed;
                        left: ${{rect.left}}px;
                        top: ${{rect.top}}px;
                        width: ${{rect.width}}px;
                        height: ${{rect.height}}px;
                        background: rgba(66, 133, 244, 0.3);
                        border: 2px solid #4285f4;
                        pointer-events: none;
                        z-index: 99999;
                        transition: all 0.2s;
                    `;
                    document.body.appendChild(highlight);
                    
                    // 3秒后自动移除
                    setTimeout(() => highlight.remove(), 3000);
                    return 'Highlighted';
                }})()
            "
        });

        return PluginResult.Ok("Highlighted");
    }

    #endregion
}

internal class ChromePage
{
    [System.Text.Json.Serialization.JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [System.Text.Json.Serialization.JsonPropertyName("title")]
    public string Title { get; set; } = "";

    [System.Text.Json.Serialization.JsonPropertyName("url")]
    public string Url { get; set; } = "";

    [System.Text.Json.Serialization.JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [System.Text.Json.Serialization.JsonPropertyName("webSocketDebuggerUrl")]
    public string WebSocketDebuggerUrl { get; set; } = "";
}

internal class BrowserDebugConfig
{
    public int Port { get; set; } = 9222;
}

internal class DomChange
{
    [System.Text.Json.Serialization.JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [System.Text.Json.Serialization.JsonPropertyName("target")]
    public string Target { get; set; } = "";

    [System.Text.Json.Serialization.JsonPropertyName("added")]
    public int Added { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("removed")]
    public int Removed { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("attribute")]
    public string? Attribute { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("time")]
    public long Time { get; set; }
}
