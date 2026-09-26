import { describe, expect, it } from "vitest";

import {
  ANONYMOUS_DAILY_DOWNLOAD_LIMIT,
  DOWNLOAD_RESERVATION_TTL_SECONDS,
  USER_DAILY_DOWNLOAD_LIMIT,
} from "@/config/downloads";
import {
  afterFinalizeSuccess,
  afterReserveSuccess,
  afterUrlFailure,
  afterUrlSuccess,
  canReserveDownloadSlot,
  downloadUsageTotal,
  hasFinalDownloadEvent,
  isReservationActive,
} from "@/lib/downloads/semantics";
import { evaluateDailyLimit, utcDayWindowStart } from "@/lib/downloads/limits";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("download config SSOT (fix)", () => {
  it("locks anon=2, user=4, reservation TTL", () => {
    expect(ANONYMOUS_DAILY_DOWNLOAD_LIMIT).toBe(2);
    expect(USER_DAILY_DOWNLOAD_LIMIT).toBe(4);
    expect(DOWNLOAD_RESERVATION_TTL_SECONDS).toBe(120);
  });
});

describe("OD-17 state machine — event only after URL + finalize", () => {
  it("URL success → finalize creates final event", () => {
    const reserved = afterReserveSuccess("res-1");
    expect(hasFinalDownloadEvent(reserved)).toBe(false);
    const issued = afterUrlSuccess(reserved, "https://signed.example/x");
    expect(hasFinalDownloadEvent(issued)).toBe(false);
    const finalized = afterFinalizeSuccess(issued, "evt-1");
    expect(hasFinalDownloadEvent(finalized)).toBe(true);
    expect(finalized.phase).toBe("finalized");
  });

  it("URL failure → release → no final event", () => {
    const reserved = afterReserveSuccess("res-2");
    const released = afterUrlFailure(reserved);
    expect(released.phase).toBe("released");
    expect(hasFinalDownloadEvent(released)).toBe(false);
  });

  it("reservation alone is not a DOWNLOAD_EVENT", () => {
    const reserved = afterReserveSuccess("res-3");
    expect(hasFinalDownloadEvent(reserved)).toBe(false);
  });
});

describe("limit = events + active reservations", () => {
  it("blocks when events + reservations reach anon limit 2", () => {
    expect(
      canReserveDownloadSlot({
        usage: { events: 1, activeReservations: 1 },
        limit: 2,
      }).allowed,
    ).toBe(false);
    expect(
      canReserveDownloadSlot({
        usage: { events: 2, activeReservations: 0 },
        limit: 2,
      }).allowed,
    ).toBe(false);
    expect(
      canReserveDownloadSlot({
        usage: { events: 0, activeReservations: 1 },
        limit: 2,
      }).allowed,
    ).toBe(true);
  });

  it("blocks fifth user download (4 events)", () => {
    expect(
      canReserveDownloadSlot({
        usage: { events: 4, activeReservations: 0 },
        limit: 4,
      }).allowed,
    ).toBe(false);
  });

  it("parallel same-identity: second sees active reservation", () => {
    const afterFirstReserve = { events: 0, activeReservations: 1 };
    expect(downloadUsageTotal(afterFirstReserve)).toBe(1);
    const second = canReserveDownloadSlot({
      usage: afterFirstReserve,
      limit: 2,
    });
    expect(second.allowed).toBe(true);
    const afterSecond = { events: 0, activeReservations: 2 };
    expect(
      canReserveDownloadSlot({ usage: afterSecond, limit: 2 }).allowed,
    ).toBe(false);
  });

  it("different users do not share usage buckets", () => {
    const userA = { events: 4, activeReservations: 0 };
    const userB = { events: 0, activeReservations: 0 };
    expect(canReserveDownloadSlot({ usage: userA, limit: 4 }).allowed).toBe(
      false,
    );
    expect(canReserveDownloadSlot({ usage: userB, limit: 4 }).allowed).toBe(
      true,
    );
  });

  it("expired reservation does not count", () => {
    const now = new Date("2026-09-26T12:00:00.000Z");
    expect(
      isReservationActive({
        expiresAt: new Date("2026-09-26T11:59:00.000Z"),
        now,
      }),
    ).toBe(false);
    expect(
      isReservationActive({
        expiresAt: new Date("2026-09-26T12:01:00.000Z"),
        now,
      }),
    ).toBe(true);
  });
});

describe("crash-safety matrix (semantic)", () => {
  it("A reserve→URL→finalize: event yes", () => {
    const finalized = afterFinalizeSuccess(
      afterUrlSuccess(afterReserveSuccess("r"), "u"),
      "e",
    );
    expect(hasFinalDownloadEvent(finalized)).toBe(true);
  });

  it("B reserve→URL fail→release: event no", () => {
    const s = afterUrlFailure(afterReserveSuccess("r"));
    expect(hasFinalDownloadEvent(s)).toBe(false);
  });

  it("C reserve→crash before URL: no event; reservation expires", () => {
    const reserved = afterReserveSuccess("r");
    expect(hasFinalDownloadEvent(reserved)).toBe(false);
    expect(
      isReservationActive({
        expiresAt: new Date("2026-09-26T12:00:00.000Z"),
        now: new Date("2026-09-26T12:03:00.000Z"),
      }),
    ).toBe(false);
  });

  it("D URL ok but finalize never runs: no final event", () => {
    const s = afterUrlSuccess(afterReserveSuccess("r"), "u");
    expect(hasFinalDownloadEvent(s)).toBe(false);
  });
});

describe("UTC day + evaluateDailyLimit still locked", () => {
  it("window midnight UTC", () => {
    expect(
      utcDayWindowStart(new Date("2026-09-26T23:59:59.000Z")).toISOString(),
    ).toBe("2026-09-26T00:00:00.000Z");
  });

  it("legacy evaluate still denies at limit", () => {
    expect(evaluateDailyLimit({ count: 2, limit: 2 }).allowed).toBe(false);
  });
});

describe("migration least-privilege + OD-17 RPCs (source contract)", () => {
  const mig = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260926020000_phase_1_8a_download_reservation.sql",
    ),
    "utf8",
  );

  it("revokes DML from anon/authenticated on events", () => {
    expect(mig).toContain(
      "REVOKE ALL ON TABLE public.beat_download_events FROM anon",
    );
    expect(mig).toContain(
      "REVOKE ALL ON TABLE public.beat_download_events FROM authenticated",
    );
    expect(mig).toContain(
      "GRANT SELECT ON TABLE public.beat_download_events TO authenticated",
    );
  });

  it("drops provisional claim_beat_download_slot", () => {
    expect(mig).toContain("DROP FUNCTION IF EXISTS public.claim_beat_download_slot");
  });

  it("defines reserve / finalize / release; events only in finalize", () => {
    expect(mig).toContain("reserve_beat_download_slot");
    expect(mig).toContain("finalize_beat_download");
    expect(mig).toContain("release_beat_download_reservation");
    expect(mig).toContain("beat_download_reservations");
    // finalize inserts into events
    expect(mig).toMatch(
      /finalize_beat_download[\s\S]*INSERT INTO public\.beat_download_events/,
    );
  });

  it("RPC execute only for service_role", () => {
    expect(mig).toContain(
      "GRANT EXECUTE ON FUNCTION public.reserve_beat_download_slot",
    );
    expect(mig).toContain("TO service_role");
    expect(mig).toContain(
      "REVOKE ALL ON FUNCTION public.reserve_beat_download_slot",
    );
    expect(mig).toContain("FROM anon, authenticated");
  });

  it("lock key includes UTC day window", () => {
    expect(mig).toContain(":day:");
    expect(mig).toContain("p_window_start");
  });
});

describe("Access Gate DOWNLOAD path source contract", () => {
  const access = readFileSync(
    join(process.cwd(), "src/lib/beats/audio-access.ts"),
    "utf8",
  );

  it("reserves before URL and finalizes after URL success", () => {
    expect(access).toContain("reserveDownloadSlot");
    expect(access).toContain("createSignedUrl");
    expect(access).toContain("finalizeDownload");
    expect(access).toContain("releaseDownloadReservation");
    expect(access).not.toContain("claimDownloadSlot");
    expect(access).not.toContain("deleteDownloadEvent");
  });

  it("runtime call order: reserve then URL then finalize", () => {
    // Strip import block — only assert call sites in the function body.
    const body = access.slice(access.indexOf("export async function requestBeatAudioAccess"));
    const reserveCall = body.indexOf("await reserveDownloadSlot");
    const urlCall = body.indexOf("createSignedUrl");
    const finalizeCall = body.indexOf("await finalizeDownload");
    expect(reserveCall).toBeGreaterThan(-1);
    expect(urlCall).toBeGreaterThan(reserveCall);
    expect(finalizeCall).toBeGreaterThan(urlCall);
  });
});
