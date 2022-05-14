/* eslint-disable @typescript-eslint/no-unused-expressions */

import { RedisBin, RedisCache } from '../src'

const redisConfig = {
  // 服务器地址
  host: '127.0.0.1',
  // 端口
  port: 6379,
  // 密码，若无填空字符串
  password: '',
  // 数据库，默认为0
  db: 0,
  // 键前缀，可区分不同的项目
  prefix: 'test___pre_',
  // 是否回显查询语句
  trace: false,
}

// 一般一个数据库只需要使用一个实例，内部会管理连接池，无需创建多个
const redisBin = new RedisBin(redisConfig)

// 创建一个缓存实例
const redisCache = new RedisCache(redisBin)

const nsp1 = 'NSP_1'

describe('RedisCache class test', function () {
  it('init data', async () => {
    await redisCache.mSet(nsp1, { a: 1, b: 2, c: 3 }, 1)
    await redisCache.mSet(nsp1, { a1: 1, b1: 2, c1: 3 }, 10)
    await redisCache.delete(nsp1, ['b', 'c1'])
    await redisCache.set(nsp1, 'b', 'v-b')
    await redisCache.set(nsp1, 'c1', 'v-c1')
  })

  it('clear useless cache', async () => {
    const res = await redisCache.clearUseless('*')
    console.log(res)
  })
})
