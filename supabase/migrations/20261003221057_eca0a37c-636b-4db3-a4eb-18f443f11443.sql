CREATE OR REPLACE FUNCTION trip_private.home_day_finish_postcard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pack text; BEGIN
 IF NEW.step='done' AND OLD.step IS DISTINCT FROM NEW.step AND NOT EXISTS (SELECT 1 FROM public.home_day_sessions s WHERE s.trip_id=NEW.trip_id AND s.id<>NEW.id AND s.step<>'done') THEN
   SELECT at_home_pack INTO v_pack FROM public.trips WHERE id=NEW.trip_id AND kind='at_home';
   IF v_pack IS NOT NULL THEN
     INSERT INTO public.postcard_stickers(user_id,trip_id,pack) SELECT user_id,NEW.trip_id,v_pack FROM public.trip_members WHERE trip_id=NEW.trip_id AND status='approved' ON CONFLICT DO NOTHING;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER home_day_finish_postcard AFTER UPDATE OF step ON public.home_day_sessions FOR EACH ROW EXECUTE FUNCTION trip_private.home_day_finish_postcard();