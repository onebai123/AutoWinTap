"""列出所有 Antigravity 窗口并向指定窗口发送你好"""
import requests, time, sys

SERVER = "http://localhost:3001"
r = requests.get(f"{SERVER}/api/agents", timeout=5)
device_id = [a["id"] for a in r.json()["data"] if a["status"] == "ONLINE"][0]

def exe(plugin, action, params=None):
    body = {"plugin": plugin, "action": action}
    if params:
        body["params"] = params
    return requests.post(f"{SERVER}/api/agents/{device_id}/execute", json=body, timeout=10).json()

# 列出所有 Antigravity 窗口
r = exe("window-control", "list")
anti_windows = [w for w in r["data"] if "Antigravity" in w.get("processName", "")]

print(f"找到 {len(anti_windows)} 个 Antigravity 窗口:\n")
for i, w in enumerate(anti_windows):
    print(f"  [{i+1}] handle={w['handle']}  title={w['title']}")

# 如果指定了序号，向该窗口发送你好
if len(sys.argv) > 1:
    idx = int(sys.argv[1]) - 1
    target = anti_windows[idx]
    print(f"\n→ 目标: [{idx+1}] {target['title']}")
    print(f"→ 激活窗口...")
    exe("window-control", "activate", {"handle": target["handle"]})
    time.sleep(0.5)
    print(f"→ 发送: 你好")
    exe("window-control", "send-keys", {"keys": "你好"})
    time.sleep(0.3)
    print(f"→ 按 Enter")
    exe("window-control", "send-keys", {"keys": "{Enter}"})
    print(f"✓ 完成!")
