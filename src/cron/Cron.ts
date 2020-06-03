import { echo } from 'coa-echo'
import { env } from 'coa-env'
import { _ } from 'coa-helper'
import { Queue } from '..'
import redis from '../redis'
import { Dic } from '../typings'
import { CronTime } from './CronTime'

const D = { series: 0 }
const prefix = env.redis.prefix + '-aac-cron-'
const key_cron_last = prefix + 'last'

export class Cron {

  private readonly times: Dic<string>
  private readonly workers: Dic<() => Promise<void>>
  private readonly queue: { push: (id: string) => Promise<number> }

  constructor (queue: Queue) {
    this.times = {}
    this.workers = {}
    this.queue = queue.job(id => this.work(id), 'CRON')
  }

  // 添加日程计划
  job (time: string, worker: () => Promise<void>) {
    const id = ++D.series
    this.times[id] = time
    this.workers[id] = worker
  }

  // 尝试触发
  async try () {
    const deadline = _.now()
    const start = _.toInteger(await redis.io.getset(key_cron_last, deadline)) || (deadline - 1000)
    _.forEach(this.times, (time, id) => {
      const next = new CronTime(time, { start, deadline }).next()
      if (next) this.queue.push(id)
    })
  }

  // 开始执行
  private async work (id: string) {
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
