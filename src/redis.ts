import { echo } from 'coa-echo'
import { env } from 'coa-env'
import * as Redis from 'ioredis'

const redis = new Redis({
  port: env.redis.port,
  host: env.redis.host,
  password: env.redis.password,
  db: env.redis.db,
  lazyConnect: true,
})

env.redis.trace && redis.monitor((err, monitor) => {
  monitor.on('monitor', (time, args, source, database) => {
    echo.grey('* Redis: [%s] %s', database, args)
  })
})

export default { io: redis }