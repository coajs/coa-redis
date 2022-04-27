import { echo } from 'coa-echo'
import { $, _ } from 'coa-helper'
import { RedisBin } from '../RedisBin'
import { CoaRedis, Redis } from '../typings'
import { RedisQueue, RedisQueueKeys } from './RedisQueue'

const sep = '^^'

export class RedisQueueWorker {
  public readonly queue: RedisQueue

  private lock = false
  private doingJob: string
  private retryAt: number
  private readonly keys: RedisQueueKeys
  private readonly workers: CoaRedis.Dic<(id: string, data: Record<string, any>) => Promise<void>>
  private readonly bin: RedisBin
  private readonly io: Redis.Redis
  private readonly ioRead: Redis.Redis

  constructor(queue: RedisQueue) {
    this.queue = queue
    this.bin = queue.bin
    this.keys = queue.keys
    this.workers = {}
    this.doingJob = ''
    this.retryAt = 0
    this.io = queue.io
    this.ioRead = queue.io.duplicate()
  }

  // 初始化任务，interval为上报间隔，默认为10秒上报一次
  async init(interval = 10e3) {
    if (this.lock) return
    this.lock = true

    // 队列任务监听器
    setInterval(() => {
      this.interval().then(_.noop, _.noop)
    }, interval)

    // 持续监听队列
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const key = await this.ioRead.brpoplpush(this.keys.pending, this.keys.doing, 0)
        await this.work(key)
      } catch (e) {
        echo.error('* QueueError:', e)
        await $.timeout(2000)
      }
    }
  }

  // 添加新工作类型
  on(name: string, worker: (id: string, data: Record<string, any>) => Promise<void>) {
    this.workers[name] = worker
    return this.queue.definePusher(name)
  }

  // 检查队列，force是否强制执行，timeout任务上报超时的时间，默认180秒，interval两次执行间隔，默认60秒
  private async retry(force = false, timeout = 180e3, interval = 60e3) {
    const now = _.now()
    // 如果60秒内执行过且没有强制执行，则忽略
    const can = await this.io.set(this.keys.retrying, now, 'PX', interval, 'NX')
    if (!can && !force) return

    const [[, doing = []], [, doing_map = {}]] = await this.io.pipeline().lrange(this.keys.doing, 0, -1).hgetall(this.keys.doing_map).exec()
    const retryJobs = [] as string[]

    // 遍历map检查是否超时
    _.forEach(doing_map, (time, jobId) => {
      doing_map[jobId] = now - _.toInteger(time)
      if (doing_map[jobId] > timeout) retryJobs.push(jobId)
    })
    // 遍历doing检查是否超时
    _.forEach(doing, (jobId) => {
      if (doing_map[jobId] === undefined || doing_map[jobId] > timeout) retryJobs.push(jobId)
    })

    // 如果存在需要重试的任务
    if (retryJobs.length) {
      const uniqJobIds = _.uniq(retryJobs)
      await this.io
        .pipeline()
        .hdel(this.keys.doing_map, ...uniqJobIds)
        .lpush(this.keys.pending, ...uniqJobIds)
        .exec()
    }
  }

  // 开始工作
  private async work(job: string) {
    // 准备执行
    const now = _.now()
    const can = await this.io.hsetnx(this.keys.doing_map, job, now)

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
        await worker(id, JSON.parse(data))
      } catch (e: any) {
        echo.error('* Queue JobError: %s %s', job, e.toString())
      }
    } else {
      echo.error('* Queue JobNotFound: %s %s %s', name, id, data)
    }

    // 执行结束
    this.doingJob = ''
    await this.io.pipeline().hdel(this.keys.doing_map, job).lrem(this.keys.doing, 0, job).exec()
    echo.grey('* Queue: job %s completed in %sms', job, _.now() - now)
  }

  // 定时检查
  private async interval() {
    const now = _.now()
    // 如果当前有正在执行的任务，报告最新时间
    if (this.doingJob) await this.io.hset(this.keys.doing_map, this.doingJob, now)
    // 每隔60秒重试
    if (now - this.retryAt > 60e3) {
      this.retry().then(_.noop, _.noop)
      this.retryAt = now
    }
  }
}
