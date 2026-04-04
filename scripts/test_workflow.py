import requests, time, json

SERVER = "http://localhost:3001"
r = requests.get(f"{SERVER}/api/agents", timeout=5)
device_id = [a["id"] for a in r.json()["data"] if a["status"] == "ONLINE"][0]

workflow = {
    "plugin": "workflow",
    "action": "run",
    "params": {
        "steps": [
            {
                "id": "step_find",
                "action": "window-control.find",
                "params": {
                    "processNamePattern": "Antigravity"
                }
            },
            {
                "id": "step_activate",
                "action": "window-control.activate",
                "params": {
                    "handle": "${step_find.handle}"
                }
            },
            {
                "id": "step_delay",
                "action": "system.delay",
                "params": { "ms": 500 }
            },
            {
                "id": "step_send",
                "action": "window-control.send-keys",
                "params": {
                    "keys": "来自工作流引擎的问候！{Enter}"
                }
            }
        ]
    }
}

print(f"向设备 {device_id} 发送 Workflow 执行指令...")
start = time.time()
res = requests.post(f"{SERVER}/api/agents/{device_id}/execute", json=workflow)
duration = time.time() - start

print(f"执行耗时: {duration:.2f}s")
print(json.dumps(res.json(), indent=2, ensure_ascii=False))
