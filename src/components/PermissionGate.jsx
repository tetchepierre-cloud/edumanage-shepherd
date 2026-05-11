import { usePermissions } from '../hooks/usePermissions'
import { useAuthStore } from '../stores/authStore'

const FULL_ACCESS_ROLES = ['owner', 'director']

export function CanSee({ module, section, element, children, fallback = null }) {
  const { profile } = useAuthStore()
  const { hasPermission } = usePermissions()

  if (profile && FULL_ACCESS_ROLES.includes(profile.role)) {
    return children
  }
  return hasPermission(module, section, element, 'see') ? children : fallback
}

export function CanAct({ module, section, element, children, fallback = null }) {
  const { profile } = useAuthStore()
  const { hasPermission } = usePermissions()

  if (profile && FULL_ACCESS_ROLES.includes(profile.role)) {
    return children
  }
  return hasPermission(module, section, element, 'act') ? children : fallback
}