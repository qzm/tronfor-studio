// Amap (高德地图) MCP Server - Chinese mapping and location services

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { net } from 'electron'

const BASE_URL = 'https://restapi.amap.com/v3'

const GEO_SEARCH_TOOL: Tool = {
  name: 'amap_geo_search',
  description:
    '地理编码：将地址描述转换为经纬度坐标。支持结构化地址和关键字。' +
    'Geocoding: Convert address descriptions into latitude/longitude coordinates.',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: '结构化地址信息，如"北京市朝阳区阜通东大街6号"'
      },
      city: {
        type: 'string',
        description: '指定查询的城市，可以使用城市名称、citycode、adcode。如"北京"'
      }
    },
    required: ['address']
  }
}

const REVERSE_GEO_TOOL: Tool = {
  name: 'amap_reverse_geo',
  description:
    '逆地理编码：将经纬度坐标转换为地址描述。' +
    'Reverse geocoding: Convert coordinates to address descriptions.',
  inputSchema: {
    type: 'object',
    properties: {
      longitude: {
        type: 'number',
        description: '经度 (Longitude)'
      },
      latitude: {
        type: 'number',
        description: '纬度 (Latitude)'
      }
    },
    required: ['longitude', 'latitude']
  }
}

const POI_SEARCH_TOOL: Tool = {
  name: 'amap_poi_search',
  description:
    'POI搜索：搜索附近的兴趣点（餐厅、酒店、景点等）。' +
    'POI Search: Search for nearby points of interest (restaurants, hotels, attractions, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      keywords: {
        type: 'string',
        description: '搜索关键词，如"肯德基"、"加油站"'
      },
      city: {
        type: 'string',
        description: '查询城市，如"上海"'
      },
      types: {
        type: 'string',
        description: 'POI类型编码，多个用"|"分隔'
      },
      location: {
        type: 'string',
        description: '中心点坐标，格式"经度,纬度"，如"116.397428,39.90923"'
      },
      radius: {
        type: 'number',
        description: '搜索半径（米），默认3000，最大50000',
        default: 3000
      },
      page_size: {
        type: 'number',
        description: '每页结果数，默认10，最大25',
        default: 10
      }
    },
    required: ['keywords']
  }
}

const DIRECTION_TOOL: Tool = {
  name: 'amap_direction',
  description:
    '路径规划：计算两点之间的驾车/步行/骑行/公交路线。' +
    'Route planning: Calculate driving/walking/cycling/transit routes between two points.',
  inputSchema: {
    type: 'object',
    properties: {
      origin: {
        type: 'string',
        description: '起点坐标，格式"经度,纬度"，如"116.481028,39.989643"'
      },
      destination: {
        type: 'string',
        description: '终点坐标，格式"经度,纬度"，如"116.465302,40.004717"'
      },
      mode: {
        type: 'string',
        enum: ['driving', 'walking', 'bicycling', 'transit'],
        description: '出行方式：driving(驾车)、walking(步行)、bicycling(骑行)、transit(公交)',
        default: 'driving'
      },
      city: {
        type: 'string',
        description: '公交模式时必填，起点所在城市'
      }
    },
    required: ['origin', 'destination']
  }
}

const WEATHER_TOOL: Tool = {
  name: 'amap_weather',
  description:
    '天气查询：获取指定城市的实时天气或天气预报。' +
    'Weather query: Get real-time weather or weather forecast for a specified city.',
  inputSchema: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: '城市编码(adcode)或城市名称，如"110101"或"北京"'
      },
      extensions: {
        type: 'string',
        enum: ['base', 'all'],
        description: '"base"返回实时天气，"all"返回预报。默认"base"',
        default: 'base'
      }
    },
    required: ['city']
  }
}

const IP_LOCATION_TOOL: Tool = {
  name: 'amap_ip_location',
  description:
    'IP定位：通过IP地址获取大致位置信息。不传IP则定位当前设备。' +
    'IP Location: Get approximate location through IP address.',
  inputSchema: {
    type: 'object',
    properties: {
      ip: {
        type: 'string',
        description: 'IP地址，不传则使用当前设备IP'
      }
    },
    required: []
  }
}

async function amapFetch(apiKey: string, path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('output', 'json')
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  const response = await net.fetch(url.toString(), {
    headers: { Accept: 'application/json' }
  })

  if (!response.ok) {
    throw new Error(`Amap API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  if (data.status === '0') {
    throw new Error(`Amap API error: ${data.info || 'Unknown error'} (code: ${data.infocode})`)
  }

  return data
}

function formatGeoResult(data: any): string {
  const geocodes = data.geocodes || []
  if (geocodes.length === 0) return 'No results found'

  return geocodes
    .map((g: any) => {
      return [
        `Address: ${g.formatted_address || 'N/A'}`,
        `Province: ${g.province || 'N/A'}`,
        `City: ${g.city || 'N/A'}`,
        `District: ${g.district || 'N/A'}`,
        `Location: ${g.location || 'N/A'}`,
        `Level: ${g.level || 'N/A'}`
      ].join('\n')
    })
    .join('\n---\n')
}

function formatReverseGeoResult(data: any): string {
  const regeocode = data.regeocode
  if (!regeocode) return 'No results found'

  const addr = regeocode.addressComponent || {}
  return [
    `Formatted Address: ${regeocode.formatted_address || 'N/A'}`,
    `Province: ${addr.province || 'N/A'}`,
    `City: ${addr.city || 'N/A'}`,
    `District: ${addr.district || 'N/A'}`,
    `Township: ${addr.township || 'N/A'}`,
    `Street: ${addr.streetNumber?.street || 'N/A'} ${addr.streetNumber?.number || ''}`,
    `Business Area: ${(addr.businessAreas || []).map((b: any) => b.name).join(', ') || 'N/A'}`
  ].join('\n')
}

function formatPOIResult(data: any): string {
  const pois = data.pois || []
  if (pois.length === 0) return 'No POIs found'

  return `Found ${data.count || pois.length} results:\n\n` +
    pois
      .map((poi: any) => {
        return [
          `Name: ${poi.name}`,
          `Type: ${poi.type || 'N/A'}`,
          `Address: ${poi.address || 'N/A'}`,
          `Location: ${poi.location || 'N/A'}`,
          `Tel: ${poi.tel || 'N/A'}`,
          `Distance: ${poi.distance ? poi.distance + 'm' : 'N/A'}`,
          `Rating: ${poi.biz_ext?.rating || 'N/A'}`
        ].join('\n')
      })
      .join('\n---\n')
}

function formatDirectionResult(data: any, mode: string): string {
  if (mode === 'transit') {
    const transit = data.route?.transits?.[0]
    if (!transit) return 'No transit route found'
    return [
      `Duration: ${(parseInt(transit.duration) / 60).toFixed(0)} minutes`,
      `Walking Distance: ${transit.walking_distance || 'N/A'}m`,
      `Cost: ${transit.cost || 'N/A'} CNY`,
      `Segments: ${(transit.segments || []).map((s: any) => {
        const bus = s.bus?.buslines?.[0]
        if (bus) return `${bus.name} (${bus.departure_stop?.name} → ${bus.arrival_stop?.name})`
        return 'Walk'
      }).join(' → ')}`
    ].join('\n')
  }

  const route = data.route
  if (!route) return 'No route found'

  const path = route.paths?.[0]
  if (!path) return 'No path found'

  return [
    `Distance: ${(parseInt(path.distance) / 1000).toFixed(1)} km`,
    `Duration: ${(parseInt(path.duration) / 60).toFixed(0)} minutes`,
    `Tolls: ${path.tolls || '0'} CNY`,
    `Toll Distance: ${path.toll_distance ? (parseInt(path.toll_distance) / 1000).toFixed(1) + ' km' : 'N/A'}`,
    `Traffic Lights: ${path.traffic_lights || 'N/A'}`,
    `Strategy: ${path.strategy || 'N/A'}`
  ].join('\n')
}

function formatWeatherResult(data: any, extensions: string): string {
  if (extensions === 'all') {
    const forecasts = data.forecasts?.[0]
    if (!forecasts) return 'No forecast data'

    return [
      `City: ${forecasts.city}`,
      `Report Time: ${forecasts.reporttime}`,
      ``,
      ...(forecasts.casts || []).map((cast: any) => {
        return [
          `Date: ${cast.date} (${cast.week})`,
          `  Day: ${cast.dayweather}, ${cast.daytemp}°C, ${cast.daywind}风 ${cast.daypower}级`,
          `  Night: ${cast.nightweather}, ${cast.nighttemp}°C, ${cast.nightwind}风 ${cast.nightpower}级`
        ].join('\n')
      })
    ].join('\n')
  }

  const lives = data.lives?.[0]
  if (!lives) return 'No weather data'

  return [
    `City: ${lives.city}`,
    `Weather: ${lives.weather}`,
    `Temperature: ${lives.temperature}°C`,
    `Wind: ${lives.winddirection}风 ${lives.windpower}级`,
    `Humidity: ${lives.humidity}%`,
    `Report Time: ${lives.reporttime}`
  ].join('\n')
}

class AmapServer {
  public server: Server
  private apiKey: string

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('AMAP_API_KEY is required for Amap MCP server')
    }
    this.apiKey = apiKey
    this.server = new Server(
      {
        name: 'amap-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )
    this.initialize()
  }

  private initialize() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [GEO_SEARCH_TOOL, REVERSE_GEO_TOOL, POI_SEARCH_TOOL, DIRECTION_TOOL, WEATHER_TOOL, IP_LOCATION_TOOL]
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params

        if (!args) {
          throw new Error('No arguments provided')
        }

        switch (name) {
          case 'amap_geo_search': {
            const { address, city } = args as { address: string; city?: string }
            const data = await amapFetch(this.apiKey, '/geocode/geo', {
              address,
              ...(city ? { city } : {})
            })
            return { content: [{ type: 'text', text: formatGeoResult(data) }], isError: false }
          }

          case 'amap_reverse_geo': {
            const { longitude, latitude } = args as { longitude: number; latitude: number }
            const data = await amapFetch(this.apiKey, '/geocode/regeo', {
              location: `${longitude},${latitude}`,
              extensions: 'base'
            })
            return { content: [{ type: 'text', text: formatReverseGeoResult(data) }], isError: false }
          }

          case 'amap_poi_search': {
            const { keywords, city, types, location, radius = 3000, page_size = 10 } = args as {
              keywords: string
              city?: string
              types?: string
              location?: string
              radius?: number
              page_size?: number
            }
            const params: Record<string, string> = {
              keywords,
              ...(city ? { city } : {}),
              ...(types ? { types } : {}),
              ...(location ? { location } : {}),
              radius: String(radius),
              offset: String(page_size)
            }
            const data = await amapFetch(this.apiKey, '/place/text', params)
            return { content: [{ type: 'text', text: formatPOIResult(data) }], isError: false }
          }

          case 'amap_direction': {
            const { origin, destination, mode = 'driving', city } = args as {
              origin: string
              destination: string
              mode?: string
              city?: string
            }

            let path: string
            const params: Record<string, string> = { origin, destination }

            switch (mode) {
              case 'walking':
                path = '/direction/walking'
                break
              case 'bicycling':
                path = '/direction/bicycling'
                break
              case 'transit':
                path = '/direction/transit/integrated'
                if (city) params.city = city
                break
              case 'driving':
              default:
                path = '/direction/driving'
                break
            }

            const data = await amapFetch(this.apiKey, path, params)
            return { content: [{ type: 'text', text: formatDirectionResult(data, mode) }], isError: false }
          }

          case 'amap_weather': {
            const { city, extensions = 'base' } = args as { city: string; extensions?: string }
            const data = await amapFetch(this.apiKey, '/weather/weatherInfo', { city, extensions })
            return { content: [{ type: 'text', text: formatWeatherResult(data, extensions) }], isError: false }
          }

          case 'amap_ip_location': {
            const { ip } = args as { ip?: string }
            const data = await amapFetch(this.apiKey, '/ip', ip ? { ip } : {})
            const result = [
              `Province: ${data.province || 'N/A'}`,
              `City: ${data.city || 'N/A'}`,
              `Adcode: ${data.adcode || 'N/A'}`,
              `Rectangle: ${data.rectangle || 'N/A'}`
            ].join('\n')
            return { content: [{ type: 'text', text: result }], isError: false }
          }

          default:
            return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        }
      }
    })
  }
}

export default AmapServer
