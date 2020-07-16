import { env } from 'coa-env'
import { die } from 'coa-error'
import { _ } from 'coa-helper'
import redis from './redis'
import { Dic } from './typings'

const ms_ttl = 30 * 24 * 3600 * 1000
const prefix = env.redis.prefix.toString() || 'coa-d0'

declare global {
  type CacheDelete = [string, string[]]
}

export default new class {

  redis = redis

  // 设置
  async set (nsp: string, id: string, value: any, ms: number = ms_ttl) {
    ms > 0 || die.hint('cache hash ms 必须大于0')
    const expire = _.now() + ms
    const data = this.encode(value, expire)
    return await redis.io.hset(this.key(nsp), id, data)
  }

  // 批量设置
  async mSet (nsp: string, values: Dic<any>, ms: number = ms_ttl) {
    ms > 0 || die.error('cache hash ms 必须大于0')
    _.keys(values).length > 0 || die.error('cache hash values值的数量 必须大于0')
    const expire = Date.now() + ms
    const data = {} as Dic<any>
    _.forEach(values, (v, k) => data[k] = this.encode(v, expire))
    return await redis.io.hmset(this.key(nsp), data)
  }

  // 获取
  async get (nsp: string, id: string) {
    const ret = await redis.io.hget(this.key(nsp), id) || ''
    return this.decode(ret, _.now())
  }

  // 批量获取
  async mGet (nsp: string, ids: string[]) {
    const ret = await redis.io.hmget(this.key(nsp), ...ids)
    const result = {} as Dic<any>
    const time = _.now()
    _.forEach(ids, (id, i) => result[id] = this.decode(ret[i], time))
    return result
  }

  // 获取
  async warp<T> (nsp: string, id: string, worker: () => Promise<T>, ms = ms_ttl, force = false) {
    let result = force ? undefined : await this.get(nsp, id)
    if (result === undefined) {
      result = await worker()
      ms > 0 && await this.set(nsp, id, result, ms)
    }
    return result as T
  }

  // 获取
  async mWarp<T> (nsp: string, ids: string[], worker: (ids: string[]) => Promise<T>, ms = ms_ttl, force = false) {
    const result = force ? {} : await this.mGet(nsp, ids)

    const newIds = [] as string[]
    _.forEach(ids, id => {
      if (result[id] === undefined) newIds.push(id)
    })

    if (newIds.length) {
      const newResult = await worker(newIds) as any
      _.forEach(newIds, id => {
        if (!newResult[id]) newResult[id] = null
      })
      ms > 0 && await this.mSet(nsp, newResult, ms)
      _.extend(result, newResult)
    }

    return result
  }

  // 删除
  async delete (nsp: string, ids: string[] = []) {
    if (ids.length)
      return await redis.io.hdel(this.key(nsp), ...ids)
    else
      return await redis.io.del(this.key(nsp))
  }

  // 删除
  async mDelete (deleteIds: CacheDelete[]) {
    if (deleteIds.length === 0)
      return 0
    else if (deleteIds.length === 1)
      return await this.delete(...deleteIds[0])

    const pipeline = redis.io.pipeline()
    deleteIds.forEach(([nsp, ids]) => {
      ids.length ? pipeline.hdel(this.key(nsp), ...ids) : pipeline.del(this.key(nsp))
    })
    return await pipeline.exec()
  }

  // 清除无效的缓存
  async clearUseless () {
    const now = _.now()
    const keys1 = await redis.io.keys(this.key('*'))
    for (const i1 in keys1) {
      const key1 = keys1[i1]
      const keys2 = await redis.io.hkeys(key1) as string[]
      for (const i2 in keys2) {
        const key2 = keys2[i2]
        const value = await redis.io.hget(key1, key2) || ''
        const expire = _.toInteger(value.substr(1, 13))
        if (expire < now) await redis.io.hdel(key1, key2)
      }
    }
  }

  // 清除指定命名空间的缓存
  async clear (nsp: string = '') {
    const keys = await redis.io.keys(this.key(nsp + '*'))
    return keys.length ? await redis.io.del(...keys) : 0
  }

  // 设置nsp
  public key (nsp: string) {
    return prefix + ':' + nsp
  }

  private encode (value: any, expire: number) {
    if (value === undefined) value = null
    return JSON.stringify([expire, value])
  }

  private decode (value: string | null, time: number) {
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
