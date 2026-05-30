-- Migration 063: Pin search_path on set_updated_at (advisor 0011 function_search_path_mutable).
-- A SECURITY DEFINER / trigger function with a mutable search_path can be hijacked via a
-- malicious schema on the caller's search_path. Pin it explicitly.
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
