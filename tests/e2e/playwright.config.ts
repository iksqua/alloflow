import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

export default defineConfig({
  testDir: '.',
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    storageState: '.auth/user.json',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
