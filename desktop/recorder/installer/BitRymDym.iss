; BitRymDym Windows recorder. No admin. Fonts, ffmpeg and ffplay (with their DLLs) sit next to the program.
; ffmpeg is the GPL full shared build from GyanD/codexffmpeg (see the workflow). Its LICENSE is copied beside the exe
; as FFMPEG-LICENSE.txt. The program prefers these copies over anything on PATH.

#define AppVersion "2026.11.13.8"

[Setup]
AppId={{7C2E9A41-6B18-4E5D-9F03-1A8D4C6E2B70}
AppName=BitRymDym
AppVersion={#AppVersion}
AppPublisher=BitRymDym
DefaultDirName={localappdata}\BitRymDym\Nagrywarka
DefaultGroupName=BitRymDym
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=output
OutputBaseFilename=BitRymDym-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
SetupIconFile=..\assets\cassette.ico
UninstallDisplayIcon={app}\brd-cassette.ico
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"

; Jump from any older build to this one: remove the previous program files, then copy the full tree.
; Recordings and the session stay in %APPDATA%\BitRymDym, not in {app}.
[InstallDelete]
Type: filesandordirs; Name: "{app}\*"

[Files]
Source: "..\dist\BitRymDym\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\assets\cassette.ico"; DestDir: "{app}"; DestName: "brd-cassette.ico"

[Icons]
Name: "{autodesktop}\BitRymDym"; Filename: "{app}\BitRymDym.exe"; IconFilename: "{app}\brd-cassette.ico"
Name: "{userstartmenu}\BitRymDym"; Filename: "{app}\BitRymDym.exe"; IconFilename: "{app}\brd-cassette.ico"

[Run]
Filename: "{app}\BitRymDym.exe"; Description: "Otwórz BitRymDym"; Flags: nowait postinstall skipifsilent
; Self-update (updater.py runs this setup with /SILENT /UPDATE=1): start the new build when the setup ends.
Filename: "{app}\BitRymDym.exe"; Flags: nowait runasoriginaluser; Check: IsUpdate

[Code]
function IsUpdate: Boolean;
begin
  Result := ExpandConstant('{param:UPDATE|0}') = '1';
end;

{ The app starts setup and then exits. Do not delete its files until that process is gone. }
function InitializeSetup(): Boolean;
var
  I: Integer;
begin
  Result := True;
  for I := 1 to 40 do
  begin
    if not CheckForMutexes('Local\BitRymDym.Nagrywarka') then
    begin
      Sleep(1000);
      Exit;
    end;
    Sleep(500);
  end;
  SuppressibleMsgBox('BitRymDym nadal jest włączony. Zamknij BitRymDym.exe w Menedżerze zadań i uruchom instalator jeszcze raz.', mbError, MB_OK, IDOK);
  Result := False;
end;
