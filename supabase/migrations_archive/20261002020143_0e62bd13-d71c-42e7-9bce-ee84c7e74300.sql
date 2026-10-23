DROP FUNCTION trip_private.mark_cost_reviewed();
CREATE OR REPLACE FUNCTION trip_private.clear_review_on_save() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $fn$ BEGIN
  UPDATE public.cost_items SET needs_review=false WHERE id=NEW.item_id AND needs_review AND current_setting('trip.resplitting', true) IS DISTINCT FROM 'on';
  RETURN NULL; END $fn$;
CREATE OR REPLACE FUNCTION trip_private.save_cost_item_wrap(p_trip uuid, p_item uuid, p_title text, p_category text, p_total_cents bigint, p_split text, p_shares jsonb, p_due date) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v uuid; BEGIN v := trip_private.save_cost_item(p_trip,p_item,p_title,p_category,p_total_cents,p_split,p_shares,p_due); UPDATE public.cost_items SET needs_review=false WHERE id=v; RETURN v; END $fn$;
DROP FUNCTION trip_private.clear_review_on_save();
REVOKE ALL ON FUNCTION trip_private.save_cost_item_wrap(uuid,uuid,text,text,bigint,text,jsonb,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.save_cost_item_wrap(uuid,uuid,text,text,bigint,text,jsonb,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_cost_item(p_trip uuid, p_item uuid, p_title text, p_category text, p_total_cents bigint, p_split text, p_shares jsonb, p_due date) RETURNS uuid LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.save_cost_item_wrap(p_trip,p_item,p_title,p_category,p_total_cents,p_split,p_shares,p_due) $fn$;