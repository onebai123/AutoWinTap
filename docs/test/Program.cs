using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace WinTabTest;

class Program
{
    #region Win32 API

    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    const int SW_MINIMIZE = 6;
    const int SW_RESTORE = 9;
    const int SW_SHOWMAXIMIZED = 3;
    const uint MOD_ALT = 0x0001;

    #endregion

    static List<WindowInfo> windows = new();

    static void Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;

        // 如果传入 rpa 参数，运行 RPA 测试
        if (args.Length > 0 && args[0] == "rpa")
        {
            RpaTest.Run();
            return;
        }

        // 如果传入 chrome 参数，运行 Chrome 日志测试
        if (args.Length > 0 && args[0] == "chrome")
        {
            ChromeLogTest.Run().Wait();
            return;
        }

        // 如果传入 network 参数，运行网络请求监听
        if (args.Length > 0 && args[0] == "network")
        {
            ChromeNetworkTest.Run().Wait();
            return;
        }

        // 如果传入 netdetail 参数，运行详细网络请求监听
        if (args.Length > 0 && args[0] == "netdetail")
        {
            ChromeNetworkDetail.Run().Wait();
            return;
        }

        Console.WriteLine("=== WinTab 窗口管理测试 ===\n");
        Console.WriteLine("提示: 运行 'dotnet run rpa' 进行 RPA 能力测试\n");

        // 测试1: 枚举所有窗口
        Console.WriteLine("【测试1】枚举所有可见窗口:\n");
        EnumAllWindows();

        // 输出窗口列表到文件和控制台
        var listFile = Path.Combine(AppContext.BaseDirectory, "windows.txt");
        using (var writer = new StreamWriter(listFile, false, Encoding.UTF8))
        {
            writer.WriteLine("序号 | 进程名               | 窗口标题");
            writer.WriteLine(new string('-', 90));
            for (int i = 0; i < windows.Count; i++)
            {
                var w = windows[i];
                var line = $"[{i + 1,2}] {w.ProcessName,-20} | {w.Title}";
                writer.WriteLine(line);
                Console.WriteLine(line);
            }
        }
        Console.WriteLine($"\n共找到 {windows.Count} 个窗口");
        Console.WriteLine($"完整列表已保存到: {listFile}\n");

        // 测试2: 窗口操作
        Console.WriteLine("【测试2】窗口操作测试");
        Console.WriteLine("命令: 数字=激活单个, g 1,2,3=激活多个, r=刷新, q=退出");

        while (true)
        {
            Console.Write("> ");
            var input = Console.ReadLine()?.Trim();

            if (string.IsNullOrEmpty(input)) continue;
            if (input == "q") break;

            if (input == "r")
            {
                windows.Clear();
                EnumAllWindows();
                Console.WriteLine($"已刷新，共 {windows.Count} 个窗口");
                continue;
            }

            // 组合激活: g 1,2,3
            if (input.StartsWith("g "))
            {
                var nums = input.Substring(2).Split(',', ' ')
                    .Where(s => int.TryParse(s.Trim(), out _))
                    .Select(s => int.Parse(s.Trim()))
                    .ToList();

                if (nums.Count == 0)
                {
                    Console.WriteLine("用法: g 1,2,3 (激活序号1,2,3的窗口)");
                    continue;
                }

                var sw = Stopwatch.StartNew();

                // 1. 最小化其他窗口
                for (int i = 0; i < windows.Count; i++)
                {
                    if (!nums.Contains(i + 1))
                    {
                        ShowWindow(windows[i].Handle, SW_MINIMIZE);
                    }
                }

                // 2. 激活选中的窗口（倒序激活，最后一个在最前面）
                for (int i = nums.Count - 1; i >= 0; i--)
                {
                    var idx = nums[i];
                    if (idx > 0 && idx <= windows.Count)
                    {
                        var w = windows[idx - 1];
                        ShowWindow(w.Handle, SW_RESTORE);
                        SetForegroundWindow(w.Handle);
                        ShowWindow(w.Handle, SW_SHOWMAXIMIZED);
                        Thread.Sleep(50); // 小延迟确保窗口切换
                    }
                }

                sw.Stop();
                Console.WriteLine($"✅ 已激活 {nums.Count} 个窗口: [{string.Join(",", nums)}]");
                Console.WriteLine($"⏱️ 响应时间: {sw.ElapsedMilliseconds}ms");
                continue;
            }

            // 单个激活
            if (int.TryParse(input, out int singleIdx) && singleIdx > 0 && singleIdx <= windows.Count)
            {
                var target = windows[singleIdx - 1];
                var sw = Stopwatch.StartNew();

                ShowWindow(target.Handle, SW_RESTORE);
                SetForegroundWindow(target.Handle);
                ShowWindow(target.Handle, SW_SHOWMAXIMIZED);

                sw.Stop();
                Console.WriteLine($"✅ 已激活: [{singleIdx}] {target.ProcessName} - {target.Title}");
                Console.WriteLine($"⏱️ 响应时间: {sw.ElapsedMilliseconds}ms");
            }
            else
            {
                Console.WriteLine("无效输入");
            }
        }

        Console.WriteLine("\n测试完成！");
    }

    static void EnumAllWindows()
    {
        EnumWindows((hWnd, lParam) =>
        {
            if (!IsWindowVisible(hWnd)) return true;

            var sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            var title = sb.ToString();

            if (string.IsNullOrWhiteSpace(title)) return true;

            GetWindowThreadProcessId(hWnd, out uint pid);
            string processName = "Unknown";
            try
            {
                var proc = Process.GetProcessById((int)pid);
                processName = proc.ProcessName;
            }
            catch { }

            windows.Add(new WindowInfo
            {
                Handle = hWnd,
                Title = title,
                ProcessName = processName,
                ProcessId = pid
            });

            return true;
        }, IntPtr.Zero);
    }

    static string Truncate(string s, int maxLen)
    {
        if (s.Length <= maxLen) return s;
        return s.Substring(0, maxLen - 3) + "...";
    }
}

class WindowInfo
{
    public IntPtr Handle { get; set; }
    public string Title { get; set; } = "";
    public string ProcessName { get; set; } = "";
    public uint ProcessId { get; set; }
}
