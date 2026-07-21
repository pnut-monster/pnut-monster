import { readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const templateDir = resolve(root, "email-templates");
const manifest = JSON.parse(await readFile(resolve(templateDir, "manifest.json"), "utf8"));
const errors = [];

for (const [destination, source] of Object.entries(manifest)) {
  try {
    await access(resolve(templateDir, source));
    const html = await readFile(resolve(templateDir, source), "utf8");
    if (!html.toLowerCase().includes("<!doctype html>")) errors.push(`${source}: missing doctype`);
    if (!html.includes('name="viewport"')) errors.push(`${source}: missing viewport`);
    if (!html.includes("{{companyName}}")) errors.push(`${source}: missing company branding`);
    if (!html.includes("{{privacyUrl}}") || !html.includes("{{termsUrl}}")) {
      errors.push(`${source}: missing policy links`);
    }
    const withoutPlaceholders = html.replace(/{{{?\s*[a-zA-Z0-9_.-]+\s*}?}}/g, "");
    if (withoutPlaceholders.includes("{{")) errors.push(`${source}: malformed placeholder`);
  } catch (error) {
    errors.push(`${destination}: ${error.message}`);
  }
}

if (Object.keys(manifest).length !== 26) {
  errors.push(`manifest: expected 26 templates, found ${Object.keys(manifest).length}`);
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Validated ${Object.keys(manifest).length} S3 email templates.\n`);
