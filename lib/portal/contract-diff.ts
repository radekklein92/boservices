import { diffWords } from "diff";

export interface DiffResult {
  hasChanges: boolean;
  changeCount: number;
  diffHtml: string;
}

/**
 * Porovná originální (snapshot šablony) HTML s aktuálním HTML smlouvy
 * a vrátí HTML s `<ins>` (přidáno) a `<del>` (smazáno) značkami.
 *
 * Použito v "Přehled změn" modalu a v "PDF s úpravami" generování.
 */
export function htmlDiff(
  original: string,
  current: string,
): DiffResult {
  if (original === current) {
    return { hasChanges: false, changeCount: 0, diffHtml: current };
  }

  const parts = diffWords(original, current);
  let diffHtml = "";
  let changeCount = 0;
  let inChangeRun = false;

  for (const part of parts) {
    if (part.added) {
      diffHtml += `<ins>${part.value}</ins>`;
      if (!inChangeRun) {
        changeCount++;
        inChangeRun = true;
      }
    } else if (part.removed) {
      diffHtml += `<del>${part.value}</del>`;
      if (!inChangeRun) {
        changeCount++;
        inChangeRun = true;
      }
    } else {
      diffHtml += part.value;
      inChangeRun = false;
    }
  }

  return { hasChanges: true, changeCount, diffHtml };
}
