import { describe, expect, it } from "vitest";

import { buildMail } from "@/lib/email/notify/templates";

import { staffMail } from "./staff-mail";

describe("support e-mails", () => {
  it("tells the owner what arrived and where to answer", () => {
    const mail = staffMail({ threadId: "t1", kind: "bug", subject: "Cisza\nw bicie" }, "x".repeat(2000), "https://brd.pl/");
    expect(mail.subject).toBe("Błąd: Cisza w bicie");
    expect(mail.text).toContain("https://brd.pl/admin/zgloszenia/t1");
    expect(mail.text.length).toBeLessThan(1800);
  });
  it("sends the user a link to the conversation and escapes the text", () => {
    const mail = buildMail("support_reply", { siteUrl: "https://brd.pl", threadId: "t1", threadSubject: "Bit", detail: "<b>hej</b>" }, { unsubscribe: "u", preferences: "p" });
    expect(mail.text).toContain("https://brd.pl/account/support/t1");
    expect(mail.html).toContain("&lt;b&gt;hej&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>hej</b>");
  });
});
