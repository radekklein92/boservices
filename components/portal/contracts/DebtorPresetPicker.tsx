"use client";

import { CompanyChipPicker, type CompanyFillPayload } from "./CompanyChipPicker";

export interface DebtorFillPayload {
  debtorName: string;
  debtorIco: string;
  debtorStreet: string;
  debtorCity: string;
  debtorZip: string;
}

// Tenký wrapper nad CompanyChipPicker, který mapuje obecné field-names
// (name/ico/street/city/zip) na konkrétní debtor* placeholdery.
export function DebtorPresetPicker({
  selectedIco,
  onFill,
}: {
  selectedIco?: string;
  onFill: (payload: DebtorFillPayload) => void;
}) {
  return (
    <CompanyChipPicker
      selectedIco={selectedIco}
      addLabel="Jiná firma"
      modalTitle="Vyhledat firmu v ARES"
      modalEyebrow="Dlužník mimo presety"
      onFill={(p: CompanyFillPayload) =>
        onFill({
          debtorName: p.name,
          debtorIco: p.ico,
          debtorStreet: p.street,
          debtorCity: p.city,
          debtorZip: p.zip,
        })
      }
    />
  );
}
