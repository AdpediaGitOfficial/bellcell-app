import { describe, expect, it } from 'vitest'
import { LoginThrottle, clientAddress, DEFAULT_THROTTLE } from './throttle'

const config = { maxFailures: 3, windowMs: 1000, blockMs: 5000, maxTrackedAddresses: 4 }
const headers = (map: Record<string, string>) => ({
  get: (name: string) => map[name.toLowerCase()] ?? null,
})

describe('LoginThrottle', () => {
  it('lets an address through before the limit', () => {
    const t = new LoginThrottle(config)
    t.recordFailure('1.1.1.1', 0)
    t.recordFailure('1.1.1.1', 10)
    expect(t.blockedFor('1.1.1.1', 20)).toBe(0)
  })

  it('blocks on the failure that reaches the limit', () => {
    const t = new LoginThrottle(config)
    expect(t.recordFailure('1.1.1.1', 0)).toBe(false)
    expect(t.recordFailure('1.1.1.1', 10)).toBe(false)
    expect(t.recordFailure('1.1.1.1', 20)).toBe(true)
    expect(t.blockedFor('1.1.1.1', 25)).toBe(5000 - 5)
  })

  it('lets the address back in once the block expires', () => {
    const t = new LoginThrottle(config)
    for (const at of [0, 1, 2]) t.recordFailure('1.1.1.1', at)
    expect(t.blockedFor('1.1.1.1', 100)).toBeGreaterThan(0)
    expect(t.blockedFor('1.1.1.1', 6000)).toBe(0)
  })

  it('forgets failures that fall outside the window', () => {
    const t = new LoginThrottle(config)
    t.recordFailure('1.1.1.1', 0)
    t.recordFailure('1.1.1.1', 1)
    // The first two are now older than the 1s window.
    expect(t.recordFailure('1.1.1.1', 2000)).toBe(false)
    expect(t.blockedFor('1.1.1.1', 2000)).toBe(0)
  })

  it('counts each address separately', () => {
    const t = new LoginThrottle(config)
    for (const at of [0, 1, 2]) t.recordFailure('1.1.1.1', at)
    expect(t.blockedFor('1.1.1.1', 3)).toBeGreaterThan(0)
    expect(t.blockedFor('2.2.2.2', 3)).toBe(0)
  })

  it('catches a spray across many accounts from one address', () => {
    // The whole point: the per-account lockout never fires here, because
    // each account sees only one failure.
    const t = new LoginThrottle(config)
    const accounts = ['a@x', 'b@x', 'c@x']
    let blocked = false
    accounts.forEach((_, i) => {
      blocked = t.recordFailure('9.9.9.9', i) || blocked
    })
    expect(blocked).toBe(true)
  })

  it('clears an address on a successful sign-in', () => {
    const t = new LoginThrottle(config)
    t.recordFailure('1.1.1.1', 0)
    t.recordFailure('1.1.1.1', 1)
    t.recordSuccess('1.1.1.1')
    expect(t.recordFailure('1.1.1.1', 2)).toBe(false)
  })

  it('does not grow without bound when addresses are rotated', () => {
    const t = new LoginThrottle(config)
    for (let i = 0; i < 50; i += 1) t.recordFailure(`10.0.0.${i}`, i)
    expect(t.size()).toBeLessThanOrEqual(config.maxTrackedAddresses)
  })

  it('ships a sane default — more attempts than a person makes, fewer than a script', () => {
    expect(DEFAULT_THROTTLE.maxFailures).toBeGreaterThan(5)
    expect(DEFAULT_THROTTLE.maxFailures).toBeLessThan(50)
    expect(DEFAULT_THROTTLE.blockMs).toBeGreaterThanOrEqual(10 * 60 * 1000)
  })
})

describe('clientAddress', () => {
  it('takes the proxy’s view of the client, the first entry', () => {
    // Later entries are attacker-supplied and must not be trusted.
    expect(
      clientAddress(headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' })),
    ).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip', () => {
    expect(clientAddress(headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7')
  })

  it('returns a single bucket rather than throwing when neither is set', () => {
    expect(clientAddress(headers({}))).toBe('unknown')
  })

  it('ignores an empty forwarded header', () => {
    expect(clientAddress(headers({ 'x-forwarded-for': '  ', 'x-real-ip': '1.2.3.4' }))).toBe(
      '1.2.3.4',
    )
  })
})
