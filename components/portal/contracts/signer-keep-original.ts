// Sentinel pro volbu „Zachovat původního podepisujícího" v SignerPickerModal.
// Když je vybrána, smlouva se posune do stavu K podpisu, ale NEnastaví se
// signerEmail -> v PDF se nepřepíše zástupce uvedený přímo ve smlouvě
// (např. Mgr. Petr Zapletal na základě plné moci u postoupení).
export const KEEP_ORIGINAL_SIGNER = "__keep_original__";
