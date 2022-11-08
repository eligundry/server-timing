export type DetailedServerTimingLabel = {
  label: string
  desc?: string
}

export type ServerTimingLabel = string | DetailedServerTimingLabel

/**
 * Framework agnostic timing class that outputs `Server-Timing` headers so that
 * you can track latency in your backend applications.
 *
 * @example
 *
 * ```typescript
 * const handler = async () => {
 *   const serverTiming = new ServerTiming()
 *
 *   // Functions can be tracked manually
 *   serverTiming.start('db')
 *   await db.query()
 *   serverTiming.end('db')
 *
 *   // Timing calls can be chained
 *   serverTiming.start('db:users')
 *   const users = await db.getUsers()
 *   serverTiming.end('db:users').start('cache:users')
 *   cache.set('users', users)
 *   serverTiming.end('cache:users')
 *
 *   // All of this is nice, but you really should be using the track method,
 *   // which allows for wrapping of functions that will track latency.
 *   const orders = await serverTiming.track('db:orders', () => db.getOrders())
 *
 *   // When you are done tracking operations, attach headers to the response by
 *   // calling serverTiming.header().
 *   return json({ users, orders }, {
 *     headers: {
 *       [serverTiming.headerKey]: serverTiming.header(),
 *     }
 *   })
 * }
 * ```
 */
export class ServerTiming {
  public headerKey = 'Server-Timing' as const
  private timings: Map<
    string,
    {
      start: Date
      end?: Date
    } & Omit<DetailedServerTimingLabel, 'label'>
  >

  constructor() {
    this.timings = new Map()
  }

  private transformLabel(obj: ServerTimingLabel): DetailedServerTimingLabel {
    if (typeof obj === 'string') {
      return { label: obj }
    }

    return obj
  }

  start(labelObj: ServerTimingLabel) {
    const { label, ...rest } = this.transformLabel(labelObj)

    this.timings.set(label, {
      start: new Date(),
      ...rest,
    })

    return this
  }

  end(labelObj: ServerTimingLabel) {
    const { label } = this.transformLabel(labelObj)
    const timing = this.timings.get(label)

    if (!timing) {
      throw new Error(`timing '${label}' was never started`)
    }

    this.timings.set(label, {
      ...timing,
      end: new Date(),
    })

    return this
  }

  /**
   * Track how long it takes for a function to run and save it to the
   * ServerTiming instance.
   */
  async track<T extends () => Promise<any> | any>(
    labelObj: ServerTimingLabel,
    fn: T
  ): Promise<Awaited<ReturnType<T>>> {
    this.start(labelObj)

    try {
      const ret = await fn()
      return ret
    } finally {
      this.end(labelObj)
    }
  }

  header(): string {
    return Array.from(this.timings.entries())
      .map(([label, timing]) => {
        let end = timing.end

        if (!end) {
          end = new Date()
        }

        let value = `${label};`

        if (timing.desc) {
          value += `desc="${timing.desc}";`
        }

        value += `dur=${end.getTime() - timing.start.getTime()}`

        return value
      })
      .join(', ')
  }

  toString() {
    return this.header()
  }
}
