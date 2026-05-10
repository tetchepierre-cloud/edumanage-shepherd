// src/lib/classListGenerator.js
import { jsPDF } from 'jspdf';

export async function generateClassListPDF({ className, students, school }) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;
  
  // Charger le logo si disponible
  let logoData = null;
  if (school.logo) {
    try {
      const response = await fetch(school.logo);
      const blob = await response.blob();
      const reader = new FileReader();
      logoData = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Logo could not be loaded for class list.');
    }
  }

    // --- En-tête école (avec logo si disponible) ---
  if (logoData) {
    const logoSize = 18;
    doc.addImage(logoData, 'JPEG', margin, y - 2, logoSize, logoSize);
    const textX = margin + logoSize + 4;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(school.name || 'School Name', textX, y + 4, { align: 'left' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(school.address || 'Address', textX, y + 4, { align: 'left' });
    y += 5;
    if (school.phone) {
      doc.text(`Tel: ${school.phone}`, textX, y + 4, { align: 'left' });
      y += 5;
    }
  } else {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(school.name || 'School Name', pageW / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(school.address || 'Address', pageW / 2, y, { align: 'center' });
    y += 5;
    if (school.phone) {
      doc.text(`Tel: ${school.phone}`, pageW / 2, y, { align: 'center' });
      y += 5;
    }
  }
  y += 4;

  // --- Titre ---
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`CLASS LIST - ${className.toUpperCase()}`, pageW / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Academic Year: 2025/2026   |   Total: ${students.length} pupils`, pageW / 2, y, { align: 'center' });
  y += 10;

  // --- Tableau ---
  const headers = ['No.', 'Full Name', 'Gender', 'Date of Birth', 'Parent / Guardian', 'Phone'];
  const colWidths = [10, 48, 16, 28, 45, 30];
  const startX = margin;

  // Fonction qui dessine une ligne d'en‑tête
  function drawHeader(yPos) {
    let xP = startX;
    for (let i = 0; i < headers.length; i++) {
      // Fond bleu
      doc.setFillColor(30, 77, 145);
      doc.rect(xP, yPos, colWidths[i], 6, 'F');
      // Texte blanc
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(headers[i], xP + 1, yPos + 4);
      xP += colWidths[i];
    }
  }

  // Dessiner la première en‑tête
  drawHeader(y);
  y += 6;

  // --- Données élèves ---
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  for (let idx = 0; idx < students.length; idx++) {
    const student = students[idx];

    // Saut de page
    if (y + 10 > pageH - margin) {
      doc.addPage();
      y = margin;
      drawHeader(y);
      y += 6;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
    }

    // Alternance de couleurs
    if (idx % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), 7, 'F');
    }

    const fullName = `${student.last_name || ''} ${student.first_name || ''}`.trim();
    const gender = (student.gender || '').toLowerCase() === 'female' ? 'F'
                 : (student.gender || '').toLowerCase() === 'male'   ? 'M'
                 : (student.gender || '—');

    const row = [
      String(idx + 1),
      fullName,
      gender,
      student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString('en-GB') : '—',
      student.parent_name || '—',
      student.parent_phone || '—',
    ];

    let x = startX;
    for (let i = 0; i < row.length; i++) {
      doc.text(row[i], x + 1, y + 5);
      x += colWidths[i];
    }

    y += 7;
  }

  // --- Pied de page ---
  y += 15;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Class Teacher Signature: _________________________', margin, y);
  y += 10;
  doc.text('Head of School Signature: _________________________', margin, y);

  // Ouvrir dans un nouvel onglet
  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}