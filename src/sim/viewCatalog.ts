/**
 * Complete 2D view catalog for the weather sandbox.
 *
 * Every entry carries its provenance (simulated / derived / externally
 * supplied / visual-only), its vertical convention, units, and — for derived
 * diagnostics — the formula and assumptions.  Entries without a `productId`
 * are listed for completeness but are NOT plotted: the map panel must never
 * show a diagnostic before its inputs and formula have been implemented.
 */
import type { MapProductId } from "./mapProducts";

export type ViewCategory =
  | "thermodynamics"
  | "wind"
  | "storm"
  | "clouds"
  | "radar"
  | "lightning"
  | "surface"
  | "history";

export type ViewProvenance = "simulated" | "derived" | "external" | "visual";

/** Vertical convention used by the view. */
export type ViewLevelKind =
  | "surface"
  | "pressure"
  | "column"
  | "slice"
  | "profile"
  | "time";

export interface CatalogView {
  id: string;
  label: string;
  category: ViewCategory;
  section: string;
  provenance: ViewProvenance;
  level: string;
  levelKind: ViewLevelKind;
  units: string;
  /** Short definition, shown in the search result tooltip/detail. */
  definition?: string;
  /** Formula / algorithm for derived diagnostics. */
  formula?: string;
  /** Known assumptions, limitations, or missing inputs. */
  assumptions?: string;
  /** Extra search terms. */
  aliases?: string;
  /** Live map product, when implemented. */
  productId?: MapProductId;
  /** Member of the recommended initial-release core set. */
  core?: boolean;
}

export const VIEW_CATEGORY_LABELS: Record<ViewCategory, string> = {
  thermodynamics: "Thermodynamics",
  wind: "Wind & dynamics",
  storm: "Storm ingredients",
  clouds: "Clouds",
  radar: "Radar & precipitation",
  lightning: "Lightning",
  surface: "Surface & terrain",
  history: "History & diagnostics",
};

export const VIEW_PROVENANCE_LABELS: Record<ViewProvenance, string> = {
  simulated: "Simulated",
  derived: "Derived",
  external: "External",
  visual: "Visual only",
};

export const VIEW_LEVEL_LABELS: Record<ViewLevelKind, string> = {
  surface: "Surface",
  pressure: "Pressure level",
  column: "Column-derived",
  slice: "Horizontal slice",
  profile: "Profile / cross-section",
  time: "Time window",
};

const S1 = "1. Atmospheric instability and storm potential";
const S2 = "2. Moisture and humidity";
const S3 = "3. Temperature and atmospheric thermodynamics";
const S4 = "4. Wind, shear and storm organisation";
const S5 = "5. Storm initiation, boundaries and convergence";
const S6 = "6. Clouds and vertical cloud structure";
const S6B = "6b. Satellite imagery (visual)";
const S7 = "7. Precipitation, rain and hail";
const S8 = "8. Lightning and electrical activity";
const S9 = "9. Severe-weather diagnostics";
const S10 = "10. Atmospheric circulation and synoptic weather";
const S11 = "11. Surface, terrain and land–atmosphere interaction";
const S12 = "12. Time evolution and simulation debugging";

function V(
  section: string,
  category: ViewCategory,
  id: string,
  label: string,
  provenance: ViewProvenance,
  level: string,
  levelKind: ViewLevelKind,
  units: string,
  extra: Partial<CatalogView> = {},
): CatalogView {
  return { section, category, id, label, provenance, level, levelKind, units, ...extra };
}

export const VIEW_CATALOG: CatalogView[] = [
  // ── 1. Instability ─────────────────────────────────────────────────────────
  V(S1, "thermodynamics", "cape", "CAPE (general)", "derived", "column", "column", "J/kg", {
    productId: "cape",
    core: true,
    definition: "Convective available potential energy of a lifted parcel.",
    formula: "∫ g·(Tp − Te)/Te dz over layers where the parcel is warmer than the environment.",
    assumptions: "Surface parcel; dry ascent to the LCL then a moist adiabat; no entrainment, ice, or parcel dilution.",
    aliases: "convective available potential energy buoyancy",
  }),
  V(S1, "thermodynamics", "cape03", "CAPE 0–3 km", "derived", "0–3 km", "column", "J/kg", {
    productId: "cape03",
    core: true,
    definition: "CAPE accumulated only through the lowest 3 km above the surface.",
    formula: "∫ g·(Tp − Te)/Te dz from the surface to 3 km AGL, where the parcel is warmer than the environment.",
    assumptions: "Surface parcel; same integrator as CAPE restricted to 0–3 km. No entrainment, ice, or parcel dilution.",
    aliases: "low level cape 0-3 km",
  }),
  V(S1, "thermodynamics", "mlcape", "MLCAPE — mixed-layer CAPE", "derived", "column", "column", "J/kg", {
    definition: "CAPE for a parcel averaged over the lowest 100 hPa.",
    assumptions: "Not implemented. Needs a mixed-layer parcel routine; the current integrator only lifts a surface parcel.",
    aliases: "mixed layer cape",
  }),
  V(S1, "thermodynamics", "mucape", "MUCAPE — most-unstable CAPE", "derived", "column", "column", "J/kg", {
    definition: "CAPE of the parcel with the highest equivalent potential temperature.",
    assumptions: "Not implemented. Needs a most-unstable parcel search through the column.",
    aliases: "most unstable cape",
  }),
  V(S1, "thermodynamics", "sbcape", "SBCAPE — surface-based CAPE", "derived", "column", "column", "J/kg", {
    productId: "cape",
    core: true,
    definition: "CAPE for a parcel lifted from the lowest model level.",
    formula: "Same integrator as CAPE; parcel starts at the surface T and Td.",
    assumptions: "No entrainment or ice. The surface is the lowest model level, not a true 2 m observation.",
    aliases: "surface based cape",
  }),
  V(S1, "thermodynamics", "cin", "CIN / CINH — convective inhibition", "derived", "column", "column", "J/kg", {
    productId: "cin",
    core: true,
    definition: "Energy needed to lift a parcel to its level of free convection.",
    formula: "∫ g·(Te − Tp)/Te dz below the LFC while the parcel is cooler than the environment.",
    assumptions: "Surface parcel; positive magnitude; stops accumulating above the LFC.",
    aliases: "inhibition cap",
  }),
  V(S1, "thermodynamics", "li", "Lifted Index (LI)", "derived", "500 hPa", "pressure", "K", {
    core: true,
    definition: "500 hPa environment temperature minus the lifted-parcel temperature.",
    formula: "LI = T500(env) − T500(parcel)",
    assumptions: "Not implemented. Requires a parcel lifted to 500 hPa from the surface.",
    aliases: "lifted index",
  }),
  V(S1, "thermodynamics", "showalter", "Showalter Index", "derived", "850–500 hPa", "pressure", "K", {
    definition: "Stability index using an 850 hPa parcel lifted to 500 hPa.",
    assumptions: "Not implemented. Needs 850 hPa parcel thermodynamics.",
  }),
  V(S1, "thermodynamics", "k-index", "K Index", "derived", "850–500 hPa", "pressure", "K", {
    definition: "Thunderstorm potential from the 850–500 hPa temperature lapse and low-level moisture.",
    formula: "KI = (T850 − T500) + Td850 − (T700 − Td700)",
    assumptions: "Not implemented. Needs 700/850 hPa temperature and dewpoint extraction.",
    aliases: "k index",
  }),
  V(S1, "thermodynamics", "total-totals", "Total Totals Index (TT)", "derived", "850–500 hPa", "pressure", "K", {
    definition: "Combined lapse-rate and moisture index.",
    formula: "TT = T850 + Td850 − 2·T500",
    assumptions: "Not implemented.",
    aliases: "total totals",
  }),
  V(S1, "thermodynamics", "lapse-700-500", "700–500 hPa lapse rate", "derived", "700–500 hPa", "pressure", "K/km", {
    definition: "Environmental temperature lapse rate between 700 and 500 hPa.",
    assumptions: "Not implemented. Requires pressure-level interpolation.",
    aliases: "mid-level lapse rate",
  }),
  V(S1, "thermodynamics", "lapse-0-3", "0–3 km lapse rate", "derived", "0–3 km", "profile", "K/km", {
    definition: "Low-level environmental temperature lapse rate.",
    assumptions: "Not implemented.",
    aliases: "low level lapse rate",
  }),
  V(S1, "thermodynamics", "t700", "Temperature at 700 hPa", "simulated", "700 hPa", "pressure", "°C", {
    definition: "Model temperature interpolated to 700 hPa.",
    assumptions: "Not implemented as a separate map product.",
  }),
  V(S1, "thermodynamics", "t500", "Temperature at 500 hPa", "simulated", "500 hPa", "pressure", "°C", {
    definition: "Model temperature interpolated to 500 hPa.",
    assumptions: "Not implemented as a separate map product.",
  }),
  V(S1, "thermodynamics", "frz", "Freezing-level height", "derived", "column", "column", "m", {
    productId: "frz",
    core: true,
    definition: "Lowest height where the environmental temperature reaches 0 °C.",
    formula: "Linear interpolation between the model levels bracketing T = 273.15 K.",
    assumptions: "Uses the environment, not a lifted parcel; no sub-grid temperature variability.",
    aliases: "0c level melting level freezing",
  }),
  V(S1, "thermodynamics", "wbz", "Wet-bulb-zero height", "derived", "column", "column", "m", {
    definition: "Height where the wet-bulb temperature reaches 0 °C.",
    assumptions: "Not implemented. The model stores no wet-bulb temperature; needs a psychrometric solve.",
    aliases: "wbz wet bulb zero",
  }),
  V(S1, "thermodynamics", "el", "Equilibrium Level (EL)", "derived", "column", "column", "m", {
    productId: "el",
    definition: "Height where a lifted parcel becomes colder than the environment.",
    formula: "Highest level reached by the surface-parcel buoyancy integration.",
    assumptions: "Surface parcel; no entrainment or ice.",
  }),
  V(S1, "thermodynamics", "lfc", "Level of Free Convection (LFC)", "derived", "column", "column", "m", {
    productId: "lfc",
    definition: "Height where a lifted parcel first becomes warmer than the environment.",
    formula: "First level with positive buoyancy in the surface-parcel integration.",
    assumptions: "Surface parcel; no entrainment or ice.",
  }),
  V(S1, "thermodynamics", "lcl", "Lifting Condensation Level (LCL)", "derived", "column", "column", "m", {
    productId: "lcl",
    core: true,
    definition: "Height where a surface parcel reaches saturation.",
    formula: "z_LCL ≈ 125 m per °C of surface T − Td.",
    assumptions: "Empirical estimate; ignores the actual pressure-dependent lapse rate.",
    aliases: "cloud base condensation level",
  }),
  V(S1, "thermodynamics", "conv-temp", "Convective temperature", "derived", "surface", "surface", "°C", {
    definition: "Surface temperature needed to remove the remaining CIN.",
    assumptions: "Not implemented.",
  }),
  V(S1, "thermodynamics", "parcel-buoyancy", "Parcel buoyancy", "derived", "profile", "profile", "m/s²", {
    definition: "Local buoyancy of a lifted parcel relative to the environment.",
    formula: "B = g·(Tp − Te)/Te",
    assumptions: "Not implemented as a map. Available inside the CAPE integrator.",
  }),
  V(S1, "thermodynamics", "pos-neg-buoyancy", "Positive and negative buoyancy", "derived", "profile", "profile", "J/kg", {
    definition: "Separate integrals of positive and negative parcel buoyancy.",
    assumptions: "Not implemented separately; CAPE and CIN already split the integral.",
  }),
  V(S1, "thermodynamics", "dcape", "DCAPE — downdraft convective available potential energy", "derived", "column", "column", "J/kg", {
    core: true,
    definition: "Potential negative buoyancy available to a descending downdraft parcel.",
    assumptions: "Not implemented. Needs a downdraft parcel (e.g. minimum θe in the lowest 3 km) and moist descent.",
    aliases: "downdraft cape",
  }),
  V(S1, "thermodynamics", "cape-shear", "CAPE × shear diagnostic", "derived", "column", "column", "J·m/(kg·s)", {
    definition: "Composite of CAPE and deep-layer shear.",
    formula: "CAPE × 0–6 km bulk shear",
    assumptions: "Not implemented.",
  }),
  V(S1, "thermodynamics", "cape-tendency", "CAPE tendency", "derived", "time", "time", "J/kg/min", {
    definition: "Rate of change of column CAPE.",
    assumptions: "Not implemented. Needs a stored CAPE history at a fixed interval.",
  }),
  V(S1, "thermodynamics", "cin-tendency", "CIN erosion / CIN tendency", "derived", "time", "time", "J/kg/min", {
    definition: "Rate at which convective inhibition is removed or rebuilt.",
    assumptions: "Not implemented. Needs a stored CIN history.",
  }),

  // ── 2. Moisture ────────────────────────────────────────────────────────────
  V(S2, "thermodynamics", "td2m", "2 m dew point", "simulated", "surface (lowest level)", "surface", "°C", {
    productId: "td",
    core: true,
    definition: "Dew point from the lowest model-level vapour mixing ratio.",
    formula: "e = qv·p/(0.622 + qv); Td = 243.5·ln(e/611.2)/(17.67 − ln(e/611.2))",
    assumptions: "Lowest model level is used in place of a true 2 m diagnostic.",
    aliases: "dewpoint surface moisture",
  }),
  V(S2, "thermodynamics", "td-select", "Dew point at selectable pressure levels", "simulated", "selectable", "pressure", "°C", {
    definition: "Pressure-level dew point with a user-chosen level.",
    assumptions: "Selectable level UI is not implemented; fixed 850 hPa view is available.",
  }),
  V(S2, "thermodynamics", "td925", "Dew point at 925 hPa", "simulated", "925 hPa", "pressure", "°C", {
    definition: "Dew point interpolated to 925 hPa.",
    assumptions: "Not implemented as a separate map product.",
  }),
  V(S2, "thermodynamics", "td850", "Dew point at 850 hPa", "simulated", "850 hPa", "pressure", "°C", {
    productId: "td850",
    definition: "Dew point sampled on the model level nearest 850 hPa.",
    formula: "e = qv·p/(0.622 + qv); Td from the Magnus formula.",
    assumptions: "Nearest-level sampling, no vertical interpolation.",
  }),
  V(S2, "thermodynamics", "td700", "Dew point at 700 hPa", "simulated", "700 hPa", "pressure", "°C", {
    definition: "Dew point interpolated to 700 hPa.",
    assumptions: "Not implemented as a separate map product.",
  }),
  V(S2, "thermodynamics", "td500", "Dew point at 500 hPa", "simulated", "500 hPa", "pressure", "°C", {
    definition: "Dew point interpolated to 500 hPa.",
    assumptions: "Not implemented as a separate map product.",
  }),
  V(S2, "thermodynamics", "dewpoint-depression", "Dew-point depression", "derived", "surface (lowest level)", "surface", "°C", {
    definition: "Temperature minus dew point.",
    formula: "T − Td",
    assumptions: "Not implemented as a map product.",
  }),
  V(S2, "thermodynamics", "rh-surface", "Relative humidity at the surface", "derived", "surface (lowest level)", "surface", "%", {
    productId: "rh",
    core: true,
    definition: "Vapour mixing ratio divided by the saturation mixing ratio.",
    formula: "RH = 100·qv / qsat(T, p)",
    assumptions: "Lowest model level; saturation with respect to liquid water only.",
    aliases: "humidity relative",
  }),
  V(S2, "thermodynamics", "rh-select", "Relative humidity at selectable levels", "derived", "selectable", "pressure", "%", {
    definition: "Relative humidity on a user-chosen pressure level.",
    assumptions: "Not implemented as a selectable product.",
  }),
  V(S2, "thermodynamics", "specific-humidity", "Specific humidity", "simulated", "profile", "profile", "kg/kg", {
    definition: "Mass of water vapour per mass of moist air.",
    formula: "q = qv / (1 + qv)",
    assumptions: "Not implemented as a map product.",
  }),
  V(S2, "thermodynamics", "mixing-ratio", "Water-vapour mixing ratio", "simulated", "profile", "profile", "kg/kg", {
    definition: "Mass of water vapour per mass of dry air (the model's qv).",
    assumptions: "Not implemented as a map product.",
  }),
  V(S2, "thermodynamics", "pwat", "Precipitable water (PWAT)", "derived", "column", "column", "mm", {
    productId: "pwat",
    core: true,
    definition: "Total column water vapour expressed as an equivalent liquid depth.",
    formula: "PWAT = Σ ρ·qv·dz; 1 kg/m² = 1 mm",
    assumptions: "Dry-air density from the base state; no satellite weighting function.",
    aliases: "pwat total precipitable water",
  }),
  V(S2, "thermodynamics", "moisture-flux", "Low-level moisture flux", "derived", "0–1 km", "profile", "kg/(m·s)", {
    definition: "Horizontal transport of water vapour by the low-level wind.",
    assumptions: "Not implemented.",
  }),
  V(S2, "thermodynamics", "moisture-convergence", "Moisture convergence", "derived", "surface", "surface", "10⁻⁶ kg kg⁻¹ s⁻¹", {
    productId: "mconv",
    core: true,
    definition: "Convergence of the surface water-vapour flux.",
    formula: "−∇·(qv·V), scaled by 10⁶",
    assumptions: "Centred finite differences on the lowest model level. Convergence is positive.",
    aliases: "moisture convergence flux",
  }),
  V(S2, "thermodynamics", "moisture-profile", "Vertical moisture profile", "simulated", "profile", "profile", "kg/kg", {
    definition: "qv as a function of height.",
    assumptions: "Not implemented as a 2D view; see the sounding panel.",
  }),
  V(S2, "thermodynamics", "dry-intrusion", "Dry-air intrusion / mid-level dryness", "derived", "700–500 hPa", "profile", "%", {
    definition: "Mid-level dew-point depression or dry-layer indicator.",
    assumptions: "Not implemented.",
  }),
  V(S2, "thermodynamics", "evap-potential", "Evaporation potential", "derived", "surface", "surface", "mm/h", {
    definition: "Potential evaporation implied by the surface energy balance.",
    assumptions: "Not implemented; the surface energy balance is not fully resolved.",
  }),
  V(S2, "clouds", "cloud-base", "Cloud-base height", "derived", "column", "column", "m", {
    productId: "cbase",
    definition: "Lowest model level containing cloud or rain water.",
    formula: "First level with qc + qr > 1×10⁻⁴ kg/kg",
    assumptions: "Detects the first hydrometeor level, not a thermodynamic LCL.",
  }),
  V(S2, "thermodynamics", "bl-humidity", "Boundary-layer humidity", "derived", "0–1 km", "profile", "kg/kg", {
    definition: "Mean water-vapour mixing ratio in the boundary layer.",
    assumptions: "Not implemented.",
  }),

  // ── 3. Temperature and thermodynamics ──────────────────────────────────────
  V(S3, "thermodynamics", "t2m", "2 m air temperature", "simulated", "surface (lowest level)", "surface", "°C", {
    productId: "tsfc",
    core: true,
    definition: "Temperature of the lowest model level from potential temperature.",
    formula: "T = θ·(p/p₀)^(R/cp)",
    assumptions: "Lowest model level is used in place of a true 2 m diagnostic.",
    aliases: "temperature surface",
  }),
  V(S3, "thermodynamics", "t1000", "Temperature at 1000 hPa", "simulated", "1000 hPa", "pressure", "°C", {
    definition: "Temperature on the model level nearest 1000 hPa.",
    assumptions: "Not implemented as a separate product.",
  }),
  V(S3, "thermodynamics", "t925", "Temperature at 925 hPa", "simulated", "925 hPa", "pressure", "°C", {
    definition: "Temperature on the model level nearest 925 hPa.",
    assumptions: "Not implemented as a separate product.",
  }),
  V(S3, "thermodynamics", "t850", "Temperature at 850 hPa", "simulated", "850 hPa", "pressure", "°C", {
    productId: "t850",
    core: true,
    definition: "Temperature on the model level nearest 850 hPa.",
    formula: "T = θ·(p/p₀)^(R/cp)",
    assumptions: "Nearest-level sampling, no vertical interpolation.",
  }),
  V(S3, "thermodynamics", "theta", "Potential temperature (θ)", "simulated", "profile", "profile", "K", {
    definition: "Temperature a parcel would have if brought adiabatically to 1000 hPa.",
    formula: "θ = T·(p₀/p)^(R/cp)",
    assumptions: "Not implemented as a map product.",
  }),
  V(S3, "thermodynamics", "thetae", "Equivalent potential temperature (θe)", "derived", "surface (lowest level)", "surface", "K", {
    productId: "thetae",
    definition: "Potential temperature after all vapour has condensed out.",
    formula: "θe ≈ θ·exp(Lv·qv/(cp·T))",
    assumptions: "Approximate closed form; no ice phase and no saturation adjustment.",
    aliases: "theta e equivalent",
  }),
  V(S3, "thermodynamics", "wetbulb", "Wet-bulb temperature", "derived", "profile", "profile", "°C", {
    definition: "Temperature reached by evaporative cooling to saturation.",
    assumptions: "Not implemented. Needs a psychrometric or iterative solve.",
  }),
  V(S3, "thermodynamics", "virtual-temp", "Virtual temperature", "derived", "profile", "profile", "K", {
    definition: "Temperature corrected for the lower density of moist air.",
    formula: "Tv = T·(1 + 0.61·qv)",
    assumptions: "Not implemented as a map product.",
  }),
  V(S3, "thermodynamics", "temp-advection", "Temperature advection", "derived", "surface / selectable", "slice", "K/h", {
    definition: "Horizontal advection of temperature by the wind.",
    formula: "−V·∇T",
    assumptions: "Not implemented.",
  }),
  V(S3, "thermodynamics", "diff-temp-advection", "Differential temperature advection", "derived", "layer", "profile", "K/h", {
    definition: "Difference in temperature advection across a layer.",
    assumptions: "Not implemented.",
  }),
  V(S3, "surface", "diurnal-heating", "Diurnal heating", "derived", "surface", "surface", "K/h", {
    definition: "Radiative and turbulent heating rate of the surface layer.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S3, "surface", "sensible-heat-flux", "Surface sensible heat flux", "derived", "surface", "surface", "W/m²", {
    definition: "Turbulent heat exchange between the surface and the atmosphere.",
    assumptions: "Not implemented.",
  }),
  V(S3, "surface", "latent-heat-flux", "Latent heat flux", "derived", "surface", "surface", "W/m²", {
    definition: "Turbulent moisture exchange expressed as an energy flux.",
    assumptions: "Not implemented.",
  }),
  V(S3, "thermodynamics", "density", "Atmospheric density", "simulated", "profile", "profile", "kg/m³", {
    definition: "Base-state air density.",
    assumptions: "Hydrostatic base state only; not a map product.",
  }),
  V(S3, "thermodynamics", "static-stability", "Static stability", "derived", "profile", "profile", "K/km", {
    definition: "Environmental lapse rate relative to the dry adiabat.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S3, "thermodynamics", "n2", "Brunt–Väisälä frequency (N²)", "derived", "profile", "profile", "s⁻²", {
    definition: "Squared buoyancy frequency.",
    formula: "N² = (g/θ)·∂θ/∂z",
    assumptions: "Not implemented as a map product.",
  }),

  // ── 4. Wind, shear and storm organisation ──────────────────────────────────
  V(S4, "wind", "wspd", "Surface wind speed", "simulated", "surface (lowest level)", "surface", "m/s", {
    productId: "wspd",
    core: true,
    definition: "Horizontal wind speed on the lowest model level.",
    formula: "|V| = √(u² + v²)",
    assumptions: "Cell-centred C-grid winds; lowest model level.",
    aliases: "wind speed surface",
  }),
  V(S4, "wind", "wdir", "Surface wind direction", "derived", "surface (lowest level)", "surface", "°", {
    productId: "wdir",
    definition: "Meteorological direction the surface wind blows from (0° = north).",
    formula: "dir = atan2(−u, −v), mapped to 0–360°",
    assumptions: "Calm winds are masked. Direction is the direction the wind comes FROM.",
    aliases: "wind direction",
  }),
  V(S4, "wind", "wind-overlay", "Surface wind barbs / vectors", "visual", "surface", "surface", "m/s", {
    core: true,
    definition: "Wind arrows overlaid on the active 3D or 2D view.",
    assumptions: "Rendering-only overlay; physical values are the surface wind speed/direction products.",
    aliases: "barbs arrows vectors wind overlay",
  }),
  V(S4, "wind", "wind-select", "Wind speed at selectable pressure levels", "simulated", "selectable", "pressure", "m/s", {
    definition: "Wind speed on a user-chosen pressure level.",
    assumptions: "Selectable level UI is not implemented; fixed 850 hPa view is available.",
  }),
  V(S4, "wind", "wind925", "Wind at 925 hPa", "simulated", "925 hPa", "pressure", "m/s", {
    definition: "Wind on the model level nearest 925 hPa.",
    assumptions: "Not implemented as a separate product.",
  }),
  V(S4, "wind", "wind850", "Wind at 850 hPa", "simulated", "850 hPa", "pressure", "m/s", {
    productId: "w850",
    core: true,
    definition: "Wind speed on the model level nearest 850 hPa.",
    formula: "|V| = √(u² + v²)",
    assumptions: "Nearest-level sampling, no vertical interpolation.",
  }),
  V(S4, "wind", "wind700", "Wind at 700 hPa", "simulated", "700 hPa", "pressure", "m/s", {
    definition: "Wind on the model level nearest 700 hPa.",
    assumptions: "Not implemented as a separate product.",
  }),
  V(S4, "wind", "wind500", "Wind at 500 hPa", "simulated", "500 hPa", "pressure", "m/s", {
    definition: "Wind on the model level nearest 500 hPa.",
    assumptions: "Not implemented as a separate product.",
  }),
  V(S4, "wind", "wind300", "Wind at 300 hPa", "simulated", "300 hPa", "pressure", "m/s", {
    definition: "Wind on the model level nearest 300 hPa.",
    assumptions: "Not implemented as a separate product.",
  }),
  V(S4, "wind", "wind200", "Wind at 200 hPa", "simulated", "200 hPa", "pressure", "m/s", {
    definition: "Wind on the model level nearest 200 hPa.",
    assumptions: "Not implemented as a separate product.",
  }),
  V(S4, "wind", "u-component", "U-component wind (east–west)", "simulated", "profile", "profile", "m/s", {
    definition: "Zonal wind component.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S4, "wind", "v-component", "V-component wind (north–south)", "simulated", "profile", "profile", "m/s", {
    definition: "Meridional wind component.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S4, "wind", "omega", "Pressure-coordinate vertical velocity (ω)", "derived", "profile", "profile", "Pa/s", {
    definition: "Vertical motion in pressure coordinates.",
    formula: "ω ≈ −ρ·g·w",
    assumptions: "Not implemented as a map product.",
  }),
  V(S4, "wind", "w3k", "Physical vertical air velocity (w)", "simulated", "3 km slice", "slice", "m/s", {
    productId: "w3k",
    core: true,
    definition: "Vertical velocity on the model level nearest 3 km.",
    formula: "w at k = round(3000 m / dz)",
    assumptions: "Single-level sample; a full altitude selector is not implemented.",
    aliases: "vertical velocity updraft downdraft omega",
  }),
  V(S4, "wind", "shear01", "0–1 km bulk shear", "derived", "0–1 km", "profile", "m/s", {
    definition: "Vector wind difference between the surface and 1 km.",
    formula: "|V(1 km) − V(sfc)|",
    assumptions: "Not implemented as a separate product.",
    aliases: "low level shear",
  }),
  V(S4, "wind", "shear03", "0–3 km bulk shear", "derived", "0–3 km", "profile", "m/s", {
    definition: "Vector wind difference between the surface and 3 km.",
    formula: "|V(3 km) − V(sfc)|",
    assumptions: "Not implemented as a separate product.",
  }),
  V(S4, "wind", "shear06", "0–6 km bulk shear", "derived", "0–6 km", "profile", "m/s", {
    productId: "shear06",
    core: true,
    definition: "Vector wind difference between the surface and 6 km.",
    formula: "|V(6 km) − V(sfc)| from the base-state sounding",
    assumptions: "Uses the horizontally uniform base-state wind, so the map is uniform. No simulated storm modification.",
    aliases: "deep layer shear bulk",
  }),
  V(S4, "wind", "shear08", "0–8 km bulk shear", "derived", "0–8 km", "profile", "m/s", {
    definition: "Vector wind difference between the surface and 8 km.",
    formula: "|V(8 km) − V(sfc)|",
    assumptions: "Not implemented as a separate product.",
  }),
  V(S4, "wind", "effective-shear", "Effective bulk shear", "derived", "effective inflow layer", "profile", "m/s", {
    definition: "Bulk shear over the effective storm-inflow layer.",
    assumptions: "Not implemented.",
  }),
  V(S4, "wind", "srh", "Storm-relative helicity (SRH)", "derived", "layer", "profile", "m²/s²", {
    definition: "Helicity of the wind profile in a storm-relative frame.",
    formula: "∫ (V − C) · (∂V/∂z × k) dz",
    assumptions: "Not implemented. Requires a storm-motion estimate.",
  }),
  V(S4, "wind", "srh01", "0–1 km SRH", "derived", "0–1 km", "profile", "m²/s²", {
    core: true,
    definition: "Storm-relative helicity in the lowest kilometre.",
    assumptions: "Not implemented. Requires a storm-motion vector (e.g. Bunkers).",
    aliases: "helicity low level rotation",
  }),
  V(S4, "wind", "srh03", "0–3 km SRH", "derived", "0–3 km", "profile", "m²/s²", {
    definition: "Storm-relative helicity in the lowest 3 km.",
    assumptions: "Not implemented.",
  }),
  V(S4, "wind", "storm-relative-wind", "Storm-relative wind field", "derived", "profile", "profile", "m/s", {
    definition: "Wind after subtracting the storm-motion vector.",
    assumptions: "Not implemented.",
  }),
  V(S4, "wind", "brn", "Bulk Richardson number (BRN)", "derived", "0–6 km", "profile", "—", {
    definition: "Ratio of CAPE to the kinetic energy of the deep-layer shear.",
    formula: "BRN = CAPE / (0.5·U²)",
    assumptions: "Not implemented.",
  }),
  V(S4, "wind", "brn-shear", "BRN shear contribution", "derived", "0–6 km", "profile", "m²/s²", {
    definition: "Denominator of the bulk Richardson number.",
    formula: "0.5·U²",
    assumptions: "Not implemented.",
  }),
  V(S4, "wind", "low-level-jet", "Low-level jet", "derived", "0–3 km", "profile", "m/s", {
    definition: "Local wind-speed maximum in the low levels.",
    assumptions: "Not implemented.",
  }),
  V(S4, "wind", "upper-level-jet", "Upper-level jet", "derived", "200–300 hPa", "pressure", "m/s", {
    definition: "Jet-stream wind maximum aloft.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S4, "wind", "conv", "Wind convergence", "derived", "surface", "surface", "10⁻⁴ s⁻¹", {
    productId: "conv",
    core: true,
    definition: "Horizontal convergence of the surface wind field (positive = converging).",
    formula: "−∇·V × 10⁴, centred finite differences",
    assumptions: "Lowest model level; one-sided differences at the domain edges.",
    aliases: "convergence divergence",
  }),
  V(S4, "wind", "divergence", "Wind divergence", "derived", "surface", "surface", "10⁻⁴ s⁻¹", {
    definition: "Horizontal divergence of the wind field (positive = diverging).",
    formula: "∇·V × 10⁴",
    assumptions: "Not implemented as a separate product; the convergence map shows the same field with the opposite sign.",
  }),
  V(S4, "wind", "vort", "Vorticity", "derived", "surface", "surface", "10⁻⁴ s⁻¹", {
    productId: "vort",
    core: true,
    definition: "Relative vertical vorticity of the surface wind.",
    formula: "ζ = ∂v/∂x − ∂u/∂y, × 10⁴",
    assumptions: "Lowest model level; no planetary vorticity.",
    aliases: "relative vorticity rotation",
  }),
  V(S4, "wind", "vertical-vorticity", "Vertical vorticity", "derived", "surface", "surface", "10⁻⁴ s⁻¹", {
    productId: "vort",
    definition: "Vertical component of relative vorticity.",
    formula: "ζ = ∂v/∂x − ∂u/∂y, ×10⁴",
    assumptions: "Same implementation as the vorticity product.",
  }),
  V(S4, "wind", "horizontal-vorticity", "Horizontal vorticity", "derived", "profile", "profile", "s⁻¹", {
    definition: "Vorticity vector in the horizontal plane.",
    assumptions: "Not implemented.",
  }),
  V(S4, "wind", "absolute-vorticity", "Absolute vorticity", "derived", "profile", "profile", "s⁻¹", {
    definition: "Relative vorticity plus the Coriolis parameter.",
    formula: "ζ + f",
    assumptions: "Not implemented.",
  }),
  V(S4, "wind", "gust-potential", "Wind gust potential", "derived", "surface", "surface", "m/s", {
    definition: "Estimated peak surface gust from downdraft and mean-wind factors.",
    assumptions: "Not implemented; no gust parameterisation in the current model.",
  }),
  V(S4, "wind", "storm-motion", "Storm-motion vectors", "derived", "surface", "surface", "m/s", {
    definition: "Estimated motion of storm cells.",
    assumptions: "Not implemented.",
  }),
  V(S4, "wind", "bunkers", "Bunkers storm-motion estimate", "derived", "0–6 km", "profile", "m/s", {
    definition: "Right- and left-moving supercell motion from the mean wind and shear vector.",
    formula: "C = Vmean ± D·(shear × k)/|shear|",
    assumptions: "Not implemented.",
  }),

  // ── 5. Storm initiation, boundaries and convergence ────────────────────────
  V(S5, "storm", "psfc", "Surface pressure", "simulated", "surface", "surface", "hPa", {
    productId: "psfc",
    core: true,
    definition: "Pressure perturbation at the surface relative to the base state.",
    formula: "π'/cp·ρ scaling plus the synoptic surface-pressure bias",
    assumptions: "Shows perturbation + synoptic pattern, not absolute station pressure.",
    aliases: "pressure surface",
  }),
  V(S5, "storm", "mslp", "Mean sea-level pressure (MSLP)", "derived", "surface", "surface", "hPa", {
    definition: "Pressure reduced to mean sea level.",
    assumptions: "Not implemented. The domain has no terrain or sea-level reduction.",
  }),
  V(S5, "storm", "pressure-gradient", "Pressure gradient", "derived", "surface", "surface", "hPa/km", {
    definition: "Horizontal gradient of surface pressure.",
    assumptions: "Not implemented.",
  }),
  V(S5, "storm", "surface-convergence", "Surface convergence", "derived", "surface", "surface", "10⁻⁴ s⁻¹", {
    productId: "conv",
    definition: "Wind convergence on the lowest model level.",
    formula: "−∇·V × 10⁴",
    assumptions: "Lowest model level; same field as the wind convergence product.",
  }),
  V(S5, "storm", "low-level-convergence", "Low-level convergence", "derived", "0–3 km", "slice", "10⁻⁴ s⁻¹", {
    productId: "conv",
    definition: "Convergence in the low levels.",
    formula: "−∇·V × 10⁴, surface layer",
    assumptions: "The live map shows the surface layer only; a level selector is not implemented.",
  }),
  V(S5, "storm", "bl-convergence", "Boundary-layer convergence", "derived", "0–1 km", "slice", "10⁻⁴ s⁻¹", {
    productId: "conv",
    definition: "Convergence within the boundary layer.",
    formula: "−∇·V × 10⁴, surface layer",
    assumptions: "The live map shows the surface layer only.",
  }),
  V(S5, "storm", "thermal-gradient", "Thermal gradient", "derived", "surface", "surface", "K/km", {
    definition: "Horizontal gradient of surface temperature.",
    assumptions: "Not implemented.",
  }),
  V(S5, "storm", "dewpoint-gradient", "Dew-point gradient", "derived", "surface", "surface", "K/km", {
    definition: "Horizontal gradient of surface dew point.",
    assumptions: "Not implemented.",
  }),
  V(S5, "storm", "dryline", "Dryline detection", "derived", "surface", "surface", "—", {
    definition: "Boundary between moist and dry air detected from the dew-point gradient.",
    assumptions: "Not implemented. No dryline analysis or threshold is defined.",
  }),
  V(S5, "storm", "sea-breeze", "Sea-breeze front", "derived", "surface", "surface", "—", {
    definition: "Thermally driven coastal boundary.",
    assumptions: "Not implemented. The domain has no coastline or sea-surface temperature field.",
  }),
  V(S5, "storm", "gust-front", "Gust-front detection", "derived", "surface", "surface", "—", {
    definition: "Leading edge of a cold pool.",
    assumptions: "Not implemented.",
  }),
  V(S5, "storm", "outflow-boundaries", "Outflow boundaries", "derived", "surface", "surface", "—", {
    definition: "Cold-pool outflow boundaries detected from wind and temperature contrasts.",
    assumptions: "Not implemented.",
  }),
  V(S5, "storm", "cold-pool-deficit", "Cold-pool temperature deficit", "derived", "surface", "surface", "K", {
    definition: "Surface temperature deficit inside a downdraft cold pool.",
    assumptions: "Not implemented.",
  }),
  V(S5, "storm", "boundary-strength", "Boundary strength", "derived", "surface", "surface", "—", {
    definition: "Combined thermal, moisture, and wind contrast across a boundary.",
    assumptions: "Not implemented.",
  }),
  V(S5, "storm", "boundary-intersections", "Boundary intersections", "derived", "surface", "surface", "—", {
    definition: "Locations where two or more boundaries cross.",
    assumptions: "Not implemented.",
  }),
  V(S5, "storm", "ci-potential", "Convective-initiation potential", "derived", "column", "column", "—", {
    definition: "Composite favourability for new convection.",
    assumptions: "Not implemented. No validated composite formula is wired up yet.",
  }),
  V(S5, "storm", "orographic-lift", "Orographic lift", "derived", "surface", "surface", "m/s", {
    definition: "Vertical motion forced by flow over terrain.",
    assumptions: "Not implemented; the model has no terrain.",
  }),
  V(S5, "surface", "elevation", "Terrain elevation", "external", "surface", "surface", "m", {
    definition: "Height of the land surface.",
    assumptions: "Not implemented; the current domain is flat.",
  }),
  V(S5, "surface", "terrain-slope", "Terrain slope", "external", "surface", "surface", "°", {
    definition: "Magnitude of the terrain gradient.",
    assumptions: "Not implemented; requires an elevation dataset.",
  }),
  V(S5, "surface", "terrain-aspect", "Terrain aspect", "external", "surface", "surface", "°", {
    definition: "Direction of the terrain gradient.",
    assumptions: "Not implemented; requires an elevation dataset.",
  }),
  V(S5, "storm", "ci-tracking", "Convective-initiation tracking", "derived", "time", "time", "—", {
    definition: "Tracked new-convection objects through time.",
    assumptions: "Not implemented; needs persistent storm-object IDs.",
  }),

  // ── 6. Clouds ──────────────────────────────────────────────────────────────
  V(S6, "clouds", "cfr", "Cloud fraction", "derived", "column", "column", "%", {
    productId: "cfr",
    core: true,
    definition: "Share of the column containing cloud or rain water.",
    formula: "100 × (levels with qc + qr > 10⁻⁴ kg/kg) / nz",
    assumptions: "A column occupancy fraction, not a radiative cloud-fraction parameterisation.",
    aliases: "cloud cover cloud fraction",
  }),
  V(S6, "clouds", "clwc", "Cloud liquid-water content", "simulated", "column", "column", "g/kg", {
    productId: "clwc",
    core: true,
    definition: "Maximum cloud liquid-water mixing ratio in the column.",
    formula: "max(qc) × 1000",
    assumptions: "Liquid only; the model has no ice, snow, or graupel species.",
    aliases: "cloud water liquid",
  }),
  V(S6, "clouds", "cloud-ice", "Cloud ice content", "simulated", "column", "column", "g/kg", {
    definition: "Ice mixing ratio.",
    assumptions: "Not implemented: the warm-rain microphysics carries no ice species.",
  }),
  V(S6, "clouds", "lwp", "Liquid water path (LWP)", "derived", "column", "column", "g/m²", {
    productId: "lwp",
    definition: "Column-integrated cloud liquid water.",
    formula: "Σ ρ·qc·dz × 1000",
    assumptions: "Liquid only; rain water is excluded.",
    aliases: "liquid water path",
  }),
  V(S6, "clouds", "iwp", "Ice water path (IWP)", "derived", "column", "column", "g/m²", {
    definition: "Column-integrated cloud ice.",
    assumptions: "Not implemented: no ice species in the model.",
  }),
  V(S6, "clouds", "cloud-optical-depth", "Cloud optical depth", "derived", "column", "column", "—", {
    definition: "Vertically integrated extinction of cloud particles.",
    assumptions: "Not implemented; requires effective radius and a radiative transfer calculation.",
  }),
  V(S6, "clouds", "ctop", "Cloud-top height", "derived", "column", "column", "m", {
    productId: "ctop",
    core: true,
    definition: "Height of the highest level containing cloud or rain water.",
    formula: "Highest k with qc + qr > 10⁻⁴ kg/kg → (k + 0.5)·dz",
    assumptions: "Hydrometeor threshold, not a radiative or radar cloud-top definition.",
    aliases: "cloud top height",
  }),
  V(S6, "clouds", "cloud-top-temp", "Cloud-top temperature", "derived", "column", "column", "°C", {
    definition: "Temperature at the highest hydrometeor level.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S6, "clouds", "cloud-depth", "Cloud depth", "derived", "column", "column", "m", {
    definition: "Cloud-top height minus cloud-base height.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S6, "clouds", "wmax", "Updraft strength", "derived", "column", "column", "m/s", {
    productId: "wmax",
    definition: "Maximum upward vertical velocity in the column.",
    formula: "max(w) over all levels",
    assumptions: "Instantaneous model w; sub-grid updrafts are not resolved.",
    aliases: "updraft strength",
  }),
  V(S6, "clouds", "downdraft", "Downdraft strength", "derived", "column", "column", "m/s", {
    definition: "Maximum downward vertical velocity in the column.",
    assumptions: "Not implemented as a separate product.",
  }),
  V(S6, "clouds", "condensation-rate", "Condensation rate", "derived", "profile", "profile", "kg/kg/s", {
    definition: "Rate at which vapour condenses to cloud water.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S6, "clouds", "evaporation-rate", "Evaporation rate", "derived", "profile", "profile", "kg/kg/s", {
    definition: "Rate at which cloud or rain water evaporates.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S6, "clouds", "freezing-rate", "Freezing rate", "derived", "profile", "profile", "kg/kg/s", {
    definition: "Rate of liquid-to-ice conversion.",
    assumptions: "Not implemented: no ice phase.",
  }),
  V(S6, "clouds", "deposition-rate", "Deposition rate", "derived", "profile", "profile", "kg/kg/s", {
    definition: "Rate of vapour-to-ice conversion.",
    assumptions: "Not implemented: no ice phase.",
  }),
  V(S6, "clouds", "sublimation-rate", "Sublimation rate", "derived", "profile", "profile", "kg/kg/s", {
    definition: "Rate of ice-to-vapour conversion.",
    assumptions: "Not implemented: no ice phase.",
  }),
  V(S6, "clouds", "cloud-growth", "Cloud-growth tendency", "derived", "time", "time", "g/kg/min", {
    definition: "Rate of change of cloud water.",
    assumptions: "Not implemented.",
  }),
  V(S6, "clouds", "anvil-extent", "Anvil extent", "derived", "column", "column", "km²", {
    definition: "Horizontal area of the storm anvil.",
    assumptions: "Not implemented; requires storm-object segmentation.",
  }),
  V(S6, "clouds", "overshooting-top", "Overshooting-top detection", "derived", "column", "column", "—", {
    definition: "Detection of cloud tops above the equilibrium level.",
    assumptions: "Not implemented.",
  }),
  V(S6, "clouds", "cloud-top-divergence", "Cloud-top divergence", "derived", "cloud top", "slice", "10⁻⁴ s⁻¹", {
    definition: "Wind divergence at the cloud-top level.",
    assumptions: "Not implemented.",
  }),
  V(S6, "clouds", "entrainment", "Entrainment", "derived", "profile", "profile", "kg/kg/s", {
    definition: "Mixing of environmental air into a cloud.",
    assumptions: "Not implemented: the model has no sub-grid entrainment parameterisation.",
  }),
  V(S6, "clouds", "cloud-age", "Cloud age", "derived", "time", "time", "min", {
    definition: "Time since the cloud object formed.",
    assumptions: "Not implemented; needs persistent storm-object IDs.",
  }),
  V(S6, "clouds", "cloud-classification", "Cloud classification", "derived", "column", "column", "—", {
    definition: "Cumulus / towering cumulus / cumulonimbus / anvil classification.",
    assumptions: "Not implemented.",
  }),

  // ── 6b. Satellite imagery (visual) ─────────────────────────────────────────
  V(S6B, "clouds", "vis-sat", "Visible satellite imagery", "visual", "column", "column", "albedo", {
    productId: "vis",
    core: true,
    definition: "Grey-shade visible image derived from simulated cloud and rain water.",
    formula: "τ = Σ(520·qc + 180·qr)·dz; albedo = 1 − exp(−τ)",
    assumptions: "Rendering of the simulated hydrometeor field, not a radiance calculation. No sun angle, surface albedo, or satellite geometry.",
    aliases: "visible satellite vis imagery",
  }),
  V(S6B, "clouds", "ir-sat", "Infrared satellite imagery", "visual", "column", "column", "°C", {
    productId: "ir",
    core: true,
    definition: "Cloud-top-weighted infrared brightness temperature from the simulated column.",
    formula: "Column emission weighted by optical depth τ = (40·qc + 18·qr)·dz; emitting temperature from θ and p",
    assumptions: "Visual proxy only; no Planck radiance, emissivity, or absorption by water vapour and ozone.",
    aliases: "infrared satellite ir brightness temperature",
  }),

  // ── 7. Precipitation, rain and hail ────────────────────────────────────────
  V(S7, "radar", "precip-rate", "Instantaneous precipitation rate", "derived", "surface", "surface", "mm/h", {
    core: true,
    definition: "Rain mass flux reaching the surface.",
    assumptions: "Not implemented. Surface rain-out is discarded by the current microphysics.",
    aliases: "rain rate precipitation",
  }),
  V(S7, "radar", "precip-accum", "Accumulated precipitation", "derived", "time", "time", "mm", {
    core: true,
    definition: "Time-integrated surface rainfall.",
    assumptions: "Not implemented; no accumulation buffer is stored.",
  }),
  V(S7, "radar", "rainfall-rate", "Rainfall rate", "derived", "surface", "surface", "mm/h", {
    definition: "Liquid-equivalent rainfall rate at the ground.",
    assumptions: "Not implemented.",
  }),
  V(S7, "radar", "snowfall-rate", "Snowfall rate", "derived", "surface", "surface", "cm/h", {
    definition: "Solid precipitation rate at the ground.",
    assumptions: "Not implemented: no ice or snow species.",
  }),
  V(S7, "radar", "hail-rate", "Hail production rate", "derived", "column", "column", "kg/m²/s", {
    definition: "Rate of hail mass production.",
    assumptions: "Not implemented: no hail category in the microphysics.",
  }),
  V(S7, "radar", "hail-size", "Hail size", "derived", "surface", "surface", "mm", {
    core: true,
    definition: "Estimated hailstone diameter.",
    assumptions: "Not implemented: no hail category or hail-growth calculation.",
  }),
  V(S7, "radar", "hail-max", "Maximum hail size", "derived", "column", "column", "mm", {
    definition: "Largest hail size in the column or storm.",
    assumptions: "Not implemented.",
  }),
  V(S7, "radar", "hail-concentration", "Hail concentration", "derived", "column", "column", "m⁻³", {
    definition: "Number concentration of hail particles.",
    assumptions: "Not implemented.",
  }),
  V(S7, "radar", "graupel", "Graupel content", "simulated", "column", "column", "g/kg", {
    definition: "Graupel mixing ratio.",
    assumptions: "Not implemented: no graupel species.",
  }),
  V(S7, "radar", "snow-ice", "Snow and ice content", "simulated", "column", "column", "g/kg", {
    definition: "Snow and ice mixing ratios.",
    assumptions: "Not implemented: warm-rain microphysics only.",
  }),
  V(S7, "radar", "hydrometeor-class", "Hydrometeor classification", "derived", "column", "column", "—", {
    definition: "Rain / snow / hail / graupel classification.",
    assumptions: "Not implemented.",
  }),
  V(S7, "radar", "precip-phase", "Rain–snow transition / precipitation phase", "derived", "surface", "surface", "—", {
    definition: "Whether precipitation reaches the ground as rain or snow.",
    assumptions: "Not implemented: no ice phase.",
  }),
  V(S7, "radar", "melting-layer", "Melting-layer height", "derived", "column", "column", "m", {
    definition: "Depth over which snow melts to rain.",
    assumptions: "Not implemented: no ice phase.",
  }),
  V(S7, "radar", "virga", "Virga detection", "derived", "column", "column", "—", {
    definition: "Precipitation that evaporates before reaching the ground.",
    assumptions: "Not implemented.",
  }),
  V(S7, "radar", "evap-cooling", "Evaporative cooling", "derived", "profile", "profile", "K/h", {
    definition: "Cooling produced by evaporation of precipitation.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S7, "surface", "surface-rain", "Surface rainwater accumulation", "derived", "surface", "surface", "mm", {
    definition: "Liquid water accumulated on the ground.",
    assumptions: "Not implemented.",
  }),
  V(S7, "surface", "runoff", "Runoff", "derived", "surface", "surface", "mm", {
    definition: "Water leaving the surface as runoff.",
    assumptions: "Not implemented: no land-surface or routing model.",
  }),
  V(S7, "surface", "infiltration", "Infiltration", "derived", "surface", "surface", "mm", {
    definition: "Water entering the soil.",
    assumptions: "Not implemented: no soil model.",
  }),
  V(S7, "radar", "precip-efficiency", "Precipitation efficiency", "derived", "column", "column", "%", {
    definition: "Fraction of condensed water that reaches the ground as precipitation.",
    assumptions: "Not implemented.",
  }),
  V(S7, "radar", "drop-size", "Drop-size distribution", "derived", "column", "column", "m⁻³ mm⁻¹", {
    definition: "Number concentration of raindrops as a function of diameter.",
    assumptions: "Not implemented: no prognostic drop-size distribution.",
  }),
  V(S7, "radar", "fall-speed", "Precipitation-particle fall speed", "derived", "column", "column", "m/s", {
    definition: "Terminal fall speed of hydrometeors.",
    assumptions: "Not implemented as a map product; a bulk fall speed is used internally for rain sedimentation.",
  }),
  V(S7, "radar", "refl", "Radar-equivalent reflectivity (dBZ)", "derived", "column", "column", "dBZ", {
    productId: "refl",
    core: true,
    definition: "Radar-equivalent reflectivity from rain and cloud water.",
    formula: "Z = 8×10⁸·qr^1.6 + 2×10⁵·qc²; dBZ = 10·log₁₀(Z), with an updraft core bonus",
    assumptions: "Warm-rain proxy, not a calibrated radar measurement. No ice, hail, or attenuation.",
    aliases: "dbz reflectivity radar",
  }),
  V(S7, "radar", "refl-maxcol", "Maximum column reflectivity", "derived", "column", "column", "dBZ", {
    productId: "refl",
    core: true,
    definition: "Highest reflectivity anywhere in the column (composite reflectivity).",
    formula: "max over k of the reflectivity proxy",
    assumptions: "Same warm-rain proxy as the reflectivity product.",
  }),
  V(S7, "radar", "refl-composite", "Composite reflectivity", "derived", "column", "column", "dBZ", {
    productId: "refl",
    definition: "Column-maximum radar reflectivity.",
    formula: "max over k of the reflectivity proxy",
    assumptions: "Same implementation as maximum column reflectivity.",
  }),
  V(S7, "radar", "refl-low", "Low-level reflectivity", "derived", "1 km slice", "slice", "dBZ", {
    productId: "refl1k",
    definition: "Reflectivity on the model level nearest 1 km.",
    formula: "Reflectivity proxy sampled near 1 km AGL",
    assumptions: "Nearest-level sample; no beam broadening or elevation-angle geometry.",
  }),
  V(S7, "radar", "doppler", "Storm-relative radial velocity", "derived", "~1.5 km slice", "slice", "m/s", {
    productId: "doppler",
    core: true,
    definition: "Radial velocity toward a virtual radar at the domain centre, with the domain-mean wind removed.",
    formula: "vr = ((u − ū)·dx + (v − v̄)·dy) / r, sampled at ~1.5 km AGL",
    assumptions: "One centre radar at a fixed level; storm motion is approximated by the domain-mean wind. No velocity folding/dealiasing, beam broadening, or terrain blockage.",
    aliases: "radial velocity doppler storm relative",
  }),
  V(S7, "radar", "sr-velocity", "Storm-relative velocity", "derived", "~1.5 km slice", "slice", "m/s", {
    productId: "doppler",
    definition: "Radial velocity after subtracting the estimated storm motion.",
    formula: "vr = ((u − ū)·dx + (v − v̄)·dy) / r",
    assumptions: "Same live field as radial velocity; storm motion uses the domain-mean wind at ~1.5 km.",
    aliases: "storm relative velocity",
  }),
  V(S7, "radar", "vil", "Vertically integrated liquid (VIL)", "derived", "column", "column", "kg/m²", {
    productId: "vil",
    definition: "Column integral of rainwater mass.",
    formula: "Σ ρ·qr·dz",
    assumptions: "Rain water only; no ice or hail contribution.",
    aliases: "vil liquid water",
  }),
  V(S7, "radar", "vil-density", "VIL density", "derived", "column", "column", "g/m³", {
    definition: "VIL divided by echo-top height.",
    formula: "VIL / echo-top height",
    assumptions: "Not implemented as a map product.",
  }),
  V(S7, "radar", "echotop", "Echo-top height", "derived", "column", "column", "km", {
    productId: "echotop",
    core: true,
    definition: "Height of the highest 18 dBZ echo.",
    formula: "Highest k with reflectivity ≥ 18 dBZ",
    assumptions: "Uses the same warm-rain reflectivity proxy; no radar beam geometry.",
    aliases: "echo top cloud top radar",
  }),
  V(S7, "radar", "accum-history", "Precipitation accumulation history", "derived", "time window", "time", "mm", {
    definition: "Accumulated precipitation over a selectable time window.",
    assumptions: "Not implemented; no accumulation buffer or time-window control.",
  }),

  // ── 8. Lightning ───────────────────────────────────────────────────────────
  V(S8, "lightning", "charge-density", "Charge density", "derived", "column", "column", "nC/m³", {
    core: true,
    definition: "Net electrical charge per unit volume.",
    assumptions: "Not implemented: the solver tracks a flash-rate proxy, not resolved charge.",
  }),
  V(S8, "lightning", "positive-charge", "Positive-charge distribution", "derived", "column", "column", "nC/m³", {
    definition: "Positive charge density by height.",
    assumptions: "Not implemented.",
  }),
  V(S8, "lightning", "negative-charge", "Negative-charge distribution", "derived", "column", "column", "nC/m³", {
    definition: "Negative charge density by height.",
    assumptions: "Not implemented.",
  }),
  V(S8, "lightning", "e-field", "Electric-field strength and direction", "derived", "column", "column", "V/m", {
    definition: "Electrostatic field vector.",
    assumptions: "Not implemented.",
  }),
  V(S8, "lightning", "e-potential", "Electric potential", "derived", "column", "column", "V", {
    definition: "Electrostatic potential.",
    assumptions: "Not implemented.",
  }),
  V(S8, "lightning", "charge-separation", "Charge separation", "derived", "column", "column", "nC/(m³·s)", {
    definition: "Rate of charge separation by the updraft and hydrometeors.",
    assumptions: "Not implemented.",
  }),
  V(S8, "lightning", "charge-accumulation", "Charge accumulation rate", "derived", "time", "time", "nC/(m³·s)", {
    definition: "Rate at which charge builds up.",
    assumptions: "Not implemented.",
  }),
  V(S8, "lightning", "flash-density", "Lightning flash density", "derived", "column", "column", "flashes/min", {
    productId: "ltg",
    core: true,
    definition: "Recent lightning flash rate per grid column.",
    formula: "Updraft/rain-driven flash proxy with a ~5 minute decay",
    assumptions: "Statistical proxy, not a放电 simulation; no charge transport is resolved.",
    aliases: "lightning density strikes",
  }),
  V(S8, "lightning", "strike-locations", "Lightning strike locations", "visual", "surface", "surface", "—", {
    definition: "Instantaneous strike markers drawn over the map.",
    assumptions: "Visual overlay generated from the flash-rate proxy; not observed strikes.",
  }),
  V(S8, "lightning", "flash-rate", "Lightning flash rate", "derived", "column", "column", "flashes/min", {
    productId: "ltg",
    definition: "Same flash-rate field as lightning flash density.",
    formula: "Updraft/rain-driven flash proxy with a ~5 minute decay",
    assumptions: "Proxy field with a decay timescale of about 5 minutes.",
  }),
  V(S8, "lightning", "cg", "Cloud-to-ground (CG) lightning", "derived", "column", "column", "flashes/min", {
    definition: "Cloud-to-ground flash rate.",
    assumptions: "Not implemented: flashes are not classified by channel geometry.",
  }),
  V(S8, "lightning", "ic", "Intracloud (IC) lightning", "derived", "column", "column", "flashes/min", {
    definition: "Intracloud flash rate.",
    assumptions: "Not implemented.",
  }),
  V(S8, "lightning", "cloud-cloud", "Cloud-to-cloud lightning", "derived", "column", "column", "flashes/min", {
    definition: "Cloud-to-cloud flash rate.",
    assumptions: "Not implemented.",
  }),
  V(S8, "lightning", "pos-cg", "Positive-polarity CG lightning", "derived", "column", "column", "flashes/min", {
    definition: "Fraction of CG flashes with positive polarity.",
    assumptions: "Not implemented.",
  }),
  V(S8, "lightning", "neg-cg", "Negative-polarity CG lightning", "derived", "column", "column", "flashes/min", {
    definition: "Fraction of CG flashes with negative polarity.",
    assumptions: "Not implemented.",
  }),
  V(S8, "lightning", "channel-paths", "Lightning-channel paths", "visual", "3D", "profile", "—", {
    definition: "Rendered lightning channel geometry.",
    assumptions: "Visual-only; channels do not feed back on the simulated electric field.",
  }),
  V(S8, "lightning", "channel-length", "Lightning-channel length", "derived", "3D", "profile", "km", {
    definition: "Total length of a rendered channel.",
    assumptions: "Not implemented; the renderer uses stylised bolts.",
  }),
  V(S8, "lightning", "lightning-age", "Lightning age", "visual", "time", "time", "s", {
    definition: "Time since a flash was rendered.",
    assumptions: "Visual-only fade timing.",
  }),
  V(S8, "lightning", "lightning-intensity", "Lightning intensity", "visual", "3D", "slice", "—", {
    definition: "Rendered brightness of a flash.",
    assumptions: "Visual brightness only; no physical radiance or current is defined.",
  }),
  V(S8, "lightning", "thunder-delay", "Thunder arrival time / lightning-to-thunder delay", "derived", "surface", "surface", "s", {
    definition: "Travel time of thunder from a flash to the listener.",
    formula: "delay = distance / speed of sound",
    assumptions: "Not implemented as a map product.",
  }),
  V(S8, "surface", "ground-conductivity", "Ground electrical conductivity", "external", "surface", "surface", "S/m", {
    definition: "Electrical conductivity of the ground.",
    assumptions: "Not implemented; no soil or geology dataset.",
  }),
  V(S8, "surface", "soil-moisture-conductivity", "Soil moisture as an electrical-conductivity influence", "derived", "surface", "surface", "—", {
    definition: "Effect of soil moisture on ground conductivity.",
    assumptions: "Not implemented.",
  }),
  V(S8, "lightning", "lpi", "Lightning Potential Index", "derived", "column", "column", "—", {
    definition: "Optional index combining updraft, ice, and charge proxies.",
    assumptions: "Not implemented. The formula and inputs must be documented before it is plotted.",
  }),
  V(S8, "lightning", "charge-tendency", "Charge tendency", "derived", "time", "time", "nC/(m³·s)", {
    definition: "Rate of change of charge density.",
    assumptions: "Not implemented.",
  }),

  // ── 9. Severe weather diagnostics ──────────────────────────────────────────
  V(S9, "storm", "scp", "Supercell Composite Parameter (SCP)", "derived", "column", "column", "—", {
    definition: "Composite favourability for supercells.",
    formula: "(MUCAPE/1000)·(SRH/50)·(shear/20)",
    assumptions: "Not implemented; MUCAPE and SRH are not yet available.",
  }),
  V(S9, "storm", "stp", "Significant Tornado Parameter (STP)", "derived", "column", "column", "—", {
    definition: "Composite favourability for significant tornadoes.",
    assumptions: "Not implemented. Environmental only; does not predict a tornado.",
  }),
  V(S9, "storm", "ehi", "Energy–Helicity Index (EHI)", "derived", "column", "column", "—", {
    definition: "CAPE multiplied by storm-relative helicity.",
    formula: "EHI = (CAPE × SRH) / 160000",
    assumptions: "Not implemented.",
  }),
  V(S9, "storm", "sig-hail", "Significant-hail parameter", "derived", "column", "column", "—", {
    definition: "Composite favourability for large hail.",
    assumptions: "Not implemented. Requires CAPE, shear, and a freezing-level term.",
  }),
  V(S9, "storm", "microburst", "Microburst composite / downburst index", "derived", "column", "column", "—", {
    definition: "Composite downdraft-strength index.",
    assumptions: "Not implemented. DCAPE and evaporative cooling are not available.",
  }),
  V(S9, "storm", "derecho", "Damaging-wind / derecho environment diagnostic", "derived", "column", "column", "—", {
    definition: "Environment favourable for widespread damaging winds.",
    assumptions: "Not implemented.",
  }),
  V(S9, "storm", "tornado-vortex", "Tornado-vortex detection", "derived", "surface", "surface", "—", {
    definition: "Detected low-level vortex signature.",
    assumptions: "Not implemented; requires a vortex-detection algorithm.",
  }),
  V(S9, "storm", "mesocyclone", "Mesocyclone strength", "derived", "0–3 km", "profile", "10⁻⁴ s⁻¹", {
    definition: "Strength of a detected mesocyclone.",
    assumptions: "Not implemented.",
  }),
  V(S9, "storm", "rotation-tracks", "Rotation tracks", "derived", "time", "time", "—", {
    definition: "Track history of rotation maxima.",
    assumptions: "Not implemented.",
  }),
  V(S9, "storm", "uh25", "Updraft helicity", "derived", "2–5 km", "column", "m²/s²", {
    productId: "uh25",
    definition: "Integrated product of updraft strength and vertical vorticity.",
    formula: "∫₂–₅km max(w, 0)·ζ dz",
    assumptions: "Storm-scale diagnostic from resolved motion; no sub-grid rotation. Not a tornado detection.",
    aliases: "updraft helicity rotation supercell",
  }),
  V(S9, "storm", "low-level-rotation", "Low-level rotation", "derived", "0–3 km", "slice", "10⁻⁴ s⁻¹", {
    definition: "Vertical vorticity in the low levels.",
    assumptions: "Not implemented as a separate product; the surface vorticity map is available.",
  }),
  V(S9, "storm", "cold-pool", "Cold-pool strength", "derived", "surface", "surface", "K", {
    definition: "Temperature deficit of a downdraft cold pool.",
    assumptions: "Not implemented.",
  }),
  V(S9, "storm", "bow-echo", "Bow-echo detection", "derived", "column", "column", "—", {
    definition: "Detection of a bowed squall-line segment.",
    assumptions: "Not implemented.",
  }),
  V(S9, "storm", "storm-relative-inflow", "Storm-relative inflow", "derived", "0–3 km", "profile", "m/s", {
    definition: "Wind component flowing into a storm.",
    assumptions: "Not implemented.",
  }),
  V(S9, "storm", "storm-relative-outflow", "Storm-relative outflow", "derived", "0–3 km", "profile", "m/s", {
    definition: "Wind component flowing out of a storm.",
    assumptions: "Not implemented.",
  }),
  V(S9, "storm", "hail-growth-zone", "Hail-growth-zone display", "derived", "column", "column", "—", {
    definition: "Layer where hail can grow.",
    assumptions: "Not implemented.",
  }),
  V(S9, "storm", "downburst", "Downburst potential", "derived", "column", "column", "—", {
    definition: "Potential for a damaging downdraft.",
    assumptions: "Not implemented.",
  }),
  V(S9, "storm", "severe-composite", "Severe-weather risk composite", "derived", "column", "column", "—", {
    definition: "Combined environmental severe-weather risk.",
    assumptions: "Not implemented. Any composite must document its formula and limitations before display.",
  }),
  V(S9, "storm", "storm-mode", "Storm-mode classification", "derived", "column", "column", "—", {
    definition: "Single-cell / multicell / supercell / squall-line classification.",
    assumptions: "Not implemented.",
  }),

  // ── 10. Circulation and synoptic weather ───────────────────────────────────
  V(S10, "wind", "geopotential", "Geopotential height", "derived", "pressure level", "pressure", "m", {
    definition: "Height of a pressure surface.",
    formula: "Hydrostatic integral of the density profile",
    assumptions: "Not implemented as a map product.",
  }),
  V(S10, "wind", "z500", "500 hPa geopotential height", "derived", "500 hPa", "pressure", "m", {
    definition: "Height of the 500 hPa surface.",
    assumptions: "Not implemented.",
  }),
  V(S10, "wind", "jet-stream", "200–300 hPa jet stream", "derived", "200–300 hPa", "pressure", "m/s", {
    definition: "Upper-tropospheric wind maximum.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S10, "wind", "thickness", "1000–500 hPa thickness", "derived", "1000–500 hPa", "profile", "m", {
    definition: "Thickness of the 1000–500 hPa layer.",
    assumptions: "Not implemented.",
  }),
  V(S10, "wind", "vort-adv", "Vorticity advection", "derived", "pressure level", "pressure", "s⁻²", {
    definition: "Advection of absolute vorticity by the wind.",
    formula: "−V·∇(ζ + f)",
    assumptions: "Not implemented.",
  }),
  V(S10, "wind", "q-vector", "Q-vector convergence", "derived", "pressure level", "pressure", "K/(m²·s)", {
    definition: "Convergence of the Q vector, a forcing term for vertical motion.",
    assumptions: "Not implemented.",
  }),
  V(S10, "wind", "frontogenesis", "Frontogenesis", "derived", "pressure level", "pressure", "K/(m·s)", {
    definition: "Rate at which a temperature gradient strengthens.",
    assumptions: "Not implemented.",
  }),
  V(S10, "wind", "frontolysis", "Frontolysis", "derived", "pressure level", "pressure", "K/(m·s)", {
    definition: "Rate at which a temperature gradient weakens.",
    assumptions: "Not implemented.",
  }),
  V(S10, "wind", "cyclone-tracking", "Cyclone tracking", "derived", "time", "time", "—", {
    definition: "Tracked low-pressure centres.",
    assumptions: "Not implemented.",
  }),
  V(S10, "wind", "anticyclone-tracking", "Anticyclone tracking", "derived", "time", "time", "—", {
    definition: "Tracked high-pressure centres.",
    assumptions: "Not implemented.",
  }),
  V(S10, "wind", "trough", "Trough detection", "derived", "pressure level", "pressure", "—", {
    definition: "Detected trough axes.",
    assumptions: "Not implemented.",
  }),
  V(S10, "wind", "ridge", "Ridge detection", "derived", "pressure level", "pressure", "—", {
    definition: "Detected ridge axes.",
    assumptions: "Not implemented.",
  }),
  V(S10, "wind", "tropopause", "Tropopause height", "derived", "column", "column", "m", {
    definition: "Height of the tropopause.",
    assumptions: "Not implemented.",
  }),
  V(S10, "wind", "pv", "Potential vorticity", "derived", "pressure level", "pressure", "PVU", {
    definition: "Ertel potential vorticity.",
    assumptions: "Not implemented.",
  }),

  // ── 11. Surface, terrain and land–atmosphere interaction ───────────────────
  V(S11, "surface", "surface-temp", "Surface temperature", "simulated", "surface", "surface", "°C", {
    productId: "tsfc",
    core: true,
    definition: "Temperature of the lowest model level.",
    formula: "T = θ·(p/p₀)^(R/cp)",
    assumptions: "Lowest model level, not a true skin temperature.",
  }),
  V(S11, "surface", "soil-temp", "Soil temperature at selectable depths", "external", "soil", "profile", "°C", {
    definition: "Sub-surface soil temperature.",
    assumptions: "Not implemented: no soil model.",
  }),
  V(S11, "surface", "soil-moisture", "Soil moisture", "external", "soil", "profile", "m³/m³", {
    definition: "Volumetric soil water content.",
    assumptions: "Not implemented: no soil model.",
  }),
  V(S11, "surface", "soil-saturation", "Soil saturation", "external", "soil", "profile", "%", {
    definition: "Soil water content relative to saturation.",
    assumptions: "Not implemented.",
  }),
  V(S11, "surface", "ground-thermal-conductivity", "Ground thermal conductivity", "external", "soil", "profile", "W/(m·K)", {
    definition: "Thermal conductivity of the ground (separate from electrical conductivity).",
    assumptions: "Not implemented.",
  }),
  V(S11, "surface", "surface-wetness", "Surface wetness", "derived", "surface", "surface", "—", {
    definition: "Fraction of the surface covered by liquid water.",
    assumptions: "Not implemented.",
  }),
  V(S11, "surface", "vegetation-cover", "Vegetation cover", "external", "surface", "surface", "%", {
    definition: "Fractional vegetation cover.",
    assumptions: "Not implemented.",
  }),
  V(S11, "surface", "vegetation-moisture", "Vegetation moisture", "external", "surface", "surface", "—", {
    definition: "Water content of vegetation.",
    assumptions: "Not implemented.",
  }),
  V(S11, "surface", "land-use", "Land-use / land-cover map", "external", "surface", "surface", "class", {
    definition: "Land-use category per grid cell.",
    assumptions: "Not implemented.",
  }),
  V(S11, "surface", "roughness", "Surface roughness", "external", "surface", "surface", "m", {
    definition: "Aerodynamic roughness length.",
    assumptions: "Not implemented.",
  }),
  V(S11, "surface", "albedo", "Surface albedo", "external", "surface", "surface", "—", {
    definition: "Fraction of incoming solar radiation reflected.",
    assumptions: "Not implemented.",
  }),
  V(S11, "surface", "solar-incoming", "Incoming solar radiation", "derived", "surface", "surface", "W/m²", {
    definition: "Downwelling shortwave radiation.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S11, "surface", "olr", "Outgoing longwave radiation", "derived", "top of atmosphere", "column", "W/m²", {
    definition: "Upwelling longwave radiation at the top of the model.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S11, "surface", "energy-balance", "Surface energy balance", "derived", "surface", "surface", "W/m²", {
    definition: "Net radiative, sensible, latent, and ground heat fluxes.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S11, "surface", "evapotranspiration", "Evapotranspiration", "derived", "surface", "surface", "mm/h", {
    definition: "Water vapour flux from the surface.",
    assumptions: "Not implemented.",
  }),
  V(S11, "surface", "sst", "Ocean / sea-surface temperature", "external", "surface", "surface", "°C", {
    definition: "Temperature of the sea surface.",
    assumptions: "Not implemented: the domain has no ocean.",
  }),
  V(S11, "surface", "sea-land-contrast", "Sea–land temperature contrast", "derived", "surface", "surface", "K", {
    definition: "Temperature difference between sea and land.",
    assumptions: "Not implemented.",
  }),

  // ── 12. Time evolution and simulation debugging ────────────────────────────
  V(S12, "history", "temp-tendency", "Temperature tendency", "derived", "time", "time", "K/min", {
    definition: "Rate of change of temperature at a point or layer.",
    assumptions: "Not implemented. Needs a stored tendency or history buffer.",
  }),
  V(S12, "history", "td-tendency", "Dew-point tendency", "derived", "time", "time", "K/min", {
    definition: "Rate of change of dew point.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "pressure-tendency", "Pressure tendency", "derived", "time", "time", "hPa/h", {
    definition: "Rate of change of surface pressure.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "wind-tendency", "Wind tendency", "derived", "time", "time", "m/s/min", {
    definition: "Rate of change of the wind vector.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "w-tendency", "Vertical-velocity tendency", "derived", "time", "time", "m/s/min", {
    definition: "Rate of change of vertical velocity.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "cloud-water-tendency", "Cloud-water tendency", "derived", "time", "time", "g/kg/min", {
    definition: "Rate of change of cloud water.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "precip-tendency", "Precipitation tendency", "derived", "time", "time", "mm/h²", {
    definition: "Rate of change of the precipitation rate.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "lightning-history", "Lightning history", "derived", "time", "time", "flashes", {
    definition: "Past flash locations and rates.",
    assumptions: "Not implemented as a history product.",
  }),
  V(S12, "history", "storm-tracks", "Storm tracks", "derived", "time", "time", "—", {
    definition: "Tracks of storm objects.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "storm-ids", "Persistent storm-object IDs", "derived", "time", "time", "id", {
    definition: "Stable identifiers for tracked storms.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "storm-growth", "Storm growth and decay", "derived", "time", "time", "—", {
    definition: "Lifecycle state of tracked storms.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "streamlines", "Airflow streamlines", "visual", "3D", "profile", "—", {
    definition: "Rendered streamlines of the wind field.",
    assumptions: "Visual-only rendering; values come from the simulated wind.",
  }),
  V(S12, "history", "mass-error", "Mass-conservation error", "derived", "domain", "column", "%", {
    definition: "Relative domain-integrated mass drift.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "water-error", "Water-conservation error", "derived", "domain", "column", "%", {
    definition: "Relative domain-integrated water drift.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "energy-error", "Energy-conservation error", "derived", "domain", "column", "%", {
    definition: "Relative domain-integrated energy drift.",
    assumptions: "Not implemented.",
  }),
  V(S12, "history", "cfl", "Numerical stability / CFL indicator", "derived", "grid", "column", "—", {
    definition: "Courant–Friedrichs–Lewy number for the active timestep.",
    assumptions: "Not implemented as a map product.",
  }),
  V(S12, "history", "grid-velocity", "Grid-level velocity", "simulated", "grid", "slice", "m/s", {
    definition: "Raw grid-cell velocity components.",
    assumptions: "Not implemented as a debug map.",
  }),
  V(S12, "history", "physics-vs-visual", "Physics state versus visual effects", "visual", "—", "profile", "—", {
    definition: "Separates physical variables from rendering-only effects (cloud shading, rain shafts, bolts).",
    assumptions: "Rendering effects are visual and must not be read as additional physical fields.",
  }),
];

/** Fast lookup by catalog id. */
export const VIEW_BY_ID: Record<string, CatalogView> = Object.fromEntries(
  VIEW_CATALOG.map((v) => [v.id, v]),
);

export function getCatalogView(id: string): CatalogView | undefined {
  return VIEW_BY_ID[id];
}

/** Implemented views (those with a live map product). */
export const IMPLEMENTED_VIEWS: CatalogView[] = VIEW_CATALOG.filter(
  (v) => !!v.productId,
);

export function catalogStats(): { total: number; live: number; planned: number } {
  const live = IMPLEMENTED_VIEWS.length;
  return { total: VIEW_CATALOG.length, live, planned: VIEW_CATALOG.length - live };
}

const CATEGORY_ORDER: ViewCategory[] = [
  "thermodynamics",
  "wind",
  "storm",
  "clouds",
  "radar",
  "lightning",
  "surface",
  "history",
];

const CATEGORY_RANK: Record<ViewCategory, number> = Object.fromEntries(
  CATEGORY_ORDER.map((c, i) => [c, i]),
) as Record<ViewCategory, number>;

function haystack(v: CatalogView): string {
  return [
    v.label,
    v.id,
    v.aliases ?? "",
    v.units,
    v.level,
    v.definition ?? "",
    v.section,
    VIEW_CATEGORY_LABELS[v.category],
    VIEW_PROVENANCE_LABELS[v.provenance],
  ]
    .join(" ")
    .toLowerCase();
}

function score(v: CatalogView, q: string): number {
  const label = v.label.toLowerCase();
  const id = v.id.toLowerCase();
  if (label === q || id === q) return 0;
  if (label.startsWith(q)) return 1;
  if (id.startsWith(q)) return 2;
  if (label.includes(q)) return 3;
  if ((v.aliases ?? "").toLowerCase().includes(q)) return 4;
  if (haystack(v).includes(q)) return 5;
  return -1;
}

/**
 * Search the catalog. Implemented views sort before planned ones so the
 * drop-down stays useful even for broad queries.
 */
export function searchCatalog(query: string, limit = 80): CatalogView[] {
  const q = query.trim().toLowerCase();
  const candidates = q
    ? VIEW_CATALOG.map((v) => ({ v, s: score(v, q) })).filter((r) => r.s >= 0)
    : VIEW_CATALOG.map((v) => ({
        v,
        s: v.productId ? 0 : v.core ? 1 : 3,
      }));
  candidates.sort((a, b) => {
    if (a.s !== b.s) return a.s - b.s;
    const live = Number(!!b.v.productId) - Number(!!a.v.productId);
    if (live !== 0) return live;
    const cat = CATEGORY_RANK[a.v.category] - CATEGORY_RANK[b.v.category];
    if (cat !== 0) return cat;
    return a.v.label.localeCompare(b.v.label);
  });
  return candidates.slice(0, limit).map((r) => r.v);
}

/** Catalog entries exposed as live map products, for the top bar. */
export function liveViewsByProduct(): Map<MapProductId, CatalogView> {
  const map = new Map<MapProductId, CatalogView>();
  for (const v of IMPLEMENTED_VIEWS) {
    if (v.productId && !map.has(v.productId)) map.set(v.productId, v);
  }
  return map;
}
