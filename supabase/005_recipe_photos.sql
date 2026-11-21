begin;

update public.recipes
set image_path = 'images/recipes/' || slug || '.webp'
where image_path is null and author_id is null
  and slug in (
    'borshch', 'syrnyky', 'omelet', 'carbonara', 'greek-salad', 'pancakes', 'mug-cake', 'deruny', 'apple-oats', 'banana-toast', 'buckwheat-milk', 'shakshuka', 'cottage-bowl', 'lentil-soup', 'pumpkin-soup', 'vinaigrette', 'chicken-noodle', 'chickpea-salad', 'cabbage-stew', 'lemon-chicken', 'tomato-pasta', 'bean-chili', 'baked-fish', 'bulgur-verde', 'mushroom-rice', 'baked-apples', 'berry-crumble', 'chocolate-pudding', 'lemon-cookies', 'yogurt-parfait'
  );

commit;
