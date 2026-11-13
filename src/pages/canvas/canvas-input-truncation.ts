/** Preserve the server's retry kind and switch permission. */
export function inputTruncationActions(cause: unknown, base: {action:string;label:string}[], hasOtherLanes: boolean, switchLane: string) {
  if (cause !== 'input_truncated' || !hasOtherLanes) return base
  return base.map(entry => entry.action === 'switch_model' ? {action:'switch_lane',label:switchLane} : entry)
}
