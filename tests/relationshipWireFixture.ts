import { RELATIONSHIP_WIRE_SCHEMA } from "../consolidation/relationshipContract";

/** Explicit synthetic wire reply. Legacy fixtures remain internal quote-format fixtures. */
export function relationshipWireFixture<T extends { claims: { quoteA: string | null; quoteB: string | null }[] }>(response: T, user: string) {
  const request = JSON.parse(user) as { evidence: { id: string; side: string; text: string }[] };
  const internal = structuredClone(response);
  return { ...internal, schema: RELATIONSHIP_WIRE_SCHEMA, claims: internal.claims.map(({ quoteA, quoteB, ...claim }) => {
    const reference = (side: string, quote: string | null) => {
      if (quote === null) return null;
      const entries = request.evidence.filter(f => f.side === side);
      const entry = entries.find(f => f.text === quote) ?? entries.find(f => f.text.includes(quote)) ?? entries.find(f => quote.includes(f.text));
      if (!entry) throw Error(`Synthetic fixture has no ${side} evidence fragment`);
      return entry.id;
    };
    return { ...claim, evidenceA: reference("A", quoteA), evidenceB: reference("B", quoteB) };
  }) };
}

export function relationshipFixtureUser(body: string): string {
  return (JSON.parse(body) as { messages: { content: string }[] }).messages[1].content;
}
