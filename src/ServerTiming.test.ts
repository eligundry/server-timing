import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ServerTiming } from './ServerTiming'

const asyncFn = async (): Promise<string> =>
  new Promise((resolve) => setTimeout(() => resolve('hello world'), 3))

describe('ServerTiming', () => {
  it('should manually be able to track how long a function takes', async () => {
    const serverTiming = new ServerTiming()
    serverTiming.start('foo')
    await asyncFn()
    serverTiming.end('foo')

    assert.match(serverTiming.headers()[0], /foo;dur=\d/)
  })

  it('should be able to chain start and end tracking calls', async () => {
    const serverTiming = new ServerTiming()
    serverTiming.start('foo')
    await asyncFn()
    serverTiming.end('foo').start('bar')
    await asyncFn()
    serverTiming.end('bar')
    const headers = serverTiming.headers()

    assert.equal(headers.length, 2)
    assert.match(serverTiming.headers()[0], /foo;dur=\d/)
    assert.match(serverTiming.headers()[1], /bar;dur=\d/)
  })

  it('should allow providing of a human readable description of the timer', async () => {
    const serverTiming = new ServerTiming()
    serverTiming.start({
      label: 'foo',
      desc: 'Foo Service',
    })
    await asyncFn()
    serverTiming.end('foo')

    assert.match(serverTiming.headers()[0], /foo;desc="Foo Service";dur=\d/)
  })

  it('should be able to wrap an async function and track time', async () => {
    const serverTiming = new ServerTiming()
    const returnValue = await serverTiming.track('foo', asyncFn)

    assert.equal(returnValue, 'hello world')
    assert.match(serverTiming.headers()[0], /foo;dur=\d/)
  })

  it('should be able to provide description to tracked function', async () => {
    const serverTiming = new ServerTiming()
    await serverTiming.track(
      {
        label: 'foo',
        desc: 'Foo Service',
      },
      asyncFn
    )

    assert.match(serverTiming.headers()[0], /foo;desc="Foo Service";dur=\d/)
  })

  it('should be able to track multiple function calls', async () => {
    const serverTiming = new ServerTiming()
    await serverTiming.track('foo', asyncFn)
    await serverTiming.track('bar', asyncFn)
    await serverTiming.track({ label: 'baz', desc: 'Baz Service' }, asyncFn)
    const headers = serverTiming.headers()

    assert.equal(headers.length, 3)
    assert.match(serverTiming.headers()[0], /foo;dur=\d/)
    assert.match(serverTiming.headers()[1], /bar;dur=\d/)
    assert.match(serverTiming.headers()[2], /baz;desc="Baz Service";dur=\d/)
  })

  it('should bubble the error up while ending the timer if the callback throws', async () => {
    const serverTiming = new ServerTiming()
    const error = new Error('uh-oh all errors')

    try {
      await serverTiming.track('error', async () => {
        await asyncFn()
        throw error
      })
    } catch (e) {
      assert.equal(e, error)
    }

    assert.match(serverTiming.headers()[0], /error;dur=\d/)
  })

  it('should throw an error if a timer is ended without being started', async () => {
    const serverTiming = new ServerTiming()
    assert.throws(() => serverTiming.end('foo'), {
      message: `timing 'foo' was never started`,
    })
  })

  it('should output the header value when cast to a string', async () => {
    const serverTiming = new ServerTiming()
    await serverTiming.track('foo', asyncFn)

    assert.match(String(serverTiming), /foo;dur=\d/)
  })

  it('should not end timers when outputing header string', async () => {
    const serverTiming = new ServerTiming()
    serverTiming.start('foo')
    await asyncFn()
    const header1 = serverTiming.headers()[0]
    await asyncFn()
    const header2 = serverTiming.headers()[0]

    assert.match(header1, /foo;dur=\d/)
    assert.match(header2, /foo;dur=\d/)
    assert.notEqual(header1, header2)
  })

  it('should be able to do example 1 in the RFC', async () => {
    // https://www.w3.org/TR/server-timing/#example-1
    const serverTiming = new ServerTiming()

    serverTiming
      .group()
      .note('miss')
      .note({ label: 'db', dur: 53 })
      .note({ label: 'app', dur: 47.2 })
    serverTiming.group().note('customView').note({ label: 'dc', desc: 'atl' })
    serverTiming.group().track({ label: 'cache', desc: 'Cache Read' }, asyncFn)
    const headers = serverTiming.headers()

    assert.equal(headers.length, 3)
    assert.equal(headers[0], 'miss, db;dur=53, app;dur=47.2')
    assert.equal(headers[1], 'customView, dc;desc="atl"')
    assert.match(headers[2], /cache;desc="Cache Read";dur=\d/)
  })

  it('should throw if you attempt to group more than one layer down', () => {
    const serverTiming = new ServerTiming()
    assert.throws(() => serverTiming.group().group().note('miss'), {
      message: 'groups cannot be more than one level deep',
    })
  })
})
