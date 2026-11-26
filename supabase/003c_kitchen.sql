begin;
update public.recipes as r
set cost_band = coalesce(r.cost_band, defaults.band),
    cookware = coalesce(r.cookware, defaults.tools)
from (values
  ('borshch','standard', array['pot','pan']),
  ('syrnyky','standard', array['pan']),
  ('omelet','budget', array['pan']),
  ('carbonara','premium', array['pot','pan']),
  ('greek-salad','standard', array[]::text[]),
  ('pancakes','budget', array['pan']),
  ('mug-cake','budget', array['microwave']),
  ('deruny','budget', array['pan'])
) as defaults (slug,band,tools)
where r.slug = defaults.slug and r.author_id is null
  and (r.cost_band is null or r.cookware is null);
commit;
