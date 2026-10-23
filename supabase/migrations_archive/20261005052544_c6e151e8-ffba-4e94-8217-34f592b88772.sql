REVOKE ALL ON FUNCTION trip_private.a2c_quest_card(uuid,uuid,text,integer,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION trip_private.a2c_quest_card(uuid,uuid,text,integer,text) TO service_role;