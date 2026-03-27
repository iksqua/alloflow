import { chromium, FullConfig } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const AUTH_FILE = path.join(__dirname, '.auth/user.json')

export default async function globalSetup(_config: FullConfig) {
  const { BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD } = process.env
  if (!BASE_URL || !TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    throw new Error(
      'Missing required env vars: BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD. Check .env.test.'
    )
  }

  // Skip if auth file already fresh (< 1h old)
  if (fs.existsSync(AUTH_FILE)) {
    const stat = fs.statSync(AUTH_FILE)
    if (Date.now() - stat.mtimeMs < 60 * 60 * 1000) return
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()

    await page.goto(BASE_URL + '/login')

    await page.getByLabel('Email').fill(TEST_USER_EMAIL)
    await page.getByLabel('Mot de passe').fill(TEST_USER_PASSWORD)
    await page.getByRole('button', { name: /se connecter|connexion/i }).click()

    await page.waitForURL('**/dashboard/**', { timeout: 15_000 })

    await page.context().storageState({ path: AUTH_FILE })
  } finally {
    await browser.close()
  }
}
