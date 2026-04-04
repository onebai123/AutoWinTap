"""简化验证: 找到已有 Notepad 窗口，输入你好，截图对比"""
import requests, time, base64

SERVER = "http://localhost:3001"

# 获取设备
r = requests.get(f"{SERVER}/api/agents", timeout=5)
device_id = [a["id"] for a in r.json()["data"] if a["status"] == "ONLINE"][0]
print(f"[1] 设备: {device_id[:8]}")

def exe(plugin, action, params=None):
    body = {"plugin": plugin, "action": action}
    if params:
        body["params"] = params
    return requests.post(f"{SERVER}/api/agents/{device_id}/execute", json=body, timeout=10).json()

# 列出窗口
r = exe("window-control", "list")
print("[2] 所有窗口:")
for w in r["data"]:
    t = w.get("title", "")
    p = w.get("processName", "")
    if "Program Manager" not in t:
        print(f"    {w['handle']:>8} | {p:<20} | {t[:50]}")

# 找 notepad
notepad = None
for w in r["data"]:
    if "notepad" in w.get("processName", "").lower():
        notepad = w
        break

if not notepad:
    print("\n✗ 没有 Notepad 窗口，请手动打开一个记事本再运行")
    exit(1)

handle = notepad["handle"]
print(f"\n[3] 目标: {notepad['title']} (handle={handle})")

# 截图 before
print("[4] 截图 before...")
img = exe("window-control", "capture", {"handle": handle}).get("data", {}).get("image")
if img:
    with open("v_before.jpg", "wb") as f:
        f.write(base64.b64decode(img))

# 激活
print("[5] 激活...")
exe("window-control", "activate", {"handle": handle})
time.sleep(1)

# 发送
print("[6] 发送: 你好")
r2 = exe("window-control", "send-keys", {"keys": "你好"})
print(f"    result: {r2}")
time.sleep(0.5)

# 截图 after
print("[7] 截图 after...")
img = exe("window-control", "capture", {"handle": handle}).get("data", {}).get("image")
if img:
    with open("v_after.jpg", "wb") as f:
        f.write(base64.b64decode(img))

print("\n完成! 请对比 v_before.jpg 和 v_after.jpg")
