!define APP_NAME "Pulsar"
!define GITHUB_OWNER "BigBoss9324"
!define GITHUB_REPO "Pulsar"

Name "${APP_NAME}"
OutFile "..\release\PulsarSetup.exe"
RequestExecutionLevel user
SilentInstall silent
Icon "..\build\Pulsar.ico"

Section "Download and Install"
  Var /GLOBAL SRC
  Var /GLOBAL EXE
  Var /GLOBAL CSC
  Var /GLOBAL EC

  StrCpy $SRC "$TEMP\PulsarDL.cs"
  StrCpy $EXE "$TEMP\PulsarDL.exe"

  FileOpen $0 $SRC w

  FileWrite $0 "using System;$\n"
  FileWrite $0 "using System.Drawing;$\n"
  FileWrite $0 "using System.IO;$\n"
  FileWrite $0 "using System.Net;$\n"
  FileWrite $0 "using System.Diagnostics;$\n"
  FileWrite $0 "using System.Threading;$\n"
  FileWrite $0 "using System.Windows.Forms;$\n"
  FileWrite $0 "public class P {$\n"
  FileWrite $0 "[STAThread]$\n"
  FileWrite $0 "static void Main(string[] a) {$\n"
  FileWrite $0 "  Application.EnableVisualStyles();$\n"
  FileWrite $0 "  Application.SetCompatibleTextRenderingDefault(false);$\n"
  FileWrite $0 "  string stub = a.Length > 0 ? a[0] : $\"$\";$\n"
  FileWrite $0 "  Form f = new Form();$\n"
  FileWrite $0 "  f.Text = $\"PulsarSetup$\";$\n"
  FileWrite $0 "  f.Size = new Size(420, 180);$\n"
  FileWrite $0 "  f.StartPosition = FormStartPosition.CenterScreen;$\n"
  FileWrite $0 "  f.FormBorderStyle = FormBorderStyle.None;$\n"
  FileWrite $0 "  f.BackColor = ColorTranslator.FromHtml($\"#0f0f1a$\");$\n"
  FileWrite $0 "  if (File.Exists(stub)) { try { f.Icon = Icon.ExtractAssociatedIcon(stub); } catch {} }$\n"
  FileWrite $0 "  Panel border = new Panel();$\n"
  FileWrite $0 "  border.BackColor = ColorTranslator.FromHtml($\"#2a2a4a$\");$\n"
  FileWrite $0 "  border.Dock = DockStyle.Fill;$\n"
  FileWrite $0 "  border.Padding = new Padding(1);$\n"
  FileWrite $0 "  f.Controls.Add(border);$\n"
  FileWrite $0 "  Panel inner = new Panel();$\n"
  FileWrite $0 "  inner.BackColor = ColorTranslator.FromHtml($\"#0f0f1a$\");$\n"
  FileWrite $0 "  inner.Dock = DockStyle.Fill;$\n"
  FileWrite $0 "  border.Controls.Add(inner);$\n"
  FileWrite $0 "  Panel accent = new Panel();$\n"
  FileWrite $0 "  accent.BackColor = ColorTranslator.FromHtml($\"#6366f1$\");$\n"
  FileWrite $0 "  accent.Location = new Point(0, 0);$\n"
  FileWrite $0 "  accent.Size = new Size(420, 3);$\n"
  FileWrite $0 "  inner.Controls.Add(accent);$\n"
  FileWrite $0 "  PictureBox logo = new PictureBox();$\n"
  FileWrite $0 "  logo.Location = new Point(24, 32);$\n"
  FileWrite $0 "  logo.Size = new Size(40, 40);$\n"
  FileWrite $0 "  logo.SizeMode = PictureBoxSizeMode.Zoom;$\n"
  FileWrite $0 "  logo.BackColor = Color.Transparent;$\n"
  FileWrite $0 "  if (File.Exists(stub)) { try { logo.Image = Icon.ExtractAssociatedIcon(stub).ToBitmap(); } catch {} }$\n"
  FileWrite $0 "  inner.Controls.Add(logo);$\n"
  FileWrite $0 "  Label lTitle = new Label();$\n"
  FileWrite $0 "  lTitle.Text = $\"Pulsar$\";$\n"
  FileWrite $0 "  lTitle.Font = new Font($\"Segoe UI$\", 15f, FontStyle.Bold);$\n"
  FileWrite $0 "  lTitle.ForeColor = Color.White;$\n"
  FileWrite $0 "  lTitle.Location = new Point(76, 32);$\n"
  FileWrite $0 "  lTitle.AutoSize = true;$\n"
  FileWrite $0 "  inner.Controls.Add(lTitle);$\n"
  FileWrite $0 "  Label lSub = new Label();$\n"
  FileWrite $0 "  lSub.Text = $\"Downloading latest version...$\";$\n"
  FileWrite $0 "  lSub.Font = new Font($\"Segoe UI$\", 9f);$\n"
  FileWrite $0 "  lSub.ForeColor = ColorTranslator.FromHtml($\"#8080a0$\");$\n"
  FileWrite $0 "  lSub.Location = new Point(78, 64);$\n"
  FileWrite $0 "  lSub.AutoSize = true;$\n"
  FileWrite $0 "  inner.Controls.Add(lSub);$\n"
  FileWrite $0 "  ProgressBar bar = new ProgressBar();$\n"
  FileWrite $0 "  bar.Style = ProgressBarStyle.Marquee;$\n"
  FileWrite $0 "  bar.MarqueeAnimationSpeed = 25;$\n"
  FileWrite $0 "  bar.Location = new Point(24, 122);$\n"
  FileWrite $0 "  bar.Size = new Size(372, 6);$\n"
  FileWrite $0 "  inner.Controls.Add(bar);$\n"
  FileWrite $0 "  bool done = false;$\n"
  FileWrite $0 "  int exitCode = 0;$\n"
  FileWrite $0 "  string outPath = Path.Combine(Path.GetTempPath(), $\"PulsarLatest.exe$\");$\n"
  FileWrite $0 "  Thread th = new Thread(() => {$\n"
  FileWrite $0 "    try {$\n"
  FileWrite $0 "      ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;$\n"
  FileWrite $0 "      WebClient wc = new WebClient();$\n"
  FileWrite $0 "      wc.Headers[$\"User-Agent$\"] = $\"PulsarSetup$\";$\n"
  FileWrite $0 "      string json = wc.DownloadString($\"https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest$\");$\n"
  FileWrite $0 "      string url = $\"$\";$\n"
  FileWrite $0 "      int pos = 0;$\n"
  FileWrite $0 "      while (true) {$\n"
  FileWrite $0 "        int idx = json.IndexOf($\"browser_download_url$\", pos);$\n"
  FileWrite $0 "        if (idx < 0) break;$\n"
  FileWrite $0 "        int s = json.IndexOf('$\"', idx + 22) + 1;$\n"
  FileWrite $0 "        int e = json.IndexOf('$\"', s);$\n"
  FileWrite $0 "        if (s <= 0 || e <= s) break;$\n"
  FileWrite $0 "        string u = json.Substring(s, e - s);$\n"
  FileWrite $0 "        string nm = u.Substring(u.LastIndexOf('/') + 1);$\n"
  FileWrite $0 "        if (nm.EndsWith($\".exe$\") && !nm.ToLower().Contains($\"ninstall$\") && nm != $\"PulsarSetup.exe$\") { url = u; break; }$\n"
  FileWrite $0 "        pos = e + 1;$\n"
  FileWrite $0 "      }$\n"
  FileWrite $0 "      if (url == $\"$\") { exitCode = 1; done = true; return; }$\n"
  FileWrite $0 "      wc.DownloadFile(url, outPath);$\n"
  FileWrite $0 "    } catch { exitCode = 1; }$\n"
  FileWrite $0 "    done = true;$\n"
  FileWrite $0 "  });$\n"
  FileWrite $0 "  th.IsBackground = true;$\n"
  FileWrite $0 "  th.Start();$\n"
  FileWrite $0 "  f.Show();$\n"
  FileWrite $0 "  while (!done) { Application.DoEvents(); Thread.Sleep(16); }$\n"
  FileWrite $0 "  f.Close();$\n"
  FileWrite $0 "  if (exitCode != 0 || !File.Exists(outPath)) { Environment.Exit(1); }$\n"
  FileWrite $0 "  var pr = Process.Start(outPath);$\n"
  FileWrite $0 "  if (pr != null) pr.WaitForExit();$\n"
  FileWrite $0 "  try { File.Delete(outPath); } catch {}$\n"
  FileWrite $0 "}}$\n"

  FileClose $0

  ; Find csc.exe — Framework64 first, then 32-bit fallback
  StrCpy $CSC "$WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
  IfFileExists $CSC compile 0
    StrCpy $CSC "$WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
  compile:

  nsExec::ExecToStack '"$CSC" /nologo /out:"$EXE" /target:winexe /r:System.Windows.Forms.dll /r:System.Drawing.dll "$SRC"'
  Pop $EC
  Pop $1

  Delete $SRC

  IntCmp $EC 0 run
    MessageBox MB_OK|MB_ICONEXCLAMATION "Compile failed (exit $EC):$\n$\n$1"
    Goto cleanup
  run:

  ExecWait '"$EXE" "$EXEPATH"' $EC

  IntCmp $EC 0 cleanup
    MessageBox MB_OK|MB_ICONEXCLAMATION "Download failed.$\n$\nCheck your internet connection and try again."

  cleanup:
  Delete $EXE

SectionEnd
