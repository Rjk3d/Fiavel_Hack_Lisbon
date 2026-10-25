import { defineConfig } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const database = `.data/e2e-${randomUUID()}.sqlite`
export default defineConfig({
  metadata: { database },
  testDir: './tests/e2e',
  timeout: 45000,
  expect: { timeout: 10000 },
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5192', channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node --experimental-strip-types scripts/dev.mjs',
    url: 'http://127.0.0.1:5192',
    reuseExistingServer: false,
    env: { DEV_PORT: '5192', DEV_STRICT_PORT: 'true', REVIEWS_DEMO: 'true', REVIEWS_DB_PATH: database },
    timeout: 30000,
  },
})
