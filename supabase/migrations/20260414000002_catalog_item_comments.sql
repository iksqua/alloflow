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

DO $$ BEGIN
  CREATE POLICY "franchisee_insert_comment"
    ON public.catalog_item_comments FOR INSERT
    WITH CHECK (
      establishment_id = (
        SELECT establishment_id FROM public.profiles WHERE id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "franchisee_select_own_comments"
    ON public.catalog_item_comments FOR SELECT
    USING (
      establishment_id = (
        SELECT establishment_id FROM public.profiles WHERE id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
