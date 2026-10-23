GRANT USAGE ON SCHEMA trip_private TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION trip_private.guard_auth_signup_age() TO supabase_auth_admin;