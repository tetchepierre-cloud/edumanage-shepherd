// src/lib/kgReportCardGenerator.js
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

jsPDF.autoTable = autoTable;

export async function generateKgReportCard({ studentId, termId, className, school, report }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const isKg = String(className || '').toUpperCase().includes('KG');

  // ── Palette ──
  const colors = {
    navy: [13, 43, 94],
    navyMid: [21, 57, 110],
    gold: [184, 144, 31],
    goldPale: [244, 234, 203],
    paperBlue: [238, 243, 251],
    rowAlt: [228, 236, 249],
    border: [185, 199, 222],
    ink: [28, 43, 58],
    muted: [90, 107, 132],
    white: [255, 255, 255],
    paper: [251, 248, 239],
    inkSoft: [91, 86, 72]
  };

  const marginX = 14;
  const contentW = pageW - marginX * 2;

  // ── Fonction pour dessiner le drapeau ghanéen et l'étoile ──
  const drawGhanaFlag = () => {
    const ghanaRed   = [206, 17, 38];
    const ghanaGold  = [252, 209, 22];
    const ghanaGreen = [0, 107, 61];
    const stripeWidth = pageW / 3;

    doc.setFillColor(...ghanaRed);   doc.rect(0, 0, stripeWidth, 4, 'F');
    doc.setFillColor(...ghanaGold);  doc.rect(stripeWidth, 0, stripeWidth, 4, 'F');
    doc.setFillColor(...ghanaGreen); doc.rect(stripeWidth * 2, 0, stripeWidth, 4, 'F');

    const starCX = stripeWidth + (stripeWidth / 2);
    const starCY = 2;
    const starLines = [
      [0.336, 1.037], [1.090, 0], [-0.881, 0.640], [0.335, 1.036],
      [-0.880, -0.640], [-0.880, 0.640], [0.335, -1.036], [-0.881, -0.640],
      [1.090, 0]
    ];
    doc.setFillColor(0, 0, 0);
    doc.lines(starLines, starCX, starCY - 1.5, [1, 1], 'F', true);
  };

  // ── Fonction pour les numéros de page ──
  const addPageNumber = (current, total) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...colors.muted);
    doc.text(`Page ${current}/${total}`, pageW - marginX, pageH - 5, { align: 'right' });
  };

  // ── PAGE 1 ──
  drawGhanaFlag();

  // Cadre extérieur
  doc.setDrawColor(...colors.gold);
  doc.setLineWidth(0.6);
  doc.rect(6, 6, pageW - 12, pageH - 12);

  // ── FILIGRANE (page 1) ──
  doc.setFontSize(5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colors.muted);
  doc.text('Powered by EduManage GH  |  +233 59 643 8500', 9, pageH - 20, { angle: 90 });

  let y = 8;
  const logoSize = 27;
  const boxSize = 27;

  // Logo (gauche)
  if (school?.logo) {
    try {
      doc.addImage(school.logo, 'PNG', marginX, y, logoSize, logoSize);
    } catch (e) {}
  }

  // Nom de l'école et adresse (centre)
  const centerX = marginX + logoSize + 6;
  const centerMaxWidth = pageW - marginX - boxSize - 6 - (marginX + logoSize + 6);

  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...colors.navy);
  doc.text(String(school?.name || '').toUpperCase(), centerX, y + 8, { maxWidth: centerMaxWidth });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...colors.inkSoft);
  const contact = [school?.phone, school?.email].filter(Boolean).join('  ·  ');
  const address = `${school?.address || ''}   ${contact}`;
  doc.text(address, pageW / 2, y + 14, { align: 'center', maxWidth: centerMaxWidth });

  // Titre (cadre carré à droite)
  const boxX = pageW - marginX - boxSize;
  doc.setFillColor(...colors.navy);
  doc.setDrawColor(...colors.gold);
  doc.setLineWidth(0.4);
  doc.rect(boxX, y, boxSize, boxSize, 'FD');

  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...colors.gold);
  doc.text("PUPIL'S", boxX + boxSize / 2, y + 8, { align: 'center' });
  doc.text("ASSESSMENT", boxX + boxSize / 2, y + 14, { align: 'center' });
  doc.text("REPORT", boxX + boxSize / 2, y + 20, { align: 'center' });

  y += Math.max(logoSize, boxSize) + 4;

  // Biodata
  doc.setFillColor(...colors.paper);
  doc.setDrawColor(217, 205, 166);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, y, contentW, 28, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.inkSoft);
  doc.text('NAME OF PUPIL:', marginX + 4, y + 6);
  doc.text('CLASS / LEVEL:', 110, y + 6);
  doc.text('AGE:', 160, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...colors.navy);
  doc.text(String(report.studentName || '').toUpperCase(), marginX + 4, y + 10.5);
  doc.text(className || '—', 110, y + 10.5);
  doc.text(report.age || '—', 160, y + 10.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.inkSoft);
  doc.text('TERM:', marginX + 4, y + 16.5);
  doc.text('ACADEMIC YEAR:', 110, y + 16.5);
  doc.text('SEX:', 160, y + 16.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...colors.ink);
  doc.text(report.termName || '—', marginX + 4, y + 20.5);
  doc.text(report.academicYear || '—', 110, y + 20.5);
  doc.text(report.sex || '—', 160, y + 20.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.inkSoft);
  doc.text('TOTAL ATTENDANCE:', marginX + 4, y + 26);
  doc.text("PUPIL'S ATTENDANCE:", 110, y + 26);
  doc.text('NO. ON ROLL:', 160, y + 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...colors.ink);

  const getTextWidth = (text) => {
    const fontSize = doc.internal.getFontSize();
    const width = doc.getStringUnitWidth(text) * fontSize / doc.internal.scaleFactor;
    return width;
  };

  const x1 = marginX + 4 + getTextWidth('TOTAL ATTENDANCE:') + 2;
  const x2 = 110 + getTextWidth("PUPIL'S ATTENDANCE:") + 2;
  const x3 = 160 + getTextWidth('NO. ON ROLL:') + 2;

  doc.text(String(report.attendance?.total || '—'), x1, y + 26);
  doc.text(String(report.attendance?.present || '—'), x2, y + 26);
  doc.text(String(report.numberOnRoll || '—'), x3, y + 26);

  let currentY = y + 32;

  // Titre de la section
  doc.setFillColor(...colors.navy);
  doc.rect(marginX, currentY, contentW, 8.45, 'F');
  doc.setDrawColor(...colors.gold);
  doc.setLineWidth(0.4);
  doc.line(marginX, currentY, pageW - marginX, currentY);
  doc.line(marginX, currentY + 8.45, pageW - marginX, currentY + 8.45);

  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...colors.gold);
  doc.text('LEARNING ASSESSMENT', pageW / 2, currentY + 6, { align: 'center' });
  currentY += 14;

  // Légende
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic', 'bold');
  doc.setTextColor(...colors.inkSoft);
  doc.text('A = Always   •   S = Sometimes   •   N = Never   •   NH = Needs Help', marginX, currentY);
  currentY += 2;

  // Domaines d'évaluation
  const sections = [
    { title: 'PHYSICAL', items: report.physical || [] },
    { title: 'HEALTH', items: report.health || [] },
    { title: 'SENSES', items: report.senses || [] },
    { title: 'PSYCHO-SOCIAL', items: report.social || [] },
    { title: 'LANGUAGE & COMM.', items: report.language || [] },
    { title: 'COGNITIVE / SELF HELP', items: report.cognitive || [] },
    { title: 'MATHEMATICS', items: report.math || [] },
    { title: 'ENV. STUDIES', items: report.environmental || [] }
  ];

  const colGap = 4;
  const colWidth = (contentW - colGap) / 2;
  const rightX = marginX + colWidth + colGap;

  const renderChecklist = (section, xPos, yPos, width) => {
    doc.setFillColor(...colors.navy);
    doc.rect(xPos, yPos, width, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colors.white);
    doc.text(section.title, xPos + 2, yPos + 3.5);

    autoTable(doc, {
      startY: yPos + 5,
      margin: { left: xPos },
      tableWidth: width,
      head: [['Description', 'A', 'S', 'N', 'NH']],
      body: section.items.map(item => [
        item.desc,
        item.val === 'A' ? 'X' : '',
        item.val === 'S' ? 'X' : '',
        item.val === 'N' ? 'X' : '',
        item.val === 'NH' ? 'X' : ''
      ]),
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 0.8,
        lineColor: colors.border,
        lineWidth: 0.1,
        textColor: colors.ink,
        fillColor: [255, 255, 255]
      },
      headStyles: {
        fillColor: colors.goldPale,
        textColor: colors.navy,
        halign: 'center',
        fontStyle: 'bold',
        lineColor: colors.gold
      },
      columnStyles: {
       0: { cellWidth: width - 24 },
       1: { halign: 'center', cellWidth: 6, fontSize: 9, fontStyle: 'bold' },
       2: { halign: 'center', cellWidth: 6, fontSize: 9, fontStyle: 'bold' },
       3: { halign: 'center', cellWidth: 6, fontSize: 9, fontStyle: 'bold' },
       4: { halign: 'center', cellWidth: 6, fontSize: 9, fontStyle: 'bold' }
     },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index > 0 && data.cell.raw === 'X') {
          data.cell.styles.fillColor = colors.gold;
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
    return doc.lastAutoTable.finalY;
  };

  let leftY = currentY;
  let rightY = currentY;

  sections.forEach((sec, idx) => {
    if (idx % 2 === 0) {
      leftY = renderChecklist(sec, marginX, leftY + 2, colWidth);
    } else {
      rightY = renderChecklist(sec, rightX, rightY + 2, colWidth);
    }
  });

  // Numéro de page 1
  addPageNumber(1, 2);

  // ── PAGE 2 ──
  doc.addPage();

  // Cadre extérieur sur la page 2
  doc.setDrawColor(...colors.gold);
  doc.setLineWidth(0.6);
  doc.rect(6, 6, pageW - 12, pageH - 12);

  // ── FILIGRANE (page 2) ──
  doc.setFontSize(5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colors.muted);
  doc.text('Powered by EduManage GH  |  +233 59 643 8500', 9, pageH - 20, { angle: 90 });

  currentY = 14;

  // Titre de la page 2
  doc.setFillColor(...colors.navy);
  doc.rect(marginX, currentY, contentW, 8.45, 'F');
  doc.setDrawColor(...colors.gold);
  doc.setLineWidth(0.4);
  doc.line(marginX, currentY, pageW - marginX, currentY);
  doc.line(marginX, currentY + 8.45, pageW - marginX, currentY + 8.45);

  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...colors.gold);
  doc.text('END OF TERM EXAMINATION RESULTS', pageW / 2, currentY + 6, { align: 'center' });

  currentY += 12;

  // ── TABLEAU DES RÉSULTATS D'EXAMEN (Le Détail) ──
  if (report.examResults && report.examResults.length > 0) {
    autoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      tableWidth: contentW,
      head: [['SUBJECT', 'CLASS (30%)', 'EXAM (70%)', 'TOTAL (100%)', 'GRADE', 'REMARKS']],
      body: report.examResults.map(r => [r.subject, r.classScore, r.examScore, r.total, r.grade, r.remark]),
      theme: 'grid',
      headStyles: { 
        fillColor: colors.navyMid, 
        textColor: colors.white, 
        fontStyle: 'bold',
        halign: 'center'
      },
      alternateRowStyles: { fillColor: colors.rowAlt },
      styles: { 
        fontSize: 8, 
        cellPadding: 1.8,
        lineColor: colors.border, 
        lineWidth: 0.1, 
        textColor: colors.ink 
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center', fontStyle: 'bold', textColor: colors.navy },
        4: { halign: 'center', fontStyle: 'bold' },
        5: { halign: 'left' }
      }
    });

    currentY = doc.lastAutoTable.finalY + 6;

    // ── TABLEAU DE BORD (PERFORMANCE SUMMARY) ──
    const totalScore = report.totalAllSubjects !== undefined ? Number(report.totalAllSubjects).toFixed(1) : '—';
    const avgScore = report.overallAverage !== undefined ? Number(report.overallAverage).toFixed(2) : '—';
    const position = report.rank ? report.rank : '—';
    const roll = report.numberOnRoll ? report.numberOnRoll : '—';

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      tableWidth: contentW,
      head: [['TOTAL SCORE', 'OVERALL AVERAGE', 'POSITION IN CLASS', 'TOTAL ON ROLL']],
      body: [[totalScore, `${avgScore}%`, position, roll]],
      theme: 'grid',
      headStyles: {
        fillColor: colors.paper,
        textColor: colors.muted,
        fontSize: 7,
        halign: 'center',
        fontStyle: 'bold',
        lineColor: colors.gold,
        lineWidth: 0.2
      },
      bodyStyles: {
        fillColor: colors.white,
        textColor: colors.navy,
        fontSize: 11,
        fontStyle: 'bold',
        halign: 'center',
        lineColor: colors.gold,
        lineWidth: 0.2
      }
    });

    currentY = doc.lastAutoTable.finalY + 6;

    // ── BLOC DE SYNTHÈSE QUALITATIVE (CONCLUSION DU BULLETIN) ──
    if (report.overallAverage !== undefined && report.overallAverage !== null) {
      const avg = parseFloat(report.overallAverage);

      if (!isNaN(avg)) {
        let commentLabel = "";
        let commentText = "";

        // Application du barème (en Anglais)
        if (avg >= 90) {
          commentLabel = "Exceptional";
          commentText = "Your child greatly exceeds the term's objectives. Congratulations on this excellent performance!";
        } else if (avg >= 80) {
          commentLabel = "Very Good";
          commentText = "Your child has perfectly mastered the expected skills. Keep encouraging them in this positive dynamic.";
        } else if (avg >= 70) {
          commentLabel = "Good";
          commentText = "Your child has successfully acquired the objectives. They are on the right track and progressing steadily.";
        } else if (avg >= 60) {
          commentLabel = "Satisfactory";
          commentText = "Your child is making consistent progress. They are well on their way to achieving the set objectives.";
        } else if (avg >= 50) {
          commentLabel = "Developing";
          commentText = "Your child is making progress. Additional focus in certain areas will help consolidate their learning.";
        } else if (avg >= 40) {
          commentLabel = "Needs Consolidation";
          commentText = "Your child needs reinforcement. With a bit more practice and guided support, they will progress effectively.";
        } else {
          commentLabel = "Needs Support";
          commentText = "Your child requires sustained support. We are implementing tailored activities to help them advance at their own pace.";
        }

        // ── Adaptation au genre ──
        const gender = report.sex ? report.sex.toLowerCase() : '';
        const isMale = gender === 'male';
        const isFemale = gender === 'female';

        // Fonction de remplacement des pronoms (CORRIGÉE : gère "They are" → "He is" / "She is")
        const replacePronouns = (text) => {
          if (!isMale && !isFemale) return text;
          const subj = isMale ? 'he' : 'she';
          const obj = isMale ? 'him' : 'her';
          const poss = isMale ? 'his' : 'her';
          return text
            .replace(/\bThey are\b/g, subj.charAt(0).toUpperCase() + subj.slice(1) + ' is')
            .replace(/\bthey are\b/g, subj + ' is')
            .replace(/\bThey\b/g, subj.charAt(0).toUpperCase() + subj.slice(1))
            .replace(/\bthey\b/g, subj)
            .replace(/\bThem\b/g, obj.charAt(0).toUpperCase() + obj.slice(1))
            .replace(/\bthem\b/g, obj)
            .replace(/\bTheir\b/g, poss.charAt(0).toUpperCase() + poss.slice(1))
            .replace(/\btheir\b/g, poss);
        };

        const genderedComment = replacePronouns(commentText);

        // ── Configuration visuelle ──
        const boxPad = 5;
        doc.setFont('times', 'italic');
        doc.setFontSize(10.5);
        const splitText = doc.splitTextToSize(genderedComment, contentW - (boxPad * 2));
        const textHeight = splitText.length * 5.5;
        const boxH = 12 + textHeight;

        // Fond crème et bordure dorée
        doc.setFillColor(253, 251, 244);
        doc.setDrawColor(...colors.gold);
        doc.setLineWidth(0.4);
        doc.roundedRect(marginX, currentY, contentW, boxH, 2.5, 2.5, 'FD');

        // Ligne 1 : PERFORMANCE: label (en bleu marine, gras, helvetica)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        const xStart = marginX + boxPad;
        // "PERFORMANCE: " en bleu marine
        doc.setTextColor(...colors.navy);
        const part1 = `PERFORMANCE: `;
        doc.text(part1, xStart, currentY + 6);
        // Le label (ex: SATISFACTORY) en or
        const widthPart1 = doc.getTextWidth(part1);
        doc.setTextColor(...colors.gold);
        doc.text(commentLabel.toUpperCase(), xStart + widthPart1, currentY + 6);

        // Ligne de séparation
        doc.setDrawColor(230, 220, 190);
        doc.setLineWidth(0.2);
        doc.line(marginX + boxPad, currentY + 8.5, pageW - marginX - boxPad, currentY + 8.5);

        // Ligne 2 : Commentaire (helvetica, gras, noir)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(0, 0, 0);
        doc.text(splitText, marginX + boxPad, currentY + 13);

        currentY += boxH + 6;
      }
    }

  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...colors.muted);
    doc.text('No examination results recorded for this term.', marginX, currentY);
    currentY += 6;
  }

  // PROMOTED / CONDUCT / ATTITUDE
  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentW,
    body: [
      [`PROMOTED TO: ${report.promotedTo || '—'}`],
      [`CONDUCT: ${report.conduct || '—'}`, `ATTITUDE: ${report.attitude || '—'}`]
    ],
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 1.6,
      lineColor: [217, 205, 166],
      lineWidth: 0.15,
      fillColor: colors.paper,
      textColor: colors.ink
    },
    columnStyles: {
      0: { cellWidth: contentW * 0.5 },
      1: { cellWidth: contentW * 0.5 }
    }
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // Remarques et signatures
  const boxW = (contentW - 6) / 2;
  doc.setDrawColor(217, 205, 166);
  doc.setFillColor(255, 255, 255);
  
  const rectHeight = 18 * 1.35; // 24.3 mm (augmentation de 135%)
  doc.rect(marginX, currentY, boxW, rectHeight);
  doc.rect(marginX + boxW + 6, currentY, boxW, rectHeight);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.navy);
  doc.text("CLASS TEACHER'S REMARK", marginX + 2, currentY + 5);
  doc.text("SCHOOL MANAGER'S REMARK", marginX + boxW + 8, currentY + 5);

  currentY += 30 * 1.35; // 40.5 mm

  doc.setFontSize(8);
  doc.setTextColor(...colors.inkSoft);
  doc.line(marginX, currentY, marginX + boxW, currentY);
  doc.text('Teacher’s Signature & Date', marginX, currentY + 4);

  doc.line(marginX + boxW + 6, currentY, pageW - marginX, currentY);
  doc.text('School Manager’s Signature, Date & Stamp', marginX + boxW + 6, currentY + 4);

  currentY += 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...colors.navy);
  doc.text("PARENT'S / GUARDIAN'S SIGNATURE: ...........................................................", pageW / 2, currentY, { align: 'center' });
  
  currentY += 6;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...colors.inkSoft);
  doc.text('(Please sign and return this report to the school)', pageW / 2, currentY, { align: 'center' });

  // ── Dates de fin de terme et de reprise (Page 2) ──
  if (school?.vacationStart || school?.resumption) {
    currentY += 8;
  
    doc.setFillColor(255, 255, 245);
    doc.roundedRect(marginX, currentY, contentW, 10, 1.5, 1.5, 'F');
  
    doc.setDrawColor(...colors.navy);
    doc.setLineWidth(0.3);
    doc.line(marginX, currentY, pageW - marginX, currentY);
    doc.line(marginX, currentY + 10, pageW - marginX, currentY + 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...colors.navy);

    const fmt = (str) => {
      if (!str) return '';
      const d = new Date(str);
      return isNaN(d.getTime()) ? str : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const endTerm = school.vacationStart ? `End of Term: ${fmt(school.vacationStart)}` : '';
    const nextTerm = school.resumption ? `Next Term Begins: ${fmt(school.resumption)}` : '';
    const combined = [endTerm, nextTerm].filter(Boolean).join('   •   ');
  
    doc.text(combined, pageW / 2, currentY + 6.5, { align: 'center' });
  
    currentY += 12;
  }

  // Numéro de page 2
  addPageNumber(2, 2);

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}