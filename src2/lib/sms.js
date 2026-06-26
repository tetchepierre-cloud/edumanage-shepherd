// src/lib/sms.js
import { supabase } from './supabase';

/**
 * Envoie un SMS via l'Edge Function Supabase (Hubtel)
 * @param {string} phoneNumber - numéro local (ex: 0244123456)
 * @param {string} message - contenu du SMS
 */
export async function sendSMS(phoneNumber, message) {
  const { data, error } = await supabase.functions.invoke('send-sms', {
    body: { phone: phoneNumber, message },
  });

  if (error) {
    console.error('SMS sending failed:', error);
    return { success: false, error };
  }
  return { success: true, data };
}

/**
 * Formate le SMS de paiement avec un ton professionnel et institutionnel
 * @param {string} studentName - Nom complet de l'élève
 * @param {string|number} amount - Montant payé
 * @param {string} receiptNumber - Numéro de reçu
 * @param {string|number} balance - Vrai solde restant pour le trimestre
 * @param {string} term - Trimestre concerné (ex: Term 1)
 */
export function formatPaymentSMS(studentName, amount, receiptNumber, balance, term) {
  return `Payment of GHS ${amount} received for ${studentName} (Receipt: ${receiptNumber}). New Outstanding BALANCE for ${term}: GHS ${balance}. THANK YOU for your continued Trust!`;
}

/**
 * Formate le SMS de notification d'absence
 * @param {string} studentName - Nom complet de l'élève
 * @param {string} date - Date de l'absence (format lisible)
 */
export function formatAbsenceSMS(studentName, date) {
  return `Dear Parent, ${studentName} was marked ABSENT on ${date}. Please submit a justification via the Parent Portal, or contact the school if unaware.`;
}