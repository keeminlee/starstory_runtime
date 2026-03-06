export type TemplateResolver = (key: string) => string | undefined;

const TEMPLATE_VAR_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function renderTemplate(text: string, resolveVar: TemplateResolver, unresolved?: Set<string>): string {
  if (!text.includes("{{")) return text;

  return text.replace(TEMPLATE_VAR_REGEX, (_full, rawKey: string) => {
    const key = String(rawKey ?? "").trim();
    if (!key) return _full;

    const resolved = resolveVar(key);
    if (resolved === undefined) {
      unresolved?.add(key);
      return _full;
    }

    return resolved;
  });
}

export function renderTemplateTree<T>(value: T, resolveVar: TemplateResolver, unresolved?: Set<string>): T {
  if (typeof value === "string") {
    return renderTemplate(value, resolveVar, unresolved) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderTemplateTree(item, resolveVar, unresolved)) as T;
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = renderTemplateTree(item, resolveVar, unresolved);
    }
    return out as T;
  }

  return value;
}
