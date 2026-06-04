import { Mark, mergeAttributes } from "@tiptap/core";

// Neviditelná značka kolem zapečené hodnoty placeholderu (`<span data-ph="key">`).
// Drží vazbu hodnoty na klíč, aby šlo hodnotu z pole spolehlivě přepsat v textu
// (bez kolizí typu „Praha"/„Praha 1"). Vizuálně bez stylu - vypadá jako text.
// Registruje se v editoru jako poslední mark, aby se vykreslila nejvíc uvnitř
// (případné <strong>/<em> kolem hodnoty tak zůstanou zachované).
export const PlaceholderValue = Mark.create({
  name: "placeholderValue",
  inclusive: false,

  addAttributes() {
    return {
      dataPh: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-ph"),
        renderHTML: (attrs) =>
          attrs.dataPh ? { "data-ph": attrs.dataPh } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-ph]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});
