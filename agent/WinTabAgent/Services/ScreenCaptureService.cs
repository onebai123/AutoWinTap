using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using WinTabAgent.Models;

namespace WinTabAgent.Services;

/// <summary>
/// 屏幕捕获服务
/// </summary>
public class ScreenCaptureService : IDisposable
{
    private readonly AgentConfig _config;
    private CancellationTokenSource? _cts;
    private bool _isRunning;

    public event Action<byte[]>? OnFrame;
    public bool IsRunning => _isRunning;

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    private const int SM_CXSCREEN = 0;
    private const int SM_CYSCREEN = 1;

    public ScreenCaptureService(AgentConfig config)
    {
        _config = config;
    }

    /// <summary>
    /// 开始捕获
    /// </summary>
    public void Start()
    {
        if (_isRunning) return;

        _cts = new CancellationTokenSource();
        _isRunning = true;

        _ = Task.Run(async () =>
        {
            while (!_cts.Token.IsCancellationRequested)
            {
                try
                {
                    var frame = CaptureScreen();
                    if (frame != null)
                    {
                        OnFrame?.Invoke(frame);
                    }

                    await Task.Delay(_config.Screen.CaptureInterval, _cts.Token);
                }
                catch (TaskCanceledException)
                {
                    break;
                }
                catch
                {
                    // 忽略捕获错误
                }
            }
        });
    }

    /// <summary>
    /// 停止捕获
    /// </summary>
    public void Stop()
    {
        _cts?.Cancel();
        _isRunning = false;
    }

    /// <summary>
    /// 捕获单帧
    /// </summary>
    public byte[]? CaptureScreen()
    {
        try
        {
            int width = GetSystemMetrics(SM_CXSCREEN);
            int height = GetSystemMetrics(SM_CYSCREEN);

            using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
            using var graphics = Graphics.FromImage(bitmap);

            graphics.CopyFromScreen(0, 0, 0, 0, new Size(width, height));

            // 压缩为 JPEG
            using var ms = new MemoryStream();
            var encoder = GetEncoder(ImageFormat.Jpeg);
            var encoderParams = new EncoderParameters(1);
            encoderParams.Param[0] = new EncoderParameter(Encoder.Quality, (long)_config.Screen.Quality);

            bitmap.Save(ms, encoder!, encoderParams);
            return ms.ToArray();
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// 捕获并返回 Base64
    /// </summary>
    public string? CaptureScreenBase64()
    {
        var bytes = CaptureScreen();
        return bytes != null ? Convert.ToBase64String(bytes) : null;
    }

    private static ImageCodecInfo? GetEncoder(ImageFormat format)
    {
        var codecs = ImageCodecInfo.GetImageDecoders();
        foreach (var codec in codecs)
        {
            if (codec.FormatID == format.Guid)
                return codec;
        }
        return null;
    }

    public void Dispose()
    {
        Stop();
        _cts?.Dispose();
    }
}
