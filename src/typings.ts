import * as Redis from 'ioredis'

export { Redis }

export interface Dic<T> {
  [key: string]: T
}

export interface RedisConfig {
  host: string,
  port: number,
  db: number,
  password: string,
  prefix: string,
  trace: boolean
}

export type CacheDelete = [string, string[]]