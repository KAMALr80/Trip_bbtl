CREATE OR REPLACE FUNCTION trip_private.a2c_quest_card(p_trip uuid, p_user uuid, p_kind text, p_drop integer, p_dest text)
 RETURNS TABLE(title text, mission_text text, backstory text, keywords text[], presentation_tag text, insight text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 WITH available AS (
 SELECT sm.*,replace(sm.title,'{destination}',p_dest) AS filled_title,replace(sm.text,'{destination}',p_dest) AS filled_text,
 -- New rooms (play_arrangement set) count uses across every slot/tag and solo guide; legacy a2c keeps per-tag counting
 (SELECT count(*) FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (t.play_arrangement IS NOT NULL OR x.presentation_tag=sm.presentation_tag) AND lower(btrim(x.title)) LIKE lower(btrim(replace(sm.title,'{destination}',p_dest)))||'%' )
  + CASE WHEN t.play_arrangement IS NOT NULL THEN (SELECT count(*) FROM public.solo_quests sq WHERE sq.user_id=p_user AND sq.experience_id=t.solo_experience_id AND lower(btrim(sq.title)) LIKE lower(btrim(replace(sm.title,'{destination}',p_dest)))||'%') ELSE 0 END AS prior_uses,
 (SELECT max(x.created_at) FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (t.play_arrangement IS NOT NULL OR x.presentation_tag=sm.presentation_tag) AND lower(btrim(x.title)) LIKE lower(btrim(replace(sm.title,'{destination}',p_dest)))||'%') AS last_used,
 -- Just me: prefer one-person tasks; squad-worded tasks only as a last resort (never an empty draw)
 CASE WHEN t.play_arrangement='solo' AND (coalesce(sm.text,'')||' '||coalesce(sm.title,'')) ~* '\m(squad|team|teams|everyone|group|each player|together|crew)\M' THEN 1 ELSE 0 END AS mode_penalty
 FROM public.security_missions sm JOIN public.trips t ON t.id=p_trip
 WHERE t.season_rule='a2c' AND sm.trip_id IS NULL AND sm.kind=CASE WHEN p_kind='sealed' THEN 'checkin' ELSE 'home' END
 AND sm.presentation_tag=CASE WHEN p_kind='sealed' THEN 'video_call' WHEN t.kind='at_home' THEN 'at_home_finale' ELSE 'trip_meetup' END
 AND length(btrim(sm.insight))>12 AND sm.budget_note IS NOT NULL
 AND (sm.category NOT ILIKE '%adult%' OR (t.vibe='Party' AND NOT t.has_minors AND NOT trip_private.a2c_minor_trip(p_trip) AND trip_private.age_of(p_user)>=21))
 AND NOT ((t.has_minors OR trip_private.a2c_minor_trip(p_trip)) AND (coalesce(sm.text,'')||' '||coalesce(sm.title,'')) ~* '(stranger|passer|(photo|photograph|film|record|video|selfie)\w*\s+(with\s+|of\s+)?(a\s+|an\s+|the\s+)?(local|people|person|someone|vendor|crowd))')
 AND NOT EXISTS (SELECT 1 FROM public.season_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',p_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',p_dest)))))
 ), chosen AS (
 SELECT a.* FROM available a ORDER BY a.prior_uses ASC, a.mode_penalty ASC, a.last_used ASC NULLS FIRST, md5(a.id::text||p_trip::text||p_user::text||p_drop::text) LIMIT 1
 )
 SELECT CASE WHEN c.prior_uses=0 THEN c.filled_title ELSE c.filled_title||' · new angle '||(c.prior_uses+1)::text END,
 CASE WHEN c.prior_uses=0 THEN c.filled_text ELSE c.filled_text||' This time, choose a different verified example, compare it with the last one and tell the squad what changed. Flight remix '||(c.prior_uses+1)::text||'.' END,
 replace(c.backstory,'{destination}',p_dest),ARRAY(SELECT replace(k,'{destination}',p_dest) FROM unnest(c.keywords) k),c.presentation_tag,replace(c.insight,'{destination}',p_dest)
 FROM chosen c $function$;

-- Keep the returning At Home discount for new home rooms (single best discount still applies)
CREATE OR REPLACE FUNCTION trip_private.order_quote(p_trip uuid)
RETURNS TABLE(kind text, label text, tier text, headcount integer, list_cents integer, discount_cents integer, discount_source text, amount_due_cents integer, paid boolean, upgrade_cents integer, order_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t public.trips; ret int := 0; code int := 0; pr record; rp record; o public.orders; BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can check out'; END IF;
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  SELECT count(*)::int INTO headcount FROM public.trip_members m WHERE m.trip_id=p_trip AND m.status='approved';
  SELECT * INTO o FROM public.orders x WHERE x.trip_id=p_trip AND x.kind IN ('at_home','trip_unlock') ORDER BY x.created_at LIMIT 1;
  SELECT * INTO rp FROM trip_private.room_pricing(p_trip);
  IF o.id IS NOT NULL THEN
    kind:=o.kind; label:=o.label; tier:=o.tier; list_cents:=o.list_cents; discount_cents:=o.discount_cents; discount_source:=o.discount_source; amount_due_cents:=o.amount_due_cents; order_id:=o.id; paid:=true;
    upgrade_cents := CASE WHEN rp.is_new THEN rp.addon_cents WHEN t.kind='at_home' AND EXISTS (SELECT 1 FROM public.orders x WHERE x.trip_id=p_trip AND x.kind='tier_upgrade') THEN 300 ELSE 0 END;
    RETURN NEXT; RETURN;
  END IF;
  IF rp.is_new THEN
    kind := CASE WHEN t.kind='at_home' THEN 'at_home' ELSE 'trip_unlock' END;
    tier := rp.base_key; list_cents := rp.base_cents + rp.addon_cents;
    label := t.name || CASE WHEN rp.base_key LIKE 'trip_%' THEN ' · ' || rp.days || '-day trip' ELSE '' END;
    upgrade_cents := rp.addon_cents;
    IF t.kind='at_home' AND EXISTS (SELECT 1 FROM public.orders x WHERE x.captain_id=auth.uid() AND x.kind='at_home' AND x.trip_id IS DISTINCT FROM p_trip) THEN ret := trip_private.price('legacy_home_returning'); END IF;
  ELSIF t.kind='at_home' THEN
    kind := 'at_home'; tier := CASE WHEN headcount <= 6 THEN '1-6' ELSE '7-12' END; list_cents := trip_private.price(CASE WHEN headcount <= 6 THEN 'legacy_home_6' ELSE 'legacy_home_12' END);
    label := (SELECT name FROM public.at_home_packs WHERE key=t.at_home_pack) || ' at Home · ' || CASE t.at_home_length WHEN 'weekend' THEN 'Weekend' WHEN 'week' THEN '1 week' ELSE '2 weeks' END;
    IF EXISTS (SELECT 1 FROM public.orders x WHERE x.captain_id=auth.uid() AND x.kind='at_home' AND x.trip_id IS DISTINCT FROM p_trip) THEN ret := trip_private.price('legacy_home_returning'); END IF;
    upgrade_cents := CASE WHEN EXISTS (SELECT 1 FROM public.orders x WHERE x.trip_id=p_trip AND x.kind='tier_upgrade') THEN 300 ELSE 0 END;
  ELSE
    SELECT * INTO pr FROM trip_private.trip_price(p_trip, NULL);
    kind := 'trip_unlock'; tier := CASE WHEN pr.addon_cents > 0 THEN 'big_group' ELSE 'base' END; list_cents := pr.total_cents; label := t.name || ' · ' || pr.days || '-day trip';
    upgrade_cents := 0;
  END IF;
  SELECT r.cents INTO code FROM public.reward_codes r WHERE r.user_id=auth.uid() AND r.used_at IS NULL AND r.expires_at > now() ORDER BY r.created_at LIMIT 1;
  code := coalesce(code, 0);
  IF code > 0 AND code >= ret THEN discount_cents := least(code, list_cents); discount_source := 'captain_code';
  ELSIF ret > 0 THEN discount_cents := least(ret, list_cents); discount_source := 'returning';
  ELSE discount_cents := 0; discount_source := NULL; END IF;
  amount_due_cents := list_cents - discount_cents;
  order_id := NULL; paid := t.unlocked_at IS NOT NULL;
  RETURN NEXT;
END $function$;