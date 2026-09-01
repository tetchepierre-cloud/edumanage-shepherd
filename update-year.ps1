# 1. Créer config.js
$configContent = "export const ACADEMIC_YEAR = '2026/2027';"
$configPath = "src2/config.js"
if (!(Test-Path $configPath)) {
    Set-Content -Path $configPath -Value $configContent
    Write-Host "✅ config.js créé"
} else {
    Write-Host "ℹ️ config.js existe déjà"
}

# 2. Liste des fichiers à modifier
$files = @(
    "src2/components/AcademicSettingsTab.jsx",
    "src2/lib/classListGenerator.js",
    "src2/lib/discountReportGenerator.js",
    "src2/lib/feesReportGenerator.js",
    "src2/lib/gradeCalculations.js",
    "src2/lib/outstandingReportGenerator.js",
    "src2/lib/receiptGenerator.js",
    "src2/lib/statementGenerator.js",
    "src2/pages/BeceTrackerPage.jsx",
    "src2/pages/FeeManagementPage.jsx",
    "src2/pages/FeesPage.jsx",
    "src2/pages/GesReportPage.jsx",
    "src2/pages/MockExamsPage.jsx",
    "src2/pages/ParentPortalPage.jsx",
    "src2/pages/PromotionPage.jsx",
    "src2/pages/SettingsPage.jsx",
    "src2/pages/SMSPage.jsx"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        
        # Remplacer la déclaration locale si elle existe
        $content = $content -replace 'const ACADEMIC_YEAR = ''2025/2026'';', 'import { ACADEMIC_YEAR } from ''../config'';'
        
        # Remplacer les occurrences de '2025/2026' en tant que valeur (pas dans les tableaux)
        # On remplace uniquement les guillemets simples ou doubles entourant la chaîne exacte
        $content = $content -replace '(["\'])2025/2026(["\'])', '$1' + '${ACADEMIC_YEAR}' + '$2'
        
        # Si le fichier n'a pas d'import, on le place en haut
        if ($content -notmatch "import { ACADEMIC_YEAR } from '\.\.\/config';") {
            $content = $content -replace '^(import.*?\n)', "import { ACADEMIC_YEAR } from '../config';\n`$1"
        }
        
        Set-Content -Path $file -Value $content -NoNewline
        Write-Host "✅ $file modifié"
    } else {
        Write-Host "⚠️ $file introuvable"
    }
}

Write-Host "✅ Terminé ! Relancez l'application."