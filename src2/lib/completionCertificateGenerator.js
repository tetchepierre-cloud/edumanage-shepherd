// src/lib/completionCertificateGenerator.js
import { jsPDF } from 'jspdf';

export async function generateCompletionCertificate({ student, academic_year, school }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Bordure décorative
  doc.setDrawColor(30, 77, 145);
  doc.setLineWidth(2);
  doc.rect(10, 10, pageW - 20, pageH - 20);

  // En-tête école
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(school.name || 'School Name', pageW / 2, 30, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(school.address || '', pageW / 2, 36, { align: 'center' });

  // Titre
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICATE OF COMPLETION', pageW / 2, 60, { align: 'center' });

  // Ligne décorative
  doc.setDrawColor(30, 77, 145);
  doc.setLineWidth(1);
  doc.line(60, 66, pageW - 60, 66);

  // Corps du certificat
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('This is to certify that', pageW / 2, 85, { align: 'center' });

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`${student.last_name} ${student.first_name}`, pageW / 2, 98, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`has successfully completed the Basic Education programme of ${school.name || 'this school'}`, pageW / 2, 112, { align: 'center' });
  doc.text(`in Class ${student.class} during the academic year ${academic_year}.`, pageW / 2, 124, { align: 'center' });

  // Signatures
  doc.setFontSize(10);
  doc.text('________________________', 50, 170);
  doc.text('Head of School', 50, 178);

  doc.text('________________________', pageW - 100, 170);
  doc.text('Date', pageW - 100, 178);

  // Cachet
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.circle(pageW / 2 + 40, 165, 15);
  doc.setFontSize(8);
  doc.text('OFFICIAL', pageW / 2 + 35, 167);
  doc.text('STAMP', pageW / 2 + 36, 171);

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}