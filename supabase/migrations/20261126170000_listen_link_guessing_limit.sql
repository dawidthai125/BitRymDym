-- Private listen links: token guessing limit (2026-11-26).
-- The public page, audio route and share card count unknown / expired / revoked tokens per hashed
-- client IP (bucket 'm:<hash>' in studio_listen_hits via studio_listen_hit). studio_listen_peek only
-- reads the window, so a valid lookup does not use up the miss budget. service_role only.

CREATE OR REPLACE FUNCTION public.studio_listen_peek(p_bucket text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*) < p_limit
    FROM public.studio_listen_hits
   WHERE bucket = p_bucket AND at > now() - make_interval(secs => p_window_seconds);
$$;
REVOKE ALL ON FUNCTION public.studio_listen_peek(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_listen_peek(text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.studio_listen_peek(text, integer, integer) IS
  'Listen links: true while the bucket is under its limit in the window (read only). Used for the token-guessing limit.';
