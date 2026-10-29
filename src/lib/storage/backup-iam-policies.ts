export const SA07_BACKUP_WRITER_POLICY = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "BackupWriterAllow",
      Effect: "Allow",
      Action: [
        "s3:PutObject",
        "s3:PutObjectRetention",
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetObjectRetention",
        "s3:ListBucket",
        "s3:ListBucketVersions",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts",
      ],
      Resource: [
        "arn:aws:s3:::example-beat-audio-backup",
        "arn:aws:s3:::example-beat-audio-backup/*",
      ],
    },
    {
      Sid: "BackupWriterDenyDelete",
      Effect: "Deny",
      Action: [
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:PutBucketPolicy",
        "s3:BypassGovernanceRetention",
      ],
      Resource: [
        "arn:aws:s3:::example-beat-audio-backup",
        "arn:aws:s3:::example-beat-audio-backup/*",
      ],
    },
  ],
} as const;

export const SA07_BACKUP_READER_POLICY = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "BackupReaderAllow",
      Effect: "Allow",
      Action: [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetObjectRetention",
        "s3:ListBucket",
        "s3:ListBucketVersions",
      ],
      Resource: [
        "arn:aws:s3:::example-beat-audio-backup",
        "arn:aws:s3:::example-beat-audio-backup/*",
      ],
    },
    {
      Sid: "BackupReaderDenyMutate",
      Effect: "Deny",
      Action: [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:PutObjectRetention",
      ],
      Resource: [
        "arn:aws:s3:::example-beat-audio-backup",
        "arn:aws:s3:::example-beat-audio-backup/*",
      ],
    },
  ],
} as const;

export function iamAllowsAction(
  policy: { Statement: ReadonlyArray<{ Effect: string; Action: readonly string[] }> },
  action: string,
): boolean {
  const denied = policy.Statement.some(
    (s) => s.Effect === "Deny" && s.Action.includes(action),
  );
  if (denied) return false;
  return policy.Statement.some(
    (s) => s.Effect === "Allow" && s.Action.includes(action),
  );
}
