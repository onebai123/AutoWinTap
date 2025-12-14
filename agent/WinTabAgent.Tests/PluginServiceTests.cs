using Moq;
using WinTabAgent.Models;
using WinTabAgent.Plugins.Abstractions;
using WinTabAgent.Services;
using Xunit;

namespace WinTabAgent.Tests;

/// <summary>
/// 插件服务单元测试
/// </summary>
public class PluginServiceTests
{
    private readonly PluginService _service;
    private readonly Mock<IPluginContext> _mockContext;

    public PluginServiceTests()
    {
        _mockContext = new Mock<IPluginContext>();
        _service = new PluginService(_mockContext.Object);
    }

    [Fact]
    public async Task RegisterBuiltinPluginAsync_AddsPlugin()
    {
        // Arrange
        var mockPlugin = new Mock<IPlugin>();
        mockPlugin.Setup(p => p.Id).Returns("test-plugin");
        mockPlugin.Setup(p => p.Name).Returns("Test Plugin");
        mockPlugin.Setup(p => p.Version).Returns("1.0.0");

        // Act
        await _service.RegisterBuiltinPluginAsync(mockPlugin.Object);

        // Assert
        var plugin = _service.GetPlugin("test-plugin");
        Assert.NotNull(plugin);
        Assert.Equal("Test Plugin", plugin.Name);
    }

    [Fact]
    public void GetPlugin_NonExistent_ReturnsNull()
    {
        // Act
        var plugin = _service.GetPlugin("non-existent");

        // Assert
        Assert.Null(plugin);
    }

    [Fact]
    public async Task GetPluginIds_ReturnsRegisteredIds()
    {
        // Arrange
        var mockPlugin1 = new Mock<IPlugin>();
        mockPlugin1.Setup(p => p.Id).Returns("plugin-1");
        var mockPlugin2 = new Mock<IPlugin>();
        mockPlugin2.Setup(p => p.Id).Returns("plugin-2");

        await _service.RegisterBuiltinPluginAsync(mockPlugin1.Object);
        await _service.RegisterBuiltinPluginAsync(mockPlugin2.Object);

        // Act
        var ids = _service.GetPluginIds();

        // Assert
        Assert.Contains("plugin-1", ids);
        Assert.Contains("plugin-2", ids);
    }

    [Fact]
    public async Task ShutdownAllAsync_CallsShutdownOnAllPlugins()
    {
        // Arrange
        var mockPlugin = new Mock<IPlugin>();
        mockPlugin.Setup(p => p.Id).Returns("test-plugin");

        await _service.RegisterBuiltinPluginAsync(mockPlugin.Object);

        // Act
        await _service.ShutdownAllAsync();

        // Assert
        mockPlugin.Verify(p => p.ShutdownAsync(), Times.Once);
        Assert.Empty(_service.GetPluginIds());
    }

    [Fact]
    public async Task ExecuteAsync_NonExistentPlugin_ReturnsFail()
    {
        // Arrange
        var parameters = System.Text.Json.JsonDocument.Parse("{}").RootElement;

        // Act
        var result = await _service.ExecuteAsync("non-existent", "action", parameters);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("not found", result.Error);
    }
}
