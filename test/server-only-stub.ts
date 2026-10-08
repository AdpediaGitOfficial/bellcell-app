/**
 * `server-only` throws when imported outside a React Server Component, which
 * is exactly what it is for — but it also blocks integration tests that
 * import server modules directly. Vitest aliases the package to this no-op.
 */
export {}
