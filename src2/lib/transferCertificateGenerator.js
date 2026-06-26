// src/lib/transferCertificateGenerator.js
import { jsPDF } from 'jspdf';

export async function generateTransferCertificate({ student, academic_year, school }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;

  // En-tête école
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(school.name || 'School Name', pageW / 2, 25, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(school.address || '', pageW / 2, 32, { align: 'center' });

  // Titre
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('TRANSFER CERTIFICATE', pageW / 2, 50, { align: 'center' });

  // Corps
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  let y = 70;
  doc.text(`Pupil's Name:    ${student.last_name} ${student.first_name}`, margin, y); y += 10;
  doc.text(`Class:           ${student.class}`, margin, y); y += 10;
  doc.text(`Academic Year:   ${academic_year}`, margin, y); y += 10;
  doc.text(`Date of Leaving: ________________________`, margin, y); y += 10;
  doc.text(`Reason for Leaving: ________________________`, margin, y); y += 15;

  doc.text('Academic Record:   (attached / summarised by the Head of School)', margin, y); y += 15;

  doc.text('Conduct:   ________________________', margin, y); y += 15;
  doc.text('Remarks:   ________________________', margin, y); y += 20;

  // Signatures
  doc.text('________________________', margin, y);
  doc.text('Head of School', margin, y + 7);

  doc.text('________________________', pageW - margin - 50, y);
  doc.text('Date', pageW - margin - 50, y + 7);

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}