import { L } from "./i18n";

/**
 * The rain rate in words, mm/h.
 */
export function rainWord(rate: number) {
  if (rate < 0.1) return "";
  const k = rate < 2.5 ? 0 : rate < 10 ? 1 : rate < 50 ? 2 : 3;
  return L(
    ["slight", "moderate", "heavy", "violent"][k] + " rain showers",
    ["слабый", "умеренный", "сильный", "очень сильный"][k] + " ливневый дождь"
  );
}

/** The hail by its largest stones, mm. */
export function hailWord(size: number) {
  if (size < 1) return "";
  if (size < 10) return L("small", "мелкий");
  if (size < 20) return L("medium", "средний");
  if (size < 50) return L("large", "крупный");
  return L("very large", "очень крупный");
}

/**
 * The cloud by the international classification.
 */
export function cloudGenus(topKm: number, lclKm: number | null, topTempC: number, elKm: number | null) {
  const depth = topKm - (lclKm ?? 0);
  if (topKm < 1 || depth < 0.2) return "";
  if (topTempC > -20) {
    return depth < 1
      ? L("Cu hum — cumulus humilis", "Cu hum — кучевое плоское")
      : depth < 2.5
      ? L("Cu med — cumulus mediocris", "Cu med — кучевое средней мощности")
      : L("Cu cong — cumulus congestus", "Cu cong — мощное кучевое");
  }
  return elKm !== null && topKm >= elKm - 0.6
    ? L("Cb cap inc — cumulonimbus capillatus with an anvil", "Cb cap inc — кучево-дождевое волосатое с наковальней")
    : L("Cb calv — cumulonimbus calvus", "Cb calv — кучево-дождевое лысое");
}
