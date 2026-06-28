import type { LocationConcept } from "@/lib/portal/locations-db";

// Sdílené typy filtru POS (client-safe). Loader (server) je naplní, klientský
// PosFilterBar a jeho podkomponenty je konzumují. Labely se počítají v loaderu,
// ať se do klientského bundlu netáhne CONCEPT_LABEL/Chip.

export interface StoreOption {
  id: string; // locationId, nebo "shop:{dwShopId}" pro nenapárovanou pokladnu
  name: string;
}

export interface ConceptGroup {
  concept: LocationConcept;
  label: string;
  locations: StoreOption[];
}

export interface CityOption {
  city: string;
  count: number; // počet prodejen ve městě
}

export interface ViewLite {
  id: string;
  name: string;
  filter: string; // serializovaný query string (bez "?")
  shared: boolean;
  ownerEmail: string;
}

export interface ViewsData {
  own: ViewLite[];
  shared: ViewLite[];
  defaultId: string | null;
}

export interface MeInfo {
  email: string;
  isAdmin: boolean;
}

export interface FilterBarData {
  concepts: ConceptGroup[];
  cities: CityOption[];
  unpaired: StoreOption[]; // nenapárované pokladny (token "shop:{id}")
  currencies: string[]; // zobrazovací měny v dropdownu (vše se do zvolené přepočte přes FX)
  views: ViewsData;
  me: MeInfo;
}
