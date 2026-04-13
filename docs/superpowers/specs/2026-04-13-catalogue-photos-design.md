# Photos Catalogue — Design Spec

## Goal

Allow franchise admins to attach one photo per network catalogue item. The photo appears as a 48×48 thumbnail in both the HQ catalogue list and the franchisee catalogue list.

## Architecture

### Database

Add a single nullable column to `network_catalog_items`:

```sql
ALTER TABLE public.network_catalog_items
  ADD COLUMN IF NOT EXISTS image_url text;
```

No separate table — `image_url` is a first-class field on the item, not payload data.

### Storage

Supabase Storage bucket: `catalogue-images` (public read, authenticated write).

File path: `{orgId}/{itemId}.{ext}` — one file per item, overwritten on update.

Accepted formats: `image/jpeg`, `image/png`, `image/webp`. Max size: 2 MB. Validation happens server-side before upload.

### API

**Upload:** `POST /api/franchise/catalogue/[id]/image`
- Auth: `franchise_admin` only, `org_id` check
- Body: `multipart/form-data` with a `file` field
- Validates MIME type and file size (reject with 422 if invalid)
- Uploads to Storage via service role client (upsert, same path each time)
- Updates `network_catalog_items.image_url` with the public URL
- Returns `{ image_url: string }`

**Delete:** `DELETE /api/franchise/catalogue/[id]/image`
- Removes file from Storage, sets `image_url = null`

No separate signed URL needed — catalogue images are not sensitive.

Use `createServiceClient()` from `@/lib/supabase/service` for Storage operations (not the inline `adminClient()` pattern found in sibling catalogue routes — that pattern is inconsistent with the rest of the codebase).

## UI Components

### CatalogueItemForm (HQ side)

The upload zone sits at the top-left of the form modal, beside the name and description fields:

- 80×80px square with dashed border and 📷 icon when empty
- Shows image preview (object-fit: cover) when `image_url` is set
- Clicking opens the native file picker
- Preview updates immediately on file selection (local `URL.createObjectURL`)
- Upload fires on form save (not on file select) — image is sent in a separate request after the main PATCH/POST succeeds
- A "Supprimer" link appears below when an image is set

### CataloguePageClient (HQ list)

Each item row shows a 48×48 thumbnail at the left:
- `<img>` with `object-fit: cover`, `border-radius: 8px`
- Fallback: same grey square with 📷 icon when `image_url` is null

### CatalogueReseauPageClient (franchisee list)

Same 48×48 thumbnail pattern. The `image_url` field is returned by `GET /api/catalogue-reseau` (already fetches full `network_catalog_items` data).

## Required Changes to Existing Code

The following files must be updated as part of this feature (not new files — existing code):

1. `src/app/api/catalogue-reseau/route.ts` — add `image_url` to the explicit `network_catalog_items` select column list
2. `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx` — add `image_url?: string | null` to the `NetworkCatalogItem` type
3. `src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx` — add `image_url?: string | null` to the `CatalogItem` type
4. `src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx` — add `image_url?: string | null` to the `CatalogItem` type

## Data Flow

1. HQ creates/edits item → form saves text fields via POST/PATCH
2. If a file was selected, a follow-up `POST /api/franchise/catalogue/[id]/image` uploads it
3. If the image upload fails, the form remains open with a toast error — the item is saved but the photo is not. No automatic rollback of the Storage file is performed (same accepted pattern as the invoices route).
4. `image_url` is stored on `network_catalog_items` — shared across all establishments automatically (no per-establishment copy)
5. Franchisee reads via `GET /api/catalogue-reseau` — `image_url` must be added to the select (see Required Changes above)

## Error Handling

- Invalid MIME or size → 422 with clear French error message shown in form
- Storage upload failure → 500, toast error, form remains open
- Image load failure in list → `onError` falls back to placeholder square (no broken image icon)

## Testing

- Unit: upload route validates MIME/size correctly
- Unit: delete route clears `image_url`
- Integration: full upload flow sets `image_url` on the item

## Out of Scope

- Multiple photos per item
- Image cropping or resizing
- Franchisee-side image upload
