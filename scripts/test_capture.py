import requests
import json
import base64

SERVER = "http://localhost:3001"
r = requests.get(f"{SERVER}/api/agents", timeout=5)
device_id = [a["id"] for a in r.json()["data"] if a["status"] == "ONLINE"][0]

# List windows
r = requests.post(f"{SERVER}/api/agents/{device_id}/execute", json={
    "plugin": "window-control",
    "action": "list"
})

windows = r.json().get("data", [])
target = [w for w in windows if "Antigravity" in w.get("title", "") or "Notepad" in w.get("processName", "")]
if not target:
    print("No target window found.")
else:
    handle = target[0]["handle"]
    print(f"Target window: {target[0]['title']}, Handle: {handle}")
    
    r2 = requests.post(f"{SERVER}/api/agents/{device_id}/execute", json={
        "plugin": "window-control",
        "action": "capture",
        "params": { "handle": handle }
    })
    
    res = r2.json()
    if res.get("success") and "image" in res.get("data", {}):
        img_data = base64.b64decode(res["data"]["image"])
        with open("capture_test.jpg", "wb") as f:
            f.write(img_data)
        print("wroted capture_test.jpg")
    else:
        print("Failed to capture:", res)
