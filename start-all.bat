@echo off
chcp 65001 >nul
title WinTab 启动器

echo ╔═══════════════════════════════════════╗
echo ║         WinTab 一键启动               ║
echo ╚═══════════════════════════════════════╝
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装
    pause
    exit /b 1
)

:: 检查 .NET
where dotnet >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 .NET SDK，请先安装
    pause
    exit /b 1
)

echo [1/3] 启动 Server (Next.js)...
start "WinTab Server" cmd /k "cd /d %~dp0server && npm run dev"

echo [2/3] 等待 Server 启动...
timeout /t 5 /nobreak >nul

echo [3/3] 启动 Agent (C#) - 自动连接模式...
start "WinTab Agent" cmd /k "cd /d %~dp0agent && dotnet run --project WinTabAgent -- --auto"

echo.
echo ═══════════════════════════════════════
echo   ✓ Server: http://localhost:3001
echo   ✓ Agent:  已启动
echo ═══════════════════════════════════════
echo.
echo 按任意键打开控制台...
pause >nul

start http://localhost:3001
