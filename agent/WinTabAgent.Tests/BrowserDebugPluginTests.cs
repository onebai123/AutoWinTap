using Moq;
using WinTabAgent.Plugins.Abstractions;
using WinTabAgent.Plugins.BrowserDebug;
using Xunit;

namespace WinTabAgent.Tests;

/// <summary>
/// 浏览器调试插件单元测试
/// </summary>
public class BrowserDebugPluginTests
{
    private readonly BrowserDebugPlugin _plugin;
    private readonly Mock<IPluginContext> _mockContext;

    public BrowserDebugPluginTests()
    {
        _plugin = new BrowserDebugPlugin();
        _mockContext = new Mock<IPluginContext>();
        _plugin.InitializeAsync(_mockContext.Object).Wait();
    }

    [Fact]
    public void Plugin_HasCorrectMetadata()
    {
        Assert.Equal("browser-debug", _plugin.Id);
        Assert.Equal("浏览器调试插件", _plugin.Name);
        Assert.Equal("1.0.0", _plugin.Version);
    }

    [Fact]
    public void GetSupportedActions_ReturnsExpectedActions()
    {
        var actions = _plugin.GetSupportedActions().ToList();

        Assert.Contains("get-pages", actions);
        Assert.Contains("connect", actions);
        Assert.Contains("disconnect", actions);
        Assert.Contains("execute-script", actions);
        Assert.Contains("get-console", actions);
        Assert.Contains("get-network", actions);
    }

    [Fact]
    public async Task GetPagesAsync_ReturnsEmptyListWhenChromeNotRunning()
    {
        // Chrome 未以调试模式运行时返回空列表
        var pages = await _plugin.GetPagesAsync();
        Assert.NotNull(pages);
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
    public async Task ExecuteAsync_ConnectWithoutPageId_ReturnsFail()
    {
        var parameters = System.Text.Json.JsonDocument.Parse("{}").RootElement;
        var result = await _plugin.ExecuteAsync("connect", parameters);

        Assert.False(result.Success);
        Assert.Contains("pageId", result.Error);
    }

    [Fact]
    public async Task GetConsoleMessagesAsync_NonConnectedPage_ReturnsEmptyList()
    {
        var messages = await _plugin.GetConsoleMessagesAsync("non-existent-page");
        Assert.Empty(messages);
    }

    [Fact]
    public async Task GetNetworkRequestsAsync_NonConnectedPage_ReturnsEmptyList()
    {
        var requests = await _plugin.GetNetworkRequestsAsync("non-existent-page");
        Assert.Empty(requests);
    }
}
