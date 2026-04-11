import { chromium, FullConfig } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const ACCOUNTS = [
  {
    authFile:  path.join(__dirname, '.auth/admin.json'),
    email:     process.env.TEST_USER_EMAIL!,
    password:  process.env.TEST_USER_PASSWORD!,
    envKey:    'TEST_USER_EMAIL / TEST_USER_PASSWORD',
  },
  {
    authFile:  path.join(__dirname, '.auth/caissier.json'),
    email:     process.env.TEST_CAISSIER_EMAIL!,
    password:  process.env.TEST_CAISSIER_PASSWORD!,
    envKey:    'TEST_CAISSIER_EMAIL / TEST_CAISSIER_PASSWORD',
  },
  {
    authFile:  path.join(__dirname, '.auth/franchise.json'),
    email:     process.env.TEST_FRANCHISE_EMAIL!,
    password:  process.env.TEST_FRANCHISE_PASSWORD!,
    envKey:    'TEST_FRANCHISE_EMAIL / TEST_FRANCHISE_PASSWORD',
  },
]

const ONE_HOUR_MS = 60 * 60 * 1000

function isAuthFileFresh(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false
  return Date.now() - fs.statSync(filePath).mtimeMs < ONE_HOUR_MS
}

export default async function globalSetup(_config: FullConfig) {
  const { BASE_URL } = process.env
  if (!BASE_URL) {
    throw new Error('Missing required env var: BASE_URL. Check .env.test.')
  }

  // Validate credentials for all accounts
  for (const account of ACCOUNTS) {
    if (!account.email || !account.password) {
      throw new Error(`Missing env vars: ${account.envKey}. Check .env.test.`)
    }
  }

  // Check if all auth files are fresh — skip authentication entirely
  if (ACCOUNTS.every(a => isAuthFileFresh(a.authFile))) return

  const browser = await chromium.launch()
  try {
    for (const account of ACCOUNTS) {
      // Skip this account if its auth file is still fresh
      if (isAuthFileFresh(account.authFile)) continue

      fs.mkdirSync(path.dirname(account.authFile), { recursive: true })

      const context = await browser.newContext()
      const page    = await context.newPage()

      await page.goto(BASE_URL + '/login')
      await page.getByLabel('Email').fill(account.email)
      await page.getByLabel('Mot de passe').fill(account.password)
      await page.getByRole('button', { name: /se connecter|connexion/i }).click()
      await page.waitForURL('**/dashboard/**', { timeout: 15_000 })

      await context.storageState({ path: account.authFile })
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
