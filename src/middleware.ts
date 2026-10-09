import { NextResponse, type NextRequest } from 'next/server'

/**
 * Content-Security-Policy, with a per-request nonce.
 *
 * The other security headers are static and live in next.config.ts. CSP
 * cannot, because a policy worth having names a fresh nonce on every
 * response — a static `script-src 'unsafe-inline'` would be a header that
 * looks like protection and provides none.
 *
 * How it fits together:
 *   * a random nonce per request, passed on through `x-nonce` so Next
 *     stamps it onto its own bootstrap scripts;
 *   * `'strict-dynamic'`, so scripts those trusted scripts load are
 *     trusted too and the policy does not need a list of paths;
 *   * `style-src` keeps `'unsafe-inline'`. Next inlines critical CSS
 *     without a nonce, and a style injection is a defacement where a
 *     script injection is a session theft. Stating the reason here
 *     because the exception otherwise looks like an oversight.
 *
 * `connect-src 'self'` matters more than it looks: the app has no
 * third-party analytics or error reporting, so anything trying to reach
 * off-origin is something nobody put there on purpose.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  // React Refresh needs eval in development. Production never does.
  const devOnly = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devOnly}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    /*
     * Documents and route handlers only. Hashed static assets, the image
     * optimiser and the favicon need no policy and would pay for the
     * middleware hop on every request.
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
