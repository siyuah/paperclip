export type AuthErrorTranslationInput = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
  fallback?: string;
};

const DEFAULT_AUTH_ERROR_MESSAGE = "认证失败，请稍后重试。";

export function getAuthErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim().length > 0 ? code.trim() : null;
}

export function getAuthErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

export function getAuthErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const message = error.message.trim();
  return message.length > 0 ? message : null;
}

export function translateAuthError(error: unknown, fallback = DEFAULT_AUTH_ERROR_MESSAGE): string {
  return translateAuthErrorMessage({
    code: getAuthErrorCode(error),
    message: getAuthErrorMessage(error),
    status: getAuthErrorStatus(error),
    fallback,
  });
}

export function translateAuthErrorMessage(input: AuthErrorTranslationInput): string {
  const code = input.code?.trim().toUpperCase() || null;
  const message = input.message?.trim() || null;
  const status = input.status ?? null;
  const fallback = input.fallback ?? DEFAULT_AUTH_ERROR_MESSAGE;

  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_CREDENTIALS":
      return "邮箱或密码不正确，请检查后重试。";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
    case "EMAIL_ALREADY_EXISTS":
      return "该邮箱已注册，请使用其他邮箱，或直接登录已有账号。";
    case "INVALID_EMAIL":
      return "邮箱格式不正确，请检查后重试。";
    case "EMAIL_NOT_VERIFIED":
      return "邮箱尚未验证，请先完成邮箱验证。";
    case "SIGN_UP_DISABLED":
    case "REGISTRATION_DISABLED":
      return "当前实例已关闭邮箱注册，请联系管理员。";
    case "USER_NOT_FOUND":
      return "未找到使用该邮箱的账号。";
    case "PASSWORD_TOO_SHORT":
      return "密码长度不够，请输入至少 8 位密码。";
    case "RATE_LIMIT_EXCEEDED":
    case "TOO_MANY_REQUESTS":
      return "尝试次数过多，请稍后再试。";
  }

  if (!message) return statusFallback(status, fallback);

  if (/^request failed:\s*401$/i.test(message)) return "邮箱或密码不正确，请检查后重试。";
  if (/^request failed:\s*422$/i.test(message)) return "邮箱信息无法通过校验，请检查后重试。";
  if (/^request failed:\s*400$/i.test(message)) return "请求格式有误，请检查邮箱和密码后重试。";
  if (/authentication failed/i.test(message)) return fallback;

  if (/invalid.+(?:email|e-mail).+password|(?:email|e-mail).+password.+did not match|invalid.+credentials?/i.test(message)) {
    return "邮箱或密码不正确，请检查后重试。";
  }
  if (/user.+already.+exists|already.+registered|(?:email|e-mail).+already.+(?:exists|registered)/i.test(message)) {
    return "该邮箱已注册，请使用其他邮箱，或直接登录已有账号。";
  }
  if (/invalid.+(?:email|e-mail)|(?:email|e-mail).+invalid/i.test(message)) {
    return "邮箱格式不正确，请检查后重试。";
  }
  if (/(?:email|e-mail).+required|required.+(?:email|e-mail)/i.test(message)) {
    return "请输入邮箱。";
  }
  if (/password.+required|required.+password/i.test(message)) {
    return "请输入密码。";
  }
  if (/(?:verify|verification).+(?:email|e-mail)|(?:email|e-mail).+(?:not verified|verification)/i.test(message)) {
    return "请先完成邮箱验证。";
  }
  if (/sign.?up.+disabled|registration.+disabled/i.test(message)) {
    return "当前实例已关闭邮箱注册，请联系管理员。";
  }
  if (/too many|rate limit/i.test(message)) {
    return "尝试次数过多，请稍后再试。";
  }

  return statusFallback(status, message);
}

function statusFallback(status: number | null, fallback: string): string {
  if (status === 401) return "邮箱或密码不正确，请检查后重试。";
  if (status === 400) return "请求格式有误，请检查邮箱和密码后重试。";
  if (status === 422) return "邮箱信息无法通过校验，请检查后重试。";
  if (status === 429) return "尝试次数过多，请稍后再试。";
  return fallback;
}
