import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const usePermissionsStore = create((set, get) => ({
  permissions: {},  // { "module.section.element": "see"|"act" }
  loaded: false,

  loadPermissions: async (role) => {
    if (!role) {
      set({ permissions: {}, loaded: true })
      return
    }

    const { data: perms } = await supabase
      .from('role_permissions')
      .select('enabled, permission_elements(module, section, element, action_type)')
      .eq('role', role)

    const map = {}
    ;(perms || []).forEach(p => {
      if (p.enabled && p.permission_elements) {
        const key = `${p.permission_elements.module}.${p.permission_elements.section}.${p.permission_elements.element}`
        map[key] = p.permission_elements.action_type
      }
    })

    set({ permissions: map, loaded: true })
  },

  hasPermission: (module, section, element, type = null) => {
    const key = `${module}.${section}.${element}`
    const perm = get().permissions[key]
    if (!type) return !!perm
    return perm === type || perm === 'act' // 'act' implique 'see'
  },

  clear: () => set({ permissions: {}, loaded: false })
}))