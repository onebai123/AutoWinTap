@echo off
chcp 65001 >nul
title Chrome 调试模式

echo ╔═══════════════════════════════════════╗
echo ║       Chrome 调试模式启动             ║
echo ╚═══════════════════════════════════════╝
echo.

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
set DEBUG_PORT=9222
set USER_DATA="%TEMP%\ChromeDebug"

if not exist %CHROME_PATH% (
    set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if not exist %CHROME_PATH% (
    set CHROME_PATH="D:\software\soft\Google\Chrome\Application\chrome.exe"
)

if not exist %CHROME_PATH% (
    echo [错误] 未找到 Chrome，请手动指定路径
    pause
    exit /b 1
)

echo 启动 Chrome (调试端口: %DEBUG_PORT%)...
start "" %CHROME_PATH% --remote-debugging-port=%DEBUG_PORT% --user-data-dir=%USER_DATA%

echo.
echo ═══════════════════════════════════════
echo   ✓ Chrome 调试模式已启动
echo   ✓ 验证: http://localhost:9222/json
echo ═══════════════════════════════════════
echo.
pause
