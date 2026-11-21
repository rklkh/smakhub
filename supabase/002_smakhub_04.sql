-- Виконати в наявному проєкті SmakHub після 001_initial.sql.
-- Міграція лише додає дані й функціонал. Наявні акаунти та записи зберігаються.
begin;

alter table public.contact_messages
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists contact_messages_user_created_idx
  on public.contact_messages (user_id, created_at desc);

create or replace function public.submit_contact_message(
  p_name text, p_email text, p_topic text, p_message text, p_consent boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender uuid := auth.uid();
  name_value text := pg_catalog.btrim(p_name);
  email_value text := pg_catalog.btrim(p_email);
  message_value text := pg_catalog.btrim(p_message);
  current_time_at_submit timestamptz;
begin
  if sender is null then
    raise exception using errcode = '42501', message = 'contact_auth_required';
  end if;

  if p_consent is distinct from true
     or name_value is null or pg_catalog.char_length(name_value) not between 3 and 80
     or email_value is null or pg_catalog.char_length(email_value) > 254
     or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or p_topic is null or p_topic not in ('question', 'idea', 'complaint', 'other')
     or message_value is null or pg_catalog.char_length(message_value) not between 10 and 4000 then
    raise exception using errcode = '22023', message = 'contact_invalid_fields';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('smakhub-contact:' || sender::text, 0));
  current_time_at_submit := pg_catalog.clock_timestamp();

  if exists (
    select 1 from public.contact_messages
    where user_id = sender and created_at > current_time_at_submit - interval '30 seconds'
  ) or (
    select count(*) from public.contact_messages
    where user_id = sender and created_at > current_time_at_submit - interval '24 hours'
  ) >= 5 then
    raise exception using errcode = 'P0001', message = 'contact_rate_limit';
  end if;

  insert into public.contact_messages (user_id, name, email, topic, message, created_at)
  values (sender, name_value, email_value, p_topic, message_value, current_time_at_submit);
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.submit_contact_message(text, text, text, text, boolean)
  to authenticated;

-- Додаємо каталожні записи з постійними slug для зв’язку зі збереженим.
-- Наявні записи й посилання з favorites не змінюються.
insert into public.recipes (slug, title, description, category, minutes, difficulty, vegetarian, servings, ingredients, steps, image_path, status) values
  ('borshch', 'Борщ класичний', 'Насичений борщ на яловичому бульйоні з буряком і капустою.', 'lunch', 120, 'medium', false, 6, '[["Яловичина на кістці","600 г"],["Вода","3 л"],["Буряк","300 г"],["Картопля","4 шт."],["Капуста","300 г"],["Морква","1 шт."],["Цибуля","1 шт."],["Томатна паста","2 ст. л."],["Часник","3 зубчики"],["Олія","3 ст. л."],["Лимонний сік","1 ст. л."],["Лавровий лист","2 шт."],["Сіль","за смаком"],["Сметана й зелень","для подачі"]]'::jsonb, '["Залийте яловичину водою, доведіть до кипіння, зніміть піну. Варіть на слабкому вогні близько 80 хвилин. Наприкінці додайте сіль і лавровий лист.","Дістаньте м’ясо, відділіть його від кістки та наріжте. Видаліть лавровий лист.","Тушкуйте нарізаний буряк у ложці олії з томатною пастою і лимонним соком 10–15 хвилин. Окремо обсмажте цибулю й моркву на решті олії.","Додайте в киплячий бульйон картоплю кубиками. Через 10 хвилин покладіть нашатковану капусту, а ще за 5 хвилин — буряк, засмажку й м’ясо.","Варіть до м’якості овочів. Додайте подрібнений часник, вимкніть вогонь і дайте настоятися під кришкою. Подавайте зі сметаною та зеленню."]'::jsonb, 'images/recipes/borshch.webp', 'published'),
  ('syrnyky', 'Сирники з родзинками', 'Золотисті сирники з кисломолочного сиру та родзинок.', 'breakfast', 30, 'easy', true, 3, '[["Кисломолочний сир","400 г"],["Яйця","1 шт."],["Борошно","50 г + для обкачування"],["Цукор","2 ст. л."],["Родзинки","40 г"],["Сіль","дрібка"],["Олія","2 ст. л."]]'::jsonb, '["Залийте родзинки теплою водою на 5 хвилин, злийте воду й обсушіть їх.","Розімніть сир виделкою. Змішайте з яйцем, цукром, сіллю, борошном і родзинками.","Поділіть масу на 9 частин, сформуйте пласкі сирники та обкачайте в борошні.","Обсмажте на середньому вогні по 3–4 хвилини з кожного боку до золотистої скоринки. Якщо сирники товсті, потримайте ще 2 хвилини під кришкою на слабкому вогні."]'::jsonb, 'images/recipes/syrnyky.webp', 'published'),
  ('omelet', 'Омлет з сиром і помідорами', 'Ніжний омлет із розплавленим сиром та соковитими помідорами.', 'breakfast', 10, 'easy', true, 1, '[["Яйця","2 шт."],["Молоко","2 ст. л."],["Твердий сир","30 г"],["Помідори","1 невеликий"],["Вершкове масло","10 г"],["Сіль і чорний перець","за смаком"]]'::jsonb, '["Збийте яйця з молоком, сіллю та перцем. Помідор наріжте, сир натріть.","Розтопіть масло, прогрійте помідор на середньому вогні 1 хвилину й влийте яйця.","Посипте сиром, накрийте сковороду й готуйте на слабкому вогні 3–4 хвилини, доки яйця схопляться."]'::jsonb, 'images/recipes/omelet.webp', 'published'),
  ('carbonara', 'Паста карбонара', 'Спагеті з беконом, пармезаном і гладким яєчним соусом.', 'dinner', 25, 'medium', false, 2, '[["Спагеті","200 г"],["Бекон","120 г"],["Яйця","1 ціле та 2 жовтки"],["Пармезан","60 г"],["Сіль і чорний перець","за смаком"]]'::jsonb, '["Відваріть спагеті в підсоленій воді за інструкцією, залишивши приблизно склянку води від пасти.","Наріжте бекон і підрум’яньте на сковороді. Окремо змішайте яйце та жовтки з дрібно натертим пармезаном і перцем.","Перекладіть спагеті до бекону, зніміть сковороду з вогню та перемішайте. Вливайте яєчну суміш, постійно перемішуючи.","Додавайте гарячу воду від пасти по ложці, доки соус не вкриє спагеті. Подавайте одразу."]'::jsonb, 'images/recipes/carbonara.webp', 'published'),
  ('greek-salad', 'Грецький салат', 'Свіжі овочі з фетою, оливками й оливковою олією.', 'lunch', 15, 'easy', true, 2, '[["Помідори","2 шт."],["Огірки","1 великий"],["Солодкий перець","1 шт."],["Червона цибуля","½ шт."],["Фета","120 г"],["Оливки","60 г"],["Оливкова олія","2 ст. л."],["Винний оцет","1 ст. л."],["Орегано","½ ч. л."],["Сіль","за смаком"]]'::jsonb, '["Наріжте помідори та огірок великими шматочками, перець смужками, цибулю тонкими півкільцями.","Змішайте овочі з оливками, олією, оцтом та орегано. Посоліть з урахуванням солоності фети.","Викладіть фету зверху й подавайте одразу."]'::jsonb, 'images/recipes/greek-salad.webp', 'published'),
  ('pancakes', 'Млинці на молоці', 'Тонкі млинці, які підходять для солодкої або солоної начинки.', 'breakfast', 30, 'easy', true, 4, '[["Молоко","500 мл"],["Яйця","2 шт."],["Борошно","200 г"],["Цукор","1 ст. л."],["Сіль","½ ч. л."],["Олія","2 ст. л. + для сковороди"]]'::jsonb, '["Збийте яйця з цукром і сіллю. Додайте половину молока та вмішайте борошно.","Поступово влийте решту молока й олію. Перемішайте до гладкого рідкого тіста.","Злегка змастіть розігріту сковороду, налийте тонкий шар тіста й обсмажте млинець до золотистих країв.","Переверніть приблизно за хвилину, допечіть з другого боку й повторіть з рештою тіста."]'::jsonb, 'images/recipes/pancakes.webp', 'published'),
  ('mug-cake', 'Шоколадний кекс у кружці', 'Шоколадний кекс із какао, який готується в мікрохвильовці.', 'dessert', 5, 'easy', true, 1, '[["Борошно","4 ст. л."],["Какао","1 ст. л."],["Цукор","2 ст. л."],["Розпушувач","¼ ч. л."],["Молоко","4 ст. л."],["Олія","1 ст. л."],["Сіль","дрібка"]]'::jsonb, '["У кружці на 300–350 мл, придатній для мікрохвильовки, змішайте сухі інгредієнти.","Додайте молоко й олію, перемішайте до однорідності. Кружка має бути заповнена тістом не більше ніж наполовину.","Готуйте 60–90 секунд за потужності близько 800 Вт. Якщо центр ще рідкий, додавайте по 10 секунд. Залиште кекс на хвилину охолонути."]'::jsonb, 'images/recipes/mug-cake.webp', 'published'),
  ('deruny', 'Деруни з картоплі', 'Хрусткі картопляні деруни з цибулею. Смакують зі сметаною.', 'dinner', 40, 'easy', true, 3, '[["Картопля","700 г"],["Цибуля","1 шт."],["Яйця","1 шт."],["Борошно","2 ст. л."],["Олія","3 ст. л."],["Сіль і чорний перець","за смаком"],["Сметана","для подачі"]]'::jsonb, '["Почистьте картоплю й цибулю, натріть на дрібній тертці. Обережно злийте зайву рідину.","Додайте яйце, борошно, сіль і перець. Перемішайте та відразу починайте смажити.","Викладайте масу ложкою в розігріту олію та злегка розплющуйте. Смажте на середньому вогні по 3–4 хвилини з кожного боку, до рум’яної скоринки.","Перекладіть на паперовий рушник, щоб прибрати надлишок олії. Подавайте теплими зі сметаною."]'::jsonb, 'images/recipes/deruny.webp', 'published')
on conflict (slug) do nothing;

commit;
