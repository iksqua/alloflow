import { chromium, FullConfig } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const AUTH_FILE = path.join(__dirname, '.auth/user.json')

export default async function globalSetup(_config: FullConfig) {
  // Skip if auth file already fresh (< 1h old)
  if (fs.existsSync(AUTH_FILE)) {
    const stat = fs.statSync(AUTH_FILE)
    if (Date.now() - stat.mtimeMs < 60 * 60 * 1000) return
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })

  const browser = await chromium.launch()
  const page    = await browser.newPage()

  await page.goto(process.env.BASE_URL + '/login')

  // Login form uses label "Email" (id="email") and "Mot de passe" (id="password")
  await page.getByLabel('Email').fill(process.env.TEST_USER_EMAIL!)
  await page.getByLabel('Mot de passe').fill(process.env.TEST_USER_PASSWORD!)
  await page.getByRole('button', { name: /se connecter|connexion/i }).click()

  // Wait for post-login redirect (login redirects to /dashboard/products)
  await page.waitForURL('**/dashboard/**', { timeout: 15_000 })

  await page.context().storageState({ path: AUTH_FILE })
  await browser.close()
}
