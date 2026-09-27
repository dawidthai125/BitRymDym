import type {
  BeatOwnershipType,
  BeatStatus,
} from "@/types/domain";
import { BEAT_OWNERSHIP_TYPES, BEAT_STATUSES } from "@/types/domain";

export const BEAT_TITLE_MIN = 1;
export const BEAT_TITLE_MAX = 200;
export const BEAT_BPM_MIN = 1;
export const BEAT_BPM_MAX = 300;
export const BEAT_DURATION_MIN = 1;
export const BEAT_DURATION_MAX = 180;
export const BEAT_TAGS_MAX_COUNT = 30;
export const BEAT_TAG_MAX_LENGTH = 40;
export const BEAT_COVER_REF_MAX = 500;
export const BEAT_TEXT_FIELD_MAX = 500;
export const BEAT_DESCRIPTION_MAX = 4000;
export const BEAT_REJECTION_REASON_MAX = 2000;

export type BeatInput = {
  ownershipType: BeatOwnershipType;
  ownerId?: string | null;
  title: string;
  producer?: string | null;
  description?: string | null;
  genre?: string | null;
  style?: string | null;
  bpm: number;
  key?: string | null;
  scale?: string | null;
  durationSeconds: number;
  tags?: string[];
  coverRef?: string | null;
  status?: BeatStatus;
};

export type BeatValidationResult =
  | { ok: true; value: NormalizedBeatInput }
  | { ok: false; errors: string[] };

export type NormalizedBeatInput = {
  ownershipType: BeatOwnershipType;
  ownerId: string | null;
  title: string;
  producer: string | null;
  description: string | null;
  genre: string | null;
  style: string | null;
  bpm: number;
  key: string | null;
  scale: string | null;
  durationSeconds: number;
  tags: string[];
  coverRef: string | null;
  status: BeatStatus;
};

function optionalText(
  value: unknown,
  field: string,
  max: number,
  errors: string[],
): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > max) {
    errors.push(`${field} must be at most ${max} characters`);
  }
  return trimmed;
}

export function isBeatStatus(value: unknown): value is BeatStatus {
  return (
    typeof value === "string" &&
    (BEAT_STATUSES as readonly string[]).includes(value)
  );
}

export function isBeatOwnershipType(value: unknown): value is BeatOwnershipType {
  return (
    typeof value === "string" &&
    (BEAT_OWNERSHIP_TYPES as readonly string[]).includes(value)
  );
}

/**
 * ADMIN platform + community lifecycle transitions.
 * PUBLISHED → DRAFT is forbidden.
 */
export const ADMIN_BEAT_TRANSITIONS: Readonly<
  Record<BeatStatus, readonly BeatStatus[]>
> = {
  DRAFT: ["PUBLISHED", "ARCHIVED", "PENDING_REVIEW"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: ["DRAFT"],
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PUBLISHED", "REJECTED"],
  REJECTED: ["DRAFT", "ARCHIVED"],
};

/** @deprecated Use ADMIN_BEAT_TRANSITIONS */
export const PHASE_1_4_ADMIN_TRANSITIONS = ADMIN_BEAT_TRANSITIONS;

export const USER_BEAT_TRANSITIONS: Readonly<
  Record<BeatStatus, readonly BeatStatus[]>
> = {
  DRAFT: ["PENDING_REVIEW", "ARCHIVED"],
  PENDING_REVIEW: [],
  APPROVED: [],
  PUBLISHED: ["ARCHIVED"],
  REJECTED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: [],
};

export type TransitionActor = "ADMIN" | "MODERATOR" | "USER";

export function canTransitionStatus(params: {
  from: BeatStatus;
  to: BeatStatus;
  actor: TransitionActor;
  ownershipType?: BeatOwnershipType;
  isOwner?: boolean;
}): boolean {
  const { from, to, actor, ownershipType, isOwner } = params;
  if (from === to) {
    return true;
  }
  if (from === "PUBLISHED" && to === "DRAFT") {
    return false;
  }

  if (actor === "ADMIN") {
    return ADMIN_BEAT_TRANSITIONS[from].includes(to);
  }

  if (actor === "MODERATOR") {
    if (from === "PENDING_REVIEW" && (to === "APPROVED" || to === "REJECTED")) {
      return true;
    }
    // OD-COMMUNITY-01: MODERATOR may publish USER APPROVED → PUBLISHED only
    if (
      from === "APPROVED" &&
      to === "PUBLISHED" &&
      ownershipType === "USER"
    ) {
      return true;
    }
    return false;
  }

  // USER: own USER-owned beats only
  if (ownershipType !== undefined && ownershipType !== "USER") {
    return false;
  }
  if (isOwner === false) {
    return false;
  }
  return USER_BEAT_TRANSITIONS[from].includes(to);
}

export type RejectionReasonResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function validateRejectionReason(
  reason: unknown,
): RejectionReasonResult {
  if (typeof reason !== "string") {
    return { ok: false, error: "rejection_reason must be a string" };
  }
  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: false, error: "rejection_reason is required" };
  }
  if (trimmed.length > BEAT_REJECTION_REASON_MAX) {
    return {
      ok: false,
      error: `rejection_reason must be at most ${BEAT_REJECTION_REASON_MAX} characters`,
    };
  }
  return { ok: true, value: trimmed };
}

export function validateBeatInput(input: BeatInput): BeatValidationResult {
  const errors: string[] = [];

  if (!isBeatOwnershipType(input.ownershipType)) {
    errors.push("ownershipType is invalid");
  }

  const ownershipType = input.ownershipType;
  let ownerId: string | null =
    input.ownerId === undefined || input.ownerId === ""
      ? null
      : input.ownerId;

  if (ownershipType === "PLATFORM") {
    if (ownerId !== null) {
      errors.push("PLATFORM beats must have ownerId null");
    }
    ownerId = null;
  } else if (ownershipType === "USER") {
    if (!ownerId) {
      errors.push("USER beats must have ownerId");
    }
  }

  if (typeof input.title !== "string") {
    errors.push("title must be a string");
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < BEAT_TITLE_MIN || title.length > BEAT_TITLE_MAX) {
    errors.push(
      `title must be between ${BEAT_TITLE_MIN} and ${BEAT_TITLE_MAX} characters`,
    );
  }

  const bpm = input.bpm;
  if (typeof bpm !== "number" || !Number.isInteger(bpm)) {
    errors.push("bpm must be an integer");
  } else if (bpm < BEAT_BPM_MIN || bpm > BEAT_BPM_MAX) {
    errors.push(`bpm must be between ${BEAT_BPM_MIN} and ${BEAT_BPM_MAX}`);
  }

  const durationSeconds = input.durationSeconds;
  if (typeof durationSeconds !== "number" || !Number.isInteger(durationSeconds)) {
    errors.push("durationSeconds must be an integer");
  } else if (
    durationSeconds < BEAT_DURATION_MIN ||
    durationSeconds > BEAT_DURATION_MAX
  ) {
    errors.push(
      `durationSeconds must be between ${BEAT_DURATION_MIN} and ${BEAT_DURATION_MAX}`,
    );
  }

  const producer = optionalText(
    input.producer,
    "producer",
    BEAT_TEXT_FIELD_MAX,
    errors,
  );
  const description = optionalText(
    input.description,
    "description",
    BEAT_DESCRIPTION_MAX,
    errors,
  );
  const genre = optionalText(input.genre, "genre", BEAT_TEXT_FIELD_MAX, errors);
  const style = optionalText(input.style, "style", BEAT_TEXT_FIELD_MAX, errors);
  const key = optionalText(input.key, "key", BEAT_TEXT_FIELD_MAX, errors);
  const scale = optionalText(input.scale, "scale", BEAT_TEXT_FIELD_MAX, errors);
  const coverRef = optionalText(
    input.coverRef,
    "coverRef",
    BEAT_COVER_REF_MAX,
    errors,
  );

  const rawTags = input.tags ?? [];
  if (!Array.isArray(rawTags)) {
    errors.push("tags must be an array");
  }
  const tags: string[] = [];
  if (Array.isArray(rawTags)) {
    if (rawTags.length > BEAT_TAGS_MAX_COUNT) {
      errors.push(`tags must have at most ${BEAT_TAGS_MAX_COUNT} items`);
    }
    for (const tag of rawTags) {
      if (typeof tag !== "string") {
        errors.push("each tag must be a string");
        continue;
      }
      const trimmed = tag.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed.length > BEAT_TAG_MAX_LENGTH) {
        errors.push(`each tag must be at most ${BEAT_TAG_MAX_LENGTH} characters`);
        continue;
      }
      tags.push(trimmed);
    }
  }

  const status = input.status ?? "DRAFT";
  if (!isBeatStatus(status)) {
    errors.push("status is invalid");
  }

  // Community create: USER beats always start as DRAFT
  if (ownershipType === "USER" && isBeatStatus(status) && status !== "DRAFT") {
    errors.push("USER beats must be created as DRAFT");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      ownershipType,
      ownerId,
      title,
      producer,
      description,
      genre,
      style,
      bpm: bpm as number,
      key,
      scale,
      durationSeconds: durationSeconds as number,
      tags,
      coverRef,
      status: status as BeatStatus,
    },
  };
}
