-- Google / Apple accounts arrive without a ksywka. The old fallback (e-mail local part)
-- would put a piece of a private address into a public field, so they get a neutral one
-- until the user picks their own on /auth/finish. E-mail sign-up is unchanged.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role, account_level)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      CASE
        WHEN NEW.raw_app_meta_data ->> 'provider' IN ('google', 'apple') THEN NULL
        ELSE split_part(NEW.email, '@', 1)
      END,
      'Raper ' || substr(replace(NEW.id::text, '-', ''), 1, 6)
    ),
    'USER',
    'BEGINNER_RAPPER'
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
