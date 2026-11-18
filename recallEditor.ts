import type { Editor } from "obsidian";
import type { AnnotationType } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { NoteWriteConflictError } from "./noteWrites";

/** A single CM6 change, fenced from adjacent typing in both history directions. */
export function insertRecallInEditor(editor: Editor, original: string, replacement: string): void {
  let at = 0;
  while (at < original.length && original[at] === replacement[at]) at++;
  const added = replacement.length - original.length;
  if (added <= 0 || replacement.slice(at + added) !== original.slice(at)) throw new NoteWriteConflictError();
  replaceInEditor(editor, original, at, at, replacement.slice(at, at + added));
}

/** Exact captured range, one native undo transaction; shared by Recall insertion and Style Apply. */
export function replaceInEditor(editor: Editor, original: string, start: number, end: number, text: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- Use the host's shared history instance.
  const { isolateHistory } = require("@codemirror/commands") as { isolateHistory: AnnotationType<"full"> };
  const cm = (editor as Editor & { cm?: EditorView }).cm;
  if (!cm || editor.getValue() !== original || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > original.length) throw new NoteWriteConflictError();
  // Editor strings may use CRLF while CM positions count normalized line breaks.
  const from = original.slice(0, start).replace(/\r\n/gu, "\n").length;
  const to = original.slice(0, end).replace(/\r\n/gu, "\n").length;
  cm.dispatch({ changes: { from, to, insert: text.replace(/\r\n/gu, "\n") }, annotations: isolateHistory.of("full") });
}
