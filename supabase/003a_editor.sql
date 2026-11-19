-- Run after 002_smakhub_04.sql. Existing accounts keep the same identifiers.
begin;

create table if not exists public.smak_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  blocked boolean not null default false
);
alter table public.smak_members enable row level security;
revoke all on public.smak_members from public, anon, authenticated;
grant select on public.smak_members to authenticated;
grant update(blocked) on public.smak_members to authenticated;
create or replace function public.smak_register_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.smak_members(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function public.smak_register_member() from public, anon, authenticated;
drop trigger if exists smak_register_member on auth.users;
create trigger smak_register_member after insert on auth.users
for each row execute function public.smak_register_member();
insert into public.smak_members(user_id) select id from auth.users on conflict do nothing;

create or replace function public.is_smak_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select from public.smak_members where user_id = auth.uid() and is_admin and not blocked)
$$;
create or replace function public.is_smak_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select from public.smak_members where user_id = auth.uid() and not blocked)
$$;
revoke all on function public.is_smak_admin(), public.is_smak_active() from public;
grant execute on function public.is_smak_admin(), public.is_smak_active() to authenticated;
drop policy if exists member_read on public.smak_members;
create policy member_read on public.smak_members for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_smak_admin()));
drop policy if exists member_moderate on public.smak_members;
create policy member_moderate on public.smak_members for update to authenticated
using ((select public.is_smak_admin()) and not is_admin)
with check ((select public.is_smak_admin()) and not is_admin);
drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles for select to authenticated using ((select public.is_smak_admin()));
drop policy if exists profiles_active_update on public.profiles;
create policy profiles_active_update on public.profiles as restrictive for update to authenticated
using ((select public.is_smak_active())) with check ((select public.is_smak_active()));
drop policy if exists favorites_active_add on public.favorites;
create policy favorites_active_add on public.favorites as restrictive for insert to authenticated
with check ((select public.is_smak_active()));
create or replace function public.smak_check_contact_sender() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  if new.user_id is not null and exists(select from public.smak_members where user_id=new.user_id and blocked) then
    raise exception using errcode='42501', message='account_blocked';
  end if;
  return new;
end $$;
revoke all on function public.smak_check_contact_sender() from public, anon, authenticated;
drop trigger if exists smak_contact_sender on public.contact_messages;
create trigger smak_contact_sender before insert on public.contact_messages for each row execute function public.smak_check_contact_sender();

create table if not exists public.recipe_categories (
  slug text primary key check(slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  label text not null check(length(trim(label)) between 1 and 80)
);
insert into public.recipe_categories values ('breakfast','Сніданки'), ('lunch','Обіди'), ('dinner','Вечері'), ('dessert','Десерти')
on conflict do nothing;
alter table public.recipe_categories enable row level security;
revoke all on public.recipe_categories from public, anon, authenticated;
grant select on public.recipe_categories to anon, authenticated;
grant insert(slug,label), update(label) on public.recipe_categories to authenticated;
drop policy if exists categories_read on public.recipe_categories;
create policy categories_read on public.recipe_categories for select using(true);
drop policy if exists categories_admin on public.recipe_categories;
create policy categories_admin on public.recipe_categories for all to authenticated using((select public.is_smak_admin())) with check((select public.is_smak_admin()));
alter table public.recipes drop constraint if exists recipes_category_check;
do $$begin
  if not exists(select from pg_constraint where conrelid='public.recipes'::regclass and conname='recipes_category_fk') then
    alter table public.recipes add constraint recipes_category_fk foreign key(category) references public.recipe_categories(slug);
  end if;
end$$;

create table if not exists public.recipe_collections (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title)) between 1 and 100),
  recipe_ids uuid[] not null check(cardinality(recipe_ids) between 1 and 24)
);
alter table public.recipe_collections enable row level security;
revoke all on public.recipe_collections from public, anon, authenticated;
grant select on public.recipe_collections to anon, authenticated;
grant insert(title,recipe_ids),update(title,recipe_ids),delete on public.recipe_collections to authenticated;
drop policy if exists collections_read on public.recipe_collections;
create policy collections_read on public.recipe_collections for select using(true);
drop policy if exists collections_admin on public.recipe_collections;
create policy collections_admin on public.recipe_collections for all to authenticated using((select public.is_smak_admin())) with check((select public.is_smak_admin()));

alter table public.recipes
  add column if not exists revision integer not null default 1,
  add column if not exists moderation_note text not null default '',
  add column if not exists cuisine text not null default '',
  add column if not exists cost_band text,
  add column if not exists cookware text[];
drop policy if exists recipes_admin_read on public.recipes;
create policy recipes_admin_read on public.recipes for select to authenticated using((select public.is_smak_admin()));
create index if not exists recipes_author_idx on public.recipes(author_id,created_at desc);
create index if not exists recipes_status_idx on public.recipes(status,created_at desc);

create or replace function public.smak_save_recipe(p_id uuid,p_revision integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  r public.recipes;
  item jsonb;
  admin boolean := public.is_smak_admin();
  sender uuid := auth.uid();
  photo text := nullif(p_data->>'image_path','');
  next_status text := p_data->>'status';
begin
  if not public.is_smak_active() then raise insufficient_privilege; end if;
  if p_id is not null then
    select * into strict r from public.recipes where id=p_id for update;
    if not admin and r.author_id is distinct from sender then raise insufficient_privilege; end if;
    if r.revision is distinct from p_revision then raise exception 'stale_revision'; end if;
  end if;
  if next_status is null or next_status not in ('draft','pending') then
    if admin and p_id is not null and next_status = r.status then null;
    else raise exception 'invalid_status'; end if;
  end if;
  if coalesce(length(trim(p_data->>'title')),0) not between 3 and 160
     or length(coalesce(p_data->>'description','')) > 1200 or length(coalesce(p_data->>'cuisine','')) > 80
     or coalesce((p_data->>'minutes')::int,0) not between 1 and 10080
     or coalesce((p_data->>'servings')::int,0) not between 1 and 1000
     or jsonb_typeof(p_data->'ingredients') is distinct from 'array' or jsonb_typeof(p_data->'steps') is distinct from 'array'
     or jsonb_array_length(p_data->'ingredients') not between 1 and 80 or jsonb_array_length(p_data->'steps') not between 1 and 80
     then raise exception 'invalid_recipe'; end if;
  for item in select value from jsonb_array_elements(p_data->'ingredients') loop
    if jsonb_typeof(item) is distinct from 'array' or jsonb_array_length(item) <> 2
       or jsonb_typeof(item->0) is distinct from 'string' or jsonb_typeof(item->1) is distinct from 'string'
       or length(trim(item->>0)) not between 1 and 150 or length(trim(item->>1)) not between 1 and 100 then raise exception 'invalid_ingredient'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_data->'steps') loop
    if jsonb_typeof(item) is distinct from 'string' or length(trim(item#>>'{}')) not between 1 and 2000 then raise exception 'invalid_step'; end if;
  end loop;
  if coalesce(p_data->>'cost_band','') not in ('','budget','standard','premium') or jsonb_typeof(p_data->'cookware') is distinct from 'array' then raise exception 'invalid_equipment'; end if;
  if exists(select from jsonb_array_elements_text(p_data->'cookware') w(value) where value not in ('pan','pot','microwave')) then raise exception 'invalid_equipment'; end if;
  if next_status <> 'draft' and photo is null then raise exception 'photo_required'; end if;
  if photo is distinct from r.image_path and photo is not null then
    if photo !~ ('^https://yndwftqwuhewydjrstyf[.]supabase[.]co/storage/v1/object/public/recipe-photos/'||sender::text||'/[0-9a-f-]{36}[.](jpg|png|webp)$')
      or not exists(select from storage.objects where bucket_id='recipe-photos' and name=split_part(photo,'/recipe-photos/',2))
      then raise exception 'invalid_photo'; end if;
  end if;
  if p_id is null then
    insert into public.recipes(author_id,slug,title,description,cuisine,cost_band,cookware,category,minutes,difficulty,vegetarian,servings,ingredients,steps,image_path,status)
    values(sender,concat('r-',gen_random_uuid()),trim(p_data->>'title'),coalesce(p_data->>'description',''),coalesce(p_data->>'cuisine',''),nullif(p_data->>'cost_band',''),array(select jsonb_array_elements_text(p_data->'cookware')),p_data->>'category',
      (p_data->>'minutes')::int,p_data->>'difficulty',coalesce((p_data->>'vegetarian')::boolean,false),(p_data->>'servings')::int,p_data->'ingredients',p_data->'steps',photo,next_status)
    returning id into p_id;
  else
    update public.recipes set title=trim(p_data->>'title'),description=coalesce(p_data->>'description',''),cuisine=coalesce(p_data->>'cuisine',''),cost_band=nullif(p_data->>'cost_band',''),cookware=array(select jsonb_array_elements_text(p_data->'cookware')),category=p_data->>'category',
      minutes=(p_data->>'minutes')::int,difficulty=p_data->>'difficulty',vegetarian=coalesce((p_data->>'vegetarian')::boolean,false),
      servings=(p_data->>'servings')::int,ingredients=p_data->'ingredients',steps=p_data->'steps',image_path=photo,
      status=next_status, moderation_note=case when next_status='rejected' then moderation_note else '' end,revision=revision+1 where id=p_id;
  end if;
  return p_id;
end $$;

create or replace function public.smak_recipe_action(p_id uuid,p_revision integer,p_action text,p_note text default '') returns void
language plpgsql security definer set search_path='' as $$
declare r public.recipes; admin boolean := public.is_smak_admin();
begin
  if not public.is_smak_active() then raise insufficient_privilege; end if;
  select * into strict r from public.recipes where id=p_id for update;
  if not admin and r.author_id is distinct from auth.uid() then raise insufficient_privilege; end if;
  if r.revision is distinct from p_revision then raise exception 'stale_revision'; end if;
  if p_action='delete' then
    delete from public.recipes where id=p_id;
  elsif admin and r.status='pending' and p_action in ('published','rejected') then
    if p_action='rejected' and coalesce(length(trim(p_note)),0) not between 1 and 500 then raise exception 'rejection_reason_required'; end if;
    update public.recipes set status=p_action, moderation_note=case when p_action='rejected' then trim(p_note) else '' end,revision=revision+1 where id=p_id;
  else raise insufficient_privilege; end if;
end $$;
revoke all on function public.smak_save_recipe(uuid,int,jsonb),public.smak_recipe_action(uuid,int,text,text) from public, anon, authenticated;
grant execute on function public.smak_save_recipe(uuid,int,jsonb),public.smak_recipe_action(uuid,int,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('recipe-photos','recipe-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
drop policy if exists smak_photo_upload on storage.objects;
create policy smak_photo_upload on storage.objects for insert to authenticated with check(
 bucket_id='recipe-photos' and (select public.is_smak_active()) and
 name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}[.](jpg|png|webp)$')
);
commit;
