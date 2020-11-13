import { echo } from 'coa-echo'
import { RedisBin } from '../RedisBin'
import { Redis } from '../typings'

const sep = '^^'

export namespace RedisQueue {
  export type Keys = { pending: string, doing: string, doing_map: string, retrying: string }
}

export class RedisQueue {

  readonly keys: RedisQueue.Keys
  readonly bin: RedisBin
  readonly io: Redis.Redis

  constructor (bin: RedisBin, name: string) {
    const prefix = `${bin.config.prefix}-{aac-queue-${name}}-`
    this.keys = {
      pending: prefix + 'pending',
      doing: prefix + 'doing',
      doing_map: prefix + 'doing-map',
      retrying: prefix + 'retrying'
    }
    this.bin = bin
    this.io = bin.io
  }

  // 推送新任务
  public async push (name: string, id: string, data: object) {
    const job = name + sep + id + sep + JSON.stringify(data)
    echo.grey('* Queue: push new job %s', job)
    return await this.io.lpush(this.keys.pending, job)
  }

  // 定义一个新的推送者
  definePusher (name: string) {
    return (id: string, data: object) => this.push(name, id, data)
  }

}