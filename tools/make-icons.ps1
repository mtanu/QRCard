# Renders the app icons with System.Drawing (built into Windows PowerShell) so the
# project needs no image tooling. Re-run after changing the colours below.
#   powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1

Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\assets\icons'
$null = New-Item -ItemType Directory -Force -Path $outDir

$bgHex = '#0B0B0F'
$fgHex = '#F4F4F6'
$accentHex = '#3B82F6'

function ConvertFrom-Hex([string]$hex) {
  [System.Drawing.ColorTranslator]::FromHtml($hex)
}

# A stylised QR: three finder eyes plus a scatter of modules, drawn on a grid so it
# stays crisp at any size.
$grid = @(
  '1111111 0 1111111',
  '1000001 1 1000001',
  '1011101 0 1011101',
  '1011101 1 1011101',
  '1011101 1 1011101',
  '1000001 0 1000001',
  '1111111 1 1111111',
  '0000000 0 0000000',
  '1101101 1 0110110',
  '0000000 1 0000000',
  '1111111 0 1101011',
  '1000001 1 0110110',
  '1011101 0 1011011',
  '1011101 1 0101101',
  '1011101 1 1100110',
  '1000001 0 0111001',
  '1111111 1 1010110'
) | ForEach-Object { $_ -replace ' ', '' }

function New-Icon([int]$size, [string]$path, [double]$inset, [bool]$roundBg) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $bg = New-Object System.Drawing.SolidBrush((ConvertFrom-Hex $bgHex))
  $g.FillRectangle($bg, 0, 0, $size, $size)

  if ($roundBg) {
    $pad = [int]($size * 0.10)
    $r = [int]($size * 0.22)
    $rect = New-Object System.Drawing.Rectangle($pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad))
    $path2 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path2.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
    $path2.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
    $path2.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
    $path2.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
    $path2.CloseFigure()
    $panel = New-Object System.Drawing.SolidBrush((ConvertFrom-Hex '#16161A'))
    $g.FillPath($panel, $path2)
    $panel.Dispose()
    $path2.Dispose()
  }

  $cells = $grid.Count
  $area = $size * (1.0 - 2 * $inset)
  $cell = $area / $cells
  $origin = $size * $inset
  $fg = New-Object System.Drawing.SolidBrush((ConvertFrom-Hex $fgHex))
  $accent = New-Object System.Drawing.SolidBrush((ConvertFrom-Hex $accentHex))
  $dot = [Math]::Max(1.0, $cell * 0.86)

  for ($row = 0; $row -lt $cells; $row++) {
    $line = $grid[$row]
    for ($col = 0; $col -lt $line.Length; $col++) {
      if ($line[$col] -ne '1') { continue }
      $isEye = ($row -lt 7 -and $col -lt 7) -or ($row -lt 7 -and $col -ge ($cells - 7)) -or ($row -ge ($cells - 7) -and $col -lt 7)
      $brush = if ($isEye) { $accent } else { $fg }
      $x = $origin + $col * $cell
      $y = $origin + $row * $cell
      $g.FillRectangle($brush, [single]$x, [single]$y, [single]$dot, [single]$dot)
    }
  }

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $path"
}

New-Icon 192 (Join-Path $outDir 'icon-192.png') 0.14 $false
New-Icon 512 (Join-Path $outDir 'icon-512.png') 0.14 $false
New-Icon 180 (Join-Path $outDir 'apple-touch-icon.png') 0.14 $false
# Maskable icons get cropped to a circle on some launchers, so keep the art well inside.
New-Icon 512 (Join-Path $outDir 'maskable-512.png') 0.26 $true
