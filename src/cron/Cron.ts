import { env } from 'coa-env'
import { _ } from 'coa-helper'
import redis from '../redis'
import { Dic } from '../typings'
import { CronTime } from './CronTime'

const prefix = env.redis.prefix + '-aac-cron-'
const key_cron_last = prefix + 'last'

export class Cron {

  protected jobs: Dic<{ time: string, worker: () => any }> = {}

  // 尝试触发
  async try () {
    const deadline = _.now()
    const start = _.toInteger(await redis.io.getset(key_cron_last, deadline)) || (deadline - 1000)
    _.forEach(this.jobs, ({ time }, name) => {
      const next = new CronTime(time, { start, deadline }).next()
      if (next) this.onJob(name)
    })
  }

  // 工作者
  async worker (name: string) {
    const { worker } = this.jobs[name] || {}
    worker && await worker()
  }

  // 当有新的任务的时候
  protected onJob (name: string) {}
}
