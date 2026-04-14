-- Add notes column to customers table for cashier internal notes
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS notes text;
