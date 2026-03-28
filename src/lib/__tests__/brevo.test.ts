import { describe, it, expect } from 'vitest'
import { renderTemplate } from '../template'

describe('renderTemplate', () => {
  it('replaces all known variables', () => {
    const tpl = 'Bonjour {{prenom}} ! Tu as {{points}} pts · Tier {{tier}} · {{etablissement}}'
    const result = renderTemplate(tpl, {
      prenom: 'Marie',
      points: 150,
      tier: 'Silver',
      etablissement: 'Le Café',
    })
    expect(result).toBe('Bonjour Marie ! Tu as 150 pts · Tier Silver · Le Café')
  })

  it('replaces {{lien_avis}} and {{segment}}', () => {
    const tpl = 'Segment: {{segment}} — Avis: {{lien_avis}}'
    const result = renderTemplate(tpl, { segment: 'vip', lien_avis: 'https://g.page/r/ABC/review' })
    expect(result).toBe('Segment: vip — Avis: https://g.page/r/ABC/review')
  })

  it('leaves unknown variables untouched', () => {
    const tpl = 'Hello {{prenom}} {{unknown}}'
    const result = renderTemplate(tpl, { prenom: 'Alex' })
    expect(result).toBe('Hello Alex {{unknown}}')
  })

  it('handles missing vars with empty string', () => {
    const tpl = 'Bonjour {{prenom}} !'
    const result = renderTemplate(tpl, {})
    expect(result).toBe('Bonjour  !')
  })

  it('replaces multiple occurrences', () => {
    const tpl = '{{prenom}} {{prenom}} {{prenom}}'
    const result = renderTemplate(tpl, { prenom: 'test' })
    expect(result).toBe('test test test')
  })
})
