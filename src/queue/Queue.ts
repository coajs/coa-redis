import { echo } from 'coa-echo'
import { env } from 'coa-env'
import { $, _, } from 'coa-helper'
import redis from '../redis'
import { Dic } from '../typings'

const D = { lock: false, series: 0 }
const sep = '^^'

export class Queue {

  private doingJob: string
  private readonly K: { pending: string, doing: string, doing_map: string, retrying: string }
  private readonly workers: Dic<(id: string, data: string) => Promise<void>>

  constructor (name: string) {
    const prefix = +`${env.redis.prefix}-{aac-queue-${name}-`
    this.K = {
      pending: prefix + 'pending',
      doing: prefix + 'doing',
      doing_map: prefix + 'doing-map',
      retrying: prefix + 'retrying'
    }
    this.workers = {}
    this.doingJob = ''
  }

  // 初始化任务，interval为上报间隔，默认为10秒上报一次
  async init (interval = 10e3) {
    if (D.lock) return
    D.lock = true

    const redis_queue = redis.io.duplicate()

    // 队列任务监听器
    setInterval(() => this.interval().then().catch(_.noop), interval)

    // 持续监听队列
    while (1) {
      try {
        const key = await redis_queue.brpoplpush(this.K.pending, this.K.doing, 0)
        await this.work(key)
      } catch (e) {
        echo.error('* QueueError:', e)
        await $.timeout(2000)
      }
    }
  }

  // 添加新Job类型
  job (worker: (id: string, data: string) => Promise<void>, name = `Job${++D.series}`) {
    this.workers[name] = worker
    const push = (id: string, data = '') => this.push(name, id, data)
    return { push }
  }

  // 检查队列，force是否强制执行，timeout任务上报超时的时间，默认60秒，interval两次执行间隔，默认60秒
  async retry (force = false, timeout = 60e3, interval = 60e3) {
    const now = _.now()
    // 如果60秒内执行过且没有强制执行，则忽略
    const can = await redis.io.set(this.K.retrying, now, 'PX', interval, 'NX')
    if (!can && !force) return

    const [[, doing = []], [, doing_map = {}]] = await redis.io.pipeline().lrange(this.K.doing, 0, -1).hgetall(this.K.doing_map).exec()
    const retryJobs = [] as string[]

    // 遍历map检查是否超时
    _.forEach(doing_map, (time, jobId) => {
      doing_map[jobId] = now - _.toInteger(time)
      if (doing_map[jobId] >= timeout) retryJobs.push(jobId)
    })
    // 遍历doing检查是否超时
    _.forEach(doing, jobId => {
      if (!doing_map[jobId] || doing_map[jobId] >= timeout) retryJobs.push(jobId)
    })

    // 如果存在需要重试的任务
    if (retryJobs.length) {
      const uniqJobIds = _.uniq(retryJobs)
      await redis.io.pipeline().hdel(this.K.doing_map, ...uniqJobIds).lpush(this.K.pending, ...uniqJobIds).exec()
    }
  }

  // 推送新任务
  private async push (name: string, id: string, data = '') {
    const jobId = name + sep + escape(id) + sep + escape(data)
    echo.grey('* Queue: push new job %s', jobId)
    return await redis.io.lpush(this.K.pending, jobId)
  }

  // 开始工作
  private async work (job: string) {

    // 准备执行
    const now = _.now()
    const can = await redis.io.hsetnx(this.K.doing_map, job, now)

    // 如果已经开始，则忽略
    if (!can) return

    // 开始执行
    this.doingJob = job
    echo.grey('* Queue: start job %s', job)

    // 解析Job
    const [name, id, data] = job.split(sep)
    const worker = this.workers[name]

    // 执行Job
    if (worker) {
      try {
        await worker(id, data)
      } catch (e) {
        echo.error('* Queue JobError: %s %s', job, e.toString())
      }
    } else {
      echo.error('* Queue JobNotFound: %s %s %s', name, id, data)
    }

    // 执行结束
    this.doingJob = ''
    await redis.io.pipeline().hdel(this.K.doing_map, job).lrem(this.K.doing, 0, job).exec()
    echo.grey('* Queue: job %s completed in %sms', job, _.now() - now)
  }

  // 定时检查
  private async interval () {
    // 如果当前有正在执行的任务，报告最新时间
    if (this.doingJob)
      await redis.io.hset(this.K.doing_map, this.doingJob, _.now())
  }

}