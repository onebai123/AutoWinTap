import { WorkflowSDK } from './workflow';

/**
 * 监控调度系统 (Supervisor)
 * 这是一个业务应用示例：当 AI 分析出任务结束时，自动通过 Workflow 控制 Agent
 */
export class SupervisionManager {

  /**
   * 处理从大模型分析返回的结果
   * @param deviceId 设备ID，表示监控来源于哪台电脑
   * @param aiAnalysisResult 大模型的返回对象（状态、问题、建议）
   */
  static async handleAIAnalysisResult(deviceId: string, aiAnalysisResult: { status: string; problems: string[]; suggestions: string[] }) {
    
    // 场景：如果监控系统/大模型分析出 Antigravity 的状态是“任务完成”或“搞定”
    if (aiAnalysisResult.status.includes('完成') || aiAnalysisResult.status.includes('搞定')) {
      
      console.log(`[Supervisor] 检测到设备 ${deviceId} 任务完成，准备分发下一阶段命令...`)

      // 利用抽象好的 Workflow SDK 直接调度底层宏，不关心繁琐的寻找和激活细节
      const result = await WorkflowSDK.sendTextCommand(
        deviceId,
        'Antigravity', // 寻找特定的目标进程
        '太棒了，继续执行下一个子模块开发吧！', // 让它接着干活
        true // 自动按回车
      );

      if (result.success) {
        console.log(`[Supervisor] 自动分发任务成功！`)
      } else {
        console.error(`[Supervisor] 自动分发失败：`, result.error)
      }
      return;
    }

    // 场景：如果大模型发现屏幕报错（代码飘红、运行报错等）
    if (aiAnalysisResult.problems && aiAnalysisResult.problems.length > 0) {
      console.log(`[Supervisor] 检测到问题，可能需要拦截...`)
      // 可以调用 WorkflowSDK 发送快捷键 'Ctrl+C' 让其停下
      // WorkflowSDK.sendTextCommand(deviceId, 'Antigravity', '{^}C', false) 
    }
  }
}
