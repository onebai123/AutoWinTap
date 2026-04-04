using System.Text.Json;
using System.Text.RegularExpressions;
using WinTabAgent.Plugins.Abstractions;

namespace WinTabAgent.Plugins.Workflow;

public class WorkflowPlugin : IPlugin
{
    private IPluginContext? _context;

    public string Id => "workflow";
    public string Name => "系统工作流插件";
    public string Version => "1.0.0";
    public string Description => "支持按序执行多个动作并在步骤间传递上下文插值";
    public string Author => "AutoWinTap";

    public Task InitializeAsync(IPluginContext context)
    {
        _context = context;
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
        if (action == "run")
        {
            return await ExecuteRunAsync(parameters);
        }
        return PluginResult.Fail($"Unknown action: {action}");
    }

    public IEnumerable<string> GetSupportedActions()
    {
        return new[] { "run" };
    }

    private async Task<PluginResult> ExecuteRunAsync(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("steps", out var stepsProp) || stepsProp.ValueKind != JsonValueKind.Array)
        {
            return PluginResult.Fail("Missing or invalid 'steps' parameter");
        }

        var executionContext = new Dictionary<string, JsonElement>();
        var results = new List<object>();

        foreach (var step in stepsProp.EnumerateArray())
        {
            var stepId = step.TryGetProperty("id", out var idProp) ? idProp.GetString() : Guid.NewGuid().ToString();
            var stepAction = step.TryGetProperty("action", out var actionProp) ? actionProp.GetString() : null;
            
            if (string.IsNullOrEmpty(stepAction))
            {
                return PluginResult.Fail($"Step '{stepId}' missing action");
            }

            // 处理延时系统内置动作
            if (stepAction == "system.delay")
            {
                var ms = 0;
                if (step.TryGetProperty("params", out var p) && p.TryGetProperty("ms", out var msp))
                {
                    ms = msp.GetInt32();
                }
                await Task.Delay(ms);
                results.Add(new { step = stepId, action = stepAction, success = true });
                continue;
            }

            var parts = stepAction.Split('.');
            if (parts.Length != 2)
            {
                return PluginResult.Fail($"Invalid action format in step '{stepId}': {stepAction}");
            }
            var targetPlugin = parts[0];
            var targetMethod = parts[1];

            // 参数插值替换
            var stepParams = step.TryGetProperty("params", out var paramsProp) ? paramsProp : JsonDocument.Parse("{}").RootElement;
            stepParams = InterpolateParameters(stepParams, executionContext);

            if (_context == null) 
                return PluginResult.Fail("Context not initialized");

            var result = await _context.ExecutePluginAsync(targetPlugin, targetMethod, stepParams);

            results.Add(new
            {
                step = stepId,
                action = stepAction,
                success = result.Success,
                data = result.Data,
                error = result.Error,
                durationMs = result.Duration
            });

            if (!result.Success)
            {
                return PluginResult.Fail($"Step '{stepId}' failed: {result.Error}");
            }

            // 保存这一步的输出到执行上下文
            if (result.Data != null)
            {
                try
                {
                    var serialized = JsonSerializer.Serialize(result.Data);
                    var outputDoc = JsonDocument.Parse(serialized);
                    executionContext[stepId] = outputDoc.RootElement;
                }
                catch { }
            }
        }

        return PluginResult.Ok(new { executedSteps = results });
    }

    /// <summary>
    /// 处理参数插值，替换 ${step_id.key}
    /// 这里的实现为了保持简单，只处理顶层字符串插值，如果要处理嵌套，则需要递归重建 JsonElement
    /// 并且支持直接把值替换或把字符串里的部分内容替换
    /// </summary>
    private JsonElement InterpolateParameters(JsonElement parameters, Dictionary<string, JsonElement> context)
    {
        if (parameters.ValueKind != JsonValueKind.Object)
            return parameters;

        var dict = new Dictionary<string, object>();
        
        foreach (var prop in parameters.EnumerateObject())
        {
            if (prop.Value.ValueKind == JsonValueKind.String)
            {
                var val = prop.Value.GetString() ?? string.Empty;
                var pattern = @"\$\{([^}]+)\}";
                
                // 如果整个字符串完全是一个插值表达式 ${a.b}，并且目标值是一个数字/布尔等，我们最好保留其原始类型
                var matches = Regex.Matches(val, pattern);
                if (matches.Count == 1 && matches[0].Value == val)
                {
                    var path = matches[0].Groups[1].Value;
                    if (TryGetValueFromContext(path, context, out var resolvedValue))
                    {
                        // 提取 JsonElement 的原生值
                        dict[prop.Name] = GetRawValue(resolvedValue);
                        continue;
                    }
                }

                // 否则，做字符串内联替换
                val = Regex.Replace(val, pattern, match =>
                {
                    var path = match.Groups[1].Value;
                    if (TryGetValueFromContext(path, context, out var resolvedValue))
                    {
                        return resolvedValue.ToString() ?? "";
                    }
                    return match.Value; // 没找到则不替换
                });

                dict[prop.Name] = val;
            }
            else
            {
                dict[prop.Name] = GetRawValue(prop.Value);
            }
        }

        var json = JsonSerializer.Serialize(dict);
        return JsonDocument.Parse(json).RootElement;
    }

    private bool TryGetValueFromContext(string path, Dictionary<string, JsonElement> context, out JsonElement value)
    {
        value = default;
        var parts = path.Split('.');
        if (parts.Length < 1) return false;
        
        var stepId = parts[0];
        if (!context.TryGetValue(stepId, out var currentElement))
        {
            return false;
        }

        for (int i = 1; i < parts.Length; i++)
        {
            if (currentElement.ValueKind != JsonValueKind.Object || !currentElement.TryGetProperty(parts[i], out currentElement))
            {
                return false;
            }
        }

        value = currentElement;
        return true;
    }

    private object GetRawValue(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString() ?? "",
            JsonValueKind.Number => element.TryGetInt64(out var l) ? l : element.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            _ => element // 复杂对象原样保留
        };
    }
}
