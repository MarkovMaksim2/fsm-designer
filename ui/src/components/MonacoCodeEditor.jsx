import Editor from "@monaco-editor/react";

const VERILOG_LANGUAGE_ID = "fsm-verilog";
const VS_THEME_ID = "fsm-vscode";
const LOG_THEME_ID = "fsm-vscode-log";

function registerVerilogLanguage(monaco) {
  if (!monaco.languages.getLanguages().some((language) => language.id === VERILOG_LANGUAGE_ID)) {
    monaco.languages.register({ id: VERILOG_LANGUAGE_ID });
  }

  monaco.languages.setMonarchTokensProvider(VERILOG_LANGUAGE_ID, {
    keywords: [
      "module", "endmodule", "input", "output", "wire", "reg", "logic", "assign",
      "always", "always_ff", "always_comb", "always_latch", "posedge", "negedge",
      "if", "else", "case", "endcase", "begin", "end", "default", "localparam",
      "parameter", "function", "task", "for", "while", "repeat", "generate",
      "endgenerate", "initial",
    ],
    tokenizer: {
      root: [
        [/[a-zA-Z_][\w$]*/, {
          cases: {
            "@keywords": "keyword",
            "@default": "identifier",
          },
        }],
        [/\d+'[bBdDhH][0-9a-fA-F_xXzZ]+/, "number"],
        [/\d+/, "number"],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string"],
        [/[{}()[\]]/, "@brackets"],
        [/(<=|>=|==|!=|<<|>>|&&|\|\||[=+\-*/%<>&|^~!])/, "operator"],
        [/[;,.]/, "delimiter"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
    },
  });

  monaco.editor.defineTheme(VS_THEME_ID, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "c586c0" },
      { token: "identifier", foreground: "d4d4d4" },
      { token: "number", foreground: "b5cea8" },
      { token: "comment", foreground: "6a9955" },
      { token: "string", foreground: "ce9178" },
      { token: "operator", foreground: "d4d4d4" },
    ],
    colors: {
      "editor.background": "#11161c",
      "editor.foreground": "#d4d4d4",
      "editorLineNumber.foreground": "#5b6570",
      "editorLineNumber.activeForeground": "#c8d0d8",
      "editorCursor.foreground": "#e6b450",
      "editor.selectionBackground": "#264f78",
      "editor.inactiveSelectionBackground": "#3a3d4166",
      "editor.lineHighlightBackground": "#ffffff08",
      "editorIndentGuide.background1": "#2a2f36",
      "editorIndentGuide.activeBackground1": "#4c5663",
    },
  });

  monaco.editor.defineTheme(LOG_THEME_ID, {
    base: "vs-dark",
    inherit: true,
    rules: [{ token: "", foreground: "d4d4d4" }],
    colors: {
      "editor.background": "#11161c",
      "editor.foreground": "#d4d4d4",
      "editorLineNumber.foreground": "#5b6570",
      "editorLineNumber.activeForeground": "#5b6570",
      "editorCursor.foreground": "#e6b450",
      "editor.selectionBackground": "#264f78",
      "editor.lineHighlightBackground": "#ffffff08",
    },
  });
}

export default function MonacoCodeEditor({
  className = "",
  height = "24rem",
  language = "verilog",
  onChange,
  readOnly = false,
  value,
}) {
  const resolvedLanguage = language === "verilog" ? VERILOG_LANGUAGE_ID : language;
  const theme = language === "plaintext" ? LOG_THEME_ID : VS_THEME_ID;

  return (
    <div className={`monaco-shell ${className}`.trim()}>
      <Editor
        beforeMount={registerVerilogLanguage}
        height={height}
        language={resolvedLanguage}
        onChange={(nextValue) => onChange?.(nextValue ?? "")}
        options={{
          automaticLayout: true,
          contextmenu: true,
          cursorBlinking: "smooth",
          fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
          fontLigatures: true,
          fontSize: 13,
          lineHeight: 22,
          minimap: { enabled: false },
          padding: { top: 16, bottom: 16 },
          readOnly,
          renderLineHighlight: "all",
          roundedSelection: false,
          scrollbar: {
            alwaysConsumeMouseWheel: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          wordWrap: "on",
        }}
        theme={theme}
        value={value}
      />
    </div>
  );
}
