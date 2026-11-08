// Scale is linear in tracked controller separation. 
// The tracking floor prevents division by zero without a 10 cm dead zone.
export const MIN_TRACKED_HAND_SEPARATION_METRES=0.035;
export function resolveTwoHandScale(initialScale,initialDistance,currentDistance){
  if(![initialScale,initialDistance,currentDistance].every(Number.isFinite)) return NaN;
  const start=Math.max(MIN_TRACKED_HAND_SEPARATION_METRES,initialDistance);
  const current=Math.max(MIN_TRACKED_HAND_SEPARATION_METRES,currentDistance);
  return Math.min(3.50,Math.max(0.10,initialScale*current/start));
}
