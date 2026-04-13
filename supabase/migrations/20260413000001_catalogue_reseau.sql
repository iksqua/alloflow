-- Catalogue réseau : items maîtres
CREATE TABLE public.network_catalog_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('product', 'recipe', 'sop')),
  name         text NOT NULL,
  description  text,
  is_mandatory boolean NOT NULL DEFAULT false,
  is_seasonal  boolean NOT NULL DEFAULT false,
  expires_at   date,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Payload JSONB + snapshot pour diff visuel
CREATE TABLE public.network_catalog_item_data (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id  uuid NOT NULL REFERENCES public.network_catalog_items(id) ON DELETE RESTRICT,
  payload          jsonb NOT NULL DEFAULT '{}',
  previous_payload jsonb,
  UNIQUE (catalog_item_id)
);

-- Liaison franchisé ↔ catalogue
CREATE TABLE public.establishment_catalog_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id      uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  catalog_item_id       uuid NOT NULL REFERENCES public.network_catalog_items(id) ON DELETE RESTRICT,
  local_price           numeric(10,2),
  local_stock_threshold integer,
  is_active             boolean NOT NULL DEFAULT true,
  current_version       integer NOT NULL DEFAULT 1,
  notified_at           timestamptz,
  seen_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, catalog_item_id)
);

-- Tracking SOPs caissiers
CREATE TABLE public.sop_completions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  catalog_item_id  uuid NOT NULL REFERENCES public.network_catalog_items(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed_at     timestamptz NOT NULL DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX ON public.establishment_catalog_items(establishment_id);
CREATE INDEX ON public.establishment_catalog_items(catalog_item_id);
CREATE INDEX ON public.network_catalog_items(org_id, status);

-- RLS
ALTER TABLE public.network_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_catalog_item_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_completions ENABLE ROW LEVEL SECURITY;

-- franchise_admin : accès complet à son org
CREATE POLICY "franchise_admin_catalog" ON public.network_catalog_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'franchise_admin'
        AND org_id = network_catalog_items.org_id
    )
  );

-- admin franchisé : lecture seule sur les items publiés de son réseau
CREATE POLICY "admin_read_catalog" ON public.network_catalog_items
  FOR SELECT USING (
    status = 'published'
    AND org_id IN (
      SELECT o.id FROM public.organizations o
      JOIN public.establishments e ON e.org_id = o.id
      JOIN public.profiles p ON p.establishment_id = e.id
      WHERE p.id = auth.uid()
    )
  );

-- network_catalog_item_data : suit les mêmes droits que l'item parent
CREATE POLICY "catalog_data_franchise_admin" ON public.network_catalog_item_data
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.network_catalog_items nci
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE nci.id = network_catalog_item_data.catalog_item_id
        AND nci.org_id = p.org_id
        AND p.role = 'franchise_admin'
    )
  );

CREATE POLICY "catalog_data_admin_read" ON public.network_catalog_item_data
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.network_catalog_items nci
      JOIN public.establishments e ON e.org_id = nci.org_id
      JOIN public.profiles p ON p.establishment_id = e.id
      WHERE nci.id = network_catalog_item_data.catalog_item_id
        AND nci.status = 'published'
        AND p.id = auth.uid()
    )
  );

-- establishment_catalog_items : chaque établissement accède uniquement aux siennes
CREATE POLICY "establishment_catalog_items_rls" ON public.establishment_catalog_items
  FOR ALL USING (
    establishment_id = (SELECT establishment_id FROM public.profiles WHERE id = auth.uid())
  );

-- franchise_admin peut tout lire (pour compliance score)
CREATE POLICY "franchise_admin_read_eci" ON public.establishment_catalog_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.establishments e ON e.id = establishment_catalog_items.establishment_id
      JOIN public.organizations o ON o.id = e.org_id
      WHERE p.id = auth.uid()
        AND p.role = 'franchise_admin'
        AND (o.id = p.org_id OR o.parent_org_id = p.org_id)
    )
  );

-- sop_completions : établissement courant
CREATE POLICY "sop_completions_rls" ON public.sop_completions
  FOR ALL USING (
    establishment_id = (SELECT establishment_id FROM public.profiles WHERE id = auth.uid())
  );
