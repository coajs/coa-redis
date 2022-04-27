/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { echo } from 'coa-echo'
import { dayjs } from 'coa-helper'
import { CronTime } from '../src/cron/CronTime'

function timeFormat(time?: number | Date) {
  if (!time) return ''
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss:SSS')
}

describe('CronTime class test', function () {
  it('test millisecond is 0', function () {
    const start = dayjs('2020-01-01 10:00:00:000').valueOf()
    const deadline = dayjs('2020-01-01 10:00:01:000').valueOf()

    const cronTime = new CronTime('* * * * * *', { start, deadline })
    const next = cronTime.next()

    expect(next).be.instanceOf(Date)
    expect(timeFormat(next)).to.equals(timeFormat(deadline))
  })

  it('test millisecond is 500', function () {
    const start = dayjs('2020-01-01 10:00:00:500').valueOf()
    const deadline = dayjs('2020-01-01 10:00:01:500').valueOf()

    const cronTime = new CronTime('* * * * * *', { start, deadline })
    const next = cronTime.next()

    expect(next).be.instanceOf(Date)
    expect(timeFormat(next)).to.equals('2020-01-01 10:00:01:000')
  })

  it('test range less than 1 second', function () {
    const start = dayjs('2020-01-01 10:00:00:500').valueOf()
    const deadline = dayjs('2020-01-01 10:00:00:600').valueOf()

    const cronTime = new CronTime('* * * * * *', { start, deadline })
    const next = cronTime.next()

    expect(next).to.equals(undefined)
  })

  it('test range less than 1 second and start millisecond is 0', function () {
    const start = dayjs('2020-01-01 10:00:00:000').valueOf()
    const deadline = dayjs('2020-01-01 10:00:00:600').valueOf()

    const cronTime = new CronTime('* * * * * *', { start, deadline })
    const next = cronTime.next()

    expect(next).to.equals(undefined)
  })

  it('test range less than 1 second and end millisecond is 0', function () {
    const start = dayjs('2020-01-01 10:00:00:500').valueOf()
    const deadline = dayjs('2020-01-01 10:00:01:000').valueOf()

    const cronTime = new CronTime('* * * * * *', { start, deadline })
    const next = cronTime.next()

    expect(next).be.instanceOf(Date)
    expect(timeFormat(next)).to.equals('2020-01-01 10:00:01:000')
  })

  it('test 3 second', function () {
    const start = dayjs('2020-01-01 10:00:00:000').valueOf()
    const deadline = dayjs('2020-01-01 10:00:03:000').valueOf()

    const cronTime = new CronTime('* * * * * *', { start, deadline })
    cronTime.next()
    cronTime.next()
    const next = cronTime.next()

    expect(next).be.instanceOf(Date)
    expect(timeFormat(next)).to.equals('2020-01-01 10:00:03:000')
  })

  it('test cron task', function () {
    const start = dayjs('2020-01-01 10:00:00:000').valueOf()
    const deadline = dayjs('2020-01-01 10:00:10:000').valueOf()
    const inteval = 10

    let times = 0
    let current = start

    while (current + inteval <= deadline) {
      const cronTime = new CronTime('* * * * * *', {
        start: current,
        deadline: current + inteval,
      })
      const next = cronTime.next()
      if (next) times++
      current += inteval
    }

    expect(times).to.equals(10)
  })

  it('test cron task run', function () {
    if (!process.env.LOCAL) return

    let lastTime = Date.now()

    setInterval(() => {
      const deadline = Date.now()

      const start = lastTime

      lastTime = deadline

      const cronTime = new CronTime('*/5 * * * * *', { start, deadline })
      const next = cronTime.next()
      if (next) {
        echo.green(timeFormat(Date.now()))
      }
    }, 100)
  })
})
