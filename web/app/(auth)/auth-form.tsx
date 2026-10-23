"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register } from "@/auth/actions";
import { Field, FormErrorSummary } from "@/components/form-fields";
import { idleState } from "@/server/form-state";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const [state, action, pending] = useActionState(isRegister ? register : login, idleState);
  return (
    <section className="panel narrow auth-panel">
      <FormErrorSummary state={state} />
      <form action={action} className="auth-form">
        {isRegister ? (
          <Field
            name="name"
            label="Tên của bạn"
            autoComplete="name"
            maxLength={100}
            required
            state={state}
          />
        ) : null}
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          state={state}
        />
        <Field
          name="password"
          label="Mật khẩu"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          minLength={isRegister ? 8 : undefined}
          required
          hint={
            isRegister
              ? "Ít nhất 8 ký tự, tối đa 72 byte (khoảng 72 ký tự tiếng Anh)."
              : "Nhập mật khẩu tài khoản của bạn."
          }
          state={state}
        />
        {isRegister ? (
          <Field
            name="password_confirm"
            label="Nhập lại mật khẩu"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            state={state}
          />
        ) : null}
        <button className="button" type="submit" disabled={pending}>
          {isRegister ? "Đăng ký" : "Đăng nhập"}
        </button>
      </form>
      <p className="auth-switch">
        {isRegister ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
        <Link className="text-link" href={isRegister ? "/login" : "/register"}>
          {isRegister ? "Đăng nhập" : "Đăng ký"}
        </Link>
      </p>
    </section>
  );
}
