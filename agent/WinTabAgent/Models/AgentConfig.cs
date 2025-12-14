namespace WinTabAgent.Models;

/// <summary>
/// Agent 配置
/// </summary>
public class AgentConfig
{
    public ServerConfig Server { get; set; } = new();
    public AgentInfo Agent { get; set; } = new();
    public PluginsConfig Plugins { get; set; } = new();
    public ScreenConfig Screen { get; set; } = new();
}

public class ServerConfig
{
    public string Url { get; set; } = "ws://localhost:3000";
    public int ReconnectInterval { get; set; } = 5000;
}

public class AgentInfo
{
    public string Name { get; set; } = Environment.MachineName;
    public bool AutoStart { get; set; } = true;
    public int HttpPort { get; set; } = 5100;
}

public class PluginsConfig
{
    public PluginConfig WindowControl { get; set; } = new() { Enabled = true };
    public BrowserDebugConfig BrowserDebug { get; set; } = new();
    public WindsurfConfig Windsurf { get; set; } = new();
}

public class PluginConfig
{
    public bool Enabled { get; set; } = true;
}

public class BrowserDebugConfig : PluginConfig
{
    public int Port { get; set; } = 9222;
}

public class WindsurfConfig : PluginConfig
{
    public PositionConfig InputBoxPosition { get; set; } = new() { X = 1700, Y = 1042 };
    public string ResultFilePath { get; set; } = @"D:\git\wintab\ai_result.txt";
}

public class PositionConfig
{
    public int X { get; set; }
    public int Y { get; set; }
}

public class ScreenConfig
{
    public int CaptureInterval { get; set; } = 500;
    public int Quality { get; set; } = 60;
}
