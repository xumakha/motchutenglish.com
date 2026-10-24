"use client";

import Link from "next/link";
import {
  changePasswordAction,
  deleteAccountAction,
  requestEmailVerificationAction,
  saveConsent,
  saveProfile,
  saveReminders,
} from "@/actions/routes";
import { FieldError, invalid, typed, useLearnerAction } from "./flash";

// The forms of /bat-dau and /tai-khoan (views/product/page.php). Results show in the page flash;
// after a failed submit the typed values come back, as product.js restored them.

const GOALS = [
  ["foundation", "Củng cố nền tảng"],
  ["communication", "Giao tiếp"],
  ["work", "Đi làm"],
  ["toeic", "Nền tảng TOEIC"],
] as const;
const LEVELS = [
  ["beginner", "Mới bắt đầu"],
  ["A1", "Đã biết một chút"],
  ["A2", "Đang củng cố A2"],
  ["B1", "Đang củng cố B1"],
] as const;
const MINUTES = [5, 10, 15, 20];

export interface ProfileValues {
  goal: string;
  selfLevel: string;
  minutes: number;
  timezone: string;
  reviewLimit: number;
  gamification: boolean;
  animations: boolean;
}

export function ProfileSection({
  profile,
  timezones,
}: {
  profile: ProfileValues;
  timezones: string[];
}) {
  const [state, action, pending] = useLearnerAction(saveProfile);
  const value = (name: keyof ProfileValues, saved: string | number | boolean) =>
    typed(state, name) ?? String(typeof saved === "boolean" ? (saved ? 1 : 0) : saved);
  return (
    <section className="panel narrow">
      <h2>Mục tiêu và nhịp học</h2>
      {/* The key remounts the selects so a reset form shows the saved (or retyped) values. */}
      <form action={action} className="auth-form" key={JSON.stringify([profile, state])}>
        <label>
          Mục tiêu
          <select
            name="goal"
            defaultValue={value("goal", profile.goal)}
            {...invalid(state, "goal")}
          >
            {GOALS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <FieldError state={state} name="goal" />
        <label>
          Tự đánh giá
          <select
            name="selfLevel"
            defaultValue={value("selfLevel", profile.selfLevel)}
            {...invalid(state, "selfLevel")}
          >
            {LEVELS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <FieldError state={state} name="selfLevel" />
        <label>
          Phút học mỗi ngày
          <select
            name="minutes"
            defaultValue={value("minutes", profile.minutes)}
            {...invalid(state, "minutes")}
          >
            {MINUTES.map((n) => (
              <option key={n} value={n}>
                {n} phút
              </option>
            ))}
          </select>
        </label>
        <FieldError state={state} name="minutes" />
        <label>
          Múi giờ
          <select
            name="timezone"
            defaultValue={value("timezone", profile.timezone)}
            {...invalid(state, "timezone")}
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <FieldError state={state} name="timezone" />
        <label>
          Giới hạn thẻ ôn mỗi ngày
          <input
            name="reviewLimit"
            type="number"
            min={1}
            max={100}
            defaultValue={value("reviewLimit", profile.reviewLimit)}
            {...invalid(state, "reviewLimit")}
          />
        </label>
        <FieldError state={state} name="reviewLimit" />
        <label>
          Ghi nhận XP và nhiệm vụ
          <select name="gamification" defaultValue={value("gamification", profile.gamification)}>
            <option value="1">Bật</option>
            <option value="0">Tắt</option>
          </select>
        </label>
        <label>
          Hiệu ứng
          <select name="animations" defaultValue={value("animations", profile.animations)}>
            <option value="1">Bật</option>
            <option value="0">Tắt</option>
          </select>
        </label>
        <button className="button" disabled={pending}>
          Lưu mục tiêu
        </button>
      </form>
      <p>
        <Link href="/hoc">Bỏ qua và học ngay</Link> -{" "}
        <Link href="/kiem-tra-dau-vao">Kiểm tra gợi ý học</Link>
      </p>
      <p>
        Đổi giờ hiển thị có hiệu lực ngay. Múi giờ nhiệm vụ giữ nguyên trong ngày đã chốt và có giới
        hạn đổi mỗi 7 ngày.
      </p>
    </section>
  );
}

export function NewEmailForm() {
  const [state, action, pending] = useLearnerAction(requestEmailVerificationAction);
  return (
    <form action={action} className="auth-form" key={JSON.stringify(state)}>
      <label>
        Email mới
        <input
          type="email"
          name="email"
          required
          maxLength={254}
          defaultValue={typed(state, "email")}
          {...invalid(state, "email")}
        />
      </label>
      <FieldError state={state} name="email" />
      <button className="button secondary" disabled={pending}>
        Xác minh email mới
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useLearnerAction(changePasswordAction);
  return (
    <form action={action} className="auth-form">
      <label>
        Mật khẩu hiện tại
        <input
          type="password"
          name="current"
          autoComplete="current-password"
          required
          {...invalid(state, "current")}
        />
      </label>
      <FieldError state={state} name="current" />
      <label>
        Mật khẩu mới
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
          {...invalid(state, "password")}
        />
      </label>
      <FieldError state={state} name="password" />
      <button className="button" disabled={pending}>
        Đổi mật khẩu và đăng xuất các phiên
      </button>
    </form>
  );
}

export function RemindersForm({ enabled, hour }: { enabled: boolean; hour: number }) {
  const [state, action, pending] = useLearnerAction(saveReminders);
  const retyped = state.status === "error" ? state.values : undefined;
  return (
    <form action={action} key={JSON.stringify([enabled, hour, state])}>
      <label>
        <input
          type="checkbox"
          name="enabled"
          value="1"
          defaultChecked={retyped ? retyped.enabled === "1" : enabled}
        />{" "}
        Tôi muốn nhận nhắc học qua email
      </label>
      <label>
        Giờ theo múi giờ của bạn{" "}
        <input
          name="hour"
          type="number"
          min={0}
          max={23}
          defaultValue={retyped?.hour ?? hour}
          {...invalid(state, "hour")}
        />
      </label>
      <FieldError state={state} name="hour" />
      <button className="button secondary" disabled={pending}>
        Lưu nhắc học
      </button>
    </form>
  );
}

export function ConsentForm({ analytics }: { analytics: boolean }) {
  const [, action, pending] = useLearnerAction(saveConsent);
  return (
    <form action={action} key={String(analytics)}>
      <label>
        <input type="checkbox" name="analytics" value="1" defaultChecked={analytics} /> Tôi đồng ý
        phân tích marketing tùy chọn
      </label>
      <button className="button secondary" disabled={pending}>
        Lưu lựa chọn
      </button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useLearnerAction(deleteAccountAction);
  return (
    <form action={action}>
      <label>
        Nhập mật khẩu để xác nhận
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          {...invalid(state, "password")}
        />
      </label>
      <FieldError state={state} name="password" />
      <button className="button secondary" disabled={pending}>
        Xác nhận yêu cầu xóa
      </button>
    </form>
  );
}
