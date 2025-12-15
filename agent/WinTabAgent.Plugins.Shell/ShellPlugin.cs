using System.Diagnostics;
using System.Text;
using System.Text.Json;
using WinTabAgent.Plugins.Abstractions;

namespace WinTabAgent.Plugins.Shell;

/// <summary>
/// Shell 命令执行插件
/// </summary>
public class ShellPlugin : IPlugin
{
    private IPluginContext? _context;

    #region IPlugin

    public string Id => "shell";
    public string Name => "远程命令执行插件";
    public string Version => "1.0.0";
    public string Description => "在被控端执行 CMD/PowerShell 命令";
    public string Author => "WinTab Team";

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
        return action switch
        {
            "execute" => await ExecuteCommandAsync(parameters),
            _ => PluginResult.Fail($"Unknown action: {action}")
        };
    }

    public IEnumerable<string> GetSupportedActions()
    {
        return new[] { "execute" };
    }

    #endregion

    #region Command Execution

    /// <summary>
    /// 执行命令
    /// </summary>
    private async Task<PluginResult> ExecuteCommandAsync(JsonElement parameters)
    {
        // 解析参数
        if (!parameters.TryGetProperty("command", out var commandProp))
        {
            return PluginResult.Fail("Missing 'command' parameter");
        }

        var command = commandProp.GetString();
        if (string.IsNullOrEmpty(command))
        {
            return PluginResult.Fail("Empty command");
        }

        // 可选参数
        var shell = parameters.TryGetProperty("shell", out var shellProp) 
            ? shellProp.GetString() ?? "cmd" 
            : "cmd";
        
        var workingDirectory = parameters.TryGetProperty("cwd", out var cwdProp) 
            ? cwdProp.GetString() 
            : null;
        
        var timeoutMs = parameters.TryGetProperty("timeout", out var timeoutProp) 
            ? timeoutProp.GetInt32() 
            : 30000; // 默认 30 秒

        // 限制超时范围
        timeoutMs = Math.Clamp(timeoutMs, 1000, 300000); // 1秒 ~ 5分钟

        _context?.Log($"Executing: [{shell}] {command}");

        try
        {
            var result = await RunCommandAsync(command, shell, workingDirectory, timeoutMs);
            return PluginResult.Ok(result);
        }
        catch (Exception ex)
        {
            return PluginResult.Fail($"Command execution failed: {ex.Message}");
        }
    }

    /// <summary>
    /// 运行命令并返回结果
    /// </summary>
    private async Task<object> RunCommandAsync(string command, string shell, string? workingDirectory, int timeoutMs)
    {
        var sw = Stopwatch.StartNew();

        // 配置进程
        var psi = new ProcessStartInfo
        {
            FileName = shell.ToLower() switch
            {
                "powershell" or "ps" => "powershell.exe",
                _ => "cmd.exe"
            },
            Arguments = shell.ToLower() switch
            {
                "powershell" or "ps" => $"-NoProfile -NoLogo -Command \"{command.Replace("\"", "\\\"")}\"",
                _ => $"/c {command}"
            },
            WorkingDirectory = workingDirectory ?? Environment.CurrentDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };

        // 验证工作目录
        if (!string.IsNullOrEmpty(workingDirectory) && !Directory.Exists(workingDirectory))
        {
            return new
            {
                success = false,
                output = "",
                error = $"Working directory does not exist: {workingDirectory}",
                exitCode = -1,
                timedOut = false,
                durationMs = sw.ElapsedMilliseconds
            };
        }

        using var process = new Process { StartInfo = psi };
        var outputBuilder = new StringBuilder();
        var errorBuilder = new StringBuilder();

        process.OutputDataReceived += (s, e) =>
        {
            if (e.Data != null) outputBuilder.AppendLine(e.Data);
        };
        process.ErrorDataReceived += (s, e) =>
        {
            if (e.Data != null) errorBuilder.AppendLine(e.Data);
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        // 等待完成或超时
        var completed = await WaitForExitAsync(process, timeoutMs);

        if (!completed)
        {
            // 超时，强制终止
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch { }

            _context?.Log($"Command timed out after {timeoutMs}ms", LogLevel.Warning);

            return new
            {
                success = false,
                output = outputBuilder.ToString(),
                error = "Command timed out",
                exitCode = -1,
                timedOut = true,
                durationMs = sw.ElapsedMilliseconds
            };
        }

        sw.Stop();

        var output = outputBuilder.ToString().TrimEnd();
        var error = errorBuilder.ToString().TrimEnd();

        _context?.Log($"Command completed in {sw.ElapsedMilliseconds}ms, exit code: {process.ExitCode}");

        return new
        {
            success = process.ExitCode == 0,
            output,
            error,
            exitCode = process.ExitCode,
            timedOut = false,
            durationMs = sw.ElapsedMilliseconds
        };
    }

    /// <summary>
    /// 异步等待进程退出
    /// </summary>
    private static async Task<bool> WaitForExitAsync(Process process, int timeoutMs)
    {
        using var cts = new CancellationTokenSource(timeoutMs);
        try
        {
            await process.WaitForExitAsync(cts.Token);
            return true;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }

    #endregion
}
