import { readFileSync } from "fs";
import { parseSoundingText } from "../src/sim/soundingImport";

const cases: [string, string][] = [
  [
    "sharppy-file",
    readFileSync("C:/Users/tajan/OneDrive/Desktop/run/run/input_sounding", "utf8"),
  ],
  [
    "extra-export",
    `# Sounding Data Export from Simulation
# Alt(m), Pressure(hPa), Temp(C), WetBulb(C), DewPoint(C), RH(%), Velocity(km/h), Angle(deg)
0.0, 1013.3, 28.0, 22.0, 20.0, 60.0, 20.0, 180.0
500.0, 954.0, 24.0, 19.0, 16.0, 55.0, 25.0, 200.0
1000.0, 898.0, 20.0, 15.0, 12.0, 50.0, 30.0, 210.0
2000.0, 795.0, 12.0, 6.0, 2.0, 45.0, 35.0, 220.0
4000.0, 616.0, 0.0, -8.0, -12.0, 40.0, 40.0, 240.0
6000.0, 472.0, -12.0, -22.0, -28.0, 35.0, 50.0, 250.0`,
  ],
  [
    "stormforge",
    `alt_m,p_hPa,t_C,td_C,u,v
0.0,1013.25,28.00,20.00,0.00,-5.00
500.0,954.00,24.00,16.00,1.00,-8.00
1000.0,898.00,20.00,12.00,2.00,-10.00
3000.0,700.00,8.00,-2.00,5.00,-15.00
6000.0,472.00,-12.00,-28.00,10.00,-20.00
9000.0,308.00,-40.00,-50.00,15.00,-25.00`,
  ],
  [
    "spc",
    `92481 OUN Observations at 12Z 05 May 2019
-----------------------------------------------------------------------------
   PRES   HGHT   TEMP   DWPT   RELH   MIXR   DRCT   SKNT   THTA   THTE   THTV
    hPa     m      C      C      %    g/kg    deg   knot     K      K      K 
-----------------------------------------------------------------------------
 1000.0    345   21.6   20.6     94  15.49    165      9  294.7  339.5  297.4
  925.0   1012   20.0   18.0     88  14.20    180     15  299.5  340.1  301.9
  850.0   1734   16.0   12.0     77  11.00    200     25  302.8  335.2  304.8
  700.0   3162    6.0    0.0     65   6.50    220     35  308.1  328.0  309.3
  500.0   5574  -12.1  -20.1     50   1.80    240     45  316.0  322.5  316.3
  300.0   9164  -40.1  -50.1     35   0.20    250     60  330.0  331.0  330.0`,
  ],
  [
    "cm1-native",
    ` 1000.00  300.00   14.00
     0.00  300.00   14.00    0.00    0.00
  1000.00  301.50   13.00    2.00    1.00
  2000.00  304.00   10.00    5.00    2.00
  3000.00  307.00    6.00    8.00    3.00
  5000.00  315.00    2.00   12.00    4.00
  8000.00  325.00    0.50   18.00    5.00
 12000.00  340.00    0.10   25.00    6.00`,
  ],
];

for (const [name, text] of cases) {
  const r = parseSoundingText(text, 18000);
  const sample = r.levels.slice(0, 2).map((l) => ({
    z: Math.round(l.z),
    p: Math.round(l.p / 100),
    T: +(l.T - 273.15).toFixed(1),
    Td: +(l.Td - 273.15).toFixed(1),
  }));
  console.log("---", name);
  console.log(r.ok, r.format, r.message);
  console.log(JSON.stringify(sample));
}
