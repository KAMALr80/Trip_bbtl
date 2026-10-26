CREATE TABLE public.trip_player_cards (
 trip_id uuid NOT NULL,
 user_id uuid NOT NULL,
 real_name text NOT NULL CHECK (length(trim(real_name)) BETWEEN 1 AND 100),
 game_name text NOT NULL CHECK (length(trim(game_name)) BETWEEN 1 AND 40),
 avatar_style text NOT NULL DEFAULT 'adventurer' CHECK (avatar_style IN ('adventurer','big-smile','fun-emoji','photo')),
 avatar_seed text NOT NULL DEFAULT '' CHECK (length(avatar_seed) <= 80),
 avatar_path text CHECK (avatar_path IS NULL OR (length(avatar_path) <= 250 AND avatar_path LIKE trip_id::text || '/' || user_id::text || '/%')),
 hometown text CHECK (length(hometown) <= 160),
 occupation text CHECK (length(occupation) <= 160),
 fun_fact text CHECK (length(fun_fact) <= 300),
 most_excited text CHECK (length(most_excited) <= 300),
 trip_persona text CHECK (trip_persona IN ('planner','hype person','photographer','food finder','other')),
 next_year_goal text CHECK (length(next_year_goal) <= 300),
 stamp_count integer NOT NULL DEFAULT 0 CHECK (stamp_count >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (trip_id,user_id),
 FOREIGN KEY (trip_id,user_id) REFERENCES public.trip_members(trip_id,user_id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE ON public.trip_player_cards TO authenticated;
GRANT ALL ON public.trip_player_cards TO service_role;
ALTER TABLE public.trip_player_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trip members see player cards" ON public.trip_player_cards FOR SELECT TO authenticated USING (trip_private.is_trip_member(trip_id,auth.uid()));
CREATE POLICY "Players create own card" ON public.trip_player_cards FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND trip_private.is_trip_member(trip_id,auth.uid()) AND stamp_count=0);
CREATE POLICY "Players edit own card" ON public.trip_player_cards FOR UPDATE TO authenticated USING (user_id=auth.uid() AND trip_private.is_trip_member(trip_id,auth.uid())) WITH CHECK (user_id=auth.uid() AND trip_private.is_trip_member(trip_id,auth.uid()));
CREATE TRIGGER set_player_card_updated_at BEFORE UPDATE ON public.trip_player_cards FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();
REVOKE UPDATE ON public.trip_player_cards FROM authenticated;
GRANT UPDATE (real_name,game_name,avatar_style,avatar_seed,avatar_path,hometown,occupation,fun_fact,most_excited,trip_persona,next_year_goal) ON public.trip_player_cards TO authenticated;
CREATE OR REPLACE FUNCTION trip_private.trip_roster(p_trip uuid) RETURNS TABLE(user_id uuid,role text,display_name text,avatar_url text,joined_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$ BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not a member'; END IF;
 RETURN QUERY SELECT m.user_id,m.role,coalesce(c.game_name,'New traveler'),c.avatar_path,m.joined_at FROM public.trip_members m LEFT JOIN public.trip_player_cards c ON c.trip_id=m.trip_id AND c.user_id=m.user_id WHERE m.trip_id=p_trip ORDER BY CASE m.role WHEN 'captain' THEN 0 WHEN 'co_captain' THEN 1 ELSE 2 END,m.joined_at;
 END $$;
CREATE POLICY "Members view trip photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='player-avatars' AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=(split_part(name,'/',1))::uuid AND m.user_id=auth.uid()));
CREATE POLICY "Players upload own trip photo" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='player-avatars' AND split_part(name,'/',2)=auth.uid()::text AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=(split_part(name,'/',1))::uuid AND m.user_id=auth.uid()));
CREATE POLICY "Players replace own trip photo" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='player-avatars' AND split_part(name,'/',2)=auth.uid()::text AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=(split_part(name,'/',1))::uuid AND m.user_id=auth.uid())) WITH CHECK (bucket_id='player-avatars' AND split_part(name,'/',2)=auth.uid()::text AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=(split_part(name,'/',1))::uuid AND m.user_id=auth.uid()));