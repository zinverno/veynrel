import type { Editor } from "obsidian";
import type { AnnotationType } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { NoteWriteConflictError } from "./noteWrites";

/** A single CM6 change, fenced from adjacent typing in both history directions. */
export function insertRecallInEditor(editor: Editor, original: string, replacement: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- Obsidian provides the shared history module; bundling another breaks isolation.
  const { isolateHistory } = require("@codemirror/commands") as { isolateHistory: AnnotationType<"full"> };
  const cm = (editor as Editor & { cm?: EditorView }).cm;
  if (!cm || editor.getValue() !== original) throw new NoteWriteConflictError();
  let at = 0;
  while (at < original.length && original[at] === replacement[at]) at++;
  const added = replacement.length - original.length;
  if (added <= 0 || replacement.slice(at + added) !== original.slice(at)) throw new NoteWriteConflictError();
  // Editor strings may use CRLF while CM positions count normalized line breaks.
  const from = original.slice(0, at).replace(/\r\n/gu, "\n").length;
  cm.dispatch({ changes: { from, insert: replacement.slice(at, at + added).replace(/\r\n/gu, "\n") }, annotations: isolateHistory.of("full") });
}
