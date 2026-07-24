/**
 * Raw body editor — Monaco (the VS Code engine): syntax highlighting,
 * find/replace, multi-cursor, minimap. Same imperative `getValue` contract as
 * the WYSIWYG editor so the App can swap between them losslessly. Theme
 * follows the OS color scheme live.
 */
import "./monaco-setup";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useSyncExternalStore,
} from "react";
import type { EditorHandle } from "./wysiwyg";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function useSystemDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      darkQuery.addEventListener("change", cb);
      return () => darkQuery.removeEventListener("change", cb);
    },
    () => darkQuery.matches,
  );
}

export const Raw = forwardRef<EditorHandle, { initial: string }>(function Raw(
  { initial },
  ref,
) {
  const model = useRef<editor.IStandaloneCodeEditor | null>(null);
  const dark = useSystemDark();

  useImperativeHandle(ref, () => ({
    getValue: () => model.current?.getValue() ?? initial,
  }));

  return (
    <Editor
      className="raw"
      defaultLanguage="markdown"
      defaultValue={initial}
      theme={dark ? "vs-dark" : "light"}
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
