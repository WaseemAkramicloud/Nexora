export type NexoraAuthenticationMode = 'federation' | 'legacy' | 'none'

export interface LogoutState {
  success: boolean
  authenticationMode: NexoraAuthenticationMode
}

export function getLogoutDestination(input: {
  logoutState: LogoutState
  legacyGlobalLogoutRequested?: boolean
  legacyGlobalLogoutUrl?: string
}): string {
  const { logoutState } = input

  if (logoutState.authenticationMode === 'federation') {
    return logoutState.success
      ? '/login/maftah'
      : '/login/maftah?error=session_revocation_failed'
  }

  // All authentication modes redirect to Maftah login after logout
  return '/login/maftah'
}
