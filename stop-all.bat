@echo off
chcp 65001 >nul
title WinTab 停止

echo 停止所有 WinTab 服务...

:: 停止 Node.js (Server)
taskkill /f /im node.exe >nul 2>&1

:: 停止 Agent
taskkill /f /im WinTabAgent.exe >nul 2>&1
taskkill /f /im dotnet.exe >nul 2>&1

echo.
echo ✓ 已停止所有服务
pause
