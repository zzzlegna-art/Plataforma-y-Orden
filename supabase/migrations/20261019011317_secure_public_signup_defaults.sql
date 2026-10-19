-- New sign-ups must not gain staff access by default.
-- Only the very first profile bootstraps an active administrator. All later Auth
-- registrations are inactive until the admin-managed Edge Function activates them.
create or replace function public.nexora_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hay_perfil boolean;
begin
  -- Serialize first-user bootstrap so two simultaneous sign-ups cannot both become admins.
  perform pg_advisory_xact_lock(hashtext('nexora_first_user_admin'));

  select exists (
    select 1 from public.nexora_profiles
  ) into v_hay_perfil;

  insert into public.nexora_profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case when v_hay_perfil then 'bodeguero' else 'admin' end,
    not v_hay_perfil
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;
