// src/lib/template.ts
// Pure template renderer — safe for both client and server bundles.
// Do NOT import server-only modules here.

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
