Add-Type -AssemblyName System.Drawing
$dir = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'pags'; New-Item -ItemType Directory -Force $out | Out-Null
$w = New-Object -ComObject Word.Application; $w.Visible = $true
$d = $w.Documents.Open((Join-Path $dir 'Memoria_Descriptiva_LaPreDigital_AMP.docx'), $false, $true)
$w.ActiveWindow.View.Type = 3
$n = $d.ComputeStatistics(2)
for ($i = 1; $i -le $n; $i++) {
  $bytes = $w.ActiveWindow.ActivePane.Pages.Item($i).EnhMetaFileBits
  $ms = New-Object IO.MemoryStream(,$bytes)
  $mf = [System.Drawing.Image]::FromStream($ms)
  $bmp = New-Object System.Drawing.Bitmap 1000, 1414
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($mf, 0, 0, 1000, 1414)
  $bmp.Save((Join-Path $out "w$i.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $mf.Dispose()
}
$d.Close($false); $w.Quit()
"done $n"
