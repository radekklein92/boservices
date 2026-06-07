import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Vizuální zvýraznění literálních {{tokenů}} v editoru (dekorace, NE značka -
// nemění text dokumentu, takže kopírování dá čistý {{token}}). Uplatní se jen
// tam, kde {{token}} v textu reálně je (= režim placeholderů). V režimu hodnot
// jsou tokeny zapečené/jako nody, takže se nic nezvýrazní.
const TOKEN_RE = /\{\{\w+\}\}/g;

export const PlaceholderHighlight = Extension.create({
  name: "placeholderHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              TOKEN_RE.lastIndex = 0;
              let m: RegExpExecArray | null;
              while ((m = TOKEN_RE.exec(node.text)) !== null) {
                const from = pos + m.index;
                const to = from + m[0].length;
                decos.push(Decoration.inline(from, to, { class: "ph-hl" }));
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
