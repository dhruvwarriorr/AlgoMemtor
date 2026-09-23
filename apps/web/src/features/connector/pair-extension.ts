import {
  createConnectorToken,
  fetchConnectorTokens,
  revokeConnectorToken,
} from '@/features/profile/api/connector'

import {
  browserLabel,
  connectorApiAddress,
  sendTokenToExtension,
} from './extension-bridge'

// Pairs the extension in this browser with the signed-in learner: creates a
// connector token and hands it to the extension, which then syncs on its own.
// Reconnecting the same browser replaces its previous token.
export async function pairExtension() {
  const label = `${browserLabel()} extension`
  const existing = await fetchConnectorTokens()
  await Promise.all(
    existing.data
      .filter((token) => token.label === label)
      .map((token) => revokeConnectorToken(token.id)),
  )
  const created = await createConnectorToken(label)
  const result = await sendTokenToExtension({
    secret: created.data.secret,
    apiUrl: connectorApiAddress(),
    label,
  })
  if (!result.ok) {
    await revokeConnectorToken(created.data.token.id).catch(() => undefined)
    throw new Error(result.error ?? 'The extension could not be connected.')
  }
}
