-- supabase/migrations/20260402000001_invoices.sql
CREATE TABLE invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  order_id         uuid NOT NULL REFERENCES orders(id),
  invoice_year     int  NOT NULL,
  sequence_number  int  NOT NULL,
  number           text NOT NULL GENERATED ALWAYS AS ('FAC-' || invoice_year || '-' || LPAD(sequence_number::text, 4, '0')) STORED,
  company_name     text NOT NULL,
  siret            text,
  delivery_email   text,
  pdf_url          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, invoice_year, sequence_number),
  UNIQUE (order_id)
);

CREATE INDEX idx_invoices_estab_year ON invoices (establishment_id, invoice_year);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_own" ON invoices
  FOR SELECT USING (
    establishment_id = (SELECT establishment_id FROM profiles WHERE id = auth.uid())
  );

-- Fonction atomique pour insérer une facture sans race condition sur le numéro
-- Utilise pg_advisory_xact_lock pour sérialiser les insertions par établissement+année
CREATE OR REPLACE FUNCTION insert_invoice_atomic(
  p_establishment_id uuid,
  p_order_id         uuid,
  p_year             int,
  p_company_name     text,
  p_siret            text,
  p_delivery_email   text,
  p_pdf_url          text
) RETURNS TABLE(invoice_id uuid, invoice_number text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_seq    int;
  v_id     uuid;
  v_number text;
BEGIN
  -- Advisory lock scoped to this transaction — sérialise les insertions par (establishment, year)
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_establishment_id::text || p_year::text), 1, 16))::bit(64)::bigint
  );

  -- Return existing invoice if already created for this order (idempotent)
  IF EXISTS (SELECT 1 FROM invoices WHERE order_id = p_order_id) THEN
    RETURN QUERY SELECT id, number FROM invoices WHERE order_id = p_order_id;
    RETURN;
  END IF;

  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_seq
  FROM invoices
  WHERE establishment_id = p_establishment_id AND invoice_year = p_year;

  INSERT INTO invoices (establishment_id, order_id, invoice_year, sequence_number, company_name, siret, delivery_email, pdf_url)
  VALUES (p_establishment_id, p_order_id, p_year, v_seq, p_company_name, p_siret, p_delivery_email, p_pdf_url)
  RETURNING id, number INTO v_id, v_number;

  RETURN QUERY SELECT v_id, v_number;
END;
$$;
