// src/lib/brevo.ts
export { renderTemplate, type TemplateVars } from './template'

const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/sms'

export interface BrevoSmsResult {
  messageId: string
  smsCount: number
}

/**
 * Send a single transactional SMS via Brevo REST API.
 * Throws on API error. Must only be called server-side.
 */
export async function sendBrevoSms(params: {
  sender: string       // max 11 chars alphanumeric
  recipient: string    // E.164 format: +33612345678
  content: string
}): Promise<BrevoSmsResult> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error('BREVO_API_KEY is not configured')

  const res = await fetch(BREVO_SMS_URL, {
    method: 'POST',
    headers: {
      'accept':       'application/json',
      'content-type': 'application/json',
      'api-key':      apiKey,
    },
    body: JSON.stringify({
      sender:    params.sender,
      recipient: params.recipient,
      content:   params.content,
      type:      'transactional',
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(`Brevo SMS error ${res.status}: ${body.message ?? 'Unknown error'}`)
  }

  return res.json() as Promise<BrevoSmsResult>
}

const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email'

export interface BrevoEmailResult {
  messageId: string
}

/**
 * Send a transactional email via Brevo REST API.
 * htmlContent must be a complete HTML string.
 * Must only be called server-side.
 */
export async function sendBrevoEmail(params: {
  to: { email: string; name?: string }
  subject: string
  htmlContent: string
  replyTo?: { email: string }
}): Promise<BrevoEmailResult> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error('BREVO_API_KEY is not configured')

  const res = await fetch(BREVO_EMAIL_URL, {
    method: 'POST',
    headers: {
      'accept':       'application/json',
      'content-type': 'application/json',
      'api-key':      apiKey,
    },
    body: JSON.stringify({
      sender:      { name: 'Alloflow', email: 'noreply@alloflow.fr' },
      to:          [params.to],
      subject:     params.subject,
      htmlContent: params.htmlContent,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(`Brevo email error ${res.status}: ${body.message ?? 'Unknown error'}`)
  }

  return res.json() as Promise<BrevoEmailResult>
}
