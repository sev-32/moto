// The ground an event stands on: height, normal and grip at (x, y), as the rider's contacts read them.
// v1: flat ground with a grip scale. (Slopes, steps, beams and a moving platform are the next
// apparatus: docs/GYM.md.)
export function makeWorld(spec = {}, mods = {}) {
  const mu = mods.grip ?? spec.grip ?? 1;
  return { spec, ground: { height: () => 0, normal: () => [0, 0, 1], grip: () => mu }, grip: mu };
}
