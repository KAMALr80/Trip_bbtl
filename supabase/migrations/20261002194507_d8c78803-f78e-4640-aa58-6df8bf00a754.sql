ALTER TABLE public.trip_player_cards DROP CONSTRAINT trip_player_cards_avatar_style_check;
ALTER TABLE public.trip_player_cards ADD CONSTRAINT trip_player_cards_avatar_style_check CHECK (avatar_style IN ('street','crew','hero','photo','traveler'));
ALTER TABLE public.player_profiles DROP CONSTRAINT player_profiles_avatar_style_check;
ALTER TABLE public.player_profiles ADD CONSTRAINT player_profiles_avatar_style_check CHECK (avatar_style IN ('street','crew','hero','photo','traveler'));