using Moq;
using WinTabAgent.Plugins.Abstractions;
using WinTabAgent.Plugins.Windsurf;
using Xunit;

namespace WinTabAgent.Tests;

/// <summary>
/// Windsurf 插件单元测试
/// </summary>
public class WindsurfPluginTests
{
    private readonly WindsurfPlugin _plugin;
    private readonly Mock<IPluginContext> _mockContext;

    public WindsurfPluginTests()
    {
        _plugin = new WindsurfPlugin();
        _mockContext = new Mock<IPluginContext>();
        _plugin.InitializeAsync(_mockContext.Object).Wait();
    }

    [Fact]
    public void Plugin_HasCorrectMetadata()
    {
        Assert.Equal("windsurf", _plugin.Id);
        Assert.Equal("Windsurf IDE 插件", _plugin.Name);
        Assert.Equal("1.0.0", _plugin.Version);
    }

    [Fact]
    public void GetSupportedActions_ReturnsExpectedActions()
    {
        var actions = _plugin.GetSupportedActions().ToList();

        Assert.Contains("is-running", actions);
        Assert.Contains("activate", actions);
        Assert.Contains("click", actions);
        Assert.Contains("type", actions);
        Assert.Contains("press-key", actions);
        Assert.Contains("execute-task", actions);
    }

    [Fact]
    public async Task IsRunningAsync_ReturnsBoolean()
    {
        var result = await _plugin.IsRunningAsync();
        // Windsurf 可能未运行
        Assert.IsType<bool>(result);
    }

    [Fact]
    public async Task ExecuteAsync_UnknownAction_ReturnsFail()
    {
        var parameters = System.Text.Json.JsonDocument.Parse("{}").RootElement;
        var result = await _plugin.ExecuteAsync("unknown-action", parameters);

        Assert.False(result.Success);
        Assert.Contains("Unknown action", result.Error);
    }

    [Fact]
    public async Task ExecuteAsync_ClickWithoutCoordinates_ReturnsFail()
    {
        var parameters = System.Text.Json.JsonDocument.Parse("{}").RootElement;
        var result = await _plugin.ExecuteAsync("click", parameters);

        Assert.False(result.Success);
        Assert.Contains("x", result.Error);
    }

    [Fact]
    public async Task ExecuteAsync_TypeWithoutText_ReturnsFail()
    {
        var parameters = System.Text.Json.JsonDocument.Parse("{}").RootElement;
        var result = await _plugin.ExecuteAsync("type", parameters);

        Assert.False(result.Success);
        Assert.Contains("text", result.Error);
    }

    [Fact]
    public async Task ExecuteAsync_IsRunning_ReturnsSuccess()
    {
        var parameters = System.Text.Json.JsonDocument.Parse("{}").RootElement;
        var result = await _plugin.ExecuteAsync("is-running", parameters);

        Assert.True(result.Success);
    }
}
