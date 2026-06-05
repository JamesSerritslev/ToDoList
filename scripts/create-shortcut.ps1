$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$portableExe = Join-Path $projectRoot "dist\Projects-Portable.exe"
$unpackedExe = Join-Path $projectRoot "dist\win-unpacked\Projects.exe"
$desktopLnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "Projects.lnk"
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$startMenuLnk = Join-Path $startMenuDir "Projects.lnk"

if (Test-Path $portableExe) {
  $target = $portableExe
  $workingDir = Split-Path $portableExe
} elseif (Test-Path $unpackedExe) {
  $target = $unpackedExe
  $workingDir = Split-Path $unpackedExe
} else {
  Write-Host "No built app found. Run: npm run build"
  exit 1
}

$WshShell = New-Object -ComObject WScript.Shell

$iconPath = Join-Path $projectRoot "build\icon.ico"

function New-ProjectsShortcut($path) {
  $shortcut = $WshShell.CreateShortcut($path)
  $shortcut.TargetPath = $target
  $shortcut.WorkingDirectory = $workingDir
  $shortcut.Description = "Projects Todo App"
  if (Test-Path $iconPath) {
    $shortcut.IconLocation = "$iconPath,0"
  }
  $shortcut.Save()
}

New-ProjectsShortcut $desktopLnk
New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null
New-ProjectsShortcut $startMenuLnk

Write-Host "Created shortcuts:"
Write-Host "  $desktopLnk"
Write-Host "  $startMenuLnk"
Write-Host ""
Write-Host "To pin: right-click the Desktop shortcut -> Show more options -> Pin to taskbar"
