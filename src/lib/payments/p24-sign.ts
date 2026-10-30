/**
 * Przelewy24 REST checksums (SHA-384).
 *
 * P24 hashes a compact JSON object with JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
 * and a fixed key order (PHP json_encode). Node's JSON.stringify escapes non-ASCII,
 * so the payload is built by hand. Do not sort keys and do not add spaces.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export type P24RegisterSignInput = {
  sessionId: string;
  merchantId: number;
  amount: number;
  currency: string;
  crc: string;
};

export type P24VerifySignInput = {
  sessionId: string;
  orderId: number;
  amount: number;
  currency: string;
  crc: string;
};

export type P24NotificationSignInput = {
  merchantId: number;
  posId: number;
  sessionId: string;
  amount: number;
  originAmount: number;
  currency: string;
  orderId: number;
  methodId: number;
  statement: string;
  crc: string;
};

function jsonString(value: string): string {
  let out = '"';
  for (const ch of value) {
    switch (ch) {
      case '"':
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
        break;
      case "\b":
        out += "\\b";
        break;
      case "\f":
        out += "\\f";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      default: {
        const code = ch.codePointAt(0) ?? 0;
        if (code < 0x20) {
          out += `\\u${code.toString(16).padStart(4, "0")}`;
        } else {
          out += ch;
        }
      }
    }
  }
  return `${out}"`;
}

function jsonInt(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new Error("P24_INT");
  }
  return String(value);
}

export function registerSignJson(input: P24RegisterSignInput): string {
  return `{"sessionId":${jsonString(input.sessionId)},"merchantId":${jsonInt(input.merchantId)},"amount":${jsonInt(input.amount)},"currency":${jsonString(input.currency)},"crc":${jsonString(input.crc)}}`;
}

export function verifySignJson(input: P24VerifySignInput): string {
  return `{"sessionId":${jsonString(input.sessionId)},"orderId":${jsonInt(input.orderId)},"amount":${jsonInt(input.amount)},"currency":${jsonString(input.currency)},"crc":${jsonString(input.crc)}}`;
}

export function notificationSignJson(input: P24NotificationSignInput): string {
  return `{"merchantId":${jsonInt(input.merchantId)},"posId":${jsonInt(input.posId)},"sessionId":${jsonString(input.sessionId)},"amount":${jsonInt(input.amount)},"originAmount":${jsonInt(input.originAmount)},"currency":${jsonString(input.currency)},"orderId":${jsonInt(input.orderId)},"methodId":${jsonInt(input.methodId)},"statement":${jsonString(input.statement)},"crc":${jsonString(input.crc)}}`;
}

export function sha384Hex(payload: string): string {
  return createHash("sha384").update(payload, "utf8").digest("hex");
}

export function signRegister(input: P24RegisterSignInput): string {
  return sha384Hex(registerSignJson(input));
}

export function signVerify(input: P24VerifySignInput): string {
  return sha384Hex(verifySignJson(input));
}

export function signNotification(input: P24NotificationSignInput): string {
  return sha384Hex(notificationSignJson(input));
}

export function signEquals(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

