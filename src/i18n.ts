// Bilingual strings for the Stormforge UI.
// Default to English; can be toggled.

let current: "en" | "ru" = "en";

export const lang = () => current;
export const setLang = (l: "en" | "ru") => { current = l; };
export const L = (en: string, ru: string) => current === "ru" ? ru : en;

export const decimal = (v: number, digits: number) => {
  const s = v.toFixed(digits);
  return current === "ru" ? s.replace(".", ",") : s;
};
