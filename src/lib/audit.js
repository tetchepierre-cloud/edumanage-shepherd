// src/lib/audit.js
import { supabase } from './supabase'

/**
 * Enregistre une action dans la table audit_logs
 *
 * @param {Object} params
 * @param {'CREATE'|'UPDATE'|'DELETE'|'LOGIN'|'LOGOUT'|'EXPORT'} params.action
 * @param {string}  params.tableName   - Table concernée (ex: 'expenses')
 * @param {string|null} params.recordId - UUID de l'enregistrement concerné
 * @param {Object|null} params.oldData  - Données AVANT modification
 * @param {Object|null} params.newData  - Données APRÈS modification
 * @param {string}  params.description  - Description lisible (ex: "Created expense...")
 */
export async function logAction({
  action,
  tableName,
  recordId   = null,
  oldData    = null,
  newData    = null,
  description = '',
}) {
  try {
    // ── Récupérer l'utilisateur connecté ─────────────────────────────────────
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // ── Construire le diff (champs modifiés uniquement) ───────────────────────
    let changes = null
    if (action === 'UPDATE' && oldData && newData) {
      changes = {}
      for (const key of Object.keys(newData)) {
        if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
          changes[key] = {
            from: oldData[key] ?? null,
            to:   newData[key] ?? null,
          }
        }
      }
      // Si aucun changement détecté, on garde null
      if (Object.keys(changes).length === 0) changes = null
    }

    // ── Insérer dans audit_logs ───────────────────────────────────────────────
    const { error } = await supabase.from('audit_logs').insert([
      {
        user_id:     user?.id    ?? null,
        user_email:  user?.email ?? null,
        action,
        table_name:  tableName,
        record_id:   recordId,
        old_data:    oldData,
        new_data:    newData,
        changes,
        description,
        created_at:  new Date().toISOString(),
      },
    ])

    if (error) {
      console.warn('⚠️ Audit log failed (non-blocking):', error.message)
    }

  } catch (err) {
    // Ne jamais bloquer l'application pour un log
    console.warn('⚠️ Audit log exception (non-blocking):', err.message)
  }
}
