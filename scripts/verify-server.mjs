import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const targets = [
  'api/[...path].js',
  'server/src/index.js',
  'server/src/middleware/auth.js',
  'server/src/routes/athleteRoutes.js',
  'server/src/routes/bookingRoutes.js',
  'server/src/routes/clinicalRoutes.js',
  'server/src/routes/consentRoutes.js',
  'server/src/routes/profileRoutes.js',
]

for (const relativeTarget of targets) {
  const absoluteTarget = path.join(root, relativeTarget)
  if (!existsSync(absoluteTarget)) {
    console.error(`[verify:server] Missing file: ${relativeTarget}`)
    process.exit(1)
  }

  const result = spawnSync(process.execPath, ['--check', absoluteTarget], {
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    console.error(`[verify:server] Syntax check failed for ${relativeTarget}`)
    process.exit(result.status ?? 1)
  }
}

console.log(`[verify:server] Verified ${targets.length} server entry files.`)
