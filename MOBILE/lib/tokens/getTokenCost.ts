// Local-first: always return cost 0 (unlimited tokens)
export async function getTokenCost(_event: string): Promise<number> {
  return 0;
}


