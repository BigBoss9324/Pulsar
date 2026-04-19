!define APP_NAME "Pulsar"
!define GITHUB_OWNER "BigBoss9324"
!define GITHUB_REPO "Pulsar"

Name "${APP_NAME} Installer"
OutFile "..\release\Pulsar-Setup-Latest.exe"
RequestExecutionLevel admin
ShowInstDetails show

Page instfiles

Section "Download and Install"
  DetailPrint "Fetching latest ${APP_NAME} release from GitHub..."

  ; Write a PowerShell script to a temp file and execute it
  Var /GLOBAL PS1
  Var /GLOBAL ExitCode
  StrCpy $PS1 "$TEMP\pulsar-install.ps1"

  FileOpen $0 $PS1 w
  FileWrite $0 "try {$\r$\n"
  FileWrite $0 "  $$r = Invoke-RestMethod -Uri 'https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest' -UseBasicParsing$\r$\n"
  FileWrite $0 "  $$a = $$r.assets | Where-Object { $$_.name -like '*.exe' -and $$_.name -notlike '*ninstall*' } | Select-Object -First 1$\r$\n"
  FileWrite $0 "  if (-not $$a) { throw 'No installer asset found.' }$\r$\n"
  FileWrite $0 "  $$out = Join-Path $$env:TEMP 'PulsarSetup.exe'$\r$\n"
  FileWrite $0 "  Write-Host ('Downloading ' + $$a.name + '...')$\r$\n"
  FileWrite $0 "  Invoke-WebRequest -Uri $$a.browser_download_url -OutFile $$out -UseBasicParsing$\r$\n"
  FileWrite $0 "  Start-Process -FilePath $$out -Wait$\r$\n"
  FileWrite $0 "  Remove-Item $$out -Force$\r$\n"
  FileWrite $0 "} catch { Write-Error $$_; exit 1 }$\r$\n"
  FileClose $0

  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PS1"' $ExitCode

  Delete $PS1

  IntCmp $ExitCode 0 done
    MessageBox MB_OK|MB_ICONEXCLAMATION "Download failed.$\n$\nCheck your internet connection and try again."
    Quit
  done:
SectionEnd
