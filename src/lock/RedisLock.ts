import { CoaError } from 'coa-error'
import { $, _ } from 'coa-helper'
import { RedisBin } from '../RedisBin'
import { Redis } from '../typings'

const D = { series: 0 }

const hostname = process.env.hostname ?? ''

class Lock {
  private readonly id: string
  private readonly value: string
  private readonly ms: number
  private readonly io: Redis.Redis

  constructor(bin: RedisBin, id: string, ms: number) {
    this.io = bin.io
    this.id = bin.config.prefix + '-redis-lock-' + _.kebabCase(id.trim())
    this.value = hostname + ++D.series + _.random(true)
    this.ms = ms
  }

  async lock() {
    return await this.io.set(this.id, this.value, 'PX', this.ms, 'NX')
  }

  async ttl() {
    const ms = await this.io.pttl(this.id)
    return ms > 0 ? ms : 0
  }

  async unlock() {
    return (await this.io.get(this.id)) === this.value ? await this.io.del(this.id) : -1
  }
}

export class RedisLock {
  private readonly bin: RedisBin

  constructor(bin: RedisBin) {
    this.bin = bin
  }

  // 开始共享阻塞锁事务
  async start<T>(id: string, worker: () => Promise<T>, ms = 2000, interval = 200) {
    const lock = new Lock(this.bin, id, ms)

    // 判断是否能锁上，如果不能锁上，则等待锁被释放
    while (!(await lock.lock())) {
      await $.timeout(interval)
    }

    // 执行操作，无论是否成功均释放锁
    return await worker().finally(() => {
      lock.unlock().then(_.noop, _.noop)
    })
  }

  // 尝试事务，如果正在进行则直接报错
  async try<T>(id: string, worker: () => Promise<T>, ms = 2000) {
    const lock = new Lock(this.bin, id, ms)

    // 判断是否能锁上，如果不能锁上，则直接报错
    ;(await lock.lock()) ?? CoaError.throw('RedisLock.Running', 'Running')

    // 执行操作，无论是否成功均释放锁
    return await worker().finally(() => {
      lock.unlock().then(_.noop, _.noop)
    })
  }

  // 节流事务，限制执行频率
  async throttle<T>(id: string, worker: () => Promise<T>, ms: number) {
    const lock = new Lock(this.bin, id, ms)

    // 判断是否能锁上，如果不能锁上，则按时间等待
    while (!(await lock.lock())) {
      await $.timeout(await lock.ttl())
    }

    // 执行操作，无论是否成功不释放锁，等待锁自己释放
    return await worker()
  }
}
