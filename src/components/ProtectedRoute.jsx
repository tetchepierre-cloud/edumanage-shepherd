// src/components/ProtectedRoute.jsx
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

export default function ProtectedRoute({ children, moduleName }) {
  const { profile, loading } = useAuthStore();
  const [canAccess, setCanAccess] = useState(null);

  useEffect(() => {
    if (!profile?.role || !moduleName) {
      setCanAccess(true);
      return;
    }

    supabase
      .from('module_access')
      .select('can_read')
      .eq('role', profile.role)
      .eq('module', moduleName)
      .single()
      .then(({ data }) => {
        // Si aucune donnée n'est trouvée (table vide ou module non configuré),
        // on autorise l'accès par défaut (comportement identique au Layout)
        setCanAccess(data ? data.can_read : true);
      })
      .catch(() => {
        // En cas d'erreur (table inexistante, etc.), on autorise aussi
        setCanAccess(true);
      });
  }, [profile, moduleName]);

  if (loading || canAccess === null) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  if (!canAccess) {
    return <Navigate to="/" replace />;
  }

  return children;
}