CREATE OR REPLACE FUNCTION trip_private.game_card_view(p_trip uuid,p_category text DEFAULT NULL) RETURNS TABLE(id bigint,trip_id uuid,category text,prompt text,created_at timestamptz,updated_at timestamptz,game_number integer,answer text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_id bigint; BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=auth.uid() AND m.status='approved') THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 IF p_category IS NULL THEN
  SELECT s.draw_card_id INTO v_id FROM public.trip_play_state s WHERE s.trip_id=p_trip;
  RETURN QUERY SELECT c.id,c.trip_id,c.category,trip_private.render_card(p_trip,c.prompt),c.created_at,c.updated_at,c.game_number,c.answer FROM public.game_cards c WHERE c.id=v_id AND (c.category<>'spicy' OR trip_private.is_approved_adult(p_trip,auth.uid()));
 ELSIF p_category IN ('most-likely','would-you-rather','get-to-know') THEN
  RETURN QUERY SELECT c.id,c.trip_id,c.category,trip_private.render_card(p_trip,c.prompt),c.created_at,c.updated_at,c.game_number,c.answer FROM public.game_cards c WHERE c.category=p_category AND (c.trip_id IS NULL OR c.trip_id=p_trip) ORDER BY random() LIMIT 30;
 ELSE RAISE EXCEPTION 'Only the current card or clean vote prompts are available'; END IF;
END $$;
REVOKE ALL ON FUNCTION trip_private.game_card_view(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.game_card_view(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.game_card_view(p_trip uuid,p_category text DEFAULT NULL) RETURNS TABLE(id bigint,trip_id uuid,category text,prompt text,created_at timestamptz,updated_at timestamptz,game_number integer,answer text) LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT * FROM trip_private.game_card_view(p_trip,p_category) $$;
REVOKE ALL ON FUNCTION public.game_card_view(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_card_view(uuid,text) TO authenticated;