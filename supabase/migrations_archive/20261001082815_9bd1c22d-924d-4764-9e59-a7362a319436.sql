ALTER TABLE public.trip_player_cards DROP CONSTRAINT trip_player_cards_avatar_style_check;
UPDATE public.trip_player_cards SET avatar_style = CASE avatar_style WHEN 'adventurer' THEN 'street' WHEN 'big-smile' THEN 'crew' WHEN 'fun-emoji' THEN 'hero' ELSE avatar_style END WHERE avatar_style IN ('adventurer','big-smile','fun-emoji');
UPDATE public.player_profiles SET avatar_style = CASE avatar_style WHEN 'adventurer' THEN 'street' WHEN 'big-smile' THEN 'crew' WHEN 'fun-emoji' THEN 'hero' ELSE avatar_style END WHERE avatar_style IN ('adventurer','big-smile','fun-emoji');
ALTER TABLE public.trip_player_cards ALTER COLUMN avatar_style SET DEFAULT 'street';
ALTER TABLE public.player_profiles ALTER COLUMN avatar_style SET DEFAULT 'street';
ALTER TABLE public.trip_player_cards ADD CONSTRAINT trip_player_cards_avatar_style_check CHECK (avatar_style IN ('street','crew','hero','photo'));
ALTER TABLE public.player_profiles ADD CONSTRAINT player_profiles_avatar_style_check CHECK (avatar_style IN ('street','crew','hero','photo'));