import "server-only";

export type ResendEnv = {
  apiKey: string | undefined;
  from: string | undefined;
  isConfigured: boolean;
};

export function getResendEnv(): ResendEnv {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  return {
    apiKey,
    from,
    isConfigured: Boolean(apiKey && from),
  };
}
