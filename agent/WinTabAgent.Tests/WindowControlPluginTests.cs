using Moq;
using WinTabAgent.Plugins.Abstractions;
using WinTabAgent.Plugins.WindowControl;
using Xunit;

namespace WinTabAgent.Tests;

/// <summary>
/// 窗口控制插件单元测试
/// </summary>
public class WindowControlPluginTests
{
    private readonly WindowControlPlugin _plugin;
    private readonly Mock<IPluginContext> _mockContext;

    public WindowControlPluginTests()
    {
        _plugin = new WindowControlPlugin();
        _mockContext = new Mock<IPluginContext>();
        _plugin.InitializeAsync(_mockContext.Object).Wait();
    }

    [Fact]
    public void Plugin_HasCorrectMetadata()
    {
        Assert.Equal("window-control", _plugin.Id);
        Assert.Equal("窗口控制插件", _plugin.Name);
        Assert.Equal("1.0.0", _plugin.Version);
    }

    [Fact]
    public void GetSupportedActions_ReturnsExpectedActions()
    {
        var actions = _plugin.GetSupportedActions().ToList();

        Assert.Contains("list", actions);
        Assert.Contains("activate", actions);
        Assert.Contains("minimize", actions);
        Assert.Contains("maximize", actions);
        Assert.Contains("capture", actions);
        Assert.Contains("switch-preset", actions);
    }

    [Fact]
    public async Task GetWindowsAsync_ReturnsWindowList()
    {
        // Act
        var windows = await _plugin.GetWindowsAsync();

        // Assert
        Assert.NotNull(windows);
        Assert.True(windows.Count > 0, "Should find at least one window");
    }

    [Fact]
    public async Task GetWindowsAsync_WindowsHaveValidProperties()
    {
        // Act
        var windows = await _plugin.GetWindowsAsync();

        // Assert
        foreach (var window in windows.Take(5))
        {
            Assert.NotEqual(IntPtr.Zero, window.Handle);
            Assert.False(string.IsNullOrEmpty(window.Title));
            Assert.True(window.IsVisible);
        }
    }

    [Fact]
    public async Task ExecuteAsync_List_ReturnsWindows()
    {
        // Arrange
        var parameters = System.Text.Json.JsonDocument.Parse("{}").RootElement;

        // Act
        var result = await _plugin.ExecuteAsync("list", parameters);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
    }

    [Fact]
    public async Task ExecuteAsync_UnknownAction_ReturnsFail()
    {
        // Arrange
        var parameters = System.Text.Json.JsonDocument.Parse("{}").RootElement;

        // Act
        var result = await _plugin.ExecuteAsync("unknown-action", parameters);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("Unknown action", result.Error);
    }

    [Fact]
    public async Task ExecuteAsync_ActivateWithoutHandle_ReturnsFail()
    {
        // Arrange
        var parameters = System.Text.Json.JsonDocument.Parse("{}").RootElement;

        // Act
        var result = await _plugin.ExecuteAsync("activate", parameters);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("handle", result.Error);
    }
}
