#!/usr/bin/env bash
# Dostosowuje projekt Xcode wygenerowany przez `npx cap add ios` (macOS: PlistBuddy).
# Uruchamiany w CI po `cap add ios` / `cap sync ios`, z katalogu ios-app/.
#   BUILD_NUMBER   – CFBundleVersion (w CI: github.run_number), domyślnie 1
#   APP_VERSION    – CFBundleShortVersionString, domyślnie 1.0.0
set -euo pipefail

APP_VERSION="${APP_VERSION:-1.0.0}"
BUILD_NUMBER="${BUILD_NUMBER:-1}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HERE/ios/App/App"
PLIST="$APP_DIR/Info.plist"
PBX="$HERE/ios/App/App.xcodeproj/project.pbxproj"
PB=/usr/libexec/PlistBuddy

test -f "$PLIST" || { echo "Brak $PLIST – najpierw npx cap add ios"; exit 1; }

# Ustawia klucz (usuwa stary, jeśli był).
pset() { "$PB" -c "Delete :$1" "$PLIST" >/dev/null 2>&1 || true; "$PB" -c "Add :$1 $2 $3" "$PLIST"; }

pset CFBundleDisplayName string "BitRymDym"
pset CFBundleDevelopmentRegion string "pl"
pset NSMicrophoneUsageDescription string "BitRymDym używa mikrofonu do nagrywania Twojego wokalu w Studiu."
pset ITSAppUsesNonExemptEncryption bool false
# Odtwarzanie bitu/podglądu także przy wyciszonym przełączniku dzwonka i w tle nie jest potrzebne – bez UIBackgroundModes.

# Tylko portret na iPhonie (aplikacja jest iPhone-only, iPad uruchamia ją w trybie zgodności).
"$PB" -c "Delete :UISupportedInterfaceOrientations" "$PLIST" >/dev/null 2>&1 || true
"$PB" -c "Add :UISupportedInterfaceOrientations array" "$PLIST"
"$PB" -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" "$PLIST"
"$PB" -c "Delete :UISupportedInterfaceOrientations~ipad" "$PLIST" >/dev/null 2>&1 || true

# Szablon Capacitora ma przestarzałe armv7 – App Store buduje tylko arm64.
"$PB" -c "Delete :UIRequiredDeviceCapabilities" "$PLIST" >/dev/null 2>&1 || true
"$PB" -c "Add :UIRequiredDeviceCapabilities array" "$PLIST"
"$PB" -c "Add :UIRequiredDeviceCapabilities:0 string arm64" "$PLIST"

# Ustawienia celu App: wersja, build, tylko iPhone.
sed -i '' \
  -e "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $APP_VERSION;/g" \
  -e "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $BUILD_NUMBER;/g" \
  -e 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/g' \
  "$PBX"
grep -q "PRODUCT_BUNDLE_IDENTIFIER = pl.bitrymdym.app;" "$PBX" || { echo "Zły bundle id w projekcie"; exit 1; }

# Ikona (1024, bez alfy) i splash (#0E0C0A + symbol) z resources/ (tools/generate-assets.mjs).
cp "$HERE/resources/AppIcon-1024.png" "$APP_DIR/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
for f in splash-2732x2732.png splash-2732x2732-1.png splash-2732x2732-2.png; do
  cp "$HERE/resources/splash-2732x2732.png" "$APP_DIR/Assets.xcassets/Splash.imageset/$f"
done

"$PB" -c "Print" "$PLIST"
echo "patch-ios: wersja $APP_VERSION ($BUILD_NUMBER) OK"
