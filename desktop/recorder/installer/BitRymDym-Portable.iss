; BitRymDym-Portable.exe: one file, no install (owner order 2026-11-26).
; It unpacks the Velopack portable folder next to itself (BitRymDym\) and starts it.
; When that folder is already there it only starts the program: an updated copy is never overwritten
; with the older files inside this exe. No uninstall entry, no shortcuts, no administrator.
; Build: ISCC /DAppVersion=<wersja> /DPortableDir=<rozpakowany Portable.zip> BitRymDym-Portable.iss

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef PortableDir
  #define PortableDir "..\portable"
#endif

[Setup]
AppName=BitRymDym
AppVersion={#AppVersion}
AppPublisher=D&P Dawid Thai Thanh
AppPublisherURL=https://www.bitrymdym.pl/nagrywarka
DefaultDirName={src}\BitRymDym
UsePreviousAppDir=no
Uninstallable=no
CreateUninstallRegKey=no
PrivilegesRequired=lowest
DisableWelcomePage=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableFinishedPage=yes
CloseApplications=no
RestartApplications=no
OutputDir=output
OutputBaseFilename=BitRymDym-Portable
SetupIconFile=..\assets\cassette.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=no

[Languages]
Name: "pl"; MessagesFile: "compiler:Languages\Polish.isl"

[Messages]
pl.SetupWindowTitle=BitRymDym — rozpakowuję program

[Files]
Source: "{#PortableDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Run]
Filename: "{app}\BitRymDym.exe"; WorkingDir: "{app}"; Flags: nowait skipifsilent

[Code]
function InitializeSetup(): Boolean;
var
  Exe: String;
  Code: Integer;
begin
  Exe := ExpandConstant('{src}\BitRymDym\BitRymDym.exe');
  if FileExists(Exe) then
  begin
    { Already unpacked (and maybe updated since): just start it. }
    Exec(Exe, '', ExpandConstant('{src}\BitRymDym'), SW_SHOWNORMAL, ewNoWait, Code);
    Result := False;
  end
  else
    Result := True;
end;
