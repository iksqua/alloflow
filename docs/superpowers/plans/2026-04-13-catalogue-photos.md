# Catalogue Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one photo per network catalogue item — uploaded by franchise_admin, displayed as 48×48 thumbnails in both HQ and franchisee catalogue lists.

**Architecture:** A nullable `image_url text` column on `network_catalog_items` stores the public Supabase Storage URL. A dedicated API route handles upload (POST) and removal (DELETE). The image upload fires after the main item save; `onSaved` is called only after the upload attempt resolves. Both catalogue list components render a thumbnail with a grey 📷 fallback via a local `ItemThumbnail` component that uses `useState` to handle `onError`.

**Tech Stack:** Next.js 16 App Router, Supabase Storage (`createServiceClient` from `@/lib/supabase/service`), TypeScript strict, Tailwind + CSS vars

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260414000001_catalogue_image_url.sql` | Create | `image_url` column + `catalogue-images` bucket + storage policy |
| `src/app/api/franchise/catalogue/[id]/image/route.ts` | Create | POST upload + DELETE remove |
| `src/app/api/franchise/catalogue/[id]/image/route.test.ts` | Create | Unit tests for validation + auth |
| `src/app/api/catalogue-reseau/route.ts` | Modify | Add `image_url` to explicit select column list |
| `src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx` | Modify | Upload zone UI + image upload/delete on save |
| `src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx` | Modify | `ItemThumbnail` + thumbnail in HQ list |
| `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx` | Modify | `ItemThumbnail` + thumbnail in franchisee list |

---

### Task 1: Migration — image_url column + Storage bucket

**Files:**
- Create: `supabase/migrations/20260414000001_catalogue_image_url.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260414000001_catalogue_image_url.sql

-- 1. Add image_url column
ALTER TABLE public.network_catalog_items
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Create public Storage bucket (public = true allows read without auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalogue-images',
  'catalogue-images',
  true,
  2097152,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Block direct client-side uploads (all writes go through service role API)
CREATE POLICY IF NOT EXISTS "no_direct_client_uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'catalogue-images');
```

- [ ] **Step 2: Apply via Supabase SQL editor**

Go to https://supabase.com/dashboard/project/vblxzfsddxhtthycsmim/sql/new, paste and run.
Expected: no errors, column added, bucket created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260414000001_catalogue_image_url.sql
git commit -m "feat(db): add image_url column and catalogue-images storage bucket"
```

---

### Task 2: Upload + Delete API route

**Files:**
- Create: `src/app/api/franchise/catalogue/[id]/image/route.ts`
- Create: `src/app/api/franchise/catalogue/[id]/image/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/api/franchise/catalogue/[id]/image/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))

import { POST, DELETE } from './route'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

function makeFormData(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return fd
}

function mockAuth(role = 'franchise_admin', orgId = 'org-1') {
  ;(createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role, org_id: orgId }, error: null }),
    })),
  })
}

function mockService(itemOrgId = 'org-1') {
  const dbFrom = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'item-1', org_id: itemOrgId }, error: null }),
    update: vi.fn().mockReturnThis(),
  }
  const storageFrom = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/org-1/item-1.jpg' } }),
  }
  ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn(() => dbFrom),
    storage: { from: vi.fn(() => storageFrom) },
  })
  return { dbFrom, storageFrom }
}

describe('POST /api/franchise/catalogue/[id]/image', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 422 for non-image MIME type', async () => {
    mockAuth(); mockService()
    const file = new File(['data'], 'file.pdf', { type: 'application/pdf' })
    const req = new NextRequest('http://localhost/api/franchise/catalogue/item-1/image', {
      method: 'POST', body: makeFormData(file),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/format/i)
  })

  it('returns 422 when file exceeds 2 MB', async () => {
    mockAuth(); mockService()
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })
    const req = new NextRequest('http://localhost/api/franchise/catalogue/item-1/image', {
      method: 'POST', body: makeFormData(file),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(422)
  })

  it('returns 404 when item belongs to different org', async () => {
    mockAuth('franchise_admin', 'org-1'); mockService('org-2')
    const file = new File(['x'], 'img.jpg', { type: 'image/jpeg' })
    const req = new NextRequest('http://localhost/api/franchise/catalogue/item-1/image', {
      method: 'POST', body: makeFormData(file),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with image_url on valid upload', async () => {
    mockAuth(); mockService()
    const file = new File(['x'], 'img.jpg', { type: 'image/jpeg' })
    const req = new NextRequest('http://localhost/api/franchise/catalogue/item-1/image', {
      method: 'POST', body: makeFormData(file),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.image_url).toContain('cdn.example.com')
  })
})

describe('DELETE /api/franchise/catalogue/[id]/image', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 and clears image_url', async () => {
    mockAuth(); mockService()
    const req = new NextRequest('http://localhost/api/franchise/catalogue/item-1/image', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- src/app/api/franchise/catalogue/\\[id\\]/image/route.test.ts 2>&1 | tail -5
```
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/franchise/catalogue/[id]/image/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 2 * 1024 * 1024

async function getFranchiseAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 401 as const }
  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return { error: 403 as const }
  return { userId: user.id, orgId: profile.org_id as string }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getFranchiseAdmin()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: item } = await supabase
    .from('network_catalog_items').select('id, org_id').eq('id', id).single()
  if (!item || item.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 422 })
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: 'Format non supporté (jpg, png, webp)' }, { status: 422 })
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'Fichier trop volumineux (max 2 Mo)' }, { status: 422 })

  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
  const path = `${caller.orgId}/${id}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from('catalogue-images').upload(path, buffer, { contentType: file.type, upsert: true })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('catalogue-images').getPublicUrl(path)
  await supabase.from('network_catalog_items').update({ image_url: publicUrl }).eq('id', id)

  return NextResponse.json({ image_url: publicUrl })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getFranchiseAdmin()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: item } = await supabase
    .from('network_catalog_items').select('id, org_id').eq('id', id).single()
  if (!item || item.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.storage.from('catalogue-images')
    .remove([`${caller.orgId}/${id}.jpg`, `${caller.orgId}/${id}.png`, `${caller.orgId}/${id}.webp`])

  await supabase.from('network_catalog_items').update({ image_url: null }).eq('id', id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- src/app/api/franchise/catalogue/\\[id\\]/image/route.test.ts 2>&1 | tail -5
```
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/app/api/franchise/catalogue/\\[id\\]/image/
git commit -m "feat: add POST/DELETE /api/franchise/catalogue/[id]/image route"
```

---

### Task 3: Update GET routes to expose image_url

**Files:**
- Modify: `src/app/api/catalogue-reseau/route.ts:22-28`

- [ ] **Step 1: Add image_url to the franchisee catalogue select**

In `src/app/api/catalogue-reseau/route.ts`, change the `network_catalog_items` select from:
```
id, type, name, description, is_mandatory, is_seasonal, expires_at, available_from, status, version,
```
to:
```
id, type, name, description, is_mandatory, is_seasonal, expires_at, available_from, status, version, image_url,
```

Note: `GET /api/franchise/catalogue` uses `.select('*')` which already includes `image_url` — no change needed there.

- [ ] **Step 2: Run all tests**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run 2>&1 | tail -5
```
Expected: all passing

- [ ] **Step 3: Commit**

```bash
git add src/app/api/catalogue-reseau/route.ts
git commit -m "feat: expose image_url in catalogue-reseau GET response"
```

---

### Task 4: CatalogueItemForm — upload zone + image lifecycle on save

**Files:**
- Modify: `src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx`

- [ ] **Step 1: Update `CatalogItem` type and add image state**

Add `image_url?: string | null` to the `CatalogItem` type:
```typescript
type CatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  available_from?: string | null; status: string; version: number
  image_url?: string | null
  network_catalog_item_data?: { payload: Record<string, unknown> }
}
```

Add three image state variables after the existing `useState` calls:
```typescript
const [imageFile,    setImageFile]    = useState<File | null>(null)
const [imagePreview, setImagePreview] = useState<string | null>(item?.image_url ?? null)
const [imageRemoved, setImageRemoved] = useState(false)
```

- [ ] **Step 2: Add file change handler**

```typescript
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImageRemoved(false)
    setImagePreview(URL.createObjectURL(file))
  }
```

- [ ] **Step 3: Update `handleSave` to manage image after main save**

Replace the section after `toast.success(...)` with this complete image lifecycle block:

```typescript
      // Image lifecycle: upload new, delete removed
      let finalImageUrl: string | null = data.item.image_url ?? null

      if (imageRemoved && item?.image_url) {
        await fetch(`/api/franchise/catalogue/${data.item.id}/image`, { method: 'DELETE' })
        finalImageUrl = null
      } else if (imageFile) {
        const fd = new FormData()
        fd.append('file', imageFile)
        const imgRes = await fetch(`/api/franchise/catalogue/${data.item.id}/image`, { method: 'POST', body: fd })
        if (imgRes.ok) {
          const imgData = await imgRes.json()
          finalImageUrl = imgData.image_url
        } else {
          toast.error('Item sauvegardé mais la photo n\'a pas pu être uploadée')
        }
      }

      onSaved({ ...data.item, image_url: finalImageUrl })
      toast.success(item ? 'Item mis à jour' : 'Item créé')
```

**Important:** Move `onSaved` call to after the image lifecycle block (remove the earlier `onSaved(data.item)` call).

- [ ] **Step 4: Add upload zone to JSX — replaces standalone Nom + Description divs**

Replace the existing standalone Nom and Description `<div>` blocks with this combined photo+fields layout:

```tsx
          {/* Photo + Nom + Description */}
          <div className="flex gap-4 items-start">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <label className="cursor-pointer">
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
                <div
                  className="w-20 h-20 rounded-xl flex flex-col items-center justify-center overflow-hidden"
                  style={{ border: '2px dashed var(--border)', background: 'var(--surface2)' }}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full gap-1">
                      <span className="text-2xl">📷</span>
                      <span className="text-xs text-[var(--text4)]">Photo</span>
                    </div>
                  )}
                </div>
              </label>
              {imagePreview && (
                <button type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null); setImageRemoved(true) }}
                  className="text-xs text-[var(--text4)] underline">
                  Supprimer
                </button>
              )}
            </div>
            <div className="flex flex-col gap-3 flex-1">
              <div>
                <label className={labelCls}>Nom *</label>
                <input style={inputStyle} value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Farine T45" />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea style={{ ...inputStyle, height: '64px', resize: 'none' }} value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
          </div>
```

- [ ] **Step 5: TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit 2>&1
```
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx
git commit -m "feat: add photo upload zone and image lifecycle to catalogue item form"
```

---

### Task 5: ItemThumbnail + thumbnails in HQ catalogue list

**Files:**
- Modify: `src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx`

- [ ] **Step 1: Update `CatalogItem` type**

Add `image_url?: string | null` to the type:
```typescript
type CatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  status: string; version: number
  image_url?: string | null
  network_catalog_item_data?: { payload: Record<string, unknown> }
}
```

- [ ] **Step 2: Add `ItemThumbnail` component before `CataloguePageClient`**

Note: use `useState` (already imported), NOT `React.useState`.

```typescript
function ItemThumbnail({ src }: { src?: string | null }) {
  const [err, setErr] = useState(false)
  if (src && !err) {
    return (
      <img src={src} alt="" onError={() => setErr(true)}
        className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
    )
  }
  return (
    <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-lg"
      style={{ background: 'var(--surface2)', color: 'var(--text4)' }}>
      📷
    </div>
  )
}
```

- [ ] **Step 3: Add thumbnail to item rows**

Inside the `.map()`, add `<ItemThumbnail src={item.image_url} />` as first child in the name flex group:

```tsx
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <ItemThumbnail src={item.image_url} />
              <div>
                <p className="text-sm font-medium text-[var(--text1)]">{item.name}</p>
```

- [ ] **Step 4: TypeScript check + tests**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit && npm run test:run 2>&1 | tail -5
```
Expected: 0 errors, all passing

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx
git commit -m "feat: add 48x48 thumbnails to HQ catalogue list"
```

---

### Task 6: Thumbnails in franchisee catalogue list

**Files:**
- Modify: `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx`

- [ ] **Step 1: Add `image_url` to `NetworkCatalogItem` type**

```typescript
type NetworkCatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  available_from?: string | null; status: string; version: number
  image_url?: string | null
  network_catalog_item_data?: { payload: Record<string, unknown>; previous_payload: Record<string, unknown> | null } | null
}
```

- [ ] **Step 2: Add `ItemThumbnail` before `CatalogueReseauPageClient`**

Same as Task 5 Step 2 — use `useState` (already imported in this file as `import { useState, useEffect } from 'react'`):

```typescript
function ItemThumbnail({ src }: { src?: string | null }) {
  const [err, setErr] = useState(false)
  if (src && !err) {
    return (
      <img src={src} alt="" onError={() => setErr(true)}
        className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
    )
  }
  return (
    <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-lg"
      style={{ background: 'var(--surface2)', color: 'var(--text4)' }}>
      📷
    </div>
  )
}
```

- [ ] **Step 3: Add thumbnail to franchisee item rows**

```tsx
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <ItemThumbnail src={cat.image_url} />
              <div>
                <p className="text-sm font-medium text-[var(--text1)]">{cat.name}</p>
```

- [ ] **Step 4: TypeScript check + all tests**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit && npm run test:run 2>&1 | tail -5
```
Expected: 0 errors, all passing

- [ ] **Step 5: Commit + push**

```bash
git add src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx
git commit -m "feat: add 48x48 thumbnails to franchisee catalogue list"
git push
```

---

### Task 7: Deploy

- [ ] **Step 1: Merge to main and push**

```bash
git checkout main && git merge <feature-branch> && git push
```

- [ ] **Step 2: Apply migration**

Apply `supabase/migrations/20260414000001_catalogue_image_url.sql` via Supabase SQL editor:
https://supabase.com/dashboard/project/vblxzfsddxhtthycsmim/sql/new
