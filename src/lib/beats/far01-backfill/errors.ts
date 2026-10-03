export class Far01BackfillAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Far01BackfillAuthorizationError";
  }
}

export class Far01CanaryGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Far01CanaryGateError";
  }
}

export class Far01MutationGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Far01MutationGateError";
  }
}

/** Credential / least-privilege gate for production read-only dry-run (IA-5). */
export class Far01CredentialGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Far01CredentialGateError";
  }
}
