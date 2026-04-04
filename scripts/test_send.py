"""
完整测试: 向 Antigravity 窗口发送"你好"，截图验证
"""
import requests
import time
import base64
import sys

SERVER = "http://localhost:3001"

def get_device():
    r = requests.get(f"{SERVER}/api/agents")
    for a in r.json()["data"]:
        if a["status"] == "ONLINE":
            return a["id"], a["hostname"]
    return None, None

def execute(device_id, plugin, action, params=None):
    body = {"plugin": plugin, "action": action}
    if params:
        body["params"] = params
    r = requests.post(f"{SERVER}/api/agents/{device_id}/execute", json=body, timeout=30)
    return r.json()

def save_screenshot(data, filename):
    if data and data.get("image"):
        with open(filename, "wb") as f:
            f.write(base64.b64decode(data["image"]))
        print(f"  截图已保存: {filename}")
        return True
    print(f"  截图失败")
    return False

def main():
    device_id, hostname = get_device()
    if not device_id:
        print("✗ 没有在线设备")
        return
    print(f"✓ 设备: {hostname}")
    
    # Step 1: 列出所有窗口，找 Antigravity
    print("\n[Step 1] 查找 Antigravity 窗口...")
    result = execute(device_id, "window-control", "list")
    if not result.get("success"):
        print("✗ 获取窗口列表失败")
        return
    
    target = None
    for w in result["data"]:
        title = w.get("title", "")
        process = w.get("processName", "")
        if "antigravity" in process.lower() or "antigravity" in title.lower():
            target = w
            print(f"  ✓ 找到: handle={w['handle']}, process={process}, title={title[:60]}")
    
    if not target:
        print("✗ 未找到 Antigravity 窗口")
        print("所有窗口:")
        for w in result["data"]:
            print(f"  {w['handle']} | {w.get('processName','')} | {w.get('title','')[:50]}")
        return
    
    handle = target["handle"]
    
    # Step 2: 截图（发送前）
    print(f"\n[Step 2] 截图 - 发送前...")
    r = execute(device_id, "window-control", "capture", {"handle": handle})
    save_screenshot(r.get("data"), "before.jpg")
    
    # Step 3: 激活窗口
    print(f"\n[Step 3] 激活窗口 (handle={handle})...")
    r = execute(device_id, "window-control", "activate", {"handle": handle})
    print(f"  结果: success={r.get('success')}")
    time.sleep(1)
    
    # Step 4: 发送"你好"
    print(f"\n[Step 4] 发送文字: 你好")
    r = execute(device_id, "window-control", "send-keys", {"keys": "你好"})
    print(f"  结果: success={r.get('success')}, data={r.get('data')}")
    time.sleep(0.5)
    
    # Step 5: 截图（发送后）
    print(f"\n[Step 5] 截图 - 发送后...")
    r = execute(device_id, "window-control", "capture", {"handle": handle})
    save_screenshot(r.get("data"), "after.jpg")
    
    print(f"\n完成! 请对比 before.jpg 和 after.jpg 确认'你好'是否出现")

if __name__ == "__main__":
    main()
