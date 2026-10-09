/**
 * Login throttling by source address.
 *
 * The account lockout in the login action stops someone guessing ONE
 * person's password: five failures and that account is locked for fifteen
 * minutes. It does nothing about the opposite shape of attack — one
 * attacker trying "Password@123" against every address they can guess,
 * which never trips any single account's counter.
 *
 * This counts failures per source address instead, and is deliberately
 * separate from the account counter: the two catch different things and
 * neither substitutes for the other.
 *
 * IN-PROCESS AND INTENTIONALLY SO. The institute runs one Node process
 * behind nginx (docs/deployment.md), so a Map is the honest implementation
 * — Redis for a single-process deployment is a dependency to back up,
 * monitor and restore for no gain. If the app is ever run as more than one
 * process this becomes per-process and must move to the database or a
 * shared store; the test names that assumption.
 */

export interface ThrottleConfig {
  /** Failures allowed in the window before the address is refused. */
  maxFailures: number
  windowMs: number
  blockMs: number
  /** Stop the map growing without bound on a sustained attack. */
  maxTrackedAddresses: number
}

export const DEFAULT_THROTTLE: ThrottleConfig = {
  maxFailures: 15,
  windowMs: 10 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
  maxTrackedAddresses: 10_000,
}

interface Entry {
  failures: number[]
  blockedUntil: number
}

export class LoginThrottle {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly config: ThrottleConfig = DEFAULT_THROTTLE) {}

  /** Milliseconds left on a block, or 0 when the address may try. */
  blockedFor(address: string, now = Date.now()): number {
    const entry = this.entries.get(address)
    if (!entry) return 0
    if (entry.blockedUntil > now) return entry.blockedUntil - now
    return 0
  }

  /** Record a failed attempt. Returns true when this one triggers a block. */
  recordFailure(address: string, now = Date.now()): boolean {
    this.evictIfCrowded(now)

    const entry = this.entries.get(address) ?? { failures: [], blockedUntil: 0 }
    entry.failures = entry.failures.filter((t) => now - t < this.config.windowMs)
    entry.failures.push(now)

    const tripped = entry.failures.length >= this.config.maxFailures
    if (tripped) {
      entry.blockedUntil = now + this.config.blockMs
      entry.failures = []
    }

    this.entries.set(address, entry)
    return tripped
  }

  /** A successful sign-in clears the address. */
  recordSuccess(address: string): void {
    this.entries.delete(address)
  }

  /** Visible for tests and for a future operations screen. */
  size(): number {
    return this.entries.size
  }

  /**
   * Drop entries that have expired, and if the map is still at its ceiling
   * drop the oldest. An attacker rotating addresses must not be able to
   * exhaust memory, and refusing to track beyond the ceiling would let them
   * push real offenders out instead.
   */
  private evictIfCrowded(now: number): void {
    if (this.entries.size < this.config.maxTrackedAddresses) return

    for (const [address, entry] of this.entries) {
      const stale =
        entry.blockedUntil < now &&
        entry.failures.every((t) => now - t >= this.config.windowMs)
      if (stale) this.entries.delete(address)
    }

    while (this.entries.size >= this.config.maxTrackedAddresses) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }
}

/**
 * The address to count against.
 *
 * `x-forwarded-for` is only trustworthy because nginx sets it and the Node
 * process is not reachable from outside (it binds 127.0.0.1). Taking the
 * FIRST entry is the proxy's own view of the client; later entries are
 * attacker-controlled. If the app is ever exposed directly this header must
 * stop being trusted.
 */
export function clientAddress(headers: {
  get(name: string): string | null
}): string {
  const forwarded = headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

/** One throttle for the process. */
export const loginThrottle = new LoginThrottle()
