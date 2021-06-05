import * as Redis from 'ioredis'

export { Redis }

export interface CoaRedisDic<T> {
  [key: string]: T
}

export interface CoaRedisConfig {
  host: string
  port: number
  db: number
  password: string
  prefix: string
  trace: boolean
}

export type CoaRedisCacheDelete = [string, string[]]
