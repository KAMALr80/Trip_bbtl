CREATE OR REPLACE FUNCTION trip_private.end_trip(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ DECLARE tr public.trips; today date; traveler record; BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain' AND status='approved') THEN RAISE EXCEPTION 'Only the Captain can end the trip'; END IF;
SELECT * INTO tr FROM public.trips WHERE id=p_trip FOR UPDATE; today := (now() AT TIME ZONE tr.home_timezone)::date;
IF tr.ended_at IS NOT NULL THEN RETURN; END IF;
IF today < tr.end_date OR today > tr.end_date + 1 THEN RAISE EXCEPTION 'You can end the trip from its last day until a day after'; END IF;
UPDATE public.trips SET ended_at = now() WHERE id=p_trip;
IF tr.is_sandbox THEN RETURN; END IF;
IF tr.kind = 'at_home' THEN
  INSERT INTO public.postcard_stickers(user_id,trip_id,pack) SELECT user_id, p_trip, tr.at_home_pack FROM public.trip_members WHERE trip_id=p_trip AND status='approved' ON CONFLICT DO NOTHING;
ELSE
  FOR traveler IN SELECT user_id FROM public.trip_members WHERE trip_id=p_trip AND status='approved' LOOP
    PERFORM trip_private.sync_passport(traveler.user_id);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.reward_codes WHERE user_id=auth.uid() AND used_at IS NULL AND expires_at > now()) THEN
    INSERT INTO public.reward_codes(user_id,code,cents,source_trip,expires_at) VALUES (auth.uid(), 'CAPT-' || upper(substr(md5(gen_random_uuid()::text),1,6)), 200, p_trip, now() + interval '90 days');
  END IF;
END IF;
END $$;