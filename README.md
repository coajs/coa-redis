# coa-redis

[![GitHub license](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)
[![npm version](https://img.shields.io/npm/v/coa-redis.svg?style=flat-square)](https://www.npmjs.org/package/coa-redis)
[![npm downloads](https://img.shields.io/npm/dm/coa-redis.svg?style=flat-square)](http://npm-stat.com/charts.html?package=coa-redis)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/coajs/coa-redis/pulls)

English | [简体中文](README.zh-CN.md)

Redis database components for coajs, including data cache, message queue, timing task, distributed lock, etc.

## Feature

- **Functional**: Basic data connection based on [ioredis](https://github.com/luin/ioredis). Pay attention to performance, full-featured
- **Lightweight**: Only hundreds of lines of code, do not rely on other third-party libraries
- **TypeScript**: All written in TypeScript, type constraint, IDE friendship

## Component

- Data Cache [RedisCache](#Data-Cache): Data cache for Key-Value type
- Message Queue [RedisQueue](#Message-Queue) [RedisQueueWorker](#消息队列): Lightweight and efficient message queue based on Redis implementation
- Timing Task [RedisCron](#Timing-Task): Perform tasks on time through the cron expression and message queue
- Distributed Lock [RedisLock](#Distributed-Lock): Basic distributed lock mechanism by Redis

## Quick Start

### Install

```shell
yarn add coa-redis
```

### Basic configuration

```typescript
import { RedisBin } from 'coa-redis'

const redisConfig = {
  // host address
  host: '127.0.0.1',
  // port
  port: 6379,
  // password, if not write an empty string
  password: '123456',
  // database, default is 0
  db: 0,
  // Key prefix, distinguish between different project
  prefix: 'pre_',
  // Whether to display a query statement
  trace: false,
}

// Create a configuration instance, follow-up all components depending on this configuration instance
// Generally a database only needs to use an instance, the internal management connection pool
const redisBin = new RedisBin(redisConfig)
```

### Component usage

#### Data Cache

Basic usage

```typescript
// Create a cache instance
const redisCache = new RedisCache(redisBin)

// Note: In order to constrain the isolation of module data, all operations of the cache instance need to pass nsp parameters and cannot be omitted.
// Generally, the module name can be used as nsp, and the data between each nsp is isolated from each other.

// Set cache data
await redisCache.set(
  'module1',
  'id001',
  'value001',
  5 * 60 * 1000 /*5 minutes*/
) // 1

// Read cache data
await redisCache.get('module1', 'id001') // value001

// Delete cache data (support to delete multiple data under the same nsp)
await redisCache.delete('module1', ['id001', 'id002']) // 2
```

Batch operate

```typescript
// Batch set cache data
await redisCache.mSet(
  'module1',
  { id101: 'value101' },
  5 * 60 * 1000 /*5 minutes*/
) // 1
await redisCache.mSet(
  'module2',
  { id201: 'value201', id202: { name: 'A2', title: 'a2' } },
  5 * 60 * 1000 /*5 minutes*/
) // 2

// Batch read cache data
await redisCache.mGet('module1', ['id101']) // 'value101'
await redisCache.mGet('module2', ['id201', 'id202']) // { id201: 'value201', id202: { name: 'A2', title: 'a2' }

// Batch delete cache data (support to delete multiple data under different nsp)
await redisCache.mDelete([
  ['module1', ['id101']],
  ['module2', ['id201', 'id202']],
]) // 3
```

Syntactic sugar

```typescript
// Get cache data, if there is no existence, follow the method to read and save
const resultWarp1 = await redisCache.warp(
  'module1',
  'id301',
  () => {
    // Do something here
    return Math.random() // return result
  },
  10 * 60 * 1000 /*10 minutes*/
)

resultWarp1 // return 0.3745813097015189 with in 10 minutes

// This Syntactic sugar                                                                                is equivalent to the following
async function getAndSetCache(nsp: string, id: string) {
  let result = await redisCache.get(nsp, id)
  if (result === undefined) {
    // Do something here
    result = Math.random() // get result
    await redisCache.set(nsp, id, result, 10 * 60 * 1000 /*10 minutes*/)
  }
  return result
}

// Batch get cache data
const resultWarp2 = await redisCache.mWarp(
  'module1',
  ['id301', 'id302'],
  (ids) => {
    const result = {} as { [id: string]: number }
    for (const id of ids) {
      // Do something here
      result[id] = Math.random()
    }
    return result // Return the result, be sure to ensure the key value
  },
  10 * 60 * 1000 /*10 minutes*/
)

resultWarp2 // { id301: 0.32430600236596074, id302: 0.29829421673682566 }
```

#### Message Queue

```typescript
// Define a queue name and message type name
const QUEUE_NAME_1 = 'CHANNEL-1',
  MESSAGE_NAME_1 = 'NORMAL-MESSAGE-1'

// Define a message queue
const queue = new RedisQueue(redisBin, QUEUE_NAME_1)

// Define the consumer of the queue
const worker = new RedisQueueWorker(queue)
worker.on(MESSAGE_NAME_1, async (id, data) => {
  console.log(`message id is ${id}, message included with ${data}`)
})

// Produce a message
await queue.push(MESSAGE_NAME_1, 'message-id-001', { value: '001' }) // 1
```

#### Timing Task

```typescript
// Timing task relies on the consumer of the message queue, and at the same time, you must specify the version number to avoid version upgrade instant task conflicts
const cron = new RedisCron(quque.worker, env.version)

// Execute at 10:00 and 16:00 each day
cron.on('0 0 10,16 * * *', () => {
  /**Do something**/
})

// Execute at 0:30 each day
cron.on('0 30 0 * * *', () => {
  /**Do something**/
})

// Execute every 10 minutes
cron.on('0 */10 * * * *', () => {
  /**Do something**/
})

// Execute at 0:00 on every Monday, Wednesday, Friday
cron.on('0 0 0 * * 1,3,5', () => {
  /**Do something**/
})

// Execute at 0:00 on every month of 1 day and 16
cron.on('0 0 0 1,16 * *', () => {
  /**Do something**/
})
```

#### Distributed Lock

```typescript
// Create a lock method instance
const redisLock = new RedisLock(redisBin)

// Blocking execution, if the call is repeated, will wait for the last call to complete
await redisLock.start('lock-for-user-register', () => {
  // Do something, this thing will not be executed concurrently
})

// Try to execute, if it is repeated call, it will throw the RedisLock.Running error
await redisLock.try('lock-for-user-register', () => {
  // Do something, this thing will not be executed concurrently
})

// The throttle is executed, only 1 second is allowed once, and the repeat call will be queued to wait for the next 1 second.
await redisLock.throttle(
  'lock-for-user-register',
  () => {
    // Do something, this thing will not be executed concurrently
  },
  1000 /*1 second*/
)
```
