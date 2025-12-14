/**
 * Agent API 单元测试
 */

describe('Agent API', () => {
  describe('GET /api/agents', () => {
    it('should return device list', async () => {
      // TODO: 实现测试
      expect(true).toBe(true)
    })
  })

  describe('POST /api/agents/register', () => {
    it('should register new agent', async () => {
      const body = {
        machineId: 'test-machine-001',
        hostname: 'TEST-PC',
        os: 'Windows 11',
        agentVersion: '1.0.0',
        plugins: ['window-control', 'browser-debug'],
      }

      // TODO: 实现测试
      expect(body.machineId).toBe('test-machine-001')
    })

    it('should update existing agent', async () => {
      // TODO: 实现测试
      expect(true).toBe(true)
    })
  })

  describe('POST /api/agents/heartbeat', () => {
    it('should update last seen time', async () => {
      // TODO: 实现测试
      expect(true).toBe(true)
    })
  })
})
