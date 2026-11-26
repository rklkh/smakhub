begin;
alter table public.profiles
  add column if not exists cuisines text not null default '' check (length(cuisines) <= 300),
  add column if not exists excluded_foods text not null default '' check (length(excluded_foods) <= 600);
grant update (cuisines, excluded_foods) on public.profiles to authenticated;
drop policy if exists profiles_active_write on public.profiles;
create policy profiles_active_write on public.profiles as restrictive for update to authenticated
  using (public.is_smak_active()) with check (public.is_smak_active());

alter table public.recipes add column if not exists cuisine text not null default '';
update public.recipes set cuisine = case
  when slug in ('borshch','deruny','syrnyky','pancakes') then 'Українська'
  when slug = 'carbonara' then 'Італійська'
  when slug = 'greek-salad' then 'Грецька'
  when slug = 'omelet' then 'Французька'
  else 'Міжнародна' end
where cuisine = '' and author_id is null and slug in
  ('borshch','deruny','syrnyky','pancakes','carbonara','greek-salad','omelet','mug-cake');

create table if not exists public.recipe_history (
  user_id uuid not null references auth.users on delete cascade,
  recipe_id uuid not null references public.recipes on delete cascade,
  viewed_at timestamptz not null default now(), primary key(user_id, recipe_id)
);
create index if not exists recipe_history_recent on public.recipe_history(user_id, viewed_at desc);
create table if not exists public.recipe_ratings (
  user_id uuid not null references auth.users on delete cascade,
  recipe_id uuid not null references public.recipes on delete cascade,
  stars smallint not null check(stars between 1 and 5), primary key(user_id, recipe_id)
);
create index if not exists recipe_ratings_by_recipe on public.recipe_ratings(recipe_id);
create table if not exists public.recipe_comments (
  id uuid primary key default gen_random_uuid(), recipe_id uuid not null references public.recipes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  body text not null check(length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists recipe_comments_by_recipe on public.recipe_comments(recipe_id, created_at desc, id);
alter table public.recipe_history enable row level security;
alter table public.recipe_ratings enable row level security;
alter table public.recipe_comments enable row level security;
revoke all on public.recipe_history, public.recipe_comments, public.recipe_ratings from public, anon, authenticated;
grant select, insert(user_id, recipe_id, viewed_at), update(viewed_at, user_id, recipe_id) on public.recipe_history to authenticated;
grant select, insert(user_id, recipe_id, stars), update(stars, user_id, recipe_id) on public.recipe_ratings to authenticated;
grant select on public.recipe_comments to anon, authenticated;
grant insert(recipe_id,user_id,body), update(body), delete on public.recipe_comments to authenticated;
do $$
declare t text;
begin
  foreach t in array array['recipe_history','recipe_ratings'] loop
    execute format('drop policy if exists own_read on public.%I',t);
    execute format('create policy own_read on public.%I for select to authenticated using(user_id = (select auth.uid()))',t);
    execute format('drop policy if exists own_insert on public.%I',t);
    execute format('create policy own_insert on public.%I for insert to authenticated with check(user_id = (select auth.uid()) and (select public.is_smak_active()) and exists(select 1 from public.recipes r where r.id = recipe_id and r.status = ''published''))',t);
    execute format('drop policy if exists own_update on public.%I',t);
    execute format('create policy own_update on public.%I for update to authenticated using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()) and (select public.is_smak_active()) and exists(select 1 from public.recipes r where r.id = recipe_id and r.status = ''published''))',t);
  end loop;
end $$;

drop policy if exists comment_read on public.recipe_comments;
create policy comment_read on public.recipe_comments for select using (
  exists(select 1 from public.recipes r where r.id = recipe_id and r.status = 'published')
);
drop policy if exists moderator_read on public.recipe_comments;
create policy moderator_read on public.recipe_comments for select to authenticated using(public.is_smak_admin());
drop policy if exists comment_insert on public.recipe_comments;
create policy comment_insert on public.recipe_comments for insert to authenticated with check(
  user_id = (select auth.uid()) and (select public.is_smak_active()) and
  exists(select 1 from public.recipes r where r.id = recipe_id and r.status = 'published')
);
drop policy if exists comment_moderate on public.recipe_comments;
create policy comment_moderate on public.recipe_comments for update to authenticated
 using(public.is_smak_admin()) with check(public.is_smak_admin());
drop policy if exists comment_remove on public.recipe_comments;
create policy comment_remove on public.recipe_comments for delete to authenticated using(public.is_smak_admin());

create or replace function public.smak_recipe_score(p_recipe uuid)
returns table(mean numeric, votes bigint) language sql stable security definer set search_path='' as $$
  select round(avg(v.stars),1), count(v.stars) from public.recipes r
  left join public.recipe_ratings v on r.id = v.recipe_id
  where r.id = p_recipe and r.status='published' group by r.id
$$;

create or replace function public.smak_suggestions(p_recipe uuid default null)
returns table(slug text, title text) language sql stable security definer set search_path='' as $$
  with me as (select auth.uid() as id),
  prefs as (select p.cuisines,p.excluded_foods,p.skill from public.profiles p,me where p.id=me.id),
  signals as (
    select r.category, 3 as weight from public.favorites f join public.recipes r on r.id=f.recipe_id,me
      where f.user_id=me.id and r.status='published'
    union all
    select r.category,1 from public.recipes r join
      (select h.recipe_id from public.recipe_history h,me where h.user_id=me.id order by viewed_at desc limit 20) h on h.recipe_id=r.id
      where r.status='published'
  ),
  weights as (select category,sum(weight) as score from signals group by category),
  source as (select category,ingredients,cuisine from public.recipes where id=p_recipe and status='published')
  select r.slug,r.title from public.recipes r left join prefs p on true left join weights w on w.category=r.category left join source s on true
  where r.status='published' and r.id is distinct from p_recipe and not exists(
    select 1 from regexp_split_to_table(coalesce(p.excluded_foods,''), ',') term
    where btrim(term)<>'' and strpos(lower(r.ingredients::text),lower(btrim(term)))>0)
  order by (coalesce(w.score,0) + case when s.category=r.category then 8 else 0 end
    + case when s.cuisine<>'' and s.cuisine=r.cuisine then 2 else 0 end
    + case when exists(select 1 from regexp_split_to_table(coalesce(p.cuisines,''),',') term
        where lower(btrim(term))=lower(r.cuisine) and btrim(term)<>'') then 12 else 0 end
    + case when (p.skill,r.difficulty) in (('beginner','easy'),('intermediate','medium'),('advanced','hard')) then 1 else 0 end
    + (select count(*) from jsonb_array_elements(r.ingredients) i where exists(
         select 1 from jsonb_array_elements(s.ingredients) j where lower(coalesce(i->>0,i#>>'{}'))=lower(coalesce(j->>0,j#>>'{}'))))) desc, r.title, r.id
  limit 6
$$;
revoke all on function public.smak_recipe_score(uuid),public.smak_suggestions(uuid) from public;
grant execute on function public.smak_recipe_score(uuid),public.smak_suggestions(uuid) to anon, authenticated;
commit;
