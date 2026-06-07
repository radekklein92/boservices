"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { PlaceholderValue } from "./placeholder-value-mark";
import {
  DynamicClause,
  dynNodesToTokens,
  refreshDynamicValues,
  tokensToDynNodes,
} from "./dynamic-clause-node";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  Link2Off,
  Undo2,
  Redo2,
  Pilcrow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";

export type TiptapEditorHandle = Editor;

// Náhled placeholderů: zapečené hodnoty (data-ph spany) nahradí jejich tokenem
// {{key}}, pak všechny {{tokeny}} (i dynamické) vizuálně zvýrazní. Jen pro čtení.
function toPlaceholderHtml(html: string): string {
  const withTokens = html.replace(
    /<span[^>]*\bdata-ph="(\w+)"[^>]*>[\s\S]*?<\/span>/g,
    (_m, key: string) => `{{${key}}}`,
  );
  return withTokens.replace(
    /\{\{(\w+)\}\}/g,
    (_m, key: string) =>
      `<span style="background:#f3eecf;color:#7a5b00;padding:0 4px;border-radius:3px;font-style:normal;white-space:nowrap">{{${key}}}</span>`,
  );
}

export function TiptapEditor({
  value,
  onChange,
  editorRef,
  editable = true,
  dynamicValues,
  showPlaceholders = false,
}: {
  value: string;
  onChange: (html: string) => void;
  editorRef?: (editor: Editor | null) => void;
  // false = jen pro čtení (smlouva uzamčená proti úpravám).
  editable?: boolean;
  // Vyrenderované hodnoty dynamických klauzulí (odstoupení) pro zobrazení v
  // editoru místo {{tokenů}}. Klíč = token (managerPartyLine, dependencyClause…).
  dynamicValues?: Record<string, string>;
  // true = místo editoru ukázat read-only náhled s placeholdery ({{tokeny}}).
  showPlaceholders?: boolean;
}) {
  // Ref, ať onCreate i efekty čtou vždy aktuální hodnoty (bez stale closure).
  const dynRef = useRef(dynamicValues ?? {});
  dynRef.current = dynamicValues ?? {};

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Link.configure({
        openOnClick: false,
        autolink: false,
      }),
      Placeholder.configure({
        placeholder: "Začněte psát znění smlouvy nebo si vyberte placeholder z palety vpravo…",
      }),
      // Poslední - vykreslí se nejvíc uvnitř (zachová <strong>/<em> kolem hodnoty).
      PlaceholderValue,
      DynamicClause,
    ],
    content: tokensToDynNodes(value),
    onCreate({ editor }) {
      refreshDynamicValues(editor, dynRef.current);
    },
    onUpdate({ editor }) {
      // Uložené HTML drží {{tokeny}} (ne vyrenderované hodnoty) - serializujeme zpět.
      onChange(dynNodesToTokens(editor.getHTML()));
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[480px] focus:outline-none px-6 py-7 text-ink-base leading-relaxed",
        spellcheck: "false",
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    editorRef?.(editor);
    return () => editorRef?.(null);
  }, [editor, editorRef]);

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    // Porovnáváme v „token" prostoru (editor drží dynamické klauzule jako nody).
    const currentTokens = dynNodesToTokens(editor.getHTML());
    if (currentTokens !== value) {
      editor.commands.setContent(tokensToDynNodes(value), { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Změna hodnot (přepínač MS/KS, výběr firmy) -> překresli dynamické klauzule
  // v editoru. Uložené HTML se nemění (drží {{tokeny}}).
  useEffect(() => {
    if (editor) refreshDynamicValues(editor, dynamicValues ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, dynamicValues]);

  if (!editor) {
    return (
      <div className="rounded-2xl border border-edge bg-paper">
        {editable && <Toolbar editor={null} />}
        <div className="min-h-[480px] px-6 py-7 text-[13.5px] text-ink-mid">
          Načítám editor…
        </div>
      </div>
    );
  }

  // Náhled placeholderů - read-only, místo editoru (editor zůstává namountovaný
  // s hodnotami, jen ho dočasně neukazujeme).
  if (showPlaceholders) {
    return (
      <div className="rounded-2xl border border-edge bg-paper">
        <div
          className="prose prose-sm max-w-none min-h-[480px] px-6 py-7 text-ink-base leading-relaxed"
          dangerouslySetInnerHTML={{ __html: toPlaceholderHtml(value) }}
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-edge bg-paper">
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  function toggleLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL odkazu (nebo nech prázdné pro odebrání)", previous ?? "");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-edge px-3 py-2">
      <Group>
        <Tbtn
          editor={editor}
          Icon={Pilcrow}
          label="Odstavec"
          isActive={editor?.isActive("paragraph")}
          onClick={() => editor?.chain().focus().setParagraph().run()}
        />
        <Tbtn
          editor={editor}
          Icon={Heading1}
          label="Nadpis 1"
          isActive={editor?.isActive("heading", { level: 1 })}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 1 }).run()
          }
        />
        <Tbtn
          editor={editor}
          Icon={Heading2}
          label="Nadpis 2"
          isActive={editor?.isActive("heading", { level: 2 })}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        />
        <Tbtn
          editor={editor}
          Icon={Heading3}
          label="Nadpis 3"
          isActive={editor?.isActive("heading", { level: 3 })}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 3 }).run()
          }
        />
      </Group>
      <Divider />
      <Group>
        <Tbtn
          editor={editor}
          Icon={Bold}
          label="Tučné"
          isActive={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        />
        <Tbtn
          editor={editor}
          Icon={Italic}
          label="Kurzíva"
          isActive={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        />
        <Tbtn
          editor={editor}
          Icon={UnderlineIcon}
          label="Podtržené (přeškrtnuté)"
          isActive={editor?.isActive("strike")}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        />
      </Group>
      <Divider />
      <Group>
        <Tbtn
          editor={editor}
          Icon={List}
          label="Seznam"
          isActive={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <Tbtn
          editor={editor}
          Icon={ListOrdered}
          label="Číslovaný seznam"
          isActive={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        />
        <Tbtn
          editor={editor}
          Icon={Quote}
          label="Citace"
          isActive={editor?.isActive("blockquote")}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        />
      </Group>
      <Divider />
      <Group>
        <Tbtn
          editor={editor}
          Icon={Link2}
          label="Odkaz"
          isActive={editor?.isActive("link")}
          onClick={toggleLink}
        />
        <Tbtn
          editor={editor}
          Icon={Link2Off}
          label="Odebrat odkaz"
          onClick={() => editor?.chain().focus().unsetLink().run()}
          disabled={!editor?.isActive("link")}
        />
      </Group>
      <Divider />
      <Group>
        <Tbtn
          editor={editor}
          Icon={Undo2}
          label="Zpět"
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor?.can().undo()}
        />
        <Tbtn
          editor={editor}
          Icon={Redo2}
          label="Vpřed"
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor?.can().redo()}
        />
      </Group>
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function Divider() {
  return (
    <span aria-hidden="true" className="mx-1 inline-block h-5 w-px bg-edge" />
  );
}

function Tbtn({
  editor,
  Icon,
  label,
  isActive,
  onClick,
  disabled,
}: {
  editor: Editor | null;
  Icon: LucideIcon;
  label: string;
  isActive?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !editor}
      aria-label={label}
      title={label}
      className={[
        "grid h-8 w-8 place-items-center rounded-md transition-colors",
        isActive
          ? "bg-ink-base text-paper"
          : "text-ink-deep hover:bg-edge-warm",
        "disabled:cursor-not-allowed disabled:opacity-40",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
