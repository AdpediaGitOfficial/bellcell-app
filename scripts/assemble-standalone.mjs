#!/usr/bin/env node
/**
 * Finish the standalone build.
 *
 * `output: 'standalone'` traces the server's own dependencies but
 * deliberately leaves out two directories, because on most platforms they
 * are served by a CDN rather than by Node:
 *
 *   .next/static  — the hashed JS and CSS bundles
 *   public        — the logo and any static file
 *
 * This project serves them from the Node process behind nginx, so they have
 * to be copied in. Without this the app boots, renders HTML, and loads no
 * styles or scripts at all — which looks like a broken deployment rather
 * than a missing copy step, so it runs automatically as `postbuild`.
 */
import { cp, access, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const standalone = join(root, '.next', 'standalone')

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

if (!(await exists(standalone))) {
  console.error(
    'postbuild: .next/standalone is missing. Is `output: "standalone"` still set in next.config.ts?',
  )
  process.exit(1)
}

const copies = [
  ['.next/static', '.next/standalone/.next/static'],
  ['public', '.next/standalone/public'],
]

for (const [from, to] of copies) {
  if (!(await exists(join(root, from)))) {
    console.log(`postbuild: skipped ${from} (not present)`)
    continue
  }
  await mkdir(join(root, to, '..'), { recursive: true })
  await cp(join(root, from), join(root, to), { recursive: true })
  console.log(`postbuild: copied ${from} -> ${to}`)
}

console.log('postbuild: standalone server ready — run `node .next/standalone/server.js`')
