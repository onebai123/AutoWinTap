/**
 * AutoWinTap Workflow API SDK
 * 供服务端其他模块（如 AI 监控模块、自动化告警等）快速调用 Agent 的工作流引擎
 */

export class WorkflowSDK {
  private static getApiBase(deviceId: string): string {
    // 这里如果以后支持分布式可以通过 DB 获取设备的 IP
    // 目前使用本地约定
    return `http://localhost:3001/api/agents/${deviceId}/execute`
  }

  /**
   * 极简场景：向目标进程发送特定文本命令
   * 常用于：监控到某任务完成，自动调用此方法输入下一条指令
   * 
   * @param deviceId 设备ID
   * @param processNamePattern 目标进程名特征（如 "Antigravity", "WeChat"）
   * @param text 要发送的文本
   * @param pressEnter 是否在末尾自动附加回车
   * @param titlePattern 可选，目标窗口标题特征
   */
  static async sendTextCommand(
    deviceId: string, 
    processNamePattern: string, 
    text: string, 
    pressEnter: boolean = true,
    titlePattern?: string
  ) {
    const keys = pressEnter ? `${text}{Enter}` : text;

    const payload = {
      plugin: 'workflow',
      action: 'run',
      params: {
        steps: [
          {
            id: 'find_target',
            action: 'window-control.find',
            params: {
              processNamePattern,
              ...(titlePattern ? { titlePattern } : {})
            }
          },
          {
            id: 'activate',
            action: 'window-control.activate',
            params: {
              handle: '${find_target.handle}'
            }
          },
          {
            id: 'delay_focus',
            action: 'system.delay',
            params: { ms: 300 }
          },
          {
            id: 'type_text',
            action: 'window-control.send-keys',
            params: { keys }
          }
        ]
      }
    };

    try {
      const response = await fetch(this.getApiBase(deviceId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const res = await response.json();
      return res;
    } catch (error) {
      console.error('[WorkflowSDK] sendTextCommand error:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 通知告警：向最近活动的通知应用发送消息
   */
  static async sendNotification(deviceId: string, warningText: string) {
    // 假设用写字板或者记事本告警
    return this.sendTextCommand(deviceId, 'Notepad', `[AutoWinTap 监控告警] ${warningText}`, true);
  }
}
