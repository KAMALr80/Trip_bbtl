ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS bingo_needs_photo boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION trip_private.set_bingo_needs_photo(p_trip uuid,p_required boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_captain(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Captain only'; END IF;
 UPDATE public.trips SET bingo_needs_photo=coalesce(p_required,true) WHERE id=p_trip;
END $$;
REVOKE ALL ON FUNCTION trip_private.set_bingo_needs_photo(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.set_bingo_needs_photo(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_bingo_needs_photo(p_trip uuid,p_required boolean) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT trip_private.set_bingo_needs_photo(p_trip,p_required) $$;
REVOKE ALL ON FUNCTION public.set_bingo_needs_photo(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_bingo_needs_photo(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION trip_private.mark_bingo(p_trip uuid, p_date date, p_square integer, p_photo text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE g public.trip_day_games := trip_private.play_day(p_trip,p_date); BEGIN
 IF g.tag='Travel' OR p_square NOT BETWEEN 0 AND 8 THEN RAISE EXCEPTION 'No bingo today'; END IF;
 IF NOT trip_private.valid_photo(p_trip,p_photo) THEN RAISE EXCEPTION 'Photo upload failed'; END IF;
 INSERT INTO public.bingo_marks(trip_id,day_date,user_id,square,photo_path) VALUES (p_trip,p_date,auth.uid(),p_square,p_photo)
 ON CONFLICT (trip_id,day_date,user_id,square) DO UPDATE SET photo_path=coalesce(public.bingo_marks.photo_path,excluded.photo_path);
END $fn$;
-- The existing private play_day check remains the gate for both marking and attaching proof.