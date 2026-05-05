import { describe, expect, it } from "vitest";
import { translateAuthErrorMessage } from "./auth-error-messages";

describe("auth-error-messages", () => {
  it("returns Chinese messages for common email auth error codes", () => {
    expect(translateAuthErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 }))
      .toBe("邮箱或密码不正确，请检查后重试。");
    expect(translateAuthErrorMessage({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", status: 422 }))
      .toBe("该邮箱已注册，请使用其他邮箱，或直接登录已有账号。");
    expect(translateAuthErrorMessage({ code: "INVALID_EMAIL", status: 400 }))
      .toBe("邮箱格式不正确，请检查后重试。");
  });

  it("translates English Better Auth messages before they reach the UI", () => {
    expect(translateAuthErrorMessage({ message: "Invalid email or password", status: 401 }))
      .toBe("邮箱或密码不正确，请检查后重试。");
    expect(translateAuthErrorMessage({ message: "User already exists. Use another email.", status: 422 }))
      .toBe("该邮箱已注册，请使用其他邮箱，或直接登录已有账号。");
    expect(translateAuthErrorMessage({ message: "Request failed: 401", status: 401 }))
      .toBe("邮箱或密码不正确，请检查后重试。");
  });
});
