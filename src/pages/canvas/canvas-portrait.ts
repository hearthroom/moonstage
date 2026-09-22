/** One card image: portrait background, with support for legacy avatar-only cards. */
export function cardPortrait(role: {roleBackground?: unknown; roleAvatar?: unknown}): string {
  const portrait = typeof role.roleBackground === 'string' ? role.roleBackground : ''
  return portrait || (typeof role.roleAvatar === 'string' ? role.roleAvatar : '')
}
