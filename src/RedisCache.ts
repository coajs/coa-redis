import { CoaError } from 'coa-error'
import { _ } from 'coa-helper'
import { RedisBin } from './RedisBin'
import { CoaRedis, Redis } from './typings'

const ms_ttl = 30 * 24 * 3600 * 1000

export class RedisCache {
  private readonly io: Redis.Redis
  private readonly config: CoaRedis.Config

  constructor(bin: RedisBin) {
    this.io = bin.io
    this.config = bin.config
  }

  // 设置
  async set(nsp: string, id: string, value: any, ms: number = ms_ttl) {
    ms > 0 || CoaError.throw('RedisCache.InvalidParam', 'cache hash ms 必须大于0')
    const expire = _.now() + ms
    const data = this.encode(value, expire)
    return await this.io.hset(this.key(nsp), id, data)
  }

  // 批量设置
  async mSet(nsp: string, values: CoaRedis.Dic<any>, ms: number = ms_ttl) {
    ms > 0 || CoaError.throw('RedisCache.InvalidParam', 'cache hash ms 必须大于0')
    _.keys(values).length > 0 || CoaError.throw('RedisCache.InvalidParam', 'cache hash values值的数量 必须大于0')
    const expire = Date.now() + ms
    const data: CoaRedis.Dic<any> = {}
    _.forEach(values, (v, k) => (data[k] = this.encode(v, expire)))
    return await this.io.hmset(this.key(nsp), data)
  }

  // 获取
  async get(nsp: string, id: string) {
    const ret = (await this.io.hget(this.key(nsp), id)) ?? ''
    return this.decode(ret, _.now())
  }

  // 批量获取
  async mGet(nsp: string, ids: string[]) {
    const ret = await this.io.hmget(this.key(nsp), ...ids)
    const result: CoaRedis.Dic<any> = {}
    const time = _.now()
    _.forEach(ids, (id, i) => (result[id] = this.decode(ret[i], time)))
    return result
  }

  // 获取
  async warp<T>(nsp: string, id: string, worker: () => Promise<T>, ms = ms_ttl, force = false) {
    let result = force ? undefined : await this.get(nsp, id)
    if (result === undefined) {
      result = await worker()
      ms > 0 && (await this.set(nsp, id, result, ms))
    }
    return result as T
  }

  // 获取
  async mWarp<T>(nsp: string, ids: string[], worker: (ids: string[]) => Promise<T>, ms = ms_ttl, force = false) {
    const result = force ? {} : await this.mGet(nsp, ids)

    const newIds = [] as string[]
    _.forEach(ids, id => {
      if (result[id] === undefined) newIds.push(id)
    })

    if (newIds.length) {
      const newResult = (await worker(newIds)) as any
      _.forEach(newIds, id => {
        if (!newResult[id]) newResult[id] = null
      })
      ms > 0 && (await this.mSet(nsp, newResult, ms))
      _.extend(result, newResult)
    }

    return result
  }

  // 删除
  async delete(nsp: string, ids: string[] = []) {
    if (ids.length) return await this.io.hdel(this.key(nsp), ...ids)
    else return await this.io.del(this.key(nsp))
  }

  // 删除
  async mDelete(deleteIds: CoaRedis.CacheDelete[]) {
    if (deleteIds.length === 0) return 0
    else if (deleteIds.length === 1) return await this.delete(...deleteIds[0])

    const pipeline = this.io.pipeline()
    deleteIds.forEach(([nsp, ids]) => {
      ids.length ? pipeline.hdel(this.key(nsp), ...ids) : pipeline.del(this.key(nsp))
    })
    return await pipeline.exec()
  }

  // 清除无效的缓存
  async clearUseless(match = '*') {
    const now = _.now()
    const keys1 = await this.io.keys(this.key(match))
    const result = {} as Record<string, [number, number]>
    // 循环处理每一个key
    for (const key1 of keys1) {
      // 按1000分组
      const keys2 = await this.io.hkeys(key1)
      const keys2Chunks = _.chunk(keys2, 1000)
      result[key1] = [0, keys2.length]
      for (const keys2 of keys2Chunks) {
        // 批量获取
        const values = await this.io.hmget(key1, keys2)
        const deleteIds = [] as string[]
        // 判断是否过期
        _.forEach(values, (value, index) => {
          const expire = _.toInteger((value || '').substring(1, 14))
          if (expire < now) deleteIds.push(keys2[index])
        })
        // 删除过期的
        if (deleteIds.length) await this.io.hdel(key1, ...deleteIds)
        result[key1][0] += deleteIds.length
      }
    }
    return result
  }

  // 清除指定命名空间的缓存
  async clear(nsp = '') {
    const keys = await this.io.keys(this.key(nsp + '*'))
    return keys.length ? await this.io.del(...keys) : 0
  }

  // 设置nsp
  public key(nsp: string) {
    return this.config.prefix + ':' + nsp
  }

  protected encode(value: any, expire: number) {
    if (value === undefined) value = null
    return JSON.stringify([expire, value])
  }

  protected decode(value: string | null, time: number) {
    if (!value) return undefined
    try {
      const data = JSON.parse(value)
      const expire = data[0] || 0
      return expire < time ? undefined : data[1]
    } catch (e) {
      return undefined
    }
  }
}
