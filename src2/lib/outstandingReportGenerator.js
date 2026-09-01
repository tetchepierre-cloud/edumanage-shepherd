// src/lib/outstandingReportGenerator.js
import { supabase } from './supabase';
import { sortClasses } from '../lib/classOrder';

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function generateOutstandingReport(minPercent = 0, academicYear = '2025/2026') {
  console.log('🟢 Chargement des données...');

  // 1. Récupérer tous les élèves avec leur classe et level_id
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id, first_name, last_name, class_id, classes(name, level_id)')
    .eq('active', true);

  if (studentsError || !students?.length) {
    alert('No students found.');
    return;
  }

  const studentIds = students.map(s => s.id);
  const levelIds = [...new Set(students.map(s => s.classes?.level_id).filter(Boolean))];

  if (!levelIds.length) {
    alert('No level IDs found.');
    return;
  }

  const allTerms = ['Term 1', 'Term 2', 'Term 3'];

  // 2. Charger tous les frais obligatoires pour ces niveaux
  const { data: allFees } = await supabase
    .from('fee_structure')
    .select('id, amount, level_id, term')
    .in('level_id', levelIds)
    .eq('academic_year', academicYear)
    .eq('is_active', true);

  // 3. Charger tous les échéanciers pour ces frais
  const feeIds = (allFees || []).map(f => f.id);
  const { data: allSchedules } = await supabase
    .from('fee_schedules')
    .select('amount, fee_structure_id, due_date')
    .in('fee_structure_id', feeIds);

  // 4. Charger toutes les remises pour ces élèves
  const { data: allDiscounts } = await supabase
    .from('student_fee_discounts')
    .select('student_id, fee_structure_id, discount_type, discount_value')
    .in('student_id', studentIds);

  // 5. Charger tous les overrides pour ces élèves
  const { data: allOverrides } = await supabase
    .from('student_fee_overrides')
    .select('student_id, fee_structure_id, override_amount')
    .in('student_id', studentIds);

  // 6. Charger tous les frais optionnels pour ces élèves
  const { data: allOptional } = await supabase
    .from('student_optional_fees')
    .select('student_id, amount, term')
    .in('student_id', studentIds)
    .eq('academic_year', academicYear)
    .eq('is_active', true);

  // 7. Charger tous les paiements pour ces élèves
  const { data: allPayments } = await supabase
    .from('fee_payments')
    .select('student_id, amount, term')
    .in('student_id', studentIds)
    .eq('academic_year', academicYear)
    .in('status', ['paid', 'partial']);

  console.log('✅ Données chargées, calcul en cours...');

  // ---- Indexation en mémoire ----
  const feesByLevelTerm = {};
  (allFees || []).forEach(f => {
    const key = `${f.level_id}|${f.term}`;
    if (!feesByLevelTerm[key]) feesByLevelTerm[key] = [];
    feesByLevelTerm[key].push(f);
  });

  const schedulesByFee = {};
  (allSchedules || []).forEach(s => {
    if (!schedulesByFee[s.fee_structure_id]) schedulesByFee[s.fee_structure_id] = [];
    schedulesByFee[s.fee_structure_id].push(s);
  });

  const discountsByStudentFee = {};
  (allDiscounts || []).forEach(d => {
    const key = `${d.student_id}|${d.fee_structure_id}`;
    discountsByStudentFee[key] = d;
  });

  const overridesByStudentFee = {};
  (allOverrides || []).forEach(o => {
    const key = `${o.student_id}|${o.fee_structure_id}`;
    overridesByStudentFee[key] = o.override_amount;
  });

  const optionalByStudentTerm = {};
  (allOptional || []).forEach(o => {
    const key = `${o.student_id}|${o.term}`;
    optionalByStudentTerm[key] = (optionalByStudentTerm[key] || 0) + parseFloat(o.amount || 0);
  });

  const paymentsByStudentTerm = {};
  (allPayments || []).forEach(p => {
    const key = `${p.student_id}|${p.term}`;
    paymentsByStudentTerm[key] = (paymentsByStudentTerm[key] || 0) + parseFloat(p.amount || 0);
  });

  // ---- Calcul des soldes ----
  const results = [];

  for (const student of students) {
    const levelId = student.classes?.level_id;
    if (!levelId) continue;

    for (const term of allTerms) {
      const fees = feesByLevelTerm[`${levelId}|${term}`] || [];
      if (!fees.length) continue;

      let mandatoryExpected = 0;
      fees.forEach(f => {
        const schedules = schedulesByFee[f.id] || [];
        // On prend la somme des échéanciers jusqu'à la fin du terme (approximatif)
        // Pour simplifier, on prend tout l'échéancier (le rapport Outstanding est pour toute l'année)
        let amount = schedules.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
        if (amount === 0) amount = parseFloat(f.amount); // fallback

        const overrideKey = `${student.id}|${f.id}`;
        if (overridesByStudentFee[overrideKey] !== undefined) {
          amount = parseFloat(overridesByStudentFee[overrideKey]);
        }

        const discountKey = `${student.id}|${f.id}`;
        const disc = discountsByStudentFee[discountKey];
        if (disc) {
          if (disc.discount_type === 'fixed') amount = Math.max(0, amount - parseFloat(disc.discount_value));
          else amount *= (1 - parseFloat(disc.discount_value) / 100);
        }
        mandatoryExpected += amount;
      });

      const optionalKey = `${student.id}|${term}`;
      const optionalTotal = optionalByStudentTerm[optionalKey] || 0;
      const expected = mandatoryExpected + optionalTotal;

      if (expected === 0) continue;

      const paymentKey = `${student.id}|${term}`;
      const totalPaid = paymentsByStudentTerm[paymentKey] || 0;
      const outstanding = Math.max(0, expected - totalPaid);

      if (outstanding === 0) continue;
      const outstandingPercent = (outstanding / expected) * 100;
      if (outstandingPercent < minPercent) continue;

      results.push({
        student_name: `${student.first_name} ${student.last_name}`,
        class_name: student.classes?.name || 'N/A',
        term: term,
        expected: expected,
        paid: totalPaid,
        outstanding: outstanding,
      });
    }
  }

  if (!results.length) {
    alert('No outstanding balances found for the selected filter.');
    return;
  }

  // ---- Regrouper et générer le HTML ----
  const grouped = {};
  results.forEach(row => {
    if (!grouped[row.term]) grouped[row.term] = {};
    if (!grouped[row.term][row.class_name]) grouped[row.term][row.class_name] = [];
    grouped[row.term][row.class_name].push(row);
  });

  // (suite HTML identique à la version précédente)
  let percentLabel;
  if (minPercent === 0) {
    percentLabel = ' (Any balance > 0)';
  } else if (minPercent === 100) {
    percentLabel = ' (100% unpaid)';
  } else {
    percentLabel = ` (≥${minPercent}% remaining)`;
  }

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Outstanding Balances – ${academicYear}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 1.5cm; color: #1e293b; }
  h1 { border-bottom: 2px solid #2563eb; padding-bottom: 6px; }
  h2 { color: #1e3a8a; margin-top: 28px; }
  h3 { color: #0f172a; margin-top: 18px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 20px; font-size: 0.9em; }
  th { background-color: #f1f5f9; padding: 8px; text-align: left; border: 1px solid #cbd5e1; }
  td { padding: 6px 8px; border: 1px solid #e2e8f0; }
  .outstanding { font-weight: bold; color: #b91c1c; }
  .recap { background-color: #f8fafc; font-weight: bold; }
  .term-recap { background-color: #dbeafe; font-weight: bold; }
  .grand-recap { background-color: #e0e7ff; font-weight: bold; }
  td, th { white-space: nowrap; }
  td:first-child, th:first-child { white-space: normal; }
</style>
</head>
<body>
<h1>Outstanding Balances – Academic Year ${academicYear}${percentLabel}</h1>
<p>Only students with a strictly positive balance matching the selected threshold are listed.</p>
`;

  const termsOrder = ['Term 1', 'Term 2', 'Term 3'];
  const termSummaries = [];

  let grandTotalExpected = 0;
  let grandTotalPaid = 0;
  let grandTotalOutstanding = 0;

  termsOrder.forEach(term => {
    if (!grouped[term]) return;
    html += `<h2>${term}</h2>`;

    const classes = sortClasses(
      Object.keys(grouped[term]).map(name => ({ name }))
    ).map(c => c.name);

    let termTotalExpected = 0;
    let termTotalPaid = 0;
    let termTotalOutstanding = 0;

    classes.forEach(cls => {
      html += `<h3>${cls}</h3>`;
      html += `<table><tr><th>Student</th><th>Expected (GHS)</th><th>Paid (GHS)</th><th>Outstanding (GHS)</th></tr>`;

      let classTotalExpected = 0;
      let classTotalPaid = 0;
      let classTotalOutstanding = 0;

      grouped[term][cls].forEach(row => {
        const expected = parseFloat(row.expected);
        const paid = parseFloat(row.paid);
        const outstanding = parseFloat(row.outstanding);

        classTotalExpected += expected;
        classTotalPaid += paid;
        classTotalOutstanding += outstanding;

        html += `<tr>
          <td>${row.student_name}</td>
          <td>${fmt(expected)}</td>
          <td>${fmt(paid)}</td>
          <td class="outstanding">${fmt(outstanding)}</td>
        </tr>`;
      });

      html += `<tr class="recap">
        <td><strong>Subtotal – ${cls}</strong></td>
        <td><strong>${fmt(classTotalExpected)}</strong></td>
        <td><strong>${fmt(classTotalPaid)}</strong></td>
        <td class="outstanding"><strong>${fmt(classTotalOutstanding)}</strong></td>
      </tr>`;
      html += `</table>`;

      termTotalExpected += classTotalExpected;
      termTotalPaid += classTotalPaid;
      termTotalOutstanding += classTotalOutstanding;
    });

    html += `<table>
      <tr class="term-recap">
        <td><strong>TOTAL – ${term}</strong></td>
        <td><strong>${fmt(termTotalExpected)}</strong></td>
        <td><strong>${fmt(termTotalPaid)}</strong></td>
        <td class="outstanding"><strong>${fmt(termTotalOutstanding)}</strong></td>
      </tr>
    </table>`;

    termSummaries.push({ term, expected: termTotalExpected, paid: termTotalPaid, outstanding: termTotalOutstanding });

    grandTotalExpected += termTotalExpected;
    grandTotalPaid += termTotalPaid;
    grandTotalOutstanding += termTotalOutstanding;
  });

  if (termSummaries.length > 0) {
    html += `<h2>Grand Total – All Terms</h2>
    <table>
      <tr><th>Term</th><th>Expected (GHS)</th><th>Paid (GHS)</th><th>Outstanding (GHS)</th></tr>`;

    termSummaries.forEach(ts => {
      html += `<tr>
        <td>${ts.term}</td>
        <td>${fmt(ts.expected)}</td>
        <td>${fmt(ts.paid)}</td>
        <td class="outstanding">${fmt(ts.outstanding)}</td>
      </tr>`;
    });

    html += `<tr class="grand-recap">
      <td><strong>GRAND TOTAL</strong></td>
      <td><strong>${fmt(grandTotalExpected)}</strong></td>
      <td><strong>${fmt(grandTotalPaid)}</strong></td>
      <td class="outstanding"><strong>${fmt(grandTotalOutstanding)}</strong></td>
    </tr>
    </table>`;
  }

  html += `</body></html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    alert('Please allow pop-ups for this site to view the report.');
  }
}