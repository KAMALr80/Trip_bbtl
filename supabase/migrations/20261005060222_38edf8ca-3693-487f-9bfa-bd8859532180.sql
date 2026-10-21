REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.solo_quests FROM authenticated, anon;
REVOKE ALL ON public.solo_quests FROM anon;