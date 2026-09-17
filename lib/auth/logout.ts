export type NexoraAuthenticationMode = 'federation' | 'legacy' | 'none'

export interface LogoutState {
  success: boolean
  authenticationMode: NexoraAuthenticationMode
}

export function getLogoutDestination(input: {
  logoutState: LogoutState
  legacyGlobalLogoutRequested: boolean
  legacyGlobalLogoutUrl: string
}): string {
  const { logoutState } = input

  if (logoutState.authenticationMode === 'federation') {
    return logoutState.success
      ? '/login/maftah'
      : '/login/maftah?error=session_revocation_failed'
  }

  if (logoutState.authenticationMode === 'legacy') {
    return input.legacyGlobalLogoutRequested ? input.legacyGlobalLogoutUrl : '/'
  }

  return '/login/maftah'
}
