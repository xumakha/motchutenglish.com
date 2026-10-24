import "server-only";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Transactional email bodies. The PHP app sent a bare link; these keep the same link (token in
// the URL fragment, so it never reaches server logs) with a short Vietnamese explanation. Each
// template renders an HTML part and a plain-text part from the same words.

export interface MailContent {
  text: string;
  html: string;
}

interface Copy {
  greeting: string;
  lines: string[];
  action: { label: string; href: string };
  footer?: { label: string; href: string };
}

function Layout({ copy }: { copy: Copy }): ReactNode {
  const text = { fontFamily: "Arial, sans-serif", fontSize: 16, lineHeight: 1.5, color: "#1f2937" };
  return (
    <html lang="vi">
      <body style={{ margin: 0, padding: 24, background: "#fffcf5" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", ...text }}>
          <p style={{ fontWeight: 700, fontSize: 20 }}>Một Chút English</p>
          <p>{copy.greeting}</p>
          {copy.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>
            <a
              href={copy.action.href}
              style={{
                display: "inline-block",
                padding: "12px 20px",
                borderRadius: 8,
                background: "#1d4ed8",
                color: "#ffffff",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              {copy.action.label}
            </a>
          </p>
          <p style={{ fontSize: 14, color: "#4b5563" }}>
            Nếu nút không mở được, hãy dán liên kết này vào trình duyệt:
            <br />
            {copy.action.href}
          </p>
          {copy.footer ? (
            <p style={{ fontSize: 14, color: "#4b5563" }}>
              <a href={copy.footer.href} style={{ color: "#4b5563" }}>
                {copy.footer.label}
              </a>
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}

function render(copy: Copy): MailContent {
  const text = [
    copy.greeting,
    ...copy.lines,
    `${copy.action.label}: ${copy.action.href}`,
    ...(copy.footer ? [`${copy.footer.label}: ${copy.footer.href}`] : []),
  ].join("\n\n");
  return { text, html: `<!doctype html>${renderToStaticMarkup(<Layout copy={copy} />)}` };
}

const hello = (name: unknown) =>
  typeof name === "string" && name.trim() ? `Chào ${name.trim()},` : "Chào bạn,";

export function resetPasswordMail(name: unknown, link: string): MailContent {
  return render({
    greeting: hello(name),
    lines: [
      "Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản Một Chút English.",
      "Liên kết dùng được một lần trong 60 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.",
    ],
    action: { label: "Đặt lại mật khẩu", href: link },
  });
}

export function verifyEmailMail(name: unknown, link: string, newEmail: boolean): MailContent {
  return render({
    greeting: hello(name),
    lines: [
      newEmail
        ? "Hãy xác nhận địa chỉ email mới cho tài khoản Một Chút English. Email cũ vẫn dùng được cho tới khi bạn xác nhận."
        : "Hãy xác minh địa chỉ email của tài khoản Một Chút English.",
      "Liên kết dùng được một lần trong 24 giờ.",
    ],
    action: { label: "Xác minh email", href: link },
  });
}

/** Same words as Jobs::reminder. */
export function reminderMail(learnLink: string, unsubscribeLink: string): MailContent {
  return render({
    greeting: "Chào bạn,",
    lines: ["Hôm nay bạn có thể học một bài ngắn hoặc ôn lại từ đã lưu."],
    action: { label: "Học ngay", href: learnLink },
    footer: { label: "Tắt nhắc học", href: unsubscribeLink },
  });
}
