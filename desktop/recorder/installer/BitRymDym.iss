; BitRymDym Windows recorder. No admin. Fonts, ffmpeg and ffplay (with their DLLs) sit next to the program.
; ffmpeg is the GPL full shared build from GyanD/codexffmpeg (see the workflow). Its LICENSE is copied beside the exe
; as FFMPEG-LICENSE.txt. The program prefers these copies over anything on PATH.

#define AppVersion "2026.11.21"

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
; Progress is the whole wizard: no extra clicks, the bar stays on screen.
DisableStartupPrompt=yes
DisableWelcomePage=yes
DisableDirPage=yes
DisableReadyPage=yes
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
Filename: "{app}\BitRymDym.exe"; Description: "Otwórz BitRymDym"; Flags: nowait postinstall skipifsilent; Check: not IsUpdate
; Self-update: start the new build when the setup ends. Visible and silent both pass /UPDATE=1.
Filename: "{app}\BitRymDym.exe"; Flags: nowait runasoriginaluser; Check: IsUpdate

[Code]
const
  HWND_TOPMOST = -1;
  HWND_NOTOPMOST = -2;
  SWP_NOSIZE = $0001;
  SWP_NOMOVE = $0002;
  SWP_SHOWWINDOW = $0040;

function SetWindowPos(hWnd: HWND; hWndInsertAfter: HWND; X, Y, cx, cy: Integer; uFlags: UINT): BOOL;
  external 'SetWindowPos@user32.dll stdcall';

function IsUpdate: Boolean;
begin
  Result := ExpandConstant('{param:UPDATE|0}') = '1';
end;

{ .9 and .10 launch this file with /SILENT, so the program just disappears.
  A real update has no /DIR. Open one visible copy and leave the hidden one.
  CI passes /DIR and must stay silent, install, and exit 0. }
function WantsVisibleUpdate: Boolean;
begin
  Result := WizardSilent and IsUpdate and (ExpandConstant('{param:DIR|}') = '') and (ExpandConstant('{param:VISIBLE|0}') <> '1');
end;

{ A child of this setup dies when InitializeSetup returns False.
  start detaches a bat first, then the bat waits and opens the visible copy. }
procedure QueueVisibleSetup();
var
  Dir, Bat, Command: String;
  ResultCode: Integer;
begin
  Dir := ExpandConstant('{%TEMP}\BitRymDym-update');
  ForceDirectories(Dir);
  Bat := Dir + '\show-setup.bat';
  SaveStringToFile(Bat,
    '@echo off' + #13#10 +
    'ping 127.0.0.1 -n 4 >nul' + #13#10 +
    'start "" "' + ExpandConstant('{srcexe}') + '" /UPDATE=1 /VISIBLE=1 /NORESTART' + #13#10,
    False);
  Command := '/c start "" /MIN "' + Bat + '"';
  Exec(ExpandConstant('{cmd}'), Command, '', SW_HIDE, ewNoWait, ResultCode);
end;

function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
  I: Integer;
begin
  Result := True;
  if WantsVisibleUpdate then
  begin
    QueueVisibleSetup();
    Result := False;
    Exit;
  end;
  for I := 1 to 6 do
  begin
    if not CheckForMutexes('Local\BitRymDym.Nagrywarka') then
      Break;
    Sleep(500);
  end;
  if CheckForMutexes('Local\BitRymDym.Nagrywarka') then
  begin
    Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /T /IM BitRymDym.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(1000);
  end;
  if CheckForMutexes('Local\BitRymDym.Nagrywarka') then
  begin
    MsgBox('BitRymDym nadal jest włączony. Zamknij BitRymDym.exe w Menedżerze zadań i uruchom instalator jeszcze raz.', mbError, MB_OK);
    Result := False;
  end;
end;

procedure InitializeWizard();
begin
  SetWindowPos(WizardForm.Handle, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE or SWP_NOSIZE or SWP_SHOWWINDOW);
  WizardForm.StatusLabel.Caption := 'Instaluję BitRymDym. Zostaw to okno. Jak pasek dojdzie do końca, program sam się otworzy.';
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpInstalling then
    WizardForm.StatusLabel.Caption := 'Instaluję BitRymDym. Zostaw to okno. Jak pasek dojdzie do końca, program sam się otworzy.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and (not WizardSilent) then
    SetWindowPos(WizardForm.Handle, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE or SWP_NOSIZE);
end;
