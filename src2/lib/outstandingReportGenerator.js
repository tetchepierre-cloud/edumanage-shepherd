import { supabase } from './supabase';
import { sortClasses } from '../lib/classOrder';

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function generateOutstandingReport(minPercent = 0) {
  const { data, error } = await supabase.rpc('get_outstanding_balances', {
    p_min_percent: minPercent,
  });

  if (error || !data?.length) {
    alert('No data found for the selected filter.');
    return;
  }

  // Regrouper par terme puis par classe
  const grouped = {};
  data.forEach(row => {
    // Sécurité : ignorer les soldes nuls (normalement déjà filtrés par la RPC)
    if (parseFloat(row.outstanding) === 0) return;
    if (!grouped[row.term]) grouped[row.term] = {};
    if (!grouped[row.term][row.class_name]) grouped[row.term][row.class_name] = [];
    grouped[row.term][row.class_name].push(row);
  });

  // Titre adapté
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
<title>Outstanding Balances – 2025/2026</title>
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
<h1>Outstanding Balances – Academic Year 2025/2026${percentLabel}</h1>
<p>Only students with a strictly positive balance matching the selected threshold are listed.</p>
`;

  const termsOrder = ['Term 1', 'Term 2', 'Term 3'];
  const termSummaries = []; // stocke les totaux pour le tableau récapitulatif

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

    termSummaries.push({
      term,
      expected: termTotalExpected,
      paid: termTotalPaid,
      outstanding: termTotalOutstanding,
    });

    grandTotalExpected += termTotalExpected;
    grandTotalPaid += termTotalPaid;
    grandTotalOutstanding += termTotalOutstanding;
  });

  // Récapitulatif général avec rappel des termes
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
  w.document.write(html);
  w.document.close();
}