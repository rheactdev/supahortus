create index garden_public_links_created_by_idx
  on public.garden_public_links (created_by);

revoke execute on function public.has_public_garden_access(uuid, text)
  from public, anon, authenticated;
