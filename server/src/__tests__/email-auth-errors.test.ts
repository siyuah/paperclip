import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { wrapEmailAuthErrorResponseForTests } from "../auth/better-auth.js";
import { localizeEmailAuthErrorPayload } from "../auth/email-auth-errors.js";

describe("email auth error localization", () => {
  it("localizes Better Auth email error payloads without changing the code", () => {
    expect(
      localizeEmailAuthErrorPayload(
        {
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "Invalid email or password",
        },
        401,
      ),
    ).toEqual({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "邮箱或密码不正确，请检查后重试。",
    });
  });

  it("localizes POST /api/auth/sign-in/email JSON error responses", async () => {
    const app = express();
    app.post("/api/auth/{*authPath}", (_req, res) => {
      wrapEmailAuthErrorResponseForTests(res);
      res.status(401).json({
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
      });
    });

    const res = await request(app).post("/api/auth/sign-in/email").send({
      email: "jane@example.com",
      password: "wrong-password",
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "邮箱或密码不正确，请检查后重试。",
    });
  });
});
