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
import { PlaceholderHighlight } from "./placeholder-highlight";
import { bakedToTokenHtml, resolveForEditing } from "@/lib/portal/contract-render";
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

export function TiptapEditor({
  value,
  onChange,
  editorRef,
  editable = true,
  dynamicValues,
  variables,
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
  // Proměnné smlouvy - pro převod mezi placeholdery a hodnotami (token ↔ baked).
  variables?: Record<string, string>;
  // true = editovat v režimu placeholderů ({{tokeny}}); false = finální hodnoty.
  showPlaceholders?: boolean;
}) {
  // Refy, ať onCreate/onUpdate i efekty čtou vždy aktuální hodnoty (bez stale closure).
  const dynRef = useRef(dynamicValues ?? {});
  dynRef.current = dynamicValues ?? {};
  const varsRef = useRef(variables ?? {});
  varsRef.current = variables ?? {};
  const modeRef = useRef(showPlaceholders);
  modeRef.current = showPlaceholders;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Kanonické (uložené) html je zapečené. Editor zobrazuje buď zapečené hodnoty
  // (s dynamickými nody), nebo token-formu ({{tokeny}}) dle režimu.
  const displayFor = (canonical: string): string =>
    modeRef.current
      ? bakedToTokenHtml(canonical, varsRef.current)
      : tokensToDynNodes(canonical);
  // Z editorového html zpět na kanonické (zapečené) html.
  const toCanonical = (editorHtml: string): string =>
    modeRef.current
      ? resolveForEditing(editorHtml, varsRef.current)
      : dynNodesToTokens(editorHtml);

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
      PlaceholderHighlight,
    ],
    content: displayFor(value),
    onCreate({ editor }) {
      refreshDynamicValues(editor, dynRef.current);
    },
    onUpdate({ editor }) {
      // Vždy emitujeme kanonické (zapečené) html - bez ohledu na režim editoru.
      onChangeRef.current(toCanonical(editor.getHTML()));
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
    // Porovnáváme v kanonickém (zapečeném) prostoru. Reaguje i na přepnutí režimu
    // (showPlaceholders) - překreslí obsah do správné reprezentace.
    const current = toCanonical(editor.getHTML());
    if (current !== value) {
      editor.commands.setContent(displayFor(value), { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, showPlaceholders]);

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
