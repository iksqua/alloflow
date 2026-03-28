-- Fix admin_reads_network_config RLS policy to restrict to role='admin' only
-- Cashiers should not be able to read network loyalty config

drop policy if exists "admin_reads_network_config" on public.network_loyalty_config;

create policy "admin_reads_network_config"
  on public.network_loyalty_config for select
  using (
    org_id in (
      select coalesce(o.parent_org_id, o.id)
      from public.establishments e
      join public.organizations o on o.id = e.org_id
      join public.profiles p on p.establishment_id = e.id
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
