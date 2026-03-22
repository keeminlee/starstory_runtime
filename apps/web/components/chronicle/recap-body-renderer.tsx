type RecapBlock =
  | { type: "paragraph"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] };

function isUnorderedListItem(line: string): boolean {
  return /^[-*]\s+/.test(line);
}

function isOrderedListItem(line: string): boolean {
  return /^\d+[.)]\s+/.test(line);
}

function stripListMarker(line: string): string {
  return line.replace(/^([-*]|\d+[.)])\s+/, "").trim();
}

function parseRecapBlocks(text: string): RecapBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: RecapBlock[] = [];
  let paragraphLines: string[] = [];
  let listType: "unordered-list" | "ordered-list" | null = null;
  let listItems: string[] = [];

  function flushParagraph(): void {
    if (paragraphLines.length === 0) {
      return;
    }
    blocks.push({
      type: "paragraph",
      text: paragraphLines.join(" ").trim(),
    });
    paragraphLines = [];
  }

  function flushList(): void {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }
    blocks.push({ type: listType, items: [...listItems] });
    listType = null;
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (isOrderedListItem(line)) {
      flushParagraph();
      if (listType !== "ordered-list") {
        flushList();
        listType = "ordered-list";
      }
      listItems.push(stripListMarker(line));
      continue;
    }

    if (isUnorderedListItem(line)) {
      flushParagraph();
      if (listType !== "unordered-list") {
        flushList();
        listType = "unordered-list";
      }
      listItems.push(stripListMarker(line));
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

type RecapBodyRendererProps = {
  text: string;
};

export function RecapBodyRenderer({ text }: RecapBodyRendererProps) {
  const blocks = parseRecapBlocks(text);

  if (blocks.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">No recap exists in this style yet.</p>
        <p className="text-sm text-muted-foreground">Open the full session to regenerate it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[15px] leading-8 text-foreground/92">
      {blocks.map((block, index) => {
        if (block.type === "paragraph") {
          return (
            <p key={`paragraph-${index}`} className="max-w-none whitespace-pre-wrap text-pretty">
              {block.text}
            </p>
          );
        }

        if (block.type === "ordered-list") {
          return (
            <ol key={`ordered-${index}`} className="list-decimal space-y-3 pl-6 marker:text-foreground/55">
              {block.items.map((item, itemIndex) => (
                <li key={`ordered-${index}-${itemIndex}`} className="pl-1">
                  {item}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <ul key={`unordered-${index}`} className="list-disc space-y-3 pl-6 marker:text-foreground/55">
            {block.items.map((item, itemIndex) => (
              <li key={`unordered-${index}-${itemIndex}`} className="pl-1">
                {item}
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}