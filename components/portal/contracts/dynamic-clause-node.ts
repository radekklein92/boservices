import { Node, mergeAttributes } from "@tiptap/core";

// Tiptap inline ATOM node pro dynamické (z formuláře skládané) klauzule
// odstoupení - {{managerPartyLine}}, {{depIntroPhrase}}, {{dependencyClause}} aj.
//
// Proč node a ne mark: hodnota obsahuje vnořené <strong> (RAW HTML). Tiptap mark
// (placeholderValue) by se kolem <strong> roztrhl na víc spanů a re-bake by se
// rozbil. Atom node drží obsah neprůhledně - vykreslí se přes NodeView jako
// vyrenderovaná, needitovatelná klauzule, ale do uloženého HTML se serializuje
// zpět jako PRÁZDNÝ <span data-dyn="token">, který se převede na {{token}}.
//
// Uložené contract.html tak ZŮSTÁVÁ s {{tokeny}} (KEEP_DYNAMIC) - diff, PDF i
// ukládání fungují beze změny. Node je čistě zobrazovací vrstva editoru: hodnoty
// se čtou z editor.storage (plněné z `variables`), takže přepnutí MS/KS nebo
// výběr firmy se v editoru hned překreslí.

// Tokeny, které se v editoru zobrazují jako vyrenderovaná klauzule (ne {{...}}).
export const EDITOR_RENDERED_TOKENS = new Set([
  "managerPartyLine",
  "depIntroPhrase",
  "depDropPhrase",
  "ksPreservedNote",
  "dependencyClause",
]);

// {{token}} -> <span data-dyn="token"></span> (jen pro RENDERED tokeny) pro vstup
// do editoru. Ostatní {{tokeny}} (claimsTable, ks* …) zůstávají beze změny.
export function tokensToDynNodes(html: string): string {
  return html.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    EDITOR_RENDERED_TOKENS.has(key) ? `<span data-dyn="${key}"></span>` : whole,
  );
}

// <span data-dyn="token"></span> -> {{token}} při čtení z editoru (pro uložení).
export function dynNodesToTokens(html: string): string {
  return html.replace(
    /<span[^>]*\bdata-dyn="(\w+)"[^>]*>\s*<\/span>/g,
    (_m, key: string) => `{{${key}}}`,
  );
}

type DynStorage = {
  values: Record<string, string>;
  renderers: Set<() => void>;
};

export const DynamicClause = Node.create({
  name: "dynamicClause",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      token: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-dyn"),
        renderHTML: (attrs) => (attrs.token ? { "data-dyn": attrs.token } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-dyn]" }];
  },

  // Serializace do HTML = prázdný marker span; hodnota se NEukládá do nodu.
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes)];
  },

  addStorage(): DynStorage {
    return { values: {}, renderers: new Set() };
  },

  addNodeView() {
    return ({ node, editor }) => {
      const storage = (editor.storage as unknown as Record<string, DynStorage>)
        .dynamicClause;
      const dom = document.createElement("span");
      dom.setAttribute("data-dyn", node.attrs.token ?? "");
      dom.setAttribute("contenteditable", "false");
      dom.className = "dyn-clause";

      const render = () => {
        const v = storage.values[node.attrs.token] ?? "";
        if (v && v.trim()) {
          dom.removeAttribute("data-empty");
          dom.innerHTML = v;
        } else {
          // Prázdná hodnota (např. MS nebyla podepsána) - nic se nevykresluje.
          dom.setAttribute("data-empty", "1");
          dom.innerHTML = "";
        }
      };
      render();
      storage.renderers.add(render);

      return {
        dom,
        // Obsah řídíme sami z `values`; PM/Tiptap dovnitř nezasahuje.
        ignoreMutation: () => true,
        update: (newNode) => {
          if (newNode.type.name !== "dynamicClause") return false;
          render();
          return true;
        },
        destroy: () => {
          storage.renderers.delete(render);
        },
      };
    };
  },
});

// Promítne nové hodnoty do storage a překreslí všechny dynamické nody.
export function refreshDynamicValues(
  editor: { storage: unknown },
  values: Record<string, string>,
): void {
  const storage = (
    editor.storage as unknown as Record<string, DynStorage | undefined>
  ).dynamicClause;
  if (!storage) return;
  storage.values = values;
  storage.renderers.forEach((r) => r());
}
