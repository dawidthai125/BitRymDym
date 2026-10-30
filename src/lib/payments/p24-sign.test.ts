import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { notificationSignValid, parseP24Notification } from "@/lib/payments/p24-notification";
import {
  notificationSignJson,
  registerSignJson,
  sha384Hex,
  signEquals,
  signNotification,
  signRegister,
  verifySignJson,
} from "@/lib/payments/p24-sign";
import { isP24Redirect } from "@/lib/payments/p24-url";

const CRC = "crc-test";

describe("P24 sign", () => {
  it("hashes the register payload in P24 key order, without spaces", () => {
    const literal = `{"sessionId":"demo-session","merchantId":12345,"amount":1499,"currency":"PLN","crc":"${CRC}"}`;
    const json = registerSignJson({ sessionId: "demo-session", merchantId: 12345, amount: 1499, currency: "PLN", crc: CRC });
    expect(json).toBe(literal);
    expect(signRegister({ sessionId: "demo-session", merchantId: 12345, amount: 1499, currency: "PLN", crc: CRC })).toBe(
      createHash("sha384").update(literal, "utf8").digest("hex"),
    );
  });

  it("hashes verify as sessionId, orderId, amount, currency, crc", () => {
    const literal = `{"sessionId":"demo-session","orderId":3030,"amount":1499,"currency":"PLN","crc":"${CRC}"}`;
    expect(verifySignJson({ sessionId: "demo-session", orderId: 3030, amount: 1499, currency: "PLN", crc: CRC })).toBe(literal);
    expect(sha384Hex(literal)).toHaveLength(96);
  });

  it("keeps unicode and slashes in the notification statement (PHP JSON_UNESCAPED_*)", () => {
    const statement = "p24-zażółć/x";
    const json = notificationSignJson({
      merchantId: 10,
      posId: 10,
      sessionId: "11111111-1111-1111-1111-111111111111",
      amount: 1499,
      originAmount: 1499,
      currency: "PLN",
      orderId: 77,
      methodId: 154,
      statement,
      crc: CRC,
    });
    expect(json).toContain(statement);
    expect(json).not.toContain("\\u");
    expect(json.indexOf("merchantId")).toBeLessThan(json.indexOf("posId"));
    expect(json.indexOf("originAmount")).toBeLessThan(json.indexOf("currency"));
    const sign = signNotification({
      merchantId: 10,
      posId: 10,
      sessionId: "11111111-1111-1111-1111-111111111111",
      amount: 1499,
      originAmount: 1499,
      currency: "PLN",
      orderId: 77,
      methodId: 154,
      statement,
      crc: CRC,
    });
    const note = parseP24Notification({
      merchantId: 10,
      posId: 10,
      sessionId: "11111111-1111-1111-1111-111111111111",
      amount: 1499,
      originAmount: 1499,
      currency: "PLN",
      orderId: 77,
      methodId: 154,
      statement,
      sign,
    });
    expect(note).not.toBeNull();
    expect(notificationSignValid(note!, CRC)).toBe(true);
    expect(notificationSignValid({ ...note!, amount: 1500 }, CRC)).toBe(false);
    expect(notificationSignValid({ ...note!, sign: "a".repeat(96) }, CRC)).toBe(false);
  });

  it("rejects a tampered sign and a different length", () => {
    expect(signEquals("ab", "ab")).toBe(true);
    expect(signEquals("ab", "ac")).toBe(false);
    expect(signEquals("ab", "abc")).toBe(false);
    expect(signEquals("", "")).toBe(false);
  });

  it("accepts only the P24 hosted payment page", () => {
    expect(isP24Redirect("https://sandbox.przelewy24.pl/trnRequest/TOKENTOKEN")).toBe(true);
    expect(isP24Redirect("https://secure.przelewy24.pl/trnRequest/TOKENTOKEN")).toBe(true);
    expect(isP24Redirect("http://sandbox.przelewy24.pl/trnRequest/TOKENTOKEN")).toBe(false);
    expect(isP24Redirect("https://evil.example/trnRequest/TOKENTOKEN")).toBe(false);
    expect(isP24Redirect("https://sandbox.przelewy24.pl/api/v1/transaction/register")).toBe(false);
  });
});
