export type TemplateVariables = Record<string, string | number | boolean | null | undefined>;

const PLACEHOLDER = /{{{\s*([a-zA-Z0-9_.-]+)\s*}}}|{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderTemplate(
  source: string,
  variables: TemplateVariables,
  options: { allowRawVariables?: ReadonlySet<string> } = {}
) {
  const missing = new Set<string>();
  const rendered = source.replace(PLACEHOLDER, (_match, rawName, escapedName) => {
    const name = String(rawName || escapedName);
    const value = variables[name];
    if (value === undefined || value === null) {
      missing.add(name);
      return "";
    }

    if (rawName) {
      if (!options.allowRawVariables?.has(name)) {
        throw new Error(`Raw email template variable is not allowed: ${name}`);
      }
      return String(value);
    }

    return escapeHtml(value);
  });

  if (missing.size > 0) {
    throw new Error(`Missing email template variables: ${Array.from(missing).sort().join(", ")}`);
  }

  if (/{{{?\s*[a-zA-Z0-9_.-]+\s*}?}}/.test(rendered)) {
    throw new Error("Email template contains unresolved variables");
  }

  return rendered;
}
