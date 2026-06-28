"use client";

import {
  FEEDBACK_LIMITS,
  routeLabelFor,
  type PageContext,
  type PickedElement,
} from "@/lib/portal/feedback-shared";

// Zachycení kontextu aktuální stránky z živého DOM. Vše čistě client-side, žádná
// nová závislost. Vynechává prvky označené [data-feedback-skip] (vč. kořene
// samotného widgetu) - tím jdou citlivé části vyloučit z toho, co putuje do AI.

const SKIP_SEL = "[data-feedback-skip]";
const TAG_SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS", "TEMPLATE"]);

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function uniq(values: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = clean(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function notInSkip(el: Element): boolean {
  return !el.closest(SKIP_SEL);
}

// Krátká CSS cesta k prvku (hint pro vývojáře/AI, ne nutně unikátní selektor).
export function cssSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 4 && cur.tagName !== "BODY" && cur.tagName !== "HTML") {
    if (cur.id) {
      parts.unshift(`#${cur.id}`);
      break;
    }
    let part = cur.tagName.toLowerCase();
    const tid = cur.getAttribute("data-testid") || cur.getAttribute("data-test");
    if (tid) {
      part += `[data-testid="${tid}"]`;
    } else {
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
    }
    parts.unshift(part);
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(" > ").slice(0, FEEDBACK_LIMITS.selector);
}

// Popis prvku, na který uživatel ukázal.
export function describeElement(el: Element): PickedElement {
  const text = clean((el as HTMLElement).innerText || el.textContent || "").slice(
    0,
    FEEDBACK_LIMITS.pickedText,
  );
  const role =
    el.getAttribute("role") ||
    el.getAttribute("aria-label") ||
    (el.tagName === "BUTTON" || el.tagName === "A" ? el.tagName.toLowerCase() : undefined) ||
    undefined;
  return { text, selector: cssSelector(el), role: role ?? undefined };
}

// Ořezaný viditelný text - rekurzivní průchod, vynechá [data-feedback-skip],
// skryté a netextové uzly. Honoruje data-feedback-skip (na rozdíl od innerText).
function captureVisibleText(root: Element): string {
  const skip = new Set(Array.from(root.querySelectorAll(SKIP_SEL)));
  const limit = FEEDBACK_LIMITS.visibleText + 2000; // sběr s rezervou, ořez až nakonec
  let out = "";
  const walk = (node: Node) => {
    if (out.length > limit) return;
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (skip.has(el) || TAG_SKIP.has(el.tagName)) return;
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return;
    for (const child of Array.from(el.childNodes)) walk(child);
    if (/^(DIV|P|LI|TR|UL|OL|H1|H2|H3|H4|H5|SECTION|HEADER|FOOTER|ARTICLE|BR|TABLE)$/.test(el.tagName)) {
      out += "\n";
    }
  };
  walk(root);
  return out
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, FEEDBACK_LIMITS.visibleText);
}

export function capturePageContext(picked?: PickedElement): PageContext {
  const path = (window.location.pathname + window.location.search).slice(0, 512);
  const title = document.title || "";
  const main = (document.querySelector("main") ?? document.body) as Element;

  const headings = uniq(
    Array.from(main.querySelectorAll("h1, h2, h3"))
      .filter(notInSkip)
      .map((e) => (e as HTMLElement).innerText || e.textContent || ""),
    FEEDBACK_LIMITS.headings,
  );
  const fieldLabels = uniq(
    Array.from(main.querySelectorAll("label, th"))
      .filter(notInSkip)
      .map((e) => (e as HTMLElement).innerText || e.textContent || ""),
    FEEDBACK_LIMITS.fieldLabels,
  );
  const visibleText = captureVisibleText(main);
  const selection = clean(window.getSelection?.()?.toString() ?? "").slice(
    0,
    FEEDBACK_LIMITS.selection,
  );

  return {
    path,
    title,
    routeLabel: routeLabelFor(path, title),
    headings,
    fieldLabels,
    visibleText,
    selection: selection || undefined,
    picked,
  };
}
