const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
};

export type TurnstileResult = {
  ok: boolean;
  skipped: boolean;
  errors: string[];
};

export async function verifyTurnstileToken(
  token: unknown,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    return { ok: true, skipped: true, errors: [] };
  }

  if (typeof token !== "string" || token.trim().length === 0) {
    return { ok: false, skipped: false, errors: ["missing-input-response"] };
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);

  if (remoteIp) {
    formData.append("remoteip", remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    return { ok: false, skipped: false, errors: ["turnstile-network-error"] };
  }

  const data = (await response.json()) as TurnstileVerifyResponse;

  return {
    ok: data.success,
    skipped: false,
    errors: data["error-codes"] ?? [],
  };
}
