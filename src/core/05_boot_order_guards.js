// LUCID MOTO core · legacy boot-order guards (injected right after legacy script 36)
// ------------------------------------------------------------------------------------------
// The V1.29.6.2 wrist-grip authority (legacy 34) and the V1.29.7 operational rider (legacy 36)
// publish their API objects when their script runs, but only become usable once their own
// polling boot has finished (hand baselines captured, relaxed pose applied). The V1.30
// operations studio (legacy 37) boots as soon as those objects *exist*; when it wins that race it
// throws inside G().audit() ("Cannot read properties of null (reading 'pos')", null hand
// baseline) and never finishes booting. Which module wins depends on main-thread timing, so the
// failure is intermittent in the original build too.
// Fix without touching legacy code: until a module reports ready, its global reads as undefined,
// so every dependant keeps polling exactly as it was written to.
(function (g) {
  "use strict";
  const guarded = (g.LUCID_CORE_BOOT_GUARDS = g.LUCID_CORE_BOOT_GUARDS || []);
  function publishWhenReady(name, readyFlag) {
    const api = g[name];
    if (!api || g[readyFlag]) return;
    try {
      delete g[name];
      Object.defineProperty(g, name, {
        configurable: true,
        enumerable: true,
        get() {
          return g[readyFlag] ? api : undefined;
        },
        set(v) {
          Object.defineProperty(g, name, { value: v, writable: true, configurable: true, enumerable: true });
        },
      });
      guarded.push(name);
    } catch (_) {
      g[name] = api;
    }
  }
  publishWhenReady("LUCID_RELAXED_WRIST_GRIP_AUTHORITY_V12962", "__LUCID_V12962_READY__");
  publishWhenReady("LUCID_OPERATIONAL_RIDER_V1297", "__LUCID_V1297_READY__");
})(window);
