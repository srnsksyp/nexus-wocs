import { useEffect, useMemo, useRef } from "react"
import { EditorView, keymap } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { indentWithTab } from "@codemirror/commands";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";

import { minimap } from "../extensions/minimap";
import { customTheme } from "../extensions/theme";
import { getLanguageExtension } from "../extensions/language-extension";
import { customSetup } from "../extensions/custom-setup";
import { suggestion } from "../extensions/suggestion";
import { quickEdit } from "../extensions/quick-edit";
import { selectionTooltip } from "../extensions/selection-tooltip";
import type { SelectedCodeContext } from "../extensions/selection-tooltip";
import type { Id } from "../../../../convex/_generated/dataModel";

export interface CursorPosition {
  line: number;
  column: number;
}

interface Props {
  projectId: Id<"projects">;
  fileId: Id<"files">;
  fileName: string;
  filePath?: string;
  initialValue?: string;
  lineWrapping?: boolean;
  minimapEnabled?: boolean;
  onChange: (value: string) => void;
  onSave?: () => void;
  conversationId?: Id<"conversations">;
  onSelectedCode?: (context: SelectedCodeContext) => void;
  onCursorPositionChange?: (position: CursorPosition) => void;
}

export const CodeEditor = (props: Props) => {
  const projectId = props.projectId;
  const fileId = props.fileId;
  const fileName = props.fileName;
  const filePath = props.filePath;
  const initialValue = props.initialValue ?? "";
  const lineWrapping = props.lineWrapping ?? false;
  const minimapEnabled = props.minimapEnabled ?? true;
  const onChange = props.onChange;
  const onSave = props.onSave;
  const conversationId = props.conversationId;
  const onSelectedCode = props.onSelectedCode;
  const onCursorPositionChange = props.onCursorPositionChange;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const wrapCompartmentRef = useRef<Compartment | null>(null);
  const minimapCompartmentRef = useRef<Compartment | null>(null);
  const onSaveRef = useRef(onSave);
  const onSelectedCodeRef = useRef(onSelectedCode);
  const conversationIdRef = useRef(conversationId);
  const onCursorPositionChangeRef = useRef(onCursorPositionChange);
  const lastReportedCursorRef = useRef<CursorPosition | null>(null);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  useEffect(() => {
    onSelectedCodeRef.current = onSelectedCode;
  }, [onSelectedCode]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    onCursorPositionChangeRef.current = onCursorPositionChange;
  }, [onCursorPositionChange]);

  const languageExtension = useMemo(() => {
    return getLanguageExtension(fileName)
  }, [fileName])

  // External document sync: update editor doc if initialValue changes externally
  // (e.g. conflict accepted or baseline loaded) and differs from editor doc
  useEffect(() => {
    const view = viewRef.current;
    if (view && initialValue !== undefined) {
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== initialValue) {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: initialValue },
        });
      }
    }
  }, [initialValue]);

  // Reconfigure line wrapping compartment when lineWrapping prop changes
  useEffect(() => {
    const view = viewRef.current;
    const compartment = wrapCompartmentRef.current;
    if (view && compartment) {
      view.dispatch({
        effects: compartment.reconfigure(
          lineWrapping ? EditorView.lineWrapping : []
        ),
      });
    }
  }, [lineWrapping]);

  // Reconfigure minimap compartment when minimapEnabled prop changes
  useEffect(() => {
    const view = viewRef.current;
    const compartment = minimapCompartmentRef.current;
    if (view && compartment) {
      view.dispatch({
        effects: compartment.reconfigure(
          minimapEnabled ? minimap() : []
        ),
      });
    }
  }, [minimapEnabled]);

  useEffect(() => {
    if (!editorRef.current) return;

    const wrapCompartment = new Compartment();
    wrapCompartmentRef.current = wrapCompartment;

    const minimapCompartment = new Compartment();
    minimapCompartmentRef.current = minimapCompartment;

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          if (onSaveRef.current) {
            onSaveRef.current();
            return true;
          }
          return false;
        },
        preventDefault: true,
      },
    ]);

    const view = new EditorView({
      doc: initialValue,
      parent: editorRef.current,
      extensions: [
        wrapCompartment.of(lineWrapping ? EditorView.lineWrapping : []),
        minimapCompartment.of(minimapEnabled ? minimap() : []),
        saveKeymap,
        oneDark,
        customTheme,
        customSetup,
        languageExtension,
        suggestion(fileName),
        quickEdit(fileName),
        selectionTooltip(
          {
            projectId,
            fileId,
            fileName,
            filePath: filePath ?? fileName,
            conversationId: conversationIdRef.current,
          },
          (context) => onSelectedCodeRef.current?.(context),
        ),
        keymap.of([indentWithTab]),
        indentationMarkers(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
            const selection = update.state.selection.main;
            const line = update.state.doc.lineAt(selection.head);
            const column = selection.head - line.from + 1;
            const newPos = { line: line.number, column };
            const lastPos = lastReportedCursorRef.current;
            if (!lastPos || lastPos.line !== newPos.line || lastPos.column !== newPos.column) {
              lastReportedCursorRef.current = newPos;
              onCursorPositionChangeRef.current?.(newPos);
            }
          }
        })
      ],
    });

    viewRef.current = view;

    // Report initial cursor position upon mount
    const initialSelection = view.state.selection.main;
    const initialLine = view.state.doc.lineAt(initialSelection.head);
    const initialColumn = initialSelection.head - initialLine.from + 1;
    const initialPos = { line: initialLine.number, column: initialColumn };
    lastReportedCursorRef.current = initialPos;
    onCursorPositionChangeRef.current?.(initialPos);

    return () => {
      view.destroy();
      wrapCompartmentRef.current = null;
      minimapCompartmentRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialValue, initial lineWrapping, and initial minimapEnabled are only used for initial setup
  }, [languageExtension]);

  return (
    <div ref={editorRef} className="size-full pl-4 bg-background" />
  );
};