import { CoaError } from 'coa-error'
import { CoaRedis } from '../typings'

const name_map = ['second', 'minute', 'hour', 'date', 'month', 'day']
const range_map = [
  [0, 59],
  [0, 59],
  [0, 23],
  [1, 31],
  [0, 11],
  [0, 6],
]

interface CronTimeFiedlds {
  second: CoaRedis.Dic<boolean>
  minute: CoaRedis.Dic<boolean>
  hour: CoaRedis.Dic<boolean>
  date: CoaRedis.Dic<boolean>
  month: CoaRedis.Dic<boolean>
  day: CoaRedis.Dic<boolean>
}

export class CronTime {
  start: number
  deadline: number
  fields: CronTimeFiedlds = { second: {}, minute: {}, hour: {}, date: {}, month: {}, day: {} }

  // 默认结束时间为2099年，左开右闭
  constructor(expression: string, option: { start?: number; deadline?: number } = {}) {
    // 默认开始时间为当前，默认截止时间为2099年
    this.start = option.start ?? Date.now()
    this.deadline = option.deadline ?? 4070880000000

    // 删除毫秒，同时开始时间加一秒，保证内部都是左闭右闭
    this.start = Math.floor(this.start / 1000) * 1000 + 1000
    this.deadline = Math.floor(this.deadline / 1000) * 1000

    // 开始解析表达式
    this.parse(expression)
  }

  // 检查下一个有效时间段
  next() {
    while (this.start <= this.deadline) {
      const date = this.check(this.start)
      this.start += 1000
      if (date) return date
    }
  }

  // 检查当前时间是否满足条件
  private check(time: number) {
    const date = new Date(time)
    if (!this.fields.second[date.getSeconds()]) return
    if (!this.fields.minute[date.getMinutes()]) return
    if (!this.fields.hour[date.getHours()]) return
    if (!this.fields.date[date.getDate()]) return
    if (!this.fields.month[date.getMonth()]) return
    if (!this.fields.day[date.getDay()]) return
    return date
  }

  // 解析表达式
  private parse(expression: string) {
    const split = expression.trim().split(/\s+/)
    split.length === 6 || CoaError.throw('CronTime.InvalidExpression', `Cron表达式有误，只能有6项`)
    split.forEach((v, i) => this.parseField(v, i))
  }

  // 解析表达式每一项
  private parseField(field: string, index: number) {
    const [min, max] = range_map[index]
    const name = name_map[index]

    field = field.replace(/\*/g, min + '-' + max)
    field = field.replace(/(\d+?)(?:-(\d+?))?(?:\/(\d+?))?(?:,|$)/g, (s, left, right, step) => {
      left = Math.max(min, parseInt(left))
      right = right ? Math.min(max, parseInt(right)) : left
      step = parseInt(step) || 1

      for (; left <= right; left += step) {
        ;(this.fields as any)[name][left] = true
      }
      return ''
    })

    field === '' || CoaError.throw('CronTime.InvalidExpressionField', `Cron表达式第${index + 1}项${field}有误`)
  }
}
