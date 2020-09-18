import { env } from 'coa-env'
import { _ } from 'coa-helper'
import redis from '../redis'

const D = { series: 0 }

export class RedisLock {
  private readonly id: string
  private readonly value: string
  private readonly ms: number

  constructor (id: string, ms: number) {
    this.id = env.redis.prefix + '-redis-lock-' + _.snakeCase(id.trim())
    this.value = env.hostname + (++D.series) + _.random(true)
    this.ms = ms
  }

  async lock () {
    return await redis.io.set(this.id, this.value, 'PX', this.ms, 'NX')
  }

  async ttl () {
    const ms = await redis.io.pttl(this.id)
    return ms > 0 ? ms : 0
  }

  async unlock () {
    return await redis.io.get(this.id) === this.value ? await redis.io.del(this.id) : -1
  }

}