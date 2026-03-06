import type { CommitSpec } from "../../scripts/awakening/_schema.js";

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function requireObjectCommit(commit: CommitSpec): Record<string, unknown> {
  return commit as Record<string, unknown>;
}

export function resolveCommitValue(args: {
  commit: CommitSpec;
  inputs: Record<string, unknown>;
  valueField?: string;
  fromField?: string;
}): unknown {
  const valueField = args.valueField ?? "value";
  const fromField = args.fromField ?? "from";

  const commitObj = requireObjectCommit(args.commit);
  const hasValue = hasOwn(commitObj, valueField);
  const hasFrom = hasOwn(commitObj, fromField);

  if ((hasValue && hasFrom) || (!hasValue && !hasFrom)) {
    throw new Error(`Commit ${args.commit.type} must include exactly one of ${valueField} or ${fromField}`);
  }

  if (hasValue) {
    return commitObj[valueField];
  }

  const inputKey = commitObj[fromField];
  if (typeof inputKey !== "string" || inputKey.trim().length === 0) {
    throw new Error(`Commit ${args.commit.type}.${fromField} must be a non-empty string`);
  }

  if (!Object.prototype.hasOwnProperty.call(args.inputs, inputKey)) {
    throw new Error(`Commit ${args.commit.type} references missing input key: ${inputKey}`);
  }

  return args.inputs[inputKey];
}

export function requireStringField(commit: CommitSpec, key: string): string {
  const value = (commit as Record<string, unknown>)[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Commit ${commit.type}.${key} must be a non-empty string`);
  }
  return value.trim();
}
