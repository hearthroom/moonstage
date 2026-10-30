/** Start can commit a first selection or replace a retired saved model. Drain
 * any earlier settings read before loading the committed model so a stale result
 * cannot overwrite it. Ordinary resumes keep their existing settings, unless the
 * resumed conversation lives on another revision of the card than the settings
 * already loaded (settingsMoved). */
export async function syncStartedModelSettings(
  started: { historyConversation?: unknown; modelPreferenceFallback?: unknown },
  pendingSettings: Promise<void> | null,
  reloadSettings: () => Promise<void>,
  notifyFallback: () => void,
  settingsMoved = false,
): Promise<void> {
  if (!settingsMoved && started.historyConversation !== false && started.modelPreferenceFallback !== true) return
  await pendingSettings
  await reloadSettings()
  if (started.modelPreferenceFallback === true) notifyFallback()
}
