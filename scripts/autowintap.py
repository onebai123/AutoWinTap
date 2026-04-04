"""
AutoWinTap 自动化控制脚本
使用方法:
  python autowintap.py list                       # 列出所有窗口
  python autowintap.py send "记事本" "你好"        # 向"记事本"窗口输入"你好"
  python autowintap.py send "记事本" "你好" --enter # 输入"你好"并按回车
  python autowintap.py activate "Antigravity"     # 激活指定窗口
  python autowintap.py shell "dir"                # 执行远程命令
"""

import requests
import sys
import json
import time

# === 配置 ===
SERVER = "http://localhost:3001"
DEVICE_ID = None  # 自动获取第一个在线设备


def get_device_id():
    """获取第一个在线设备 ID"""
    global DEVICE_ID
    if DEVICE_ID:
        return DEVICE_ID
    r = requests.get(f"{SERVER}/api/agents")
    data = r.json()
    if data["success"]:
        for agent in data["data"]:
            if agent["status"] == "ONLINE":
                DEVICE_ID = agent["id"]
                print(f"✓ 设备: {agent['hostname']} ({agent['id'][:8]}...)")
                return DEVICE_ID
    print("✗ 没有在线设备")
    sys.exit(1)


def execute(plugin, action, params=None):
    """执行插件动作"""
    device_id = get_device_id()
    body = {"plugin": plugin, "action": action}
    if params:
        body["params"] = params
    r = requests.post(
        f"{SERVER}/api/agents/{device_id}/execute",
        json=body,
        timeout=30
    )
    result = r.json()
    if not result.get("success"):
        print(f"✗ 执行失败: {result.get('error', '未知错误')}")
        return None
    return result.get("data")


def list_windows():
    """列出所有窗口"""
    data = execute("window-control", "list")
    if not data:
        return []
    
    print(f"\n{'Handle':<10} {'进程名':<20} {'标题'}")
    print("-" * 70)
    for w in data:
        title = w.get("title", "")
        if "Program Manager" in title:
            continue
        process = w.get("processName", "")
        handle = w.get("handle", 0)
        print(f"{handle:<10} {process:<20} {title[:50]}")
    return data


def find_window(pattern):
    """按名称模糊查找窗口"""
    data = execute("window-control", "list")
    if not data:
        return None
    
    pattern_lower = pattern.lower()
    for w in data:
        title = w.get("title", "").lower()
        process = w.get("processName", "").lower()
        if pattern_lower in title or pattern_lower in process:
            return w
    return None


def activate_window(pattern):
    """激活窗口"""
    w = find_window(pattern)
    if not w:
        print(f"✗ 未找到匹配 '{pattern}' 的窗口")
        return False
    
    handle = w["handle"]
    title = w["title"]
    print(f"→ 激活窗口: {title} (handle={handle})")
    execute("window-control", "activate", {"handle": handle})
    time.sleep(0.3)
    return True


def send_text(pattern, text, press_enter=False):
    """向指定窗口发送文字"""
    # 1. 找到窗口
    w = find_window(pattern)
    if not w:
        print(f"✗ 未找到匹配 '{pattern}' 的窗口")
        return False
    
    handle = w["handle"]
    title = w["title"]
    print(f"→ 目标窗口: {title} (handle={handle})")
    
    # 2. 激活窗口
    print(f"→ 激活窗口...")
    execute("window-control", "activate", {"handle": handle})
    time.sleep(0.5)
    
    # 3. 发送文字
    print(f"→ 发送文字: {text}")
    result = execute("window-control", "send-keys", {"keys": text})
    if result:
        print(f"✓ 文字已发送")
    
    # 4. 按回车
    if press_enter:
        time.sleep(0.2)
        print(f"→ 按下 Enter")
        execute("window-control", "send-keys", {"keys": "{Enter}"})
        print(f"✓ Enter 已发送")
    
    return True


def run_shell(command, shell="cmd"):
    """执行远程 Shell 命令"""
    print(f"→ 执行命令 [{shell}]: {command}")
    result = execute("shell", "execute", {
        "command": command,
        "shell": shell,
        "timeout": 30000
    })
    if result and result.get("data"):
        output = result["data"].get("output", "")
        error = result["data"].get("error", "")
        success = result["data"].get("success", False)
        duration = result["data"].get("durationMs", 0)
        
        print(f"{'✓' if success else '✗'} 完成 ({duration}ms)")
        if output:
            print(output)
        if error:
            print(f"[错误] {error}")
    return result


def screenshot(pattern=None):
    """截图（全屏或指定窗口）"""
    if pattern:
        w = find_window(pattern)
        if not w:
            print(f"✗ 未找到匹配 '{pattern}' 的窗口")
            return
        result = execute("window-control", "capture", {"handle": w["handle"]})
    else:
        result = execute("window-control", "capture-screen")
    
    if result and result.get("image"):
        import base64
        img_data = base64.b64decode(result["image"])
        filename = f"screenshot_{int(time.time())}.jpg"
        with open(filename, "wb") as f:
            f.write(img_data)
        print(f"✓ 截图已保存: {filename}")


# === 主程序 ===
def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    
    cmd = sys.argv[1].lower()
    
    if cmd == "list":
        list_windows()
    
    elif cmd == "send":
        if len(sys.argv) < 4:
            print("用法: python autowintap.py send <窗口名> <文字> [--enter]")
            return
        pattern = sys.argv[2]
        text = sys.argv[3]
        press_enter = "--enter" in sys.argv
        send_text(pattern, text, press_enter)
    
    elif cmd == "activate":
        if len(sys.argv) < 3:
            print("用法: python autowintap.py activate <窗口名>")
            return
        activate_window(sys.argv[2])
    
    elif cmd == "shell":
        if len(sys.argv) < 3:
            print("用法: python autowintap.py shell <命令> [--ps]")
            return
        shell_type = "powershell" if "--ps" in sys.argv else "cmd"
        run_shell(sys.argv[2], shell_type)
    
    elif cmd == "screenshot":
        pattern = sys.argv[2] if len(sys.argv) > 2 else None
        screenshot(pattern)
    
    else:
        print(f"未知命令: {cmd}")
        print(__doc__)


if __name__ == "__main__":
    main()
