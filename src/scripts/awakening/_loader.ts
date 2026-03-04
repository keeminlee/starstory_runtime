import fs from "node:fs/promises";
import YAML from "yaml";
import { AwakenScript, validateAwakenScript } from "./_schema.js";
import { getAwakenScriptPath } from "./_registry.js";

export const AWAKEN_SCRIPT_NOT_FOUND = "AWAKEN_SCRIPT_NOT_FOUND";
export const AWAKEN_SCRIPT_YAML_PARSE_ERROR = "AWAKEN_SCRIPT_YAML_PARSE_ERROR";
export const AWAKEN_SCRIPT_SCHEMA_ERROR = "AWAKEN_SCRIPT_SCHEMA_ERROR";

export class AwakenScriptError extends Error {
  code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "AwakenScriptError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export async function loadAwakenScript(scriptId: string, version?: number): Promise<AwakenScript> {
  let scriptPath: string;

  try {
    scriptPath = getAwakenScriptPath(scriptId, version);
  } catch (err: unknown) {
    throw new AwakenScriptError(
      AWAKEN_SCRIPT_NOT_FOUND,
      `Could not resolve script ${scriptId}${version !== undefined ? `.v${version}` : ""}`,
      err,
    );
  }

  let rawYaml: string;
  try {
    rawYaml = await fs.readFile(scriptPath, "utf8");
  } catch (err: unknown) {
    throw new AwakenScriptError(
      AWAKEN_SCRIPT_NOT_FOUND,
      `Script file is missing or unreadable at ${scriptPath}`,
      err,
    );
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(rawYaml);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AwakenScriptError(
      AWAKEN_SCRIPT_YAML_PARSE_ERROR,
      `Failed to parse YAML for ${scriptId}${version !== undefined ? `.v${version}` : ""}: ${message}`,
      err,
    );
  }

  try {
    return validateAwakenScript(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AwakenScriptError(
      AWAKEN_SCRIPT_SCHEMA_ERROR,
      `Invalid awakening script ${scriptId}${version !== undefined ? `.v${version}` : ""}: ${message}`,
      err,
    );
  }
}
