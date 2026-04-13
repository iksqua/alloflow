# Catalogue Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let franchisees leave text feedback on a network catalogue item. HQ reads all comments per item in the catalogue management page via a lazy-loaded badge.

**Architecture:** New `catalog_item_comments` table scoped by `catalog_item_id` + `establishment_id`. Franchisee POSTs via `/api/catalogue-reseau/[id]/comments` (guarded by item membership check). HQ reads via `GET /api/franchise/catalogue/[id]/comments`. Comment count included in the existing HQ list query via PostgREST aggregate, mapped to a flat `comment_count` field.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS), TypeScript strict, Tailwind + CSS vars

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260414000002_catalog_item_comments.sql` | Create | `catalog_item_comments` table + RLS |
| `src/app/api/catalogue-reseau/[id]/comments/route.ts` | Create | POST — franchisee sends a comment |
| `src/app/api/catalogue-reseau/[id]/comments/route.test.ts` | Create | Unit tests |
| `src/app/api/franchise/catalogue/[id]/comments/route.ts` | Create | GET — HQ reads comments for an item |
| `src/app/api/franchise/catalogue/[id]/comments/route.test.ts` | Create | Unit tests |
| `src/app/api/franchise/catalogue/route.ts` | Modify | Add `comment_count` to GET all items response |
| `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx` | Modify | Inline feedback UI (+ Retour → textarea) |
| `src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx` | Modify | Comment badge + lazy-loaded comment list |

---

### Task 1: Migration — catalog_item_comments table

**Files:**
- Create: `supabase/migrations/20260414000002_catalog_item_comments.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260414000002_catalog_item_comments.sql

CREATE TABLE IF NOT EXISTS public.catalog_item_comments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id  uuid NOT NULL REFERENCES public.network_catalog_items(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  author_id        uuid NOT NULL REFERENCES public.profiles(id),
  content          text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_item_comments_item_idx   ON public.catalog_item_comments (catalog_item_id);
CREATE INDEX IF NOT EXISTS catalog_item_comments_estab_idx  ON public.catalog_item_comments (establishment_id);

-- RLS: franchisee can insert/select their own establishment's comments
ALTER TABLE public.catalog_item_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "franchisee_insert_comment"
  ON public.catalog_item_comments FOR INSERT
  WITH CHECK (
    establishment_id = (
      SELECT establishment_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "franchisee_select_own_comments"
  ON public.catalog_item_comments FOR SELECT
  USING (
    establishment_id = (
      SELECT establishment_id FROM public.profiles WHERE id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply via Supabase SQL editor**

https://supabase.com/dashboard/project/vblxzfsddxhtthycsmim/sql/new
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260414000002_catalog_item_comments.sql
git commit -m "feat(db): add catalog_item_comments table with RLS"
```

---

### Task 2: Franchisee POST /api/catalogue-reseau/[id]/comments

**Files:**
- Create: `src/app/api/catalogue-reseau/[id]/comments/route.ts`
- Create: `src/app/api/catalogue-reseau/[id]/comments/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/api/catalogue-reseau/[id]/comments/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

import { POST } from './route'
import { createClient } from '@/lib/supabase/server'

function mockSupabase({ role = 'admin', establishmentId = 'est-1', membershipExists = true } = {}) {
  const fromMap: Record<string, unknown> = {}

  function makeFrom(table: string) {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { role, establishment_id: establishmentId }, error: null }),
      }
    }
    if (table === 'establishment_catalog_items') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: membershipExists ? { id: 'eci-1' } : null, error: null }),
      }
    }
    if (table === 'catalog_item_comments') {
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null }),
      }
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null }) }
  }

  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn((table: string) => makeFrom(table)),
  })
}

describe('POST /api/catalogue-reseau/[id]/comments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 422 for empty content', async () => {
    mockSupabase()
    const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ content: '' }), headers: { 'Content-Type': 'application/json' } })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(422)
  })

  it('returns 422 for content over 1000 chars', async () => {
    mockSupabase()
    const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ content: 'a'.repeat(1001) }), headers: { 'Content-Type': 'application/json' } })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(422)
  })

  it('returns 404 when item not in establishment catalog', async () => {
    mockSupabase({ membershipExists: false })
    const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ content: 'test retour' }), headers: { 'Content-Type': 'application/json' } })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 201 on valid comment', async () => {
    mockSupabase()
    const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ content: 'Ingrédient difficile à trouver' }), headers: { 'Content-Type': 'application/json' } })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(201)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- src/app/api/catalogue-reseau/\\[id\\]/comments/route.test.ts 2>&1 | tail -5
```
Expected: FAIL

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/catalogue-reseau/[id]/comments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || !['admin'].includes(profile.role) || !profile.establishment_id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { content } = await req.json() as { content?: string }

  if (!content || content.trim().length === 0)
    return NextResponse.json({ error: 'Le commentaire ne peut pas être vide' }, { status: 422 })
  if (content.trim().length > 1000)
    return NextResponse.json({ error: 'Commentaire trop long (max 1000 caractères)' }, { status: 422 })

  // Guard: item must be in this establishment's catalogue
  const { data: membership } = await supabase
    .from('establishment_catalog_items')
    .select('id')
    .eq('catalog_item_id', id)
    .eq('establishment_id', profile.establishment_id)
    .maybeSingle()
  if (!membership)
    return NextResponse.json({ error: 'Item non disponible dans votre catalogue' }, { status: 404 })

  const { error } = await supabase.from('catalog_item_comments').insert({
    catalog_item_id:  id,
    establishment_id: profile.establishment_id,
    author_id:        user.id,
    content:          content.trim(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- src/app/api/catalogue-reseau/\\[id\\]/comments/route.test.ts 2>&1 | tail -5
```
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/app/api/catalogue-reseau/\\[id\\]/comments/
git commit -m "feat: add POST /api/catalogue-reseau/[id]/comments with cross-network guard"
```

---

### Task 3: HQ GET /api/franchise/catalogue/[id]/comments

**Files:**
- Create: `src/app/api/franchise/catalogue/[id]/comments/route.ts`
- Create: `src/app/api/franchise/catalogue/[id]/comments/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/api/franchise/catalogue/[id]/comments/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

import { GET } from './route'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function mockAuth(orgId = 'org-1') {
  ;(createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'franchise_admin', org_id: orgId }, error: null }),
    })),
  })
}

function mockAdmin(itemOrgId = 'org-1', comments = [{ id: 'c1', content: 'Bon item', created_at: '2026-04-13T00:00:00Z', establishments: { name: 'Paris 1' } }]) {
  let callCount = 0
  ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'network_catalog_items') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'item-1', org_id: itemOrgId }, error: null }),
        }
      }
      // catalog_item_comments
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: comments, error: null }),
      }
    }),
  })
}

describe('GET /api/franchise/catalogue/[id]/comments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when item belongs to different org', async () => {
    mockAuth('org-1'); mockAdmin('org-2')
    const req = new NextRequest('http://localhost')
    const res = await GET(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns comments for items in own org', async () => {
    mockAuth(); mockAdmin()
    const req = new NextRequest('http://localhost')
    const res = await GET(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.comments).toHaveLength(1)
    expect(body.comments[0].content).toBe('Bon item')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- src/app/api/franchise/catalogue/\\[id\\]/comments/route.test.ts 2>&1 | tail -5
```
Expected: FAIL

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/franchise/catalogue/[id]/comments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function getFranchiseAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 401 as const }
  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return { error: 403 as const }
  return { userId: user.id, orgId: profile.org_id as string }
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getFranchiseAdmin()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const { id } = await params
  const supabase = adminClient()

  // Verify item belongs to org
  const { data: item } = await supabase
    .from('network_catalog_items').select('id, org_id').eq('id', id).single()
  if (!item || item.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: comments, error } = await supabase
    .from('catalog_item_comments')
    .select('id, content, created_at, establishments(name)')
    .eq('catalog_item_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comments: comments ?? [] })
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- src/app/api/franchise/catalogue/\\[id\\]/comments/route.test.ts 2>&1 | tail -5
```
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add src/app/api/franchise/catalogue/\\[id\\]/comments/
git commit -m "feat: add GET /api/franchise/catalogue/[id]/comments for HQ"
```

---

### Task 4: Add comment_count to HQ catalogue list

**Files:**
- Modify: `src/app/api/franchise/catalogue/route.ts:30`
- Modify: `src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx` (type only)

- [ ] **Step 1: Write the failing test for comment_count mapping**

In the existing test file for `src/app/api/franchise/catalogue/route.ts` (or create `route.test.ts` alongside it if absent), add:

```typescript
it('maps catalog_item_comments aggregate to flat comment_count integer', async () => {
  // Mock supabase returning PostgREST-style aggregate (count is a string)
  mockSupabase([{
    id: 'item-1', org_id: 'org-1', type: 'ingredient', name: 'Sel',
    is_mandatory: false, is_seasonal: false, status: 'published', version: 1,
    network_catalog_item_data: null,
    catalog_item_comments: [{ count: '3' }],   // PostgREST returns count as STRING
  }])
  const req = new NextRequest('http://localhost')
  const res = await GET(req)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.items[0].comment_count).toBe(3)          // must be a number, not '3'
  expect(body.items[0].catalog_item_comments).toBeUndefined() // stripped from response
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- src/app/api/franchise/catalogue/route.test.ts 2>&1 | tail -10
```
Expected: FAIL (either file missing or assertion fails)

- [ ] **Step 3: Add comment_count subquery to GET all items**

In `src/app/api/franchise/catalogue/route.ts`, change the select:
```typescript
  const { data: items, error } = await supabase
    .from('network_catalog_items')
    .select('*, network_catalog_item_data(payload, previous_payload), catalog_item_comments(count)')
    .eq('org_id', caller.orgId)
    .order('created_at', { ascending: false })
```

After fetching, map `catalog_item_comments` to a flat `comment_count` integer.
**Important:** PostgREST returns the aggregate `count` as a **string**, not a number — wrap with `Number()`:

```typescript
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const mapped = (items ?? []).map((item) => {
    const raw = item.catalog_item_comments as { count: string | number }[] | null
    return { ...item, comment_count: Number(raw?.[0]?.count ?? 0), catalog_item_comments: undefined }
  })
  return NextResponse.json({ items: mapped })
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- src/app/api/franchise/catalogue/route.test.ts 2>&1 | tail -10
```
Expected: all passed

- [ ] **Step 5: Add `comment_count` to `CatalogItem` type in `catalogue-page-client.tsx`**

```typescript
type CatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  status: string; version: number
  image_url?: string | null
  comment_count?: number   // ← ADD
  network_catalog_item_data?: { payload: Record<string, unknown> }
}
```

- [ ] **Step 6: Run all tests**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run 2>&1 | tail -5
```
Expected: all passing

- [ ] **Step 7: Commit**

```bash
git add src/app/api/franchise/catalogue/route.ts src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx
git commit -m "feat: add comment_count to HQ catalogue list response"
```

---

### Task 5: Franchisee — inline feedback UI

**Files:**
- Modify: `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx`

- [ ] **Step 1: Add comment state to the component**

Inside `CatalogueReseauPageClient`, add state for which item has the feedback textarea open and its content:

```typescript
const [feedbackOpen,   setFeedbackOpen]   = useState<string | null>(null)
const [feedbackText,   setFeedbackText]   = useState('')
const [feedbackSent,   setFeedbackSent]   = useState<Set<string>>(() => new Set())
const [feedbackSaving, setFeedbackSaving] = useState(false)

async function handleSendFeedback(catalogItemId: string, eciId: string) {
  if (!feedbackText.trim()) return
  setFeedbackSaving(true)
  try {
    const res = await fetch(`/api/catalogue-reseau/${catalogItemId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: feedbackText.trim() }),
    })
    if (res.ok) {
      setFeedbackSent(prev => new Set([...prev, eciId]))
      setFeedbackOpen(null)
      setFeedbackText('')
      toast.success('Retour envoyé')
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'Impossible d\'envoyer le retour')
    }
  } finally {
    setFeedbackSaving(false)
  }
}
```

- [ ] **Step 2: Add the feedback UI at the bottom of each item row**

Inside the `.map()`, after the existing `{/* Diff AVANT/APRÈS */}` block, add:

```tsx
              {/* Feedback franchisé → siège */}
              {!eci.is_upcoming && cat.type !== 'ingredient' && (
                <div className="mt-2">
                  {feedbackSent.has(eci.id) ? (
                    <span className="text-xs text-[var(--text4)]">✓ Retour envoyé</span>
                  ) : feedbackOpen === eci.id ? (
                    <div className="mt-2 rounded-lg p-3" style={{ background: 'var(--surface2)' }}>
                      <textarea
                        value={feedbackText}
                        onChange={e => setFeedbackText(e.target.value)}
                        placeholder="Ex: ingrédient difficile à trouver, fournisseur souvent en rupture…"
                        maxLength={1000}
                        rows={2}
                        className="w-full bg-transparent border-none outline-none text-xs resize-none"
                        style={{ color: 'var(--text2)', fontFamily: 'inherit' }}
                      />
                      <div className="flex justify-between items-center mt-2">
                        <button
                          onClick={() => { setFeedbackOpen(null); setFeedbackText('') }}
                          className="text-xs text-[var(--text4)]">
                          Annuler
                        </button>
                        <button
                          onClick={() => handleSendFeedback(cat.id, eci.id)}
                          disabled={feedbackSaving || !feedbackText.trim()}
                          className="text-xs px-3 py-1 rounded-lg text-white font-medium"
                          style={{ background: 'var(--blue)', opacity: (feedbackSaving || !feedbackText.trim()) ? 0.5 : 1 }}>
                          {feedbackSaving ? 'Envoi…' : 'Envoyer'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setFeedbackOpen(eci.id); setFeedbackText('') }}
                      className="text-xs text-[var(--text4)] underline">
                      + Laisser un retour
                    </button>
                  )}
                </div>
              )}
```

- [ ] **Step 3: TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit 2>&1
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx
git commit -m "feat: add inline feedback UI to franchisee catalogue list"
```

---

### Task 6: HQ — comment badge + lazy-loaded comments

**Files:**
- Modify: `src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx`

- [ ] **Step 1: Add comment state to the component**

Inside `CataloguePageClient`, add state for expanded comments:

```typescript
const [commentsOpen,    setCommentsOpen]    = useState<string | null>(null)
const [commentsData,    setCommentsData]    = useState<Record<string, { content: string; created_at: string; establishments: { name: string } | null }[]>>({})
const [commentsLoading, setCommentsLoading] = useState(false)

async function loadComments(id: string) {
  if (commentsData[id]) { setCommentsOpen(id); return }
  setCommentsLoading(true)
  try {
    const res = await fetch(`/api/franchise/catalogue/${id}/comments`)
    if (res.ok) {
      const d = await res.json()
      setCommentsData(prev => ({ ...prev, [id]: d.comments }))
      setCommentsOpen(id)
    } else {
      toast.error('Impossible de charger les retours')
      // commentsOpen stays null — panel does not expand on error
    }
  } catch {
    toast.error('Impossible de charger les retours')
  } finally {
    setCommentsLoading(false)
  }
}
```

- [ ] **Step 2: Wrap each list item with a per-item container div**

The existing item list renders each item as a flat flex row with `borderTop` applied inline. The comments panel must sit *sibling* to that row inside a wrapper — do NOT place it as a bare sibling in the outer list or the `borderTop` logic will break.

Find the outermost `<div>` that starts each item (the one with the `borderTop` style) and wrap it plus the coming comments panel in a new container `<div>`:

```tsx
{items.map((item) => (
  <div key={item.id}>  {/* ← NEW per-item wrapper */}

    {/* existing item row — keep all its classes and inline styles unchanged */}
    <div className="flex items-start gap-3 p-4" style={{ borderTop: '1px solid var(--border)' }}>
      {/* ... all existing item row content ... */}

      {/* Comment badge — add inside the action buttons area */}
      <button
        onClick={() => commentsOpen === item.id ? setCommentsOpen(null) : loadComments(item.id)}
        className="text-xs px-2 py-1.5 rounded-lg flex items-center gap-1 flex-shrink-0"
        style={{
          background: (item.comment_count ?? 0) > 0 ? 'rgba(59,130,246,0.15)' : 'var(--surface2)',
          color: (item.comment_count ?? 0) > 0 ? '#60a5fa' : 'var(--text3)',
          border: '1px solid var(--border)',
        }}>
        💬 {item.comment_count ?? 0}
      </button>
    </div>  {/* end item row */}

    {/* Comments panel — sibling to the row, inside the wrapper */}
    {commentsOpen === item.id && (
      <div className="px-4 pb-3 pt-1">
        <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {commentsLoading ? (
            <p className="text-xs text-[var(--text4)]">Chargement…</p>
          ) : (commentsData[item.id] ?? []).length === 0 ? (
            <p className="text-xs text-[var(--text4)]">Aucun retour pour l'instant</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(commentsData[item.id] ?? []).map(c => (
                <div key={c.created_at} className="text-xs">
                  <span className="font-medium text-[var(--text3)]">
                    {c.establishments?.name ?? 'Établissement'} · {new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  </span>
                  <p className="text-[var(--text2)] mt-0.5">{c.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )}

  </div>  {/* end per-item wrapper */}
))}
```

**Key constraint:** Do NOT move or change the `borderTop` style on the item row — it must stay on the inner row div, not on the outer wrapper. The wrapper has no border, no padding, no background.

- [ ] **Step 3: Verify the wrapper doesn't break existing layout**

After the change, visually confirm (or via TypeScript):
- Items still display with top borders between them
- The wrapper div has no extra spacing, padding, or background that changes the appearance
- The `key` prop is on the outer wrapper div (remove any existing `key` from the inner row div)

- [ ] **Step 4: TypeScript check + all tests**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit && npm run test:run 2>&1 | tail -5
```
Expected: 0 errors, all tests passing

- [ ] **Step 5: Commit + push**

```bash
git add src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx
git commit -m "feat: add comment badge and lazy-loaded comment list to HQ catalogue"
git push
```

---

### Task 7: Deploy

- [ ] **Step 1: Merge to main and push**

```bash
git checkout main && git merge <feature-branch> && git push
```

- [ ] **Step 2: Apply migration**

Apply `supabase/migrations/20260414000002_catalog_item_comments.sql` via Supabase SQL editor.
