begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 80),
  skill text not null default 'beginner' check (skill in ('beginner','intermediate','advanced')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, skill) on public.profiles to authenticated;
create policy profiles_own_read on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_own_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create function public.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name, skill) values (
    new.id, left(coalesce(new.raw_user_meta_data->>'display_name',''),80),
    case when new.raw_user_meta_data->>'skill' in ('beginner','intermediate','advanced') then new.raw_user_meta_data->>'skill' else 'beginner' end
  );
  return new;
end;
$$;
revoke all on function public.create_profile() from public, anon, authenticated;
create trigger create_profile_after_signup after insert on auth.users for each row execute function public.create_profile();

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  slug text unique not null,
  title text not null check (length(title) between 3 and 160),
  description text not null default '',
  category text not null check (category in ('breakfast','lunch','dinner','dessert')),
  minutes integer not null check (minutes > 0),
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  vegetarian boolean not null default false,
  servings integer not null check (servings > 0),
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  image_path text,
  status text not null default 'draft' check (status in ('draft','pending','published','rejected')),
  created_at timestamptz not null default now()
);
create index recipes_public_category on public.recipes(category) where status = 'published';
alter table public.recipes enable row level security;
revoke all on public.recipes from anon, authenticated;
grant select on public.recipes to anon, authenticated;
create policy recipes_published_read on public.recipes for select to anon, authenticated using (status = 'published');
create policy recipes_owner_read on public.recipes for select to authenticated using ((select auth.uid()) = author_id);

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,recipe_id)
);
alter table public.favorites enable row level security;
revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;
create policy favorites_own_read on public.favorites for select to authenticated using ((select auth.uid()) = user_id);
create policy favorites_own_add on public.favorites for insert to authenticated with check (
 (select auth.uid()) = user_id and exists (select 1 from public.recipes r where r.id=recipe_id and r.status='published')
);
create policy favorites_own_remove on public.favorites for delete to authenticated using ((select auth.uid()) = user_id);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 3 and 80),
  email text not null check (length(email) <= 254),
  topic text not null,
  message text not null check (length(message) between 10 and 4000),
  email_status text not null default 'not_sent',
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
commit;
