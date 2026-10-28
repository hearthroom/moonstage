/** Start can commit a first selection or replace a retired saved model. Drain
 * any earlier settings read before loading the committed model so a stale result
 * cannot overwrite it. Ordinary resumes keep their existing settings. */
export async function syncStartedModelSettings(
  started: { historyConversation?: unknown; modelPreferenceFallback?: unknown },
  pendingSettings: Promise<void> | null,
  reloadSettings: () => Promise<void>,
  notifyFallback: () => void,
): Promise<void> {
  if (started.historyConversation !== false && started.modelPreferenceFallback !== true) return
  await pendingSettings
  await reloadSettings()
  if (started.modelPreferenceFallback === true) notifyFallback()
}
