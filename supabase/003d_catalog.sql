begin;
create index if not exists recipes_live_page on public.recipes (created_at desc,id) where status='published';
create or replace function public.search_smak_recipes(
 p_query text default '', p_terms text[] default '{}', p_category text default '',
 p_time int default 0, p_difficulty text default '', p_veg boolean default false,
 p_cost text default '', p_tool text default '', p_offset int default 0
) returns setof public.recipes language sql stable security invoker set search_path='' as $$
 select r.* from public.recipes r
 where r.status='published'
 and strpos(lower(r.title),lower(trim(p_query)))>0
 and not exists (select from unnest(p_terms) term where not exists
 (select from jsonb_array_elements(r.ingredients) i where strpos(lower(coalesce(i->>0,i#>>'{}')),lower(term))>0))
 and (p_category='' or r.category=p_category)
 and (p_difficulty='' or r.difficulty=p_difficulty)
 and (not p_veg or r.vegetarian)
 and (p_time=0 or (p_time=61 and r.minutes>60) or (p_time<>61 and r.minutes<=p_time))
 and (p_cost='' or r.cost_band=p_cost)
 and (p_tool='' or (cardinality(r.cookware)>0 and (r.cookware <@ case p_tool
 when 'pan-pot' then array['pan','pot','noheat'] else array[p_tool,'noheat'] end)))
 order by r.created_at desc,r.id limit 25 offset least(greatest(p_offset,0), 2400000);
$$;
revoke all on function public.search_smak_recipes(text,text[],text,int,text,boolean,text,text,int) from public;
grant execute on function public.search_smak_recipes(text,text[],text,int,text,boolean,text,text,int) to anon,authenticated;
commit;
