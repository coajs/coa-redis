export interface Dic<T> {
  [key: string]: T
}

export interface RedisEnv {
  host: string,
  port: number,
  db: number,
  password: string,
  prefix: string,
  trace: boolean
}

declare module 'coa-env' {
  interface Env {
    redis: RedisEnv
  }
}