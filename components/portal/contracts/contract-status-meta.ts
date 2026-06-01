import {
  Circle,
  Clock,
  CheckCircle2,
  Gavel,
  Stamp,
  PenLine,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import type { ContractStatus } from "@/lib/portal/contracts-db";

// Ikona pro každý stav smlouvy. Sdílené mezi stavovými filtry a stavovými
// chipy v řádcích (i v detailu klienta), ať mají filtr i chip stejný symbol.
export const CONTRACT_STATUS_ICON: Record<ContractStatus, LucideIcon> = {
  koncept: Circle,
  "ke-schvaleni": Clock,
  schvaleno: CheckCircle2,
  "k-podpisu": Gavel,
  "podepsano-bos": Stamp,
  "podepsano-klientem": PenLine,
  archivovano: ScanLine,
};
