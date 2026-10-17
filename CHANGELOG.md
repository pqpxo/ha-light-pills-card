# Changelog

## 1.1.0

Based on feedback from the first release.

### Added
- **Any entity can be a pill**, not just lights. Switches, fans, covers, locks, scripts, scenes and more work, and count as "on" using Home Assistant's own rules (a cover is on when open, a lock when unlocked). Tapping toggles where that makes sense and opens more-info otherwise; locks open more-info so a stray tap can't unlock a door.
- **`appearance` option.** The new default, `theme`, follows your Home Assistant theme in light and dark mode and uses Home Assistant's state colours. `classic` keeps the original dark navy look.
- **`animation: false`** turns off all movement and the tap ripple. Transitions also switch off automatically when the device's "reduce motion" setting is on.

### Changed
- Cards now follow your theme by default. Add `appearance: classic` to keep the 1.0 look.
- The visual editor shows any entity in the picker, labels sections "Pill 1" to "Pill 4", and shows the correct on/off state for toggles that weren't set in YAML.

## 1.0.1
- Logo and centred README header.

## 1.0.0
- First release.
