import { CoaError } from 'coa-error'
import { _ } from 'coa-helper'
import { RedisBin } from './RedisBin'
import { CoaRedisCacheDelete, CoaRedisConfig, CoaRedisDic, Redis } from './typings'

const ms_ttl = 30 * 24 * 3600 * 1000

export class RedisCache {
  private readonly io: Redis.Redis
  private readonly config: CoaRedisConfig

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
  async mSet(nsp: string, values: CoaRedisDic<any>, ms: number = ms_ttl) {
    ms > 0 || CoaError.throw('RedisCache.InvalidParam', 'cache hash ms 必须大于0')
    _.keys(values).length > 0 || CoaError.throw('RedisCache.InvalidParam', 'cache hash values值的数量 必须大于0')
    const expire = Date.now() + ms
    const data: CoaRedisDic<any> = {}
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
    const result: CoaRedisDic<any> = {}
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
    _.forEach(ids, (id) => {
      if (result[id] === undefined) newIds.push(id)
    })

    if (newIds.length) {
      const newResult = (await worker(newIds)) as any
      _.forEach(newIds, (id) => {
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
  async mDelete(deleteIds: CoaRedisCacheDelete[]) {
    if (deleteIds.length === 0) return 0
    else if (deleteIds.length === 1) return await this.delete(...deleteIds[0])

    const pipeline = this.io.pipeline()
    deleteIds.forEach(([nsp, ids]) => {
      ids.length ? pipeline.hdel(this.key(nsp), ...ids) : pipeline.del(this.key(nsp))
    })
    return await pipeline.exec()
  }

  // 清除无效的缓存
  async clearUseless() {
    const now = _.now()
    const keys1 = await this.io.keys(this.key('*'))
    for (const key1 of keys1) {
      const keys2 = await this.io.hkeys(key1)
      for (const key2 of keys2) {
        const value = (await this.io.hget(key1, key2)) ?? ''
        const expire = _.toInteger(value.substr(1, 13))
        if (expire < now) await this.io.hdel(key1, key2)
      }
    }
  }

  // 清除指定命名空间的缓存
  async clear(nsp: string = '') {
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
