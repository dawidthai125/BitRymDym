import type { Far01ChecksumStatus, Far01IntegrityClass } from "./types";

/**
 * OD-BF-02 / C-01 / C-03:
 * - checksum NULL → UNKNOWN (never PASS)
 * - size equality confirms size only, not cryptographic identity
 */
export function classifyChecksumStatus(params: {
  sourceChecksum: string | null;
  destinationChecksum: string | null;
}): Far01ChecksumStatus {
  const src = params.sourceChecksum?.trim() || null;
  const dst = params.destinationChecksum?.trim() || null;
  if (src == null || dst == null) {
    return "UNKNOWN";
  }
  return src.toLowerCase() === dst.toLowerCase() ? "PASS" : "FAIL";
}

export function classifySizeMatch(params: {
  sourceSize: number | null;
  destinationSize: number | null;
}): { sizeMatch: boolean | null; sizeClass: Far01IntegrityClass | "PASS" } {
  if (params.sourceSize == null || params.destinationSize == null) {
    return { sizeMatch: null, sizeClass: "UNKNOWN" };
  }
  if (params.sourceSize === params.destinationSize) {
    return { sizeMatch: true, sizeClass: "PASS" };
  }
  return { sizeMatch: false, sizeClass: "FAIL" };
}

export function contentIdentityFromChecksum(
  checksumStatus: Far01ChecksumStatus,
): "UNKNOWN" | "CHECKSUM_PASS" | "CHECKSUM_FAIL" | "N/A" {
  if (checksumStatus === "PASS") return "CHECKSUM_PASS";
  if (checksumStatus === "FAIL") return "CHECKSUM_FAIL";
  return "UNKNOWN";
}

/**
 * Post-copy verification gate inputs → whether DB UPDATE may proceed.
 * Size PASS required. Checksum PASS or OD-BF-02 UNKNOWN path.
 */
export function evaluatePostCopyIntegrity(params: {
  sourceExists: boolean;
  destinationExists: boolean;
  sourceSize: number | null;
  destinationSize: number | null;
  sourceChecksum: string | null;
  destinationChecksum: string | null;
  identityMismatch: boolean;
}): {
  allowDbUpdate: boolean;
  checksumStatus: Far01ChecksumStatus;
  sizeMatch: boolean | null;
  reason: string;
  status: Far01IntegrityClass | "PASS";
} {
  if (params.identityMismatch) {
    return {
      allowDbUpdate: false,
      checksumStatus: "UNKNOWN",
      sizeMatch: null,
      reason: "identity_mismatch_blocks_update",
      status: "ANOMALY",
    };
  }
  if (!params.sourceExists) {
    return {
      allowDbUpdate: false,
      checksumStatus: classifyChecksumStatus({
        sourceChecksum: params.sourceChecksum,
        destinationChecksum: params.destinationChecksum,
      }),
      sizeMatch: null,
      reason: "source_missing_after_copy",
      status: "FAIL",
    };
  }
  if (!params.destinationExists) {
    return {
      allowDbUpdate: false,
      checksumStatus: classifyChecksumStatus({
        sourceChecksum: params.sourceChecksum,
        destinationChecksum: params.destinationChecksum,
      }),
      sizeMatch: null,
      reason: "destination_missing_after_copy",
      status: "FAIL",
    };
  }

  const { sizeMatch, sizeClass } = classifySizeMatch({
    sourceSize: params.sourceSize,
    destinationSize: params.destinationSize,
  });
  const checksumStatus = classifyChecksumStatus({
    sourceChecksum: params.sourceChecksum,
    destinationChecksum: params.destinationChecksum,
  });

  if (sizeClass === "FAIL" || sizeMatch === false) {
    return {
      allowDbUpdate: false,
      checksumStatus,
      sizeMatch,
      reason: "size_mismatch",
      status: "FAIL",
    };
  }
  if (sizeClass === "UNKNOWN") {
    return {
      allowDbUpdate: false,
      checksumStatus,
      sizeMatch,
      reason: "size_unknown",
      status: "UNKNOWN",
    };
  }
  if (checksumStatus === "FAIL") {
    return {
      allowDbUpdate: false,
      checksumStatus,
      sizeMatch,
      reason: "checksum_mismatch",
      status: "FAIL",
    };
  }
  // PASS checksum OR UNKNOWN under OD-BF-02 with size PASS
  if (checksumStatus === "UNKNOWN") {
    return {
      allowDbUpdate: true,
      checksumStatus: "UNKNOWN",
      sizeMatch: true,
      reason: "size_pass_checksum_unknown_od_bf_02",
      status: "UNKNOWN",
    };
  }
  return {
    allowDbUpdate: true,
    checksumStatus: "PASS",
    sizeMatch: true,
    reason: "size_and_checksum_pass",
    status: "PASS",
  };
}
