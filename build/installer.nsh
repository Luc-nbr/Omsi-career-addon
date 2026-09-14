; Plaatst de overlay-plugin in de plugins-map van OMSI.
;
; OMSI zet zichzelf niet in het register; Steam wel. Daarmee vinden we de
; standaardbibliotheek. Staat OMSI op een andere schijf, dan lukt dat hier niet
; en zet de app hem bij de eerste start alsnog neer - die kan libraryfolders.vdf
; lezen, wat in NSIS geen doen is.

!macro FindOmsiPlugins outVar
  ; $R0 wordt het Steam-pad, ${outVar} de plugins-map (leeg als niet gevonden)
  StrCpy ${outVar} ""
  ReadRegStr $R0 HKLM "SOFTWARE\WOW6432Node\Valve\Steam" "InstallPath"
  StrCmp $R0 "" 0 +2
    ReadRegStr $R0 HKCU "Software\Valve\Steam" "SteamPath"
  StrCmp $R0 "" omsi_done 0
  StrCpy $R1 "$R0\steamapps\common\OMSI 2"
  IfFileExists "$R1\Omsi.exe" 0 omsi_done
  StrCpy ${outVar} "$R1\plugins"
  omsi_done:
!macroend

!macro customInstall
  !insertmacro FindOmsiPlugins $R2
  StrCmp $R2 "" install_skip 0

  CreateDirectory "$R2"
  ClearErrors
  CopyFiles /SILENT "$INSTDIR\resources\plugin\OMSICareerPlugin.dll" "$R2"
  CopyFiles /SILENT "$INSTDIR\resources\plugin\OMSICareer.opl" "$R2"
  IfErrors install_skip 0

  ; Pad onthouden zodat het verwijderprogramma het weer kan opruimen.
  WriteRegStr HKCU "Software\OMSI Career" "PluginDir" "$R2"
  DetailPrint "Overlay-plugin geplaatst in $R2"

  install_skip:
!macroend

!macro customUnInstall
  ReadRegStr $R2 HKCU "Software\OMSI Career" "PluginDir"
  StrCmp $R2 "" uninstall_skip 0
  Delete "$R2\OMSICareerPlugin.dll"
  Delete "$R2\OMSICareer.opl"
  DeleteRegKey HKCU "Software\OMSI Career"
  uninstall_skip:
!macroend
