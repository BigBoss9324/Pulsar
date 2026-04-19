; Custom welcome page text
!define MUI_WELCOMEPAGE_TEXT "Download videos and audio from YouTube, Instagram, TikTok, and hundreds of other sites — all from one app.$\r$\n$\r$\nClick Next to begin installation."

; Offer to wipe user data during uninstall
!macro customUnInstall
  MessageBox MB_ICONQUESTION|MB_YESNO "Remove your Pulsar settings, history, queue, and logs?$\r$\n$\r$\nThis cannot be undone." IDNO pulsar_skip_wipe
  RMDir /r "$APPDATA\Pulsar"
  pulsar_skip_wipe:
!macroend
