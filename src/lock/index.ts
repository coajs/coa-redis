import { die } from 'coa-error'
import { $ } from 'coa-helper'
import { RedisLock } from './RedisLock'

export default new class {

  // 开始共享阻塞锁事务
  async start<T> (id: string, worker: () => Promise<T>, ms = 2000, interval = 200) {

    const lock = new RedisLock(id, ms)

    // 判断是否能锁上，如果不能锁上，则等待锁被释放
    while (!await lock.lock()) {
      await $.timeout(interval)
    }

    // 执行操作，无论是否成功均释放锁
    return await worker().finally(() => {
      lock.unlock().then()
    })

  }

  // 尝试事务，如果正在进行则直接报错
  async try<T> (id: string, worker: () => Promise<T>, ms = 2000) {

    const lock = new RedisLock(id, ms)

    // 判断是否能锁上，如果不能锁上，则直接报错
    await lock.lock() || die.hint('Running')

    // 执行操作，无论是否成功均释放锁
    return await worker().finally(() => {
      lock.unlock().then()
    })

  }

  // 节流事务，限制执行频率
  async throttle<T> (id: string, worker: () => Promise<T>, ms: number) {

    const lock = new RedisLock(id, ms)

    // 判断是否能锁上，如果不能锁上，则按时间等待
    while (!await lock.lock()) {
      await $.timeout(await lock.ttl())
    }

    // 执行操作，无论是否成功不释放锁，等待锁自己释放
    return await worker()

  }
}