-- Seed data for PNUT MONSTER development

-- Loyalty Tiers
insert into public.loyalty_tiers (name, slug, min_lifetime_points, multiplier, benefits, sort_order) values
  ('Sprout Star', 'sprout_star', 0, 1.0, '["Basic rewards access"]'::jsonb, 1),
  ('Sprout Hero', 'sprout_hero', 500, 1.5, '["1.5x points multiplier", "Early access to new items", "Birthday bonus"]'::jsonb, 2),
  ('PNUT Legend', 'pnut_legend', 2000, 2.0, '["2x points multiplier", "Free packaging", "Priority orders", "Exclusive rewards"]'::jsonb, 3);

-- Outlets
insert into public.outlets (name, slug, address, city, state, pincode, latitude, longitude, phone, is_active) values
  ('PNUT MONSTER - Koramangala', 'koramangala', '123 80 Feet Road, Koramangala 4th Block', 'Bangalore', 'Karnataka', '560034', 12.9352, 77.6245, '+919876543210', true),
  ('PNUT MONSTER - Indiranagar', 'indiranagar', '45 100 Feet Road, Indiranagar', 'Bangalore', 'Karnataka', '560038', 12.9784, 77.6408, '+919876543211', true),
  ('PNUT MONSTER - HSR Layout', 'hsr-layout', '78 27th Main, HSR Layout Sector 1', 'Bangalore', 'Karnataka', '560102', 12.9116, 77.6389, '+919876543212', true),
  ('PNUT MONSTER - Whitefield', 'whitefield', '56 ITPL Main Road, Whitefield', 'Bangalore', 'Karnataka', '560066', 12.9698, 77.7500, '+919876543213', true),
  ('PNUT MONSTER - JP Nagar', 'jp-nagar', '34 15th Cross, JP Nagar 6th Phase', 'Bangalore', 'Karnataka', '560078', 12.8891, 77.5854, '+919876543214', true);

-- Menu Categories
insert into public.menu_categories (name, slug, description, sort_order) values
  ('Sprout Bowls', 'sprout-bowls', 'Hearty bowls packed with fresh sprouts and goodness', 1),
  ('Healthy Drinks', 'healthy-drinks', 'Refreshing drinks to fuel your day', 2),
  ('Snack Attack', 'snack-attack', 'Quick bites that are actually good for you', 3),
  ('Wraps & Rolls', 'wraps-rolls', 'Wrapped up nutrition on the go', 4),
  ('Smoothie Bowls', 'smoothie-bowls', 'Thick, creamy, and loaded with toppings', 5);

-- Subcategories
insert into public.menu_subcategories (category_id, name, slug, sort_order)
select c.id, s.name, s.slug, s.sort_order
from public.menu_categories c
cross join lateral (
  values
    ('Sprout Bowls', 'Classic Bowls', 'classic-bowls', 1),
    ('Sprout Bowls', 'Protein Bowls', 'protein-bowls', 2),
    ('Healthy Drinks', 'Fresh Juices', 'fresh-juices', 1),
    ('Healthy Drinks', 'Smoothies', 'smoothies', 2),
    ('Healthy Drinks', 'Detox Waters', 'detox-waters', 3),
    ('Snack Attack', 'Sprout Snacks', 'sprout-snacks', 1),
    ('Snack Attack', 'Energy Bites', 'energy-bites', 2),
    ('Wraps & Rolls', 'Sprout Wraps', 'sprout-wraps', 1),
    ('Wraps & Rolls', 'Protein Rolls', 'protein-rolls', 2),
    ('Smoothie Bowls', 'Fruit Bowls', 'fruit-bowls', 1),
    ('Smoothie Bowls', 'Acai Bowls', 'acai-bowls', 2)
) as s(cat_name, name, slug, sort_order)
where c.name = s.cat_name;

-- Menu Items (for Classic Bowls subcategory)
insert into public.menu_items (subcategory_id, name, slug, description, base_price, is_veg, is_bestseller, is_new, sort_order)
select sc.id, i.name, i.slug, i.description, i.price, i.is_veg, i.is_bestseller, i.is_new, i.sort_order
from public.menu_subcategories sc
cross join lateral (
  values
    ('classic-bowls', 'The OG Sprout Bowl', 'og-sprout-bowl', 'Mixed sprouts with our signature masala, onions, tomatoes, and lemon dressing', 149, true, true, false, 1),
    ('classic-bowls', 'Paneer Sprout Bowl', 'paneer-sprout-bowl', 'Classic sprouts topped with grilled paneer cubes and mint chutney', 199, true, false, false, 2),
    ('classic-bowls', 'Spicy Chana Bowl', 'spicy-chana-bowl', 'Chickpea sprouts with fiery red chutney and crunchy sev', 159, true, false, true, 3),
    ('protein-bowls', 'Protein Power Bowl', 'protein-power-bowl', 'Triple sprout mix with eggs, quinoa, and tahini dressing', 249, false, true, false, 1),
    ('protein-bowls', 'Chicken Sprout Bowl', 'chicken-sprout-bowl', 'Grilled chicken with mixed sprouts and avocado', 279, false, false, true, 2),
    ('fresh-juices', 'Green Detox Juice', 'green-detox-juice', 'Spinach, cucumber, apple, ginger, and lemon', 129, true, false, false, 1),
    ('fresh-juices', 'Carrot Ginger Blast', 'carrot-ginger-blast', 'Fresh carrots with ginger and a hint of orange', 119, true, true, false, 2),
    ('smoothies', 'Peanut Banana Smoothie', 'peanut-banana-smoothie', 'Creamy peanut butter with banana and almond milk', 179, true, true, false, 1),
    ('smoothies', 'Berry Blast Smoothie', 'berry-blast-smoothie', 'Mixed berries with yogurt and honey', 189, true, false, true, 2),
    ('detox-waters', 'Cucumber Mint Water', 'cucumber-mint-water', 'Refreshing cucumber and mint infused water', 79, true, false, false, 1),
    ('sprout-snacks', 'Crispy Sprout Chaat', 'crispy-sprout-chaat', 'Crunchy fried sprouts with chaat masala and chutneys', 129, true, true, false, 1),
    ('sprout-snacks', 'Sprout Tikki', 'sprout-tikki', 'Pan-fried sprout patties with green chutney', 139, true, false, false, 2),
    ('energy-bites', 'Peanut Energy Balls', 'peanut-energy-balls', 'No-bake peanut butter and oat energy balls (4 pcs)', 149, true, false, true, 1),
    ('energy-bites', 'Date & Nut Bites', 'date-nut-bites', 'Dates, almonds, and coconut energy bites (4 pcs)', 159, true, false, false, 2),
    ('sprout-wraps', 'Classic Sprout Wrap', 'classic-sprout-wrap', 'Mixed sprouts with veggies in a whole wheat wrap', 169, true, false, false, 1),
    ('sprout-wraps', 'Paneer Sprout Wrap', 'paneer-sprout-wrap', 'Grilled paneer with sprouts and special sauce', 199, true, true, false, 2),
    ('protein-rolls', 'Chicken Sprout Roll', 'chicken-sprout-roll', 'Tandoori chicken with sprouts in a rumali roti', 219, false, false, true, 1),
    ('fruit-bowls', 'Tropical Fruit Bowl', 'tropical-fruit-bowl', 'Mango, pineapple, banana with granola and honey', 199, true, false, false, 1),
    ('acai-bowls', 'Classic Acai Bowl', 'classic-acai-bowl', 'Acai blend topped with banana, granola, and berries', 249, true, false, true, 1)
) as i(subcat_slug, name, slug, description, price, is_veg, is_bestseller, is_new, sort_order)
where sc.slug = i.subcat_slug;

-- Customization groups and options for The OG Sprout Bowl
do $$
declare
  v_item_id uuid;
  v_group_id uuid;
begin
  select id into v_item_id from menu_items where slug = 'og-sprout-bowl';

  -- Base
  insert into item_customization_groups (item_id, name, type, is_required, min_select, max_select, sort_order)
  values (v_item_id, 'Choose Base', 'base', true, 1, 1, 1) returning id into v_group_id;

  insert into customization_options (group_id, name, price, is_default, sort_order) values
    (v_group_id, 'Moong Sprouts', 0, true, 1),
    (v_group_id, 'Mixed Sprouts', 20, false, 2),
    (v_group_id, 'Chana Sprouts', 10, false, 3);

  -- Toppings
  insert into item_customization_groups (item_id, name, type, is_required, min_select, max_select, sort_order)
  values (v_item_id, 'Add Toppings', 'topping', false, 0, 5, 2) returning id into v_group_id;

  insert into customization_options (group_id, name, price, is_default, sort_order) values
    (v_group_id, 'Onions', 0, true, 1),
    (v_group_id, 'Tomatoes', 0, true, 2),
    (v_group_id, 'Cucumber', 0, false, 3),
    (v_group_id, 'Corn', 20, false, 4),
    (v_group_id, 'Pomegranate', 30, false, 5),
    (v_group_id, 'Sev', 10, false, 6),
    (v_group_id, 'Peanuts', 15, false, 7);

  -- Flavour
  insert into item_customization_groups (item_id, name, type, is_required, min_select, max_select, sort_order)
  values (v_item_id, 'Choose Flavour', 'flavour', true, 1, 1, 3) returning id into v_group_id;

  insert into customization_options (group_id, name, price, is_default, sort_order) values
    (v_group_id, 'Classic Masala', 0, true, 1),
    (v_group_id, 'Tangy Lemon', 0, false, 2),
    (v_group_id, 'Spicy Peri Peri', 10, false, 3),
    (v_group_id, 'Mint Fresh', 0, false, 4);

  -- Extras
  insert into item_customization_groups (item_id, name, type, is_required, min_select, max_select, sort_order)
  values (v_item_id, 'Add Extras', 'extra', false, 0, 3, 4) returning id into v_group_id;

  insert into customization_options (group_id, name, price, is_default, sort_order) values
    (v_group_id, 'Extra Sprouts', 40, false, 1),
    (v_group_id, 'Paneer Cubes', 50, false, 2),
    (v_group_id, 'Boiled Egg', 30, false, 3),
    (v_group_id, 'Avocado', 60, false, 4);
end $$;

-- Make all items available at all outlets
insert into public.outlet_menu_items (outlet_id, item_id, is_available)
select o.id, i.id, true
from public.outlets o
cross join public.menu_items i;

-- Loyalty Actions
insert into public.loyalty_actions (name, slug, description, points, event_type, max_per_day) values
  ('Place an Order', 'order_placed', 'Earn points for every order', 10, 'order_placed', null),
  ('First Order', 'first_order', 'Bonus points for your first order', 50, 'first_order', 1),
  ('Refer a Friend', 'referral', 'Earn when your friend signs up', 100, 'referral', null),
  ('Daily Check-in', 'daily_checkin', 'Open the app daily to earn', 5, 'daily_checkin', 1),
  ('Rate an Order', 'order_rated', 'Share your feedback', 5, 'order_rated', 3),
  ('Wallet Top-up', 'wallet_topup', 'Add money to wallet', 10, 'wallet_topup', 1);

-- Sample Missions
insert into public.missions (name, description, type, target_event, target_count, reward_points, reward_type, starts_at, ends_at) values
  ('First Bite', 'Place your first order', 'one_time', 'order_placed', 1, 100, 'points', now(), now() + interval '1 year'),
  ('Weekly Warrior', 'Order 3 times this week', 'recurring', 'order_placed', 3, 50, 'points', now(), now() + interval '1 year'),
  ('7-Day Streak', 'Order every day for 7 days', 'streak', 'order_placed', 7, 200, 'points', now(), now() + interval '1 year'),
  ('Sprout Explorer', 'Try 5 different menu items', 'one_time', 'unique_item_ordered', 5, 150, 'points', now(), now() + interval '1 year'),
  ('Social Butterfly', 'Refer 3 friends', 'one_time', 'referral', 3, 300, 'points', now(), now() + interval '1 year');

-- Sample Coupons
insert into public.coupons (code, description, discount_type, discount_value, min_order, max_discount, usage_limit, starts_at, ends_at) values
  ('WELCOME50', 'Get 50% off on your first order', 'percentage', 50, 200, 150, null, now(), now() + interval '6 months'),
  ('FLAT100', 'Flat ₹100 off on orders above ₹500', 'flat', 100, 500, null, 500, now(), now() + interval '3 months'),
  ('SPROUT20', 'Get 20% off on all sprout bowls', 'percentage', 20, 100, 80, 1000, now(), now() + interval '3 months');

-- Sample Campaign
insert into public.campaigns (name, type, config, starts_at, ends_at) values
  ('Top-up Bonus', 'wallet_topup_bonus', '{"min_amount": 500, "bonus_percentage": 10, "max_bonus": 100}'::jsonb, now(), now() + interval '3 months'),
  ('Refer & Earn', 'referral', '{"referrer_bonus": 100, "referee_bonus": 50}'::jsonb, now(), now() + interval '6 months');
