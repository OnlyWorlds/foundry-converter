/**
 * Page body HTML builder (R7).
 *
 * Produces the enriched HTML content for one JournalEntryPage from an OW element:
 *   <p>description paragraphs</p>
 *   <dl> populated type-specific TEXT fields (humanized labels) </dl>
 *   <section> Connections — link fields, each UUID resolved to a Foundry
 *             @UUID[...] enricher ref, or a LOUD "(unlinked: <tail>)" </section>
 *   <details> Import metadata — extension fields (x_, atlas_, shadow_) </details>
 *
 * Field classification is structural, not schema-bound (forward-compatible):
 *   - link field  = value is a UUID string, or an array whose items are all UUIDs
 *   - extension   = key starts with x_ / atlas_ / shadow_
 *   - text field  = any other populated scalar/string (or array of scalars)
 * id / name / description are handled explicitly and never repeated as fields.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// id/name/description are handled explicitly; the *_updated_at / *created* stamps
// are folder-sync and server bookkeeping, not world content -- rendering them as
// lore fields was caught in the first licensed render check.
const SKIP_FIELDS = new Set([
  "id", "name", "description",
  "created_at", "updated_at", "local_updated_at", "server_updated_at",
]);

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isExtensionKey(key) {
  return /^(x_|atlas_|shadow_)/.test(key);
}

export function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v);
}

/** True if a value is a link: a UUID, or a non-empty array of all-UUIDs. */
export function isLinkValue(v) {
  if (isUuid(v)) return true;
  if (Array.isArray(v) && v.length && v.every(isUuid)) return true;
  return false;
}

/** Humanize a field key: "birth_date" → "Birth Date". */
export function humanize(key) {
  return String(key)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function paragraphs(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** Render one link value's targets as an array of <li> inner strings. */
function renderLinkItems(value, resolve) {
  const uuids = Array.isArray(value) ? value : [value];
  return uuids.map((uuid) => {
    const target = resolve(uuid);
    if (target) {
      // Foundry cross-document enricher. Links between compendium docs MUST be
      // absolute (Compendium.<module>.<pack>....) -- bare JournalEntry.<id> uuids
      // resolve against the WORLD collection and dead-end on click (verified live
      // in Foundry v14: bare form fromUuid -> null, absolute form -> resolves).
      return `@UUID[Compendium.${target.packRef}.JournalEntry.${target.journalId}.JournalEntryPage.${target.pageId}]{${escapeHtml(target.name)}}`;
    }
    const tail = String(uuid).replaceAll("-", "").slice(-8);
    return `<em>(unlinked: ${escapeHtml(tail)})</em>`;
  });
}

/**
 * Build the page HTML.
 * @param element   the OW element
 * @param resolve   (uuid) => { journalId, pageId, name } | null
 */
export function buildPageHtml(element, resolve) {
  const parts = [];
  // No name <h1> in the body: the page renders its own title (title.show), and
  // Foundry builds the in-page TOC from content headings -- an h1 here doubled
  // every name in the sidebar (caught by Captain in the first licensed render).

  if (element.description) parts.push(paragraphs(element.description));

  // Partition remaining fields.
  const textRows = [];
  const linkRows = [];
  const extRows = [];
  for (const [key, value] of Object.entries(element)) {
    if (SKIP_FIELDS.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (isExtensionKey(key)) {
      extRows.push([key, value]);
    } else if (isLinkValue(value)) {
      linkRows.push([key, value]);
    } else if (typeof value === "object") {
      // Nested object/array of non-uuids: stringify into metadata rather than drop.
      extRows.push([key, value]);
    } else {
      textRows.push([key, value]);
    }
  }

  if (textRows.length) {
    const dl = textRows
      .map(
        ([k, v]) =>
          `<dt>${escapeHtml(humanize(k))}</dt><dd>${escapeHtml(String(v))}</dd>`
      )
      .join("\n");
    parts.push(`<dl>\n${dl}\n</dl>`);
  }

  if (linkRows.length) {
    const sections = linkRows
      .map(([k, v]) => {
        const items = renderLinkItems(v, resolve)
          .map((inner) => `<li>${inner}</li>`)
          .join("\n");
        return `<h3>${escapeHtml(humanize(k))}</h3>\n<ul>\n${items}\n</ul>`;
      })
      .join("\n");
    parts.push(`<section class="ow-connections">\n<h2>Connections</h2>\n${sections}\n</section>`);
  }

  if (extRows.length) {
    const dl = extRows
      .map(([k, v]) => {
        const text = typeof v === "object" ? JSON.stringify(v) : String(v);
        return `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(text)}</dd>`;
      })
      .join("\n");
    parts.push(
      `<details class="ow-metadata">\n<summary>Import metadata</summary>\n<dl>\n${dl}\n</dl>\n</details>`
    );
  }

  return parts.join("\n");
}
