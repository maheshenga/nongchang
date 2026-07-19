export interface LatestRequestGate {
  begin(): number;
  isLatest(id: number): boolean;
  dispose(): void;
}

export function createLatestRequestGate(): LatestRequestGate {
  let current = 0;
  let disposed = false;

  return {
    begin() {
      current += 1;
      return current;
    },
    isLatest(id: number) {
      return !disposed && id === current;
    },
    dispose() {
      disposed = true;
    },
  };
}
