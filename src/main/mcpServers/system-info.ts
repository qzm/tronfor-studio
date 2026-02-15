// System Info MCP Server - provides system and environment information

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import os from 'os'

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unitIndex = 0
  let value = bytes
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`
}

function getCpuUsage(): string {
  const cpus = os.cpus()
  return cpus
    .map((cpu, index) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
      const idle = cpu.times.idle
      const usage = ((1 - idle / total) * 100).toFixed(1)
      return `  Core ${index}: ${cpu.model} @ ${cpu.speed}MHz (${usage}% usage)`
    })
    .join('\n')
}

function getNetworkInterfaces(): string {
  const interfaces = os.networkInterfaces()
  const results: string[] = []
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue
    for (const addr of addrs) {
      if (addr.internal) continue
      results.push(`  ${name}: ${addr.address} (${addr.family})`)
    }
  }
  return results.length > 0 ? results.join('\n') : '  No external network interfaces found'
}

class SystemInfoServer {
  public server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'system-info-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )
    this.setupRequestHandlers()
  }

  private setupRequestHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_system_info',
          description:
            'Get comprehensive system information including OS, CPU, memory, network, and runtime details. ' +
            'Useful for understanding the environment the application is running on.',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['all', 'os', 'cpu', 'memory', 'network', 'runtime'],
                description: 'Information category to retrieve. "all" returns everything. Default: "all"',
                default: 'all'
              }
            },
            required: []
          }
        },
        {
          name: 'get_disk_usage',
          description: 'Get disk usage information for the system. Shows total, used, and free space.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'get_process_info',
          description:
            'Get information about the current process including PID, uptime, memory usage, and Node.js version.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      ]
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'get_system_info':
          return this.getSystemInfo((args as { category?: string })?.category || 'all')

        case 'get_disk_usage':
          return await this.getDiskUsage()

        case 'get_process_info':
          return this.getProcessInfo()

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`)
      }
    })
  }

  private getSystemInfo(category: string) {
    const sections: string[] = []

    if (category === 'all' || category === 'os') {
      sections.push(
        `=== Operating System ===\n` +
          `Platform: ${os.platform()}\n` +
          `Architecture: ${os.arch()}\n` +
          `OS Type: ${os.type()}\n` +
          `OS Release: ${os.release()}\n` +
          `Hostname: ${os.hostname()}\n` +
          `Home Directory: ${os.homedir()}\n` +
          `Temp Directory: ${os.tmpdir()}\n` +
          `Uptime: ${(os.uptime() / 3600).toFixed(2)} hours`
      )
    }

    if (category === 'all' || category === 'cpu') {
      const cpus = os.cpus()
      sections.push(
        `=== CPU ===\n` +
          `Model: ${cpus[0]?.model || 'Unknown'}\n` +
          `Cores: ${cpus.length}\n` +
          `Load Average (1m, 5m, 15m): ${os
            .loadavg()
            .map((l) => l.toFixed(2))
            .join(', ')}\n` +
          `Per-core details:\n${getCpuUsage()}`
      )
    }

    if (category === 'all' || category === 'memory') {
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const usedMem = totalMem - freeMem
      sections.push(
        `=== Memory ===\n` +
          `Total: ${formatBytes(totalMem)}\n` +
          `Used: ${formatBytes(usedMem)} (${((usedMem / totalMem) * 100).toFixed(1)}%)\n` +
          `Free: ${formatBytes(freeMem)} (${((freeMem / totalMem) * 100).toFixed(1)}%)`
      )
    }

    if (category === 'all' || category === 'network') {
      sections.push(`=== Network Interfaces ===\n${getNetworkInterfaces()}`)
    }

    if (category === 'all' || category === 'runtime') {
      sections.push(
        `=== Runtime ===\n` +
          `Node.js: ${process.version}\n` +
          `V8: ${process.versions.v8}\n` +
          `Electron: ${process.versions.electron || 'N/A'}\n` +
          `Chrome: ${process.versions.chrome || 'N/A'}\n` +
          `Platform: ${process.platform}\n` +
          `PID: ${process.pid}`
      )
    }

    return {
      content: [{ type: 'text', text: sections.join('\n\n') }],
      isError: false
    }
  }

  private async getDiskUsage() {
    // Use Node.js to check disk space via statvfs-like approach
    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      let result: string
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption', { timeout: 5000 })
        result = stdout
      } else {
        const { stdout } = await execAsync('df -h', { timeout: 5000 })
        result = stdout
      }

      return {
        content: [{ type: 'text', text: `=== Disk Usage ===\n${result}` }],
        isError: false
      }
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error getting disk usage: ${error instanceof Error ? error.message : String(error)}` }
        ],
        isError: true
      }
    }
  }

  private getProcessInfo() {
    const memUsage = process.memoryUsage()
    const result = [
      `=== Process Info ===`,
      `PID: ${process.pid}`,
      `PPID: ${process.ppid}`,
      `Uptime: ${(process.uptime() / 60).toFixed(2)} minutes`,
      `Title: ${process.title}`,
      `Executable: ${process.execPath}`,
      `Working Directory: ${process.cwd()}`,
      ``,
      `=== Memory Usage ===`,
      `RSS: ${formatBytes(memUsage.rss)}`,
      `Heap Total: ${formatBytes(memUsage.heapTotal)}`,
      `Heap Used: ${formatBytes(memUsage.heapUsed)}`,
      `External: ${formatBytes(memUsage.external)}`,
      `Array Buffers: ${formatBytes(memUsage.arrayBuffers)}`
    ].join('\n')

    return {
      content: [{ type: 'text', text: result }],
      isError: false
    }
  }
}

export default SystemInfoServer
