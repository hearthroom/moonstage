/** A first-start response commits the model after the initial settings request may
 * already have read the old default. Drain that read before loading the committed
 * settings so it cannot later overwrite the selected model. */
export async function syncStartedModelSettings(
  started: { historyConversation?: unknown; modelPreferenceFallback?: unknown },
  pendingSettings: Promise<void> | null,
  reloadSettings: () => Promise<void>,
  notifyFallback: () => void,
): Promise<void> {
  if (started.historyConversation !== false) return
  await pendingSettings
  await reloadSettings()
  if (started.modelPreferenceFallback === true) notifyFallback()
}
