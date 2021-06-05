import { echo } from 'coa-echo'
import { _ } from 'coa-helper'
import { RedisQueueWorker } from '../queue/RedisQueueWorker'
import { CoaRedisDic, Redis } from '../typings'
import { CronTime } from './CronTime'

const D = { series: 0 }

export class RedisCron {
  private readonly times: CoaRedisDic<string>
  private readonly workers: CoaRedisDic<() => Promise<void>>
  private readonly pusher: (id: string, data: object) => Promise<number>

  private readonly version: string
  private readonly key_cron_last: string
  private readonly io: Redis.Redis

  constructor(worker: RedisQueueWorker, version: string) {
    this.times = {}
    this.workers = {}
    this.pusher = worker.on('CRON', async (id) => await this.work(id))
    this.key_cron_last = worker.queue.keys.prefix + 'cron-last'
    this.version = version || ''
    this.io = worker.queue.bin.io
  }

  // 添加日程计划
  on(time: string, worker: () => Promise<void>) {
    const id = `${this.version}-${++D.series}`
    this.times[id] = time
    this.workers[id] = worker
  }

  // 尝试触发
  async try() {
    const deadline = _.now()
    const start = _.toInteger(await this.io.getset(this.key_cron_last, deadline)) || deadline - 1000
    _.forEach(this.times, (time, id) => {
      const next = new CronTime(time, { start, deadline }).next()
      next && this.pusher(id, {})
    })
  }

  // 开始执行
  private async work(id: string) {
    const worker = this.workers[id]
    if (worker) {
      try {
        await worker()
      } catch (e) {
        echo.error('* Cron JobError: %s %s', id, this.times[id], e.toString())
      }
    } else {
      echo.error('* Cron JobNotFound: %s %s', id, this.times[id])
    }
  }
}
