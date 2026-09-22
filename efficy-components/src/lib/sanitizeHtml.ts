/**
 * Turns a knowledge-base body authored in the CRM into markup this portal is willing to render.
 *
 * Efficy stores a FAQ answer as a whole HTML *document*, `<head>` included, written by whoever
 * drafted the article in the CRM editor. Several of the real articles carry a `<style>` block
 * that opens with `:root{--primary:…;--ink:…;--surface:…}` — injected as-is, those declarations
 * land on the portal's own root variables and repaint every page the article appears on. Others
 * carry inline colours that disappear against the Action Logement navy.
 *
 * So the rule here is not "strip scripts": it is that **CRM content is data, never markup we
 * trust**. Only the tags below survive, only the attributes below survive on them, and anything
 * else is unwrapped down to its text. An article can say anything; it cannot style, script,
 * frame, or lay out the page around it.
 *
 * Headings are shifted down rather than dropped: an article body is rendered inside a panel
 * under the block's own `h2`/`h3`, so an `h1` written by an author would break the page outline
 * for anyone navigating by headings.
 *
 * Runs in the browser — the island is `clientOnly`, so DOMParser is available and the parsing
 * is the browser's own, not a regex pretending to be one.
 *
 * The collision is not hypothetical in this module. KnowledgeBase.module.css resolves its brand
 * colour as `var(--portal-color-primary, var(--color-primary, var(--primary, #c21a1f)))`, and
 * `--primary` is exactly what the articles declare. On a host page that sets neither of the
 * first two, an article used to hand the component its own blue.
 *
 * Copied from tenant-portal's src/lib/sanitizeHtml.ts rather than shared: the two modules are
 * separate packages with no common dependency. Keep them in step by hand if either changes.
 */

/** Tags that survive. Everything else is unwrapped, keeping its text. */
const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "span", "div",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd",
  "strong", "b", "em", "i", "u", "sub", "sup", "small", "abbr",
  "a", "img",
  "blockquote", "pre", "code",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
]);

/**
 * Dropped outright, content and all.
 *
 * `style` is the one that matters in practice — see the note above. The rest are here because
 * an article that can inject a form or an iframe into a signed-in tenant's page is a phishing
 * surface, whoever wrote it.
 */
const DROPPED_TAGS = "style,script,link,meta,title,head,iframe,frame,frameset,object,embed,applet,form,input,button,select,textarea,noscript,base,svg,math";

/** Attributes kept per tag. Anything not listed — including every `on*`, `style`, `class` and `id` — goes. */
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "title"],
  img: ["src", "alt", "title"],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan"],
  abbr: ["title"],
};

/** An article sits under the block heading, so its own headings start below it. */
const HEADING_SHIFT: Record<string, string> = {
  h1: "h4", h2: "h4", h3: "h5", h4: "h5", h5: "h6", h6: "h6",
};

const SAFE_LINK = /^(https?:|mailto:|tel:)/i;
const SAFE_IMAGE = /^(https?:|data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,)/i;

function parse(raw: string): HTMLElement | null {
  if (!raw?.trim()) return null;
  try {
    return new DOMParser().parseFromString(raw, "text/html").body;
  } catch {
    return null;
  }
}

/** Replaces an element with its own children, so its text is kept and its tag is not. */
function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (!parent) {
    element.remove();
    return;
  }
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

function clean(element: Element): void {
  const tag = element.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tag)) {
    unwrap(element);
    return;
  }

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (!(ALLOWED_ATTRIBUTES[tag] ?? []).includes(name)) {
      element.removeAttribute(attribute.name);
    }
  }

  if (tag === "a") {
    const href = element.getAttribute("href") ?? "";
    if (!SAFE_LINK.test(href)) {
      // A link we cannot vouch for keeps its words and loses its destination.
      element.removeAttribute("href");
    } else if (/^https?:/i.test(href)) {
      // The article lives in the CRM; its links leave the portal.
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  }

  if (tag === "img") {
    const src = element.getAttribute("src") ?? "";
    if (!SAFE_IMAGE.test(src)) {
      element.remove();
      return;
    }
    // An image nobody described is decoration as far as a screen reader is concerned.
    if (!element.getAttribute("alt")) element.setAttribute("alt", "");
    element.setAttribute("loading", "lazy");
  }

  const shifted = HEADING_SHIFT[tag];
  if (shifted) {
    const replacement = element.ownerDocument.createElement(shifted);
    while (element.firstChild) replacement.appendChild(element.firstChild);
    element.replaceWith(replacement);
  }
}

/**
 * The sanitised body of a CRM article, safe to hand to `dangerouslySetInnerHTML`.
 *
 * Returns an empty string when the article carries nothing renderable, so a caller can decide
 * whether an article with no body is worth showing at all.
 */
export function sanitizeCrmHtml(raw: string | undefined): string {
  const body = parse(raw ?? "");
  if (!body) return "";

  body.querySelectorAll(DROPPED_TAGS).forEach((node) => node.remove());

  // Deepest first: `clean` can unwrap or replace a node, and a snapshot taken before that
  // still points at nodes whose parents have moved.
  const elements = Array.from(body.querySelectorAll("*")).reverse();
  for (const element of elements) clean(element);

  return body.innerHTML.trim();
}

/**
 * The article as plain text — used to search across bodies and to build the teaser line.
 *
 * Reads the text the tenant would actually see, so a word hidden in an attribute or a dropped
 * `<style>` block never makes an article match a search for it.
 */
export function crmHtmlToText(raw: string | undefined): string {
  const body = parse(raw ?? "");
  if (!body) return "";

  body.querySelectorAll(DROPPED_TAGS).forEach((node) => node.remove());
  return (body.textContent ?? "").replace(/\s+/g, " ").trim();
}
