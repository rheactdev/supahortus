begin;

revoke execute on all functions in schema private
  from public, anon, service_role;

grant execute on all functions in schema private
  to authenticated;

alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, service_role;

alter default privileges for role postgres in schema private
  grant execute on functions to authenticated;

commit;
