const ARKESEL_API_KEY = import.meta.env.VITE_ARKESEL_API_KEY

export async function sendSMS(phoneNumber, message) {
  try {
    const response = await fetch('https://sms.arkesel.com/sms/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send-sms',
        api_key: ARKESEL_API_KEY,
        to: phoneNumber,
        from: 'EduManage',
        sms: message,
      }),
    })
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('SMS erreur:', error)
    return { success: false, error }
  }
}

export function formatPaymentSMS(studentName, amount, receiptNumber, balance) {
  return `EduManage GH: Paiement recu pour ${studentName}. Montant: GHS ${amount}. Recu N°${receiptNumber}. Solde restant: GHS ${balance}. Merci!`
}
