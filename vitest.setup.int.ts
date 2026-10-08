/**
 * Integration-test setup: load .env without adding a dotenv dependency.
 * Unit tests do not need this and never touch a database.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const envPath = path.resolve(process.cwd(), '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!m) continue
    const key = m[1]!
    let value = (m[2] ?? '').trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}
