import { usePermissionsStore } from '../stores/permissionsStore'

export function usePermissions() {
  const { permissions, loaded, hasPermission } = usePermissionsStore()
  return { permissions, loaded, hasPermission }
}