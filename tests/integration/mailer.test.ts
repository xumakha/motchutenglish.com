import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { deliverSmtp, DeliveryUncertainError } from "@/worker/mail/mailer";

// A scripted fake SMTP server proves the delivery boundary: failures before the server reads the
// message body are safe to retry, failures after it are "delivery uncertain" (never resent).

type Step = "greeting" | "rcpt" | "data" | "body";
type Fault = { at: Step; action: "drop" | "reject" };

let server: Server | undefined;
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

async function fakeSmtp(fault?: Fault): Promise<{ port: number; received: () => string }> {
  let message = "";
  server = createServer((socket: Socket) => {
    const fail = (step: Step, reply: string) => {
      if (fault?.at !== step) return false;
      if (fault.action === "drop") socket.destroy();
      else socket.write(reply);
      return true;
    };
    if (fault?.at === "greeting") return socket.destroy();
    socket.write("220 fake.test ESMTP\r\n");
    let inData = false;
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (inData) {
        if (!buffer.includes("\r\n.\r\n")) return;
        message = buffer.slice(0, buffer.indexOf("\r\n.\r\n"));
        buffer = "";
        inData = false;
        if (!fail("body", "554 5.0.0 Rejected after body\r\n"))
          socket.write("250 2.0.0 queued\r\n");
        return;
      }
      let line: string;
      while (buffer.includes("\r\n")) {
        [line, buffer] = [
          buffer.slice(0, buffer.indexOf("\r\n")),
          buffer.slice(buffer.indexOf("\r\n") + 2),
        ];
        const verb = line.split(/[ :]/)[0]!.toUpperCase();
        if (verb === "EHLO") socket.write("250-fake.test\r\n250 8BITMIME\r\n");
        else if (verb === "MAIL") socket.write("250 OK\r\n");
        else if (verb === "RCPT") {
          if (!fail("rcpt", "550 5.1.1 No such user\r\n")) socket.write("250 OK\r\n");
        } else if (verb === "DATA") {
          if (!fail("data", "554 5.0.0 No DATA\r\n")) {
            inData = true;
            socket.write("354 Go ahead\r\n");
          }
          return;
        } else if (verb === "QUIT") {
          socket.end("221 Bye\r\n");
          return;
        } else socket.write("502 Unknown\r\n");
      }
    });
  });
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    received: () => message,
  };
}

const mail = {
  to: "learner@example.test",
  subject: "Xác minh email Một Chút English",
  text: "Xác minh email: https://example.test/xac-minh-email#token=abc",
  html: "<p>Xác minh</p>",
};
const send = (port: number) =>
  deliverSmtp(mail, "no-reply@example.test", {
    host: "127.0.0.1",
    port,
    secure: false,
    requireTLS: false,
    ignoreTLS: true,
  });

describe("SMTP delivery boundary", () => {
  it("delivers a UTF-8 message with text and HTML parts", async () => {
    const smtp = await fakeSmtp();
    await send(smtp.port);
    expect(smtp.received()).toContain("multipart/alternative");
    expect(smtp.received()).toMatch(/Subject: =\?UTF-8\?/);
  });

  it.each<Fault>([
    { at: "greeting", action: "drop" },
    { at: "rcpt", action: "reject" },
    { at: "rcpt", action: "drop" },
    { at: "data", action: "reject" },
  ])("$action at $at: a plain failure, safe to retry", async (fault) => {
    const smtp = await fakeSmtp(fault);
    const error = await send(smtp.port).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(DeliveryUncertainError);
  });

  it.each<Fault>([
    { at: "body", action: "drop" },
    { at: "body", action: "reject" },
  ])("$action after the body: delivery uncertain", async (fault) => {
    const smtp = await fakeSmtp(fault);
    await expect(send(smtp.port)).rejects.toBeInstanceOf(DeliveryUncertainError);
  });

  it("refuses addresses with line breaks before connecting", async () => {
    await expect(
      deliverSmtp({ ...mail, to: "a@example.test\r\nBcc: b@example.test" }, "x@example.test", {
        host: "127.0.0.1",
        port: 1,
        secure: false,
        requireTLS: false,
      }),
    ).rejects.toThrow("Invalid mail address");
  });
});
