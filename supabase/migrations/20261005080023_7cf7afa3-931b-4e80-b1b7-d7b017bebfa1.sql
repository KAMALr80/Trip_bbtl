ALTER FUNCTION public.create_trip_play_mode(text,text,date,date,text,text) SECURITY INVOKER;
ALTER FUNCTION public.create_trip_play_mode_v2(text,text,date,date,text,text,text) SECURITY INVOKER;
ALTER FUNCTION public.create_trip_play_mode_v3(text,text,date,date,text,text,text,text[]) SECURITY INVOKER;
ALTER FUNCTION public.create_window_play_mode(text,text,text,text,text,date,int,text,text[],int) SECURITY INVOKER;
ALTER FUNCTION public.confirm_departure(uuid) SECURITY INVOKER;
GRANT USAGE ON SCHEMA trip_private TO authenticated;
GRANT EXECUTE ON FUNCTION trip_private.create_trip_play_mode(text,text,date,date,text,text), trip_private.create_trip_play_mode_v2(text,text,date,date,text,text,text), trip_private.create_trip_play_mode_v2(text,text,date,date,text,text,text,text[]), trip_private.create_window_play_mode(text,text,text,text,text,date,int,text,text[],int), trip_private.confirm_departure(uuid) TO authenticated;