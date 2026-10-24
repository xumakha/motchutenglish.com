import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import MailComposer from "nodemailer/lib/mail-composer";
import SMTPConnection from "nodemailer/lib/smtp-connection";
import { env } from "@/env";

// Port of MailTransport.php. Two transports: `log` (development/test: one private JSON file per
// message in writable/mail) and `smtp` (STARTTLS or implicit TLS only, verified peer, 15 s
// timeouts). SMTP acceptance of the message body is the delivery boundary: once the server has
// started reading the body, any failure is "delivery uncertain" and the job must never be resent
// automatically.

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** The message may already have been delivered; the worker marks the job failed for review. */
export class DeliveryUncertainError extends Error {
  constructor(cause: unknown) {
    super("SMTP delivery uncertain", { cause });
    this.name = "DeliveryUncertainError";
  }
}

const TIMEOUT_MS = 15_000;

const validAddress = (email: string) =>
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) && !/[\r\n]/.test(email);

export async function sendMail(mail: OutgoingMail): Promise<void> {
  const config = env();
  if (config.MAIL_DRIVER === "log") {
    if (config.APP_ENV === "production") throw new Error("Development mail sink disabled");
    const dir = resolve(process.cwd(), config.WRITABLE_DIR, "mail");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(dir, `${randomBytes(16).toString("hex")}.json`),
      JSON.stringify({ recipient: mail.to, ...mail, sentAt: new Date().toISOString() }),
      { flag: "wx", mode: 0o600 },
    );
    return;
  }
  if (config.MAIL_DRIVER !== "smtp") throw new Error("SMTP not configured");
  await deliverSmtp(mail, config.MAIL_FROM, {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_ENCRYPTION === "tls",
    requireTLS: config.SMTP_ENCRYPTION === "starttls",
    tls: { rejectUnauthorized: true, servername: config.SMTP_HOST },
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
  });
}

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  /** Tests talk to a local fake server in plain text; production always encrypts. */
  ignoreTLS?: boolean;
  tls?: { rejectUnauthorized: boolean; servername?: string };
  auth?: { user: string; pass: string };
}

/** One message over one connection. Exported for the fake-server test. */
export async function deliverSmtp(
  mail: OutgoingMail,
  from: string,
  options: SmtpOptions,
): Promise<void> {
  for (const address of [from, mail.to])
    if (!validAddress(address)) throw new Error("Invalid mail address");
  const raw = await new MailComposer({
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    date: new Date(),
  })
    .compile()
    .build();

  // SMTPConnection only reads the body after the server answered DATA with 354, so the first read
  // marks the point after which the server may hold the message.
  let bodyStarted = false;
  const body = new Readable({
    read() {
      bodyStarted = true;
      this.push(raw);
      this.push(null);
    },
  });

  const { auth, ...connection } = options;
  const smtp = new SMTPConnection({
    ...connection,
    name: "localhost",
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  // Errors are also reported to the pending callback; the listener keeps them from crashing.
  smtp.on("error", () => {});
  try {
    await new Promise<void>((done, fail) =>
      smtp.connect((error) => (error ? fail(error) : done())),
    );
    if (auth)
      await new Promise<void>((done, fail) =>
        smtp.login(auth, (error) => (error ? fail(error) : done())),
      );
    await new Promise<void>((done, fail) =>
      smtp.send({ from, to: [mail.to] }, body, (error) => {
        if (!error) return done();
        // Envelope rejections (MAIL FROM, RCPT TO, DATA refused) happen before the body.
        const code = (error as { code?: string }).code;
        fail(bodyStarted && code !== "EENVELOPE" ? new DeliveryUncertainError(error) : error);
      }),
    );
  } finally {
    // The server accepted the message; a failed QUIT must never cause a resend.
    try {
      smtp.quit();
    } catch {
      smtp.close();
    }
  }
}
