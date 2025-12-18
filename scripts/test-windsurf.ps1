# Windsurf 自动化测试脚本
# 用法: .\test-windsurf.ps1 -Action <action> [-Message <msg>] [-X <x>] [-Y <y>]

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("screenshot", "mouse", "setpos", "send", "window", "health")]
    [string]$Action,
    
    [string]$Message = "test message",
    [int]$X = 0,
    [int]$Y = 0
)

$BaseUrl = "http://localhost:3001"
$DeviceId = "27349e69-0ca3-4279-8b19-6541c70fe807"

function Invoke-Agent {
    param($Plugin, $ActionName, $Params = @{})
    $body = @{plugin=$Plugin; action=$ActionName; params=$Params} | ConvertTo-Json -Depth 3
    $result = Invoke-RestMethod -Uri "$BaseUrl/api/agents/$DeviceId/execute" -Method POST -Body $body -ContentType "application/json"
    return $result
}

switch ($Action) {
    "health" {
        Write-Host "检查 Agent 状态..." -ForegroundColor Cyan
        $result = Invoke-RestMethod -Uri "http://localhost:5200/health"
        Write-Host "状态: $($result.status)" -ForegroundColor Green
        Write-Host "插件: $($result.plugins -join ', ')"
    }
    
    "screenshot" {
        Write-Host "截图中..." -ForegroundColor Cyan
        $result = Invoke-Agent -Plugin "window-control" -ActionName "capture-screen"
        if ($result.success) {
            $path = "D:\git\AutoWinTap\screenshot_$(Get-Date -Format 'HHmmss').png"
            [System.IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($result.data.image))
            Write-Host "截图已保存: $path" -ForegroundColor Green
        } else {
            Write-Host "截图失败: $($result.error)" -ForegroundColor Red
        }
    }
    
    "mouse" {
        Write-Host "获取鼠标位置..." -ForegroundColor Cyan
        $result = Invoke-Agent -Plugin "windsurf" -ActionName "get-mouse-position"
        if ($result.success) {
            Write-Host "鼠标位置: X=$($result.data.x), Y=$($result.data.y)" -ForegroundColor Green
        }
    }
    
    "setpos" {
        if ($X -eq 0 -or $Y -eq 0) {
            Write-Host "请指定坐标: -X <x> -Y <y>" -ForegroundColor Yellow
            return
        }
        Write-Host "设置输入框位置: ($X, $Y)..." -ForegroundColor Cyan
        $result = Invoke-Agent -Plugin "windsurf" -ActionName "set-input-position" -Params @{x=$X; y=$Y}
        if ($result.success) {
            Write-Host "设置成功!" -ForegroundColor Green
        }
    }
    
    "send" {
        Write-Host "发送消息: $Message" -ForegroundColor Cyan
        $params = @{message=$Message}
        if ($X -gt 0 -and $Y -gt 0) {
            $params.x = $X
            $params.y = $Y
        }
        $result = Invoke-Agent -Plugin "windsurf" -ActionName "send-message" -Params $params
        if ($result.success) {
            Write-Host "发送成功! 时间: $($result.data.timestamp)" -ForegroundColor Green
        } else {
            Write-Host "发送失败: $($result.error)" -ForegroundColor Red
        }
    }
    
    "window" {
        Write-Host "获取窗口信息..." -ForegroundColor Cyan
        $result = Invoke-Agent -Plugin "windsurf" -ActionName "get-window-info"
        if ($result.success) {
            $d = $result.data
            Write-Host "窗口: $($d.width) x $($d.height) @ ($($d.left), $($d.top))" -ForegroundColor Green
            Write-Host "估计输入框: ($($d.estimatedInputBox.x), $($d.estimatedInputBox.y))"
        }
    }
}
