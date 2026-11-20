// Adapted from MIRA-HUD/components/MiraField.jsx (MIT). See N7-MIRA-HUD-LICENSE.txt.
export const N7_MIRA_FIELD_FRAGMENT = `
  precision highp float;
  uniform vec2  iRes;
  uniform float iTime;
  uniform float iField;
  uniform float iMatter;
  uniform vec2  iCenter;
  uniform float iRing;
  uniform float iClear;
  uniform float iSpread;
  uniform float iState;
  uniform float iEnergy;
  uniform float iDebug;
  uniform float iAlpha;
  uniform float iNear;
  uniform float iHotLo;

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return v; }
  float fbm3(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return v; }

  vec2 domainWarp(vec2 p, float t) {
    vec2 q = vec2(fbm(p + vec2(0.0, t * 0.045)), fbm(p + vec2(5.2, -t * 0.037)));
    vec2 r = vec2(fbm(p + 3.8 * q + vec2(1.7, t * 0.027)), fbm(p + 3.2 * q + vec2(8.3, -t * 0.031)));
    return p + 1.4 * r;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / iRes;
    vec2 asp = vec2(iRes.x / iRes.y, 1.0);

    float slowT = iTime * 0.035, medT = iTime * 0.08, fineT = iTime * 0.14;
    float listening = step(0.5, iState) * (1.0 - step(1.5, iState));
    float thinking  = step(1.5, iState) * (1.0 - step(2.5, iState));
    float speaking  = step(2.5, iState);
    float audioBoost = 1.0 + iEnergy * 0.20 * speaking;

    float nearSlowT = iTime * 0.02, nearMedT = iTime * 0.05, hotT = iTime * 0.11 * (1.0 + 0.35 * thinking);
    float debugOn = step(0.5, iDebug);

    vec2 toOrb = (uv - iCenter) * asp;
    float distanceToOrb = length(toOrb);
    vec2 dir = toOrb / (distanceToOrb + 0.0001);
    vec2 tangent = vec2(-dir.y, dir.x);
    float orbInfluence = 1.0 - smoothstep(iRing * 0.9, iRing * 3.0, distanceToOrb);

    vec2 p = (uv - 0.5) * asp * 2.0;

    vec2 warped = domainWarp(p, iTime);
    warped += tangent * orbInfluence * sin(distanceToOrb * 17.0 + medT * 4.6) * 0.035;
    float distortion = fbm(warped * 1.7 + slowT);
    float irregularDistance = distanceToOrb + distortion * 0.09;

    float fieldL = fbm(warped * 0.45 + vec2(slowT * 0.6, -slowT * 0.4));
    float fieldA = fbm(warped * 1.15 + vec2(medT * 0.3, 0.0));
    float fieldB = fbm(warped * 2.1 + 7.4 + vec2(0.0, fineT * 0.25));

    float ridgeA = pow(1.0 - abs(fieldA * 2.0 - 1.0), 6.0);
    float ridgeB = pow(1.0 - abs(fieldB * 2.0 - 1.0), 10.0);
    float ridgeL = pow(1.0 - abs(fieldL * 2.0 - 1.0), 5.0);
    float membrane = smoothstep(0.48, 0.72, fieldA) * 0.12;
    float membraneL = smoothstep(0.52, 0.80, fieldL) * 0.07;

    float energyRaw = fbm(warped * 0.65 + vec2(slowT * 0.6 * (1.0 + 0.5 * thinking), -slowT * 0.5));
    float energy = smoothstep(0.58, 0.78, energyRaw);
    ridgeA *= mix(0.4, 1.7, energy) * audioBoost;
    ridgeB *= mix(0.6, 1.5, energy) * audioBoost;

    float farHot = pow(smoothstep(0.80, 0.92, energyRaw), 1.5) * max(ridgeA, ridgeB);

    float near = (1.0 - smoothstep(iRing * 1.1, iRing * 3.2, irregularDistance)) * smoothstep(iRing * 0.85, iRing * 1.15, irregularDistance);
    ridgeB *= 1.0 + 0.6 * near;
    ridgeA *= 1.0 + 0.3 * near;

    float clear = mix(1.0, smoothstep(iRing * 0.80, iRing * 1.05, distanceToOrb), iClear);

    float innerMask = smoothstep(iRing * 0.90, iRing * 1.10, distanceToOrb);
    float outerMask = 1.0 - smoothstep(iRing * 2.0, iRing * 2.7, distanceToOrb);
    float rawMask = innerMask * outerMask;
    float nearOrbMask = rawMask;
    float breakupS = 0.0;
    float nearRidgeA = 0.0, nearRidgeB = 0.0, nearBody = 0.0, hotspot = 0.0, hotGlow = 0.0;
    if (nearOrbMask > 0.002) {

      float breakup = fbm3(warped * 1.9 + vec2(nearSlowT * 1.05, -nearSlowT * 0.8));
      breakupS = smoothstep(0.22, 0.62, breakup);
      nearOrbMask *= breakupS;
      float nearFieldA = fbm(warped * 1.4 + vec2(nearMedT * 0.4, nearMedT * 0.25));
      float nearFieldB = fbm(warped * 2.7 + 8.7 + vec2(-nearMedT * 0.3, nearMedT * 0.5));
      nearRidgeA = pow(1.0 - abs(nearFieldA * 2.0 - 1.0), 7.0) * nearOrbMask;
      nearRidgeB = pow(1.0 - abs(nearFieldB * 2.0 - 1.0), 12.0) * nearOrbMask;
      nearBody = smoothstep(0.50, 0.78, nearFieldA) * nearOrbMask;

      float energyField = fbm3(warped * 1.5 + vec2(hotT * 0.28, -hotT * 0.21));

      float energyHot = smoothstep(iHotLo, iHotLo + 0.07, energyField);
      float matterPresence = min(1.0, max(max(nearRidgeA, nearRidgeB), nearBody * 0.6) * 1.6);
      hotspot = energyHot * matterPresence;

      hotGlow = energyHot * pow(1.0 - abs(nearFieldA * 2.0 - 1.0), 2.0) * nearOrbMask;
    }

    vec3 violetDeep   = vec3(0.025, 0.16, 0.29);
    vec3 violetMain   = vec3(0.08, 0.51, 0.72);
    vec3 violetBright = vec3(0.20, 0.74, 0.87);
    vec3 lavender     = vec3(0.50, 0.88, 0.96);
    vec3 baseViolet   = vec3(0.06, 0.37, 0.56);
    vec3 whiteViolet  = vec3(0.90, 0.98, 1.00);
    vec3 color = mix(violetDeep, violetMain, fieldA);
    color = mix(color, violetBright, clamp(ridgeA, 0.0, 1.0));
    color = mix(color, lavender, clamp(ridgeB * energy, 0.0, 1.0));

    float alpha = iAlpha * (membraneL * 0.5 * iField + membrane * 0.26 * iMatter + ridgeL * 0.07 * iField
                + ridgeA * 0.30 * iMatter + ridgeB * 0.42 * iField);
    float visibility = smoothstep(0.32, 0.70, fbm(warped * 0.6 + 12.0 + vec2(slowT * 0.3, -slowT * 0.2)));

    visibility = mix(visibility, 0.55 + 0.45 * visibility, iSpread);
    alpha *= visibility * clear;
    float quiet = 1.0 - 0.18 * (1.0 - step(0.5, iState));
    alpha *= quiet;

    vec3 nearCol = mix(baseViolet, violetBright, clamp(nearRidgeA * 1.4, 0.0, 1.0));
    nearCol = mix(nearCol, lavender, clamp(nearRidgeB, 0.0, 1.0));
    nearCol = mix(nearCol, whiteViolet, clamp(hotspot * 1.5, 0.0, 1.0));

    float nearAlpha = (nearBody * 0.30 + nearRidgeA * 1.00 + nearRidgeB * 0.95) * iMatter * quiet * audioBoost * iNear;

    vec3 ground = mix(vec3(0.006, 0.016, 0.027), vec3(0.002, 0.007, 0.013), smoothstep(0.35, 1.25, length((uv - 0.5) * asp)));
    float atmo = smoothstep(0.40, 0.9, fbm(p * 0.28 + vec2(slowT * 0.25, slowT * 0.15) + 30.0)) * 0.09 * iField;

    if (debugOn > 0.5) {
      vec3 dbg = ground;
      if (iDebug < 1.5) { }
      else if (iDebug < 2.5) dbg = vec3(rawMask);
      else if (iDebug < 3.5) dbg = vec3(rawMask * breakupS);
      else if (iDebug < 4.5) dbg += vec3(1.0, 0.0, 0.0) * clamp((nearRidgeA + nearRidgeB) * 3.0 + nearBody * 1.5, 0.0, 1.0);
      else if (iDebug < 5.5) dbg += vec3(1.0) * clamp(hotspot * 2.5 + hotGlow * 0.35, 0.0, 1.0);
      else if (iDebug < 6.5) {
        dbg = mix(dbg, nearCol, clamp(nearAlpha, 0.0, 1.0));
        dbg += lavender * hotGlow * 0.5 * iMatter + whiteViolet * hotspot * 1.6 * iMatter;
      }

      gl_FragColor = vec4(dbg, 1.0);
      return;
    }

    vec3 col = ground + violetDeep * atmo;

    float haze = (0.35 + 0.65 * smoothstep(0.25, 0.85, fieldL)) * (0.6 + 0.4 * visibility);
    col += mix(violetDeep, violetMain, fieldL * 0.8) * haze * 0.30 * iSpread * iField * iAlpha;
    col = col + color * clamp(alpha, 0.0, 1.0);

    vec3 nearFaint = mix(baseViolet, violetBright, clamp(nearRidgeA * 1.4, 0.0, 1.0));
    col = mix(col, nearFaint, clamp(nearAlpha * 0.18, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;
