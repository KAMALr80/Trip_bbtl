-- M3-02 content library: the minimal admin list / edit screen. App admins only (is_app_admin).
--  * The founder reviews and tags the seeded items here: wording, tags, reviewed + note, active.
--  * Items are never deleted from the app (trip_schedule rows point at them); switching one off
--    (active = false) stops new deals. kind, source, source_ref and locale can't change, so an
--    item already dealt keeps its game (Bingo squares stay Bingo squares).
--  * The table's own CHECKs (lengths, tags, answer index, content_text_safe) still apply to every save.
--  * Every save is logged in admin_actions with the fields it changed.
-- rollback: DROP FUNCTION public.admin_content_items(text, text, boolean, int),
--   public.admin_save_content_item(uuid, jsonb) and their trip_private bodies;
--   DELETE FROM public.admin_actions WHERE action = 'edit_content';
--   ALTER TABLE public.admin_actions DROP COLUMN target_content; restore admin_actions_action_check from 20261104150000.

ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action IN ('disable_user', 'enable_user', 'edit_content'));
ALTER TABLE public.admin_actions ADD COLUMN target_content uuid REFERENCES public.content_items(id);

-- One page (50) of the library, filtered by kind, a search over the text and the reviewed flag.
CREATE FUNCTION trip_private.admin_content_items(p_kind text, p_query text, p_reviewed boolean, p_offset int)
RETURNS SETOF public.content_items
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE q text := '%' || replace(replace(btrim(coalesce(p_query, '')), '%', ''), '_', '') || '%';
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN QUERY
    SELECT c.* FROM public.content_items c
    WHERE (p_kind IS NULL OR c.kind = p_kind)
      AND (p_reviewed IS NULL OR c.reviewed = p_reviewed)
      AND (q = '%%' OR c.title ILIKE q OR c.body ILIKE q OR c.insight ILIKE q OR c.source_ref = btrim(p_query))
    ORDER BY c.kind, c.reviewed, c.created_at, c.id
    LIMIT 50 OFFSET greatest(coalesce(p_offset, 0), 0);
END
$$;

-- Save the fields in p_patch (only the editable ones) and return the item as stored.
CREATE FUNCTION trip_private.admin_save_content_item(p_id uuid, p_patch jsonb) RETURNS public.content_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.content_items; n public.content_items; v_bad text; v_keys text;
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN RAISE EXCEPTION 'Nothing to save'; END IF;
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_bad FROM jsonb_object_keys(p_patch) k
  WHERE k NOT IN ('title', 'body', 'insight', 'items', 'choices', 'answer', 'rooms', 'modes', 'focus', 'culture', 'vibe',
                  'difficulty', 'min_age', 'alcohol', 'reviewed', 'review_note', 'active');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'These can''t be edited here: %', v_bad; END IF;
  SELECT * INTO c FROM public.content_items WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That item doesn''t exist'; END IF;
  n := jsonb_populate_record(c, p_patch);
  UPDATE public.content_items
  SET title = n.title, body = n.body, insight = n.insight, items = n.items, choices = n.choices, answer = n.answer,
      rooms = n.rooms, modes = n.modes, focus = n.focus, culture = n.culture, vibe = n.vibe, difficulty = n.difficulty,
      min_age = n.min_age, alcohol = n.alcohol, reviewed = n.reviewed, review_note = n.review_note, active = n.active,
      updated_at = now()
  WHERE id = p_id
  RETURNING * INTO n;
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_keys FROM jsonb_object_keys(p_patch) k;
  INSERT INTO public.admin_actions (actor, action, target_content, note) VALUES (auth.uid(), 'edit_content', p_id, left(v_keys, 500));
  RETURN n;
END
$$;

REVOKE ALL ON FUNCTION trip_private.admin_content_items(text, text, boolean, int),
  trip_private.admin_save_content_item(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.admin_content_items(text, text, boolean, int),
  trip_private.admin_save_content_item(uuid, jsonb) TO authenticated, service_role;

CREATE FUNCTION public.admin_content_items(p_kind text DEFAULT NULL, p_query text DEFAULT NULL, p_reviewed boolean DEFAULT NULL,
                                           p_offset int DEFAULT 0)
RETURNS SETOF public.content_items
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.admin_content_items(p_kind, p_query, p_reviewed, p_offset) $$;
CREATE FUNCTION public.admin_save_content_item(p_id uuid, p_patch jsonb) RETURNS public.content_items
LANGUAGE sql SET search_path = '' AS $$ SELECT * FROM trip_private.admin_save_content_item(p_id, p_patch) $$;
REVOKE ALL ON FUNCTION public.admin_content_items(text, text, boolean, int), public.admin_save_content_item(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_content_items(text, text, boolean, int), public.admin_save_content_item(uuid, jsonb)
  TO authenticated, service_role;
