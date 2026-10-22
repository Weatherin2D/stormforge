import { SoundingSummary } from "../sim/sounding";

/** One readout cell: label, value, optional unit. */
function metric(k: string, v: string, u = "", cls = ""): string {
  const unit = u ? ` <span class="u">${u}</span>` : "";
  return `<div class="metric"><span class="k">${k}</span><span class="v ${cls}">${v}${unit}</span></div>`;
}

/** Metres to a "1.2" km string, or an em dash when the level is absent. */
function km(m: number): string {
  return m > 0 ? (m / 1000).toFixed(1) : "—";
}

/**
 * Render the sounding readouts into a metrics element.
 * Shared by the Skew-T and the Hodograph so both views agree.
 */
export function renderSoundingMetrics(
  el: HTMLElement | null,
  s: SoundingSummary,
): void {
  if (!el) return;
  const capeCls = s.cape >= 2000 ? "hot" : s.cape >= 1000 ? "warm" : "ok";
  const cinCls = s.cin >= 100 ? "warn" : s.cin >= 50 ? "warm" : "ok";
  const srhCls = s.srh1km >= 150 ? "hot" : s.srh1km >= 75 ? "warm" : "ok";
  const shearCls = s.shear0to6 >= 15 ? "hot" : s.shear0to6 >= 8 ? "warm" : "ok";
  const pwCls = s.pwMm >= 50 ? "hot" : s.pwMm >= 30 ? "warm" : "ok";

  el.innerHTML = [
    metric("T sfc", s.tSfcC.toFixed(1), "°C"),
    metric("Td sfc", s.tdSfcC.toFixed(1), "°C"),
    metric("RH", s.rhSfc.toFixed(0), "%"),
    metric("θe sfc", s.thetaeSfcK.toFixed(0), "K"),
    metric("CAPE", Math.round(s.cape).toLocaleString(), "J/kg", capeCls),
    metric("CIN", Math.round(s.cin).toLocaleString(), "J/kg", cinCls),
    metric("CAPE 0-3", Math.round(s.cape0to3).toLocaleString(), "J/kg"),
    metric("LCL", km(s.lclM), "km"),
    metric("LFC", km(s.lfcM), "km"),
    metric("EL", km(s.elM), "km"),
    metric("Shear 0-6", s.shear0to6.toFixed(1), "m/s", shearCls),
    metric("SRH 0-1", s.srh1km.toFixed(0), "m²/s²", srhCls),
    metric("SRH 0-3", s.srh3km.toFixed(0), "m²/s²"),
    metric("Max wind", s.maxWindSpd.toFixed(0), "m/s"),
    metric("Freezing", km(s.freezingM), "km"),
    metric("Precip W", s.pwMm.toFixed(1), "mm", pwCls),
  ].join("");
}

/**
 * Wind-focused readouts for the Hodograph pane.
 * Kept separate from the thermodynamic set so each view shows what matters.
 */
export function renderWindMetrics(
  el: HTMLElement | null,
  s: SoundingSummary,
): void {
  if (!el) return;
  const shearCls = s.shear0to6 >= 15 ? "hot" : s.shear0to6 >= 8 ? "warm" : "ok";
  const srhCls = s.srh1km >= 150 ? "hot" : s.srh1km >= 75 ? "warm" : "ok";

  el.innerHTML = [
    metric("Sfc wind", s.sfcWindSpd.toFixed(0), "m/s"),
    metric("Sfc dir", s.sfcWindDir.toFixed(0), "°"),
    metric("Shear 0-1", s.shear0to1.toFixed(1), "m/s"),
    metric("Shear 0-3", s.shear0to3.toFixed(1), "m/s"),
    metric("Shear 0-6", s.shear0to6.toFixed(1), "m/s", shearCls),
    metric("SRH 0-1", s.srh1km.toFixed(0), "m²/s²", srhCls),
    metric("SRH 0-3", s.srh3km.toFixed(0), "m²/s²"),
    metric("Max wind", s.maxWindSpd.toFixed(0), "m/s"),
    metric("Max at", km(s.maxWindM), "km"),
    metric("Storm motion", s.stormMotionSpd.toFixed(0), "m/s"),
    metric("Motion dir", s.stormMotionDir.toFixed(0), "°"),
    metric("CAPE", Math.round(s.cape).toLocaleString(), "J/kg"),
  ].join("");
}
