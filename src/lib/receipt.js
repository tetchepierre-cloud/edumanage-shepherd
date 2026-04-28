export function printReceipt(data) {
  const {
    receiptNumber,
    studentName,
    className,
    amount,
    paymentType,
    paymentMethod,
    cashierName,
    date,
    schoolName = 'EduManage Ghana',
    schoolAddress = 'Tamale, Ghana',
    schoolPhone = '',
    balance = 0,
  } = data

  const receiptHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: Arial, sans-serif;
          width: 148mm;
          min-height: 210mm;
          padding: 10mm;
          font-size: 12px;
        }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
        .school-name { font-size: 18px; font-weight: bold; }
        .receipt-title { font-size: 14px; font-weight: bold; margin: 8px 0; text-align: center; }
        .receipt-number { text-align: center; color: #666; margin-bottom: 10px; }
        .info-row { display: flex; justify-content: space-between; margin: 4px 0; }
        .info-label { font-weight: bold; }
        .amount-box {
          border: 2px solid #000;
          padding: 8px;
          text-align: center;
          margin: 10px 0;
          font-size: 16px;
          font-weight: bold;
        }
        .footer { border-top: 1px solid #000; margin-top: 15px; padding-top: 8px; text-align: center; font-size: 10px; }
        .signature-line { border-top: 1px solid #000; width: 60%; margin: 20px auto 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="school-name">${schoolName}</div>
        <div>${schoolAddress}</div>
        ${schoolPhone ? `<div>Tél: ${schoolPhone}</div>` : ''}
      </div>

      <div class="receipt-title">REÇU DE PAIEMENT</div>
      <div class="receipt-number">N° ${receiptNumber}</div>

      <div class="info-row">
        <span class="info-label">Date:</span>
        <span>${date}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Élève:</span>
        <span>${studentName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Classe:</span>
        <span>${className}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Type:</span>
        <span>${paymentType}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Mode:</span>
        <span>${paymentMethod}</span>
      </div>

      <div class="amount-box">
        MONTANT PAYÉ: GHS ${parseFloat(amount).toFixed(2)}
      </div>

      <div class="info-row">
        <span class="info-label">Solde restant:</span>
        <span>GHS ${parseFloat(balance).toFixed(2)}</span>
      </div>

      <div class="signature-line"></div>
      <div style="text-align:center; font-size:11px;">Signature du caissier</div>
      <div style="text-align:center; font-size:11px; margin-top:4px;">${cashierName}</div>

      <div class="footer">
        <p>Merci pour votre confiance</p>
        <p>Ce reçu est valable comme preuve de paiement</p>
      </div>
    </body>
    </html>
  `

  const printWindow = window.open('', '_blank', 'width=600,height=800')
  printWindow.document.write(receiptHTML)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 500)
}

export function generateReceiptNumber() {
  const date = new Date()
  const year = date.getFullYear().toString().slice(-2)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const random = Math.floor(Math.random() * 9000) + 1000
  return `REC-${year}${month}${day}-${random}`
}
