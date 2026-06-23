import { supabase } from './supabase';

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
    if (!grouped[row.term]) grouped[row.term] = {};
    if (!grouped[row.term][row.class_name]) grouped[row.term][row.class_name] = [];
    grouped[row.term][row.class_name].push(row);
  });

  const percentLabel = minPercent === 100
    ? ' (100% unpaid)'
    : ` (≥${minPercent}% remaining)`;

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
</style>
</head>
<body>
<h1>Outstanding Balances – Academic Year 2025/2026${percentLabel}</h1>
<p>Only students with a remaining balance matching the selected threshold are listed.</p>
`;

  const termsOrder = ['Term 1', 'Term 2', 'Term 3'];
  termsOrder.forEach(term => {
    if (!grouped[term]) return;
    html += `<h2>${term}</h2>`;
    const classes = Object.keys(grouped[term]).sort();
    classes.forEach(cls => {
      html += `<h3>${cls}</h3>`;
      html += `<table><tr><th>Student</th><th>Expected (GHS)</th><th>Paid (GHS)</th><th>Outstanding (GHS)</th></tr>`;
      grouped[term][cls].forEach(row => {
        html += `<tr>
          <td>${row.student_name}</td>
          <td>${parseFloat(row.expected).toFixed(2)}</td>
          <td>${parseFloat(row.paid).toFixed(2)}</td>
          <td class="outstanding">${parseFloat(row.outstanding).toFixed(2)}</td>
        </tr>`;
      });
      html += `</table>`;
    });
  });

  html += `</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}