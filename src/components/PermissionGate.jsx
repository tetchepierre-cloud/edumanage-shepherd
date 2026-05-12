import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

const FULL_ACCESS_ROLES = ['owner', 'director'];

export function CanSee({ module, section, element, children, fallback = null }) {
  const { profile } = useAuthStore();
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    if (!profile || FULL_ACCESS_ROLES.includes(profile.role)) {
      setAllowed(true);
      return;
    }

    // Requête directe pour la permission précise
    supabase
      .from('role_permissions')
      .select('enabled, permission_elements!inner(action_type)')
      .eq('role', profile.role)
      .eq('permission_elements.module', module)
      .eq('permission_elements.section', section)
      .eq('permission_elements.element', element)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setAllowed(false);
          return;
        }
        const actionType = data.permission_elements?.action_type;
        // 'see' ou 'act' autorisent tous deux la visibilité
        setAllowed(data.enabled === true && (actionType === 'see' || actionType === 'act'));
      })
      .catch(() => setAllowed(false));
  }, [profile, module, section, element]);

  if (allowed === null) return fallback;
  return allowed ? children : fallback;
}

export function CanAct({ module, section, element, children, fallback = null }) {
  const { profile } = useAuthStore();
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    if (!profile || FULL_ACCESS_ROLES.includes(profile.role)) {
      setAllowed(true);
      return;
    }

    supabase
      .from('role_permissions')
      .select('enabled, permission_elements!inner(action_type)')
      .eq('role', profile.role)
      .eq('permission_elements.module', module)
      .eq('permission_elements.section', section)
      .eq('permission_elements.element', element)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setAllowed(false);
          return;
        }
        const actionType = data.permission_elements?.action_type;
        setAllowed(data.enabled === true && actionType === 'act');
      })
      .catch(() => setAllowed(false));
  }, [profile, module, section, element]);

  if (allowed === null) return fallback;
  return allowed ? children : fallback;
}