// src/lib/brevo.ts
const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/sms'

export interface BrevoSmsResult {
  messageId: string
  smsCount: number
}

export interface TemplateVars {
  prenom?: string
  points?: number
  tier?: string
  segment?: string
  lien_avis?: string
  etablissement?: string
}

/**
 * Replace {{variable}} tokens in a template string.
 * Unknown tokens are left as-is.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  const map: Record<string, string> = {
    prenom:        vars.prenom        ?? '',
    points:        String(vars.points ?? ''),
    tier:          vars.tier          ?? '',
    segment:       vars.segment       ?? '',
    lien_avis:     vars.lien_avis     ?? '',
    etablissement: vars.etablissement ?? '',
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in map ? map[key] : match
  )
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
      type:      'marketing',
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(`Brevo SMS error ${res.status}: ${body.message ?? 'Unknown error'}`)
  }

  return res.json() as Promise<BrevoSmsResult>
}
