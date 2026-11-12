# Abre el .docx con Word (COM), actualiza el índice (números de página reales), guarda y exporta a PDF.
$ErrorActionPreference = 'Stop'
$docx = Join-Path (Split-Path $PSScriptRoot -Parent) 'Manual_de_Usuario_LaPreDigital_AMP.docx'
$pdf  = [System.IO.Path]::ChangeExtension($docx, '.pdf')
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($docx)
  $doc.Repaginate()
  $doc.TablesOfContents(1).Update()
  $doc.Repaginate()
  $doc.TablesOfContents(1).Update()   # segunda pasada: el propio índice puede mover páginas
  $doc.Fields.Update() | Out-Null
  $doc.Save()
  $doc.ExportAsFixedFormat($pdf, 17)  # 17 = wdExportFormatPDF
  Write-Host ("Páginas: " + $doc.ComputeStatistics(2))
  $doc.Close(0)
} finally { $word.Quit() }
