DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('trip_private.join_trip(text)'::regprocedure);
  d := replace(d, ' OR t.kind=''at_home'' AND false', '');
  EXECUTE d;
  d := pg_get_functiondef('trip_private.reclaim_captain(uuid)'::regprocedure);
  d := replace(d, ' PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;', ' IF coalesce(trip_private.age_of(auth.uid()),0) < 21 THEN RAISE EXCEPTION ''Captains are 21+.''; END IF;
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;');
  EXECUTE d;
  d := pg_get_functiondef('trip_private.use_ai_quota(text,uuid)'::regprocedure);
  d := replace(d, ' PERFORM trip_private.teen_block(''AI'');', ' PERFORM trip_private.teen_block(''AI'');
 IF p_kind = ''arcade_mix'' THEN RETURN trip_private.mix_ai_quota(p_trip); END IF;');
  EXECUTE d;
  d := pg_get_functiondef('trip_private.set_teen_dob(date,boolean,text)'::regprocedure);
  d := replace(d, '  PERFORM set_config(''trip.teen_invite_ok'',''on'',true);', '  IF EXISTS (SELECT 1 FROM trip_private.teen_accounts WHERE invite_id=inv.id AND user_id<>auth.uid()) THEN
    RAISE EXCEPTION ''This teen invite was already used. Ask your trip''''s Captain for a new link.''; END IF;
  PERFORM set_config(''trip.teen_invite_ok'',''on'',true);');
  EXECUTE d;
END $mig$;

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS boarding_tile text NOT NULL DEFAULT 'current' CHECK (boarding_tile IN ('current','a','b'));

CREATE OR REPLACE FUNCTION trip_private.boarding_tile() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce((SELECT boarding_tile FROM public.app_settings LIMIT 1),'current') $$;
CREATE OR REPLACE FUNCTION trip_private.set_boarding_tile(p_tile text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  IF p_tile NOT IN ('current','a','b') THEN RAISE EXCEPTION 'Pick A, B or current'; END IF;
  UPDATE public.app_settings SET boarding_tile=p_tile;
END $$;
REVOKE ALL ON FUNCTION trip_private.boarding_tile(), trip_private.set_boarding_tile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.boarding_tile(), trip_private.set_boarding_tile(text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.boarding_tile() RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.boarding_tile() $$;
CREATE OR REPLACE FUNCTION public.set_boarding_tile(p_tile text) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_boarding_tile(p_tile) $$;
REVOKE ALL ON FUNCTION public.boarding_tile(), public.set_boarding_tile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.boarding_tile(), public.set_boarding_tile(text) TO authenticated;