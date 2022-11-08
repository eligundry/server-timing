export type DetailedServerTimingLabel = {
  label: string
  desc?: string
  dur?: number
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
 *   // All tracking calls can accept a human readable description of the
 *   // tracking call.
 *   const stats = await serverTiming.track(
 *     {
 *       label: 'stats',
 *       desc: 'Aggregated stats about sales',
 *     },
 *     () => db.getStats()
 *   )
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
  private timings: (
    | (DetailedServerTimingLabel & {
        start?: Date
        end?: Date
      })
    | ServerTiming
  )[]

  constructor() {
    this.timings = []
  }

  private transformLabel(obj: ServerTimingLabel): DetailedServerTimingLabel {
    if (typeof obj === 'string') {
      return { label: obj }
    }

    return obj
  }

  note(labelObj: ServerTimingLabel) {
    this.timings.push(this.transformLabel(labelObj))
    return this
  }

  group() {
    const group = new ServerTiming()
    this.timings.push(group)
    group.group = () => {
      throw new Error('groups cannot be more than one level deep')
    }

    return group
  }

  /**
   * Manually start tracking the latency of operations. This function is useful
   * if you have multiple related operations that have assignments that would be
   * annoying to track using [[track]].
   *
   * @example
   *
   * ```typescript
   * const serverTiming = new ServerTiming()
   * serverTiming.start('db')
   * const user = db.getUser(1)
   * const orders = db.getUserOrders(1)
   * serverTiming.end('db')
   * ```
   */
  start(labelObj: ServerTimingLabel) {
    const timing = this.transformLabel(labelObj)

    this.timings.push({
      ...timing,
      start: new Date(),
    })

    return this
  }

  /**
   * Manually end a tracking call. This function is to be used in conjunction
   * with [[ServerTiming.start]].
   *
   * @throws An error if the label was not started with [[ServerTiming.start]].
   */
  end(labelObj: ServerTimingLabel) {
    const { label } = this.transformLabel(labelObj)
    const timingIdx = this.timings.findIndex(
      (t) => !(t instanceof ServerTiming) && t.label === label
    )

    if (timingIdx === -1) {
      throw new Error(`timing '${label}' was never started`)
    }

    this.timings[timingIdx].end = new Date()

    return this
  }

  /**
   * Track how long it takes for a function to run and save it to the
   * ServerTiming instance.
   *
   * If the function throws an error, the timer will be stopped and the error
   * will bubble up.
   *
   * @example
   *
   * ```typescript
   * const serverTiming = new ServerTiming()
   * const rows = serverTiming.track('db', () => db.query())
   * ```
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

  /**
   * Output the value of the `Server-Timing` headers for the functions tracked.
   * Note that the `ServerTiming` instance provides a memeber for the key of the
   * header.
   *
   * This function is side effect free. If you output the header without ending
   * a manual tracking call, the end of that timer will be a temporary value of
   * the current time. This means that subsequent calls to this will advance any
   * unclosed timers to that date in the outputted string.
   *
   * @example
   *
   * ```typescript
   * const headers = new Headers()
   * headers.set(serverTiming.headerKey, serverTiming.headers())
   * ```
   */
  headers(): string[] {
    return this.timings.map((timing) => {
      if (timing instanceof ServerTiming) {
        return timing.headers().join(', ')
      }

      const parts = [timing.label]

      if (timing.desc) {
        parts.push(`desc="${timing.desc}"`)
      }

      if (timing.dur) {
        parts.push(`dur=${timing.dur}`)
      } else if (timing.start) {
        let end = timing.end

        if (!end) {
          end = new Date()
        }

        parts.push(`dur=${end.getTime() - timing.start.getTime()}`)
      }

      return parts.join(';')
    })
  }

  toString() {
    return this.headers().join(', ')
  }
}
