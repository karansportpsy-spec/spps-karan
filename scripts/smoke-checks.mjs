import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const checks = [
  {
    name: 'auth middleware contract',
    file: 'server/src/middleware/auth.js',
    patterns: ['export async function authenticateRequest', 'export function requireRoles'],
  },
  {
    name: 'athlete linking endpoints',
    file: 'server/src/routes/athleteRoutes.js',
    patterns: ['/athletes/link-by-email', '/athletes/send-portal-invite'],
  },
  {
    name: 'session save compatibility hooks',
    file: 'src/hooks/useData.ts',
    patterns: ['async function insertSessionRow', 'async function updateSessionRow'],
  },
  {
    name: 'consent submission endpoint',
    file: 'server/src/routes/consentRoutes.js',
    patterns: ['app.post(`${env.apiBasePath}/consents`', 'const consentSchema = z.object'],
  },
  {
    name: 'clinical record save endpoint',
    file: 'server/src/routes/clinicalRoutes.js',
    patterns: ['app.post(`${env.apiBasePath}/clinical/records`', 'const clinicalRecordSchema = z.object'],
  },
  {
    name: 'vercel api bridge',
    file: 'api/[...path].js',
    patterns: ["import app from '../server/src/index.js';", 'export default app;'],
  },
]

for (const check of checks) {
  const absolutePath = path.join(root, check.file)
  if (!existsSync(absolutePath)) {
    console.error(`[smoke] Missing file for ${check.name}: ${check.file}`)
    process.exit(1)
  }

  const source = readFileSync(absolutePath, 'utf8')
  for (const pattern of check.patterns) {
    if (!source.includes(pattern)) {
      console.error(`[smoke] ${check.name} failed. Missing pattern "${pattern}" in ${check.file}`)
      process.exit(1)
    }
  }
}

console.log(`[smoke] Passed ${checks.length} structural smoke checks.`)
