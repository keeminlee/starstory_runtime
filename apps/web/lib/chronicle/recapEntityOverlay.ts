import type {
  EntityCandidateDto,
  RegistryCategoryKey,
  RegistryEntityDto,
  RegistrySnapshotDto,
} from "@/lib/registry/types";
import type { RecapSpan } from "@/lib/types";

export type ChronicleDisplaySpan =
  | { type: "text"; text: string }
  | { type: "entity"; text: string; entityId: string; category: RegistryCategoryKey }
  | { type: "candidate"; text: string; candidateName: string };

type CanonicalMatcher = {
  kind: "canonical";
  phrase: string;
  entityId: string;
  category: RegistryCategoryKey;
  sortKey: string;
};

type CandidateMatcher = {
  kind: "candidate";
  phrase: string;
  candidateName: string;
  sortKey: string;
};

type PhraseMatcher = CanonicalMatcher | CandidateMatcher;

type PhraseMatch = {
  start: number;
  end: number;
  length: number;
  matcher: PhraseMatcher;
};

const CATEGORY_ORDER: RegistryCategoryKey[] = ["pcs", "npcs", "locations", "factions", "misc"];
const WORD_LIKE_RE = /[\p{L}\p{N}]/u;

function isWordLike(char: string | undefined): boolean {
  return Boolean(char && WORD_LIKE_RE.test(char));
}

function hasPhraseBoundaries(text: string, start: number, length: number): boolean {
  const before = start > 0 ? text[start - 1] : undefined;
  const after = start + length < text.length ? text[start + length] : undefined;
  return !isWordLike(before) && !isWordLike(after);
}

function compareMatchers(left: PhraseMatcher, right: PhraseMatcher): number {
  if (left.kind !== right.kind) {
    return left.kind === "canonical" ? -1 : 1;
  }
  if (left.phrase.length !== right.phrase.length) {
    return right.phrase.length - left.phrase.length;
  }
  return left.sortKey.localeCompare(right.sortKey);
}

function buildCanonicalMatchers(registry: RegistrySnapshotDto | null | undefined): CanonicalMatcher[] {
  if (!registry) {
    return [];
  }

  const entries: Array<{ phrase: string; entity: RegistryEntityDto; sortKey: string }> = [];
  for (const category of CATEGORY_ORDER) {
    for (const entity of registry.categories[category]) {
      const phrases = [entity.canonicalName, ...entity.aliases]
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      for (const phrase of phrases) {
        entries.push({
          phrase,
          entity,
          sortKey: `${category}:${entity.id}:${phrase}`,
        });
      }
    }
  }

  entries.sort((left, right) => {
    if (left.phrase.length !== right.phrase.length) {
      return right.phrase.length - left.phrase.length;
    }
    return left.sortKey.localeCompare(right.sortKey);
  });

  const seen = new Set<string>();
  const matchers: CanonicalMatcher[] = [];
  for (const entry of entries) {
    if (seen.has(entry.phrase)) {
      continue;
    }
    seen.add(entry.phrase);
    matchers.push({
      kind: "canonical",
      phrase: entry.phrase,
      entityId: entry.entity.id,
      category: entry.entity.category,
      sortKey: entry.sortKey,
    });
  }

  return matchers;
}

function buildCandidateMatchers(candidates: EntityCandidateDto[] | undefined): CandidateMatcher[] {
  if (!candidates) {
    return [];
  }

  const unresolved = candidates
    .filter((candidate) => candidate.resolution === null)
    .map((candidate) => candidate.candidateName.trim())
    .filter((candidateName) => candidateName.length > 0)
    .sort((left, right) => {
      if (left.length !== right.length) {
        return right.length - left.length;
      }
      return left.localeCompare(right);
    });

  const seen = new Set<string>();
  const matchers: CandidateMatcher[] = [];
  for (const candidateName of unresolved) {
    if (seen.has(candidateName)) {
      continue;
    }
    seen.add(candidateName);
    matchers.push({
      kind: "candidate",
      phrase: candidateName,
      candidateName,
      sortKey: candidateName,
    });
  }

  return matchers;
}

function collectMatches(text: string, matchers: PhraseMatcher[]): PhraseMatch[] {
  const matches: PhraseMatch[] = [];

  for (const matcher of matchers) {
    let fromIndex = 0;
    while (fromIndex < text.length) {
      const matchIndex = text.indexOf(matcher.phrase, fromIndex);
      if (matchIndex === -1) {
        break;
      }

      if (hasPhraseBoundaries(text, matchIndex, matcher.phrase.length)) {
        matches.push({
          start: matchIndex,
          end: matchIndex + matcher.phrase.length,
          length: matcher.phrase.length,
          matcher,
        });
      }

      fromIndex = matchIndex + 1;
    }
  }

  matches.sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    const matcherComparison = compareMatchers(left.matcher, right.matcher);
    if (matcherComparison !== 0) {
      return matcherComparison;
    }
    return left.matcher.phrase.localeCompare(right.matcher.phrase);
  });

  return matches;
}

function selectMatches(matches: PhraseMatch[]): PhraseMatch[] {
  const selected: PhraseMatch[] = [];
  let cursor = 0;
  let index = 0;

  while (index < matches.length) {
    while (index < matches.length && matches[index].end <= cursor) {
      index += 1;
    }
    if (index >= matches.length) {
      break;
    }

    const nextStart = matches[index].start;
    if (nextStart < cursor) {
      index += 1;
      continue;
    }

    let best = matches[index];
    let lookahead = index + 1;
    while (lookahead < matches.length && matches[lookahead].start === nextStart) {
      const candidate = matches[lookahead];
      if (compareMatchers(candidate.matcher, best.matcher) < 0) {
        best = candidate;
      }
      lookahead += 1;
    }

    selected.push(best);
    cursor = best.end;
    index = lookahead;
  }

  return selected;
}

export function overlayChronicleText(args: {
  text: string;
  registry?: RegistrySnapshotDto | null;
  candidates?: EntityCandidateDto[];
}): ChronicleDisplaySpan[] {
  if (args.text.length === 0) {
    return [{ type: "text", text: "" }];
  }

  const canonicalMatchers = buildCanonicalMatchers(args.registry);
  const candidateMatchers = buildCandidateMatchers(args.candidates);
  const matches = selectMatches(collectMatches(args.text, [...canonicalMatchers, ...candidateMatchers]));

  if (matches.length === 0) {
    return [{ type: "text", text: args.text }];
  }

  const spans: ChronicleDisplaySpan[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      spans.push({ type: "text", text: args.text.slice(cursor, match.start) });
    }

    const matchedText = args.text.slice(match.start, match.end);
    if (match.matcher.kind === "canonical") {
      spans.push({
        type: "entity",
        text: matchedText,
        entityId: match.matcher.entityId,
        category: match.matcher.category,
      });
    } else {
      spans.push({
        type: "candidate",
        text: matchedText,
        candidateName: match.matcher.candidateName,
      });
    }
    cursor = match.end;
  }

  if (cursor < args.text.length) {
    spans.push({ type: "text", text: args.text.slice(cursor) });
  }

  return spans;
}

export function overlayChronicleRecapSpans(args: {
  spans: RecapSpan[];
  registry?: RegistrySnapshotDto | null;
  candidates?: EntityCandidateDto[];
}): ChronicleDisplaySpan[] {
  const output: ChronicleDisplaySpan[] = [];
  for (const span of args.spans) {
    if (span.type === "entity") {
      output.push(span);
      continue;
    }
    output.push(...overlayChronicleText({
      text: span.text,
      registry: args.registry,
      candidates: args.candidates,
    }));
  }
  return output;
}