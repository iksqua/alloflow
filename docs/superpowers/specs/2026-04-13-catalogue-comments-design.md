# Commentaires Franchisé → Siège — Design Spec

## Goal

Allow franchisees to leave text feedback on a network catalogue item ("ingredient hard to find", "supplier often out of stock"). The HQ sees all comments centralized per item in the catalogue management page.

## Architecture

### Database

New table `catalog_item_comments`:

```sql
CREATE TABLE public.catalog_item_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES public.network_catalog_items(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES public.profiles(id),
  content         text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.catalog_item_comments (catalog_item_id);
CREATE INDEX ON public.catalog_item_comments (establishment_id);
```

RLS:
- Franchisee (`admin` role): can INSERT where `establishment_id` matches their own; can SELECT their own establishment's comments
- `franchise_admin`: can SELECT all comments where `catalog_item_id` belongs to their `org_id` network

### API

**Franchisee sends a comment:**
`POST /api/catalogue-reseau/[id]/comments`
- Auth: `admin` role, filters by `establishment_id`
- Body: `{ content: string }` — validated (1–1000 chars)
- **Before inserting:** verify a row exists in `establishment_catalog_items` where `catalog_item_id = [id]` AND `establishment_id = caller.establishmentId` — this prevents a franchisee from commenting on items outside their network (cross-tenant guard)
- Inserts row with `catalog_item_id`, `establishment_id`, `author_id`
- Returns `{ ok: true }`
- No server-side rate limit on comment volume per item — accepted for now, UI provides a single-session soft guard only

**HQ reads comments for an item:**
`GET /api/franchise/catalogue/[id]/comments`
- Auth: `franchise_admin`, `org_id` check on the item
- Returns comments ordered by `created_at DESC`, joined with `establishments(name)` only — `profiles` does not have a `full_name` column, so author identity is shown as the establishment name
- No pagination (1000-char limit + item-scoped → manageable volume)

**HQ reads comment counts for all items:**
Comment counts are included in the existing `GET /api/franchise/catalogue` response via PostgREST aggregate:

```
.select('*, network_catalog_item_data(payload, previous_payload), catalog_item_comments(count)')
```

PostgREST returns this as a nested array `catalog_item_comments: [{ count: N }]`, not a flat integer. The route must map it before returning: `comment_count: item.catalog_item_comments?.[0]?.count ?? 0`. The `CatalogItem` TypeScript type needs `comment_count: number` added.

## UI Components

### CatalogueReseauPageClient (franchisee)

Each item row gets a "+ Retour" link at the bottom-right (hidden until hover on desktop, always visible on mobile). On click:

- An inline textarea expands below the item content with a Send button
- On successful send: textarea collapses, link becomes "✓ Retour envoyé" (local state, no refetch)
- One comment per session — the user can re-open and send another, but each send is a new row (no editing)
- API call: `POST /api/catalogue-reseau/[id]/comments`

### CataloguePageClient (HQ)

Each item row shows a `💬 N` badge (grey when 0, blue when > 0) in the action area.

On click (or on item expand — whichever is simpler given current layout):
- Lazy-loads comments via `GET /api/franchise/catalogue/[id]/comments`
- Renders a chronological list: `[Établissement X · DD/MM] Contenu du retour`
- Loading state: spinner inside the expanded area
- Empty state: "Aucun retour pour l'instant"

Comment count included in the `GET /api/franchise/catalogue` payload (subquery count field `comment_count`) so badges render on page load without extra requests.

## Data Flow

1. Franchisee opens catalogue → sees item list with "+ Retour" links
2. Franchisee clicks "+ Retour" → textarea expands inline
3. Franchisee types and clicks Envoyer → `POST /api/catalogue-reseau/[id]/comments`
4. UI confirms locally ("✓ Retour envoyé"), no reload needed
5. HQ opens `/dashboard/franchise/catalogue` → sees `💬 3` badge on an item
6. HQ clicks badge → lazy fetch, comments list expands inline
7. HQ reads: establishment name, date, content

## Error Handling

- Content too long or empty → 422, toast error, textarea stays open
- Network failure on send → toast error "Impossible d'envoyer le retour"
- HQ comment load failure → toast error, collapsed state restored

## Testing

- Unit: POST route validates content length (empty → 422, 1001 chars → 422, 500 chars → 201)
- Unit: POST route rejects wrong `establishment_id`
- Unit: POST route rejects `catalog_item_id` not linked to caller's establishment (cross-network guard)
- Unit: GET route (HQ) only returns comments for items in the org's network
- Unit: comment count included correctly in catalogue GET response (as flat integer after mapping)

## Out of Scope

- HQ replies to franchisee comments
- Push notifications when a new comment arrives
- Comment editing or deletion by franchisee
- Threaded discussions
