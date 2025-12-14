namespace WinTabAgent.Plugins.Abstractions;

/// <summary>
/// IDE 控制插件接口
/// </summary>
public interface IIdePlugin : IPlugin
{
    /// <summary>
    /// IDE 是否正在运行
    /// </summary>
    Task<bool> IsRunningAsync();

    /// <summary>
    /// 激活 IDE 窗口
    /// </summary>
    Task ActivateAsync();

    /// <summary>
    /// 点击指定位置
    /// </summary>
    Task ClickPositionAsync(int x, int y);

    /// <summary>
    /// 输入文本
    /// </summary>
    Task TypeTextAsync(string text);

    /// <summary>
    /// 按下按键
    /// </summary>
    Task PressKeyAsync(string key);

    /// <summary>
    /// 执行完整任务流程
    /// </summary>
    /// <param name="task">任务描述</param>
    /// <param name="waitSeconds">等待秒数</param>
    /// <returns>执行结果</returns>
    Task<string> ExecuteTaskAsync(string task, int waitSeconds);
}
