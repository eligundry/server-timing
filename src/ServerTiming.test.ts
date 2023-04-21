import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ServerTiming,
  type ServerTimingOptions,
  type ServerTimingLabel,
} from './ServerTiming'

const asyncFn = async (): Promise<string> =>
  new Promise((resolve) =>
    setTimeout(() => resolve('hello world'), Math.random() * 5)
  )

const serverTimingFactory = (opts: ServerTimingOptions = { precision: 0 }) =>
  new ServerTiming(opts)

describe('ServerTiming', () => {
  it('should manually be able to track how long a function takes', async () => {
    const serverTiming = serverTimingFactory()
    serverTiming.start('foo')
    await asyncFn()
    serverTiming.end('foo')

    assert.match(serverTiming.toString() ?? '', /foo;dur=\d/)
  })

  it('should be able to chain start and end tracking calls', async () => {
    const serverTiming = serverTimingFactory()
    serverTiming.start('foo')
    await asyncFn()
    serverTiming.end('foo').start('bar')
    await asyncFn()
    serverTiming.end('bar')

    assert.match(serverTiming.toString(), /foo;dur=\d, bar;dur=\d/)
  })

  it('should allow providing of a human readable description of the timer', async () => {
    const serverTiming = serverTimingFactory()
    serverTiming.start({
      label: 'foo',
      desc: 'Foo Service',
    })
    await asyncFn()
    serverTiming.end('foo')

    assert.match(serverTiming.toString(), /foo;desc="Foo Service";dur=\d/)
  })

  it('should be able to wrap an async function and track time', async () => {
    const serverTiming = serverTimingFactory()
    const returnValue = await serverTiming.track('foo', asyncFn)

    assert.equal(returnValue, 'hello world')
    assert.match(serverTiming.toString(), /foo;dur=\d/)
  })

  it('should be able to provide description to tracked function', async () => {
    const serverTiming = serverTimingFactory()
    await serverTiming.track(
      {
        label: 'foo',
        desc: 'Foo Service',
      },
      asyncFn
    )

    assert.match(serverTiming.toString(), /foo;desc="Foo Service";dur=\d/)
  })

  it('should be able to track multiple function calls', async () => {
    const serverTiming = serverTimingFactory()
    await serverTiming.track('foo', asyncFn)
    await serverTiming.track('bar', asyncFn)
    await serverTiming.track({ label: 'baz', desc: 'Baz Service' }, asyncFn)

    assert.match(
      serverTiming.toString(),
      /foo;dur=\d, bar;dur=\d, baz;desc="Baz Service";dur=\d/
    )
  })

  it('should bubble the error up while ending the timer if the callback throws', async () => {
    const serverTiming = serverTimingFactory()
    const error = new Error('uh-oh all errors')

    try {
      await serverTiming.track('error', async () => {
        await asyncFn()
        throw error
      })
    } catch (e) {
      assert.equal(e, error)
    }

    assert.match(serverTiming.toString(), /error;dur=\d/)
  })

  it('should throw an error if a timer is ended without being started', async () => {
    const serverTiming = serverTimingFactory()
    assert.throws(() => serverTiming.end('foo'), {
      message: `timing 'foo' was never started`,
    })
  })

  it('should output the header value when cast to a string', async () => {
    const serverTiming = serverTimingFactory()
    await serverTiming.track('foo', asyncFn)

    assert.match(String(serverTiming), /foo;dur=\d/)
  })

  it('should not end timers when outputing header string', async () => {
    const serverTiming = serverTimingFactory()
    serverTiming.start('foo')
    await asyncFn()
    const header1 = serverTiming.toString()
    await asyncFn()
    const header2 = serverTiming.toString()

    assert.match(header1, /foo;dur=\d/)
    assert.match(header2, /foo;dur=\d/)
    assert.notEqual(header1, header2)
  })

  it('should be able to do example 1 in the RFC', async () => {
    // https://www.w3.org/TR/server-timing/#example-1
    const serverTiming = serverTimingFactory()

    serverTiming
      .add('miss')
      .add({ label: 'db', dur: 53 })
      .add({ label: 'app', dur: 47.2 })
      .add('customView')
      .add({ label: 'dc', desc: 'atl' })
      .track({ label: 'cache', desc: 'Cache Read' }, asyncFn)

    assert.match(
      serverTiming.toString(),
      /miss, db;dur=53, app;dur=47.2, customView, dc;desc="atl", cache;desc="Cache Read";dur=\d/
    )
  })

  it('should be able to provide headers() to the Headers constructor', async () => {
    const serverTiming = serverTimingFactory()
    serverTiming.add({ label: 'miss' })
    const headers = new Headers(serverTiming.headers())

    assert.equal(headers.get(serverTiming.headerKey), serverTiming.toString())
  })

  describe("text validation: should only allow characters that Chrome's devtools allow for labels", async () => {
    const serverTiming = new ServerTiming()
    const tests: [ServerTimingLabel, boolean][] = [
      ['foo', true],
      ['db.getUsers', true],
      ['db:getUsers', false],
      ['cache/set', false],
      [encodeURIComponent('cache/set'), true],
      ['cache\\set', false],
      ['👁👄👁', false],
      ['cache set', false],
      ['hunter1', true],
      ['~strikethrough~', true],
      ['http_request', true],
      [{ label: 'http', desc: 'Slow External API' }, true],
      [{ label: 'http', desc: '"Slow" External API' }, false],
    ]

    tests.forEach(([labelObj, shouldPass]) => {
      if (shouldPass) {
        it(`should accept ${JSON.stringify(labelObj)}`, () => {
          assert.doesNotThrow(() => serverTiming.add(labelObj))
        })
      } else {
        it(`should reject ${JSON.stringify(labelObj)}`, () => {
          assert.throws(() => serverTiming.add(labelObj))
        })
      }
    })
  })

  it('should output raw timing data', async () => {
    const serverTiming = serverTimingFactory()
    serverTiming
      .add('miss')
      .add({ label: 'db.write', dur: 53 })
      .add({
        label: 'cache.desc',
        desc: 'Saving to redis.1',
      })
      .track({ label: 'db.read' }, asyncFn)
    const rawTimings = serverTiming.getRawTimings()

    assert.equal(rawTimings.length, 4)
    assert.equal(rawTimings[0], 'miss')
    assert.deepEqual(rawTimings[1], ['db.write', 53])
    assert.equal(rawTimings[2], 'cache.desc (Saving to redis.1)')
    assert.equal(rawTimings[3][0], 'db.read')
  })
})
