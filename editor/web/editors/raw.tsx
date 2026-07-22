/**
 * Raw body editor — Monaco (the VS Code engine): syntax highlighting,
 * find/replace, multi-cursor, minimap. Same imperative `getValue` contract as
 * the WYSIWYG editor so the App can swap between them losslessly.
 */
import "./monaco-setup";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { EditorHandle } from "./wysiwyg";

export const Raw = forwardRef<EditorHandle, { initial: string }>(function Raw(
  { initial },
  ref,
) {
  const model = useRef<editor.IStandaloneCodeEditor | null>(null);

  useImperativeHandle(ref, () => ({
    getValue: () => model.current?.getValue() ?? initial,
  }));

  return (
    <Editor
      className="raw"
      defaultLanguage="markdown"
      defaultValue={initial}
      onMount={(ed) => {
        model.current = ed;
      }}
      options={{
        wordWrap: "on",
        minimap: { enabled: true },
        fontSize: 14,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
    />
  );
});
