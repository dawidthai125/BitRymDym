; BitRymDym Windows recorder. No admin. Fonts and ffmpeg sit next to the program.
; ffmpeg is the GPL build already on this computer. Its LICENSE is copied beside the exe.

#define AppVersion "2026.11.12"

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
SetupIconFile=..\assets\cassette.ico
UninstallDisplayIcon={app}\brd-cassette.ico
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"

[Files]
Source: "..\dist\BitRymDym\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\assets\cassette.ico"; DestDir: "{app}"; DestName: "brd-cassette.ico"

[Icons]
Name: "{autodesktop}\BitRymDym"; Filename: "{app}\BitRymDym.exe"; IconFilename: "{app}\brd-cassette.ico"
Name: "{userstartmenu}\BitRymDym"; Filename: "{app}\BitRymDym.exe"; IconFilename: "{app}\brd-cassette.ico"

[Run]
Filename: "{app}\BitRymDym.exe"; Description: "Otwórz BitRymDym"; Flags: nowait postinstall skipifsilent
