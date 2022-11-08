import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ServerTiming } from './ServerTiming'

const asyncFn = async (): Promise<string> =>
  new Promise((resolve) => setTimeout(() => resolve('hello world'), 3))

console.log('hello')
// describe('ServerTiming', () => {
test('should manually be able to track how long a function takes', async () => {
  const serverTiming = new ServerTiming()
  serverTiming.start('foo')
  await asyncFn()
  serverTiming.end('foo')

  assert.match(serverTiming.header(), /foo;dur=\d/)
})

test('should be able to chain start and end tracking calls', async () => {
  const serverTiming = new ServerTiming()
  serverTiming.start('foo')
  await asyncFn()
  serverTiming.end('foo').start('bar')
  await asyncFn()
  serverTiming.end('bar')

  assert.match(serverTiming.header(), /foo;dur=\d, bar;dur=\d/)
})

test('should allow providing of a human readable description of the timer', async () => {
  const serverTiming = new ServerTiming()
  serverTiming.start({
    label: 'foo',
    desc: 'Foo Service',
  })
  await asyncFn()
  serverTiming.end('foo')

  assert.match(serverTiming.header(), /foo;desc="Foo Service";dur=\d/)
})

test('should be able to wrap an async function and track time', async () => {
  const serverTiming = new ServerTiming()
  const returnValue = await serverTiming.track('foo', asyncFn)

  assert.equal(returnValue, 'hello world')
  assert.match(serverTiming.header(), /foo;dur=\d/)
})

test('should be able to provide description to tracked function', async () => {
  const serverTiming = new ServerTiming()
  await serverTiming.track(
    {
      label: 'foo',
      desc: 'Foo Service',
    },
    asyncFn
  )

  assert.match(serverTiming.header(), /foo;desc="Foo Service";dur=\d/)
})

test('should be able to track multiple function calls', async () => {
  const serverTiming = new ServerTiming()
  await serverTiming.track('foo', asyncFn)
  await serverTiming.track('bar', asyncFn)
  await serverTiming.track('baz', asyncFn)

  assert.match(serverTiming.header(), /foo;dur=\d, bar;dur=\d, baz;dur=\d/)
})

// it('should throw an error if a timer is ended without being started', async () => {
//   const serverTiming = new ServerTiming()
//   assert.throws(serverTiming.end('foo'), `timing 'foo' was never started`)
// })

test('should output the header value when cast to a string', async () => {
  const serverTiming = new ServerTiming()
  await serverTiming.track('foo', asyncFn)

  assert.match(String(serverTiming), /foo;dur=\d/)
})

test('should not end timers when outputing header string', async () => {
  const serverTiming = new ServerTiming()
  serverTiming.start('foo')
  await asyncFn()
  const header1 = serverTiming.header()
  await asyncFn()
  const header2 = serverTiming.header()

  assert.match(header1, /foo;dur=\d/)
  assert.match(header2, /foo;dur=\d/)
  assert.notEqual(header1, header2)
})
// })
