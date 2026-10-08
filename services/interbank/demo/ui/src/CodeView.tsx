import { useEffect, useMemo, useRef, useState } from "react";
import type { HighlighterCore, ThemedToken } from "shiki/core";
import type { Source } from "./api";

let highlighter: Promise<HighlighterCore> | null = null;
function getHighlighter() {
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(
    ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [import("@shikijs/themes/github-dark-default")],
        langs: [import("@shikijs/langs/python"), import("@shikijs/langs/yaml"), import("@shikijs/langs/sql")],
        engine: createJavaScriptRegexEngine(),
      }),
  );
  return highlighter;
}

export function CodeView({ source }: { source: Source }) {
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const [focus, setFocus] = useState(0);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setTokens(null);
    setFocus(0);
    getHighlighter().then((h) => {
      if (live) setTokens(h.codeToTokensBase(source.code, { lang: source.language as "python", theme: "github-dark-default" }));
    });
    return () => {
      live = false;
    };
  }, [source]);

  const focused = useMemo(() => {
    const lines = new Set<number>();
    for (const range of source.focus) for (let n = range.start; n <= range.end; n++) lines.add(n);
    return lines;
  }, [source]);

  useEffect(() => {
    const range = source.focus[focus];
    const row = range && body.current?.querySelector<HTMLElement>(`[data-line="${range.start}"]`);
    if (row && body.current) body.current.scrollTop = row.offsetTop - 12;
  }, [focus, source, tokens]);

  const lines = tokens ?? source.code.split("\n").map((text) => [{ content: text, offset: 0 } as ThemedToken]);
  const range = source.focus[focus];

  return (
    <div className="code-view">
      <div className="code-meta">
        <span className="code-path">
          {source.path}
          {range ? `:${range.start}–${range.end}` : ""}
        </span>
        <span className="code-note">live file from the running container</span>
      </div>
      {source.focus.length > 1 && (
        <div className="code-symbols">
          {source.focus.map((item, index) => (
            <button key={`${item.label}-${item.start}`} className={index === focus ? "active" : ""} onClick={() => setFocus(index)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="code-body" ref={body}>
        {lines.map((line, index) => {
          const n = index + 1;
          const inRange = range && n >= range.start && n <= range.end;
          return (
            <div key={n} data-line={n} className={`code-line ${focused.has(n) ? "focus" : ""} ${inRange ? "current" : ""}`}>
              <span className="ln">{n}</span>
              <span className="lc">
                {line.map((token, i) => (
                  <span key={i} style={{ color: token.color }}>
                    {token.content}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
