import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

export default defineConfig({
  testDir: '.',
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    storageState: path.join(__dirname, '.auth/user.json'),
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'admin',    use: { ...devices['Desktop Chrome'], storageState: path.join(__dirname, '.auth/admin.json') } },
    { name: 'caissier', use: { ...devices['Desktop Chrome'], storageState: path.join(__dirname, '.auth/caissier.json') } },
    { name: 'franchise',use: { ...devices['Desktop Chrome'], storageState: path.join(__dirname, '.auth/franchise.json') } },
  ],
  ...(process.env.BASE_URL?.startsWith('http://localhost') ? {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  } : {}),
})
