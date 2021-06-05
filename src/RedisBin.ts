import { echo } from 'coa-echo'
import { CoaRedisConfig, Redis } from './typings'

export class RedisBin {
  public io: Redis.Redis
  public config: CoaRedisConfig

  constructor(config: CoaRedisConfig) {
    this.config = config
    this.io = new Redis({
      port: config.port,
      host: config.host,
      password: config.password,
      db: config.db,
      lazyConnect: true,
    })

    config.trace &&
      this.io.monitor((_err, monitor) => {
        monitor.on('monitor', (time, args, source, database) => {
          echo.grey('* Redis: [%s] %s', database, args)
        })
      })
  }
}
