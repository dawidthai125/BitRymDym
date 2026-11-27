-- Apple refresh token, needed only to revoke Sign in with Apple when the account is deleted
-- (App Store guideline 5.1.1(v)). Service role only: no policies and no client grants.
CREATE TABLE public.apple_sign_in_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.apple_sign_in_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.apple_sign_in_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.apple_sign_in_tokens TO service_role;
