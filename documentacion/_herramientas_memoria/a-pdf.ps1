$dir = Split-Path -Parent $PSScriptRoot
$w = New-Object -ComObject Word.Application; $w.Visible = $false
$d = $w.Documents.Open((Join-Path $dir 'Memoria_Descriptiva_LaPreDigital_AMP.docx'))
$d.ExportAsFixedFormat((Join-Path $dir 'Memoria_Descriptiva_LaPreDigital_AMP.pdf'), 17)
"pages: " + $d.ComputeStatistics(2)
$d.Close($false); $w.Quit()
