import { echo } from 'coa-echo'
import { RedisBin } from '../RedisBin'
import { Redis } from '../typings'

const sep = '^^'

export interface RedisQueueKeys {
  prefix: string
  pending: string
  doing: string
  doing_map: string
  retrying: string
}

export class RedisQueue {
  readonly name: string
  readonly keys: RedisQueueKeys
  readonly bin: RedisBin
  readonly io: Redis.Redis

  constructor(bin: RedisBin, name: string) {
    const prefix = `${bin.config.prefix}-{aac-queue-${name}}-`
    this.keys = {
      prefix,
      pending: prefix + 'pending',
      doing: prefix + 'doing',
      doing_map: prefix + 'doing-map',
      retrying: prefix + 'retrying',
    }
    this.bin = bin
    this.io = bin.io
    this.name = name
  }

  // 推送新任务
  public async push(name: string, id: string, data: Record<string, any>) {
    const job = name + sep + id + sep + JSON.stringify(data)
    echo.grey('* Queue: push new job %s', job)
    return await this.io.lpush(this.keys.pending, job)
  }

  // 定义一个新的推送者
  definePusher(name: string) {
    return async (id: string, data: Record<string, any>) => await this.push(name, id, data)
  }
}
