"""Headless checks for the Light Pills Card preview.

Run from the repo root:
    npm install
    python3 -m http.server 8765 &
    python3 dev/test_preview.py
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get("PREVIEW_URL", "http://localhost:8765/dev/preview.html")
SHOTS = os.path.join(os.path.dirname(__file__), "screenshots")
SETTLE_MS = 450  # longer than the 0.25s animation

failures = []


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


def pill_widths(page, card_id):
    return page.evaluate(
        """id => [...document.getElementById(id).shadowRoot.querySelectorAll('.pill')]
                 .map(p => Math.round(p.getBoundingClientRect().width * 10) / 10)""",
        card_id,
    )


def label_widths(page, card_id):
    # Natural width of each label's text (including its padding)
    return page.evaluate(
        """id => [...document.getElementById(id).shadowRoot.querySelectorAll('.label')]
                 .map(l => Math.round(l.scrollWidth * 10) / 10)""",
        card_id,
    )


def set_states(page, states):
    page.evaluate("s => window.setStates(s)", states)
    page.wait_for_timeout(SETTLE_MS)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 520, "height": 560}, device_scale_factor=2)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.goto(URL)
    page.wait_for_function("window.previewReady === true")
    page.wait_for_timeout(300)
    os.makedirs(SHOTS, exist_ok=True)

    # 1. All off: every pill is a square
    widths = pill_widths(page, "original")
    check(widths == [42, 42, 42, 42], f"all off -> pills are 42px squares {widths}")
    page.screenshot(path=f"{SHOTS}/01-all-off.png")

    # 2. Only TV on: TV grows to fit its label, others stay square
    set_states(page, {"light.example_1": "on"})
    widths = pill_widths(page, "original")
    labels = label_widths(page, "original")
    expected_tv = 42 + labels[0]
    check(abs(widths[0] - expected_tv) <= 1, f"TV only -> TV pill fits label ({widths[0]} ~ {expected_tv})")
    check(widths[1:] == [42, 42, 42], f"TV only -> other pills stay 42px {widths[1:]}")
    tv_width = widths[0]
    page.screenshot(path=f"{SHOTS}/02-tv-only.png")

    # 3. Second light on: original behaviour collapses both back to squares
    set_states(page, {"light.example_2": "on"})
    widths = pill_widths(page, "original")
    check(widths == [42, 42, 42, 42], f"two on (single mode) -> all collapse {widths}")
    page.screenshot(path=f"{SHOTS}/03-two-on.png")

    # 4. Each name gets its own width
    results = {}
    for i, entity in enumerate(
        ["light.example_1", "light.example_2", "light.example_3", "light.example_4"]
    ):
        page.evaluate("() => window.allOff()")
        set_states(page, {entity: "on"})
        results[entity] = pill_widths(page, "original")[i]
    print("     expanded widths:", json.dumps(results))
    check(len(set(results.values())) > 1, "different names produce different widths")

    # 5. Long friendly name ("Living Room") is wider than "TV"
    page.evaluate("() => window.allOff()")
    set_states(page, {"light.living_room": "on"})
    long_w = pill_widths(page, "long")[0]
    long_label = label_widths(page, "long")[0]
    check(abs(long_w - (42 + long_label)) <= 1, f"Living Room pill fits its label ({long_w} ~ {42 + long_label})")
    check(long_w > tv_width, f"Living Room ({long_w}) wider than TV ({tv_width})")
    count = page.evaluate("() => document.getElementById('long').shadowRoot.querySelector('.count').textContent")
    check(count == "1 of 3 on", f"show_count text -> '{count}'")

    # 6. Animation: width is between collapsed and expanded part way through
    page.evaluate("() => window.allOff()")
    page.wait_for_timeout(SETTLE_MS)
    page.evaluate("() => window.setStates({'light.kitchen_island': 'on'})")
    page.wait_for_timeout(110)
    mid = pill_widths(page, "long")[1]
    page.wait_for_timeout(SETTLE_MS)
    end = pill_widths(page, "long")[1]
    check(42 < mid < end, f"width animates (mid {mid}, end {end})")
    overflow = page.evaluate(
        "() => getComputedStyle(document.getElementById('long').shadowRoot.querySelector('.label')).textOverflow"
    )
    check(overflow == "clip", f"label clips rather than ellipsising mid-animation ({overflow})")

    # 7. expand: on keeps every lit pill expanded
    set_states(page, {"light.bedside": "on", "light.hallway": "on"})
    widths = pill_widths(page, "themed")
    check(all(w > 42 for w in widths), f"expand: on -> both lit pills expanded {widths}")
    radius = page.evaluate(
        "() => getComputedStyle(document.getElementById('themed').shadowRoot.querySelector('ha-card')).borderTopLeftRadius"
    )
    check(radius == "22px", f"numeric border_radius becomes px ({radius})")

    # 7b. YAML 1.1 booleans: `expand: on` parsed as true still means "on"
    yaml_bool = page.evaluate(
        """() => {
            const card = document.createElement('light-pills-card');
            card.setConfig({ expand: true, lights: ['light.a', 'light.b'] });
            const offCard = document.createElement('light-pills-card');
            offCard.setConfig({ expand: false, lights: ['light.a', 'light.b'] });
            return [card._config.expand, offCard._config.expand];
        }"""
    )
    check(yaml_bool == ["on", "never"], f"expand true/false map to on/never {yaml_bool}")

    # 8. Tap toggles via hass-action; hold sends more-info
    page.evaluate("() => { window.allOff(); window.actionLog = []; }")
    page.wait_for_timeout(SETTLE_MS)
    pill = page.locator("#original .pill").nth(3)
    pill.click()
    page.wait_for_timeout(SETTLE_MS)
    state = page.evaluate("() => document.getElementById('original').hass.states['light.example_4'].state")
    check(state == "on", f"tap toggles light ({state})")
    page.screenshot(path=f"{SHOTS}/04-fire-tapped.png")

    box = pill.bounding_box()
    page.mouse.move(box["x"] + 10, box["y"] + 10)
    page.mouse.down()
    page.wait_for_timeout(650)
    page.mouse.up()
    page.wait_for_timeout(100)
    log = page.evaluate("() => window.actionLog")
    check(log[-1] == {"action": "hold", "entity": "light.example_4", "type": "more-info"}, f"hold -> more-info {log[-1]}")
    check(sum(1 for e in log if e["action"] == "tap") == 1, "hold did not also fire a tap")
    state = page.evaluate("() => document.getElementById('original').hass.states['light.example_4'].state")
    check(state == "on", "hold did not toggle the light")

    # 9. Config validation
    for bad, why in [
        ({"lights": ["light.a"]}, "1 light"),
        ({"lights": ["light.a", "light.b", "light.c", "light.d", "light.e"]}, "5 lights"),
        ({"lights": ["light.a", {"name": "x"}]}, "light without entity"),
        ({"lights": ["light.a", "light.b"], "expand": "sometimes"}, "bad expand"),
    ]:
        msg = page.evaluate(
            """cfg => { try { document.createElement('light-pills-card').setConfig(cfg); return null }
                       catch (e) { return e.message } }""",
            bad,
        )
        check(msg is not None, f"rejects {why}: {msg}")

    # 10. Editor config mapping round trip
    rt = page.evaluate(
        """() => {
            const E = customElements.get('light-pills-card-editor');
            const cfg = window.CONFIGS.original;
            const form = E.configToForm(cfg);
            const back = E.formToConfig({ ...form, type: cfg.type });
            // Clear light 2 in the form: it should drop out and later lights move up
            const cleared = E.formToConfig({ ...form, light_2: { entity: '' }, type: cfg.type });
            return { same: JSON.stringify(back) === JSON.stringify(cfg), cleared: cleared.lights.map(l => l.entity) };
        }"""
    )
    check(rt["same"], "editor configToForm/formToConfig round trip is lossless")
    check(
        rt["cleared"] == ["light.example_1", "light.example_3", "light.example_4"],
        f"clearing a light slot drops it {rt['cleared']}",
    )

    # 11. Narrow card, 4 long names all expanded: nothing spills outside the card
    page.evaluate(
        """() => {
            const wrap = document.createElement('div');
            wrap.id = 'narrow-wrap';
            wrap.style.width = '340px';
            document.querySelector('.grid').appendChild(wrap);
            const card = document.createElement('light-pills-card');
            card.id = 'narrow';
            card.setConfig({ name: 'Very Long Room Name Here', expand: 'always', lights: [
                'light.living_room', 'light.kitchen_island', 'switch.fairy_lights', 'light.hallway'] });
            card.hass = document.getElementById('original').hass;
            wrap.appendChild(card);
        }"""
    )
    page.wait_for_timeout(SETTLE_MS)
    geo = page.evaluate(
        """() => {
            const root = document.getElementById('narrow').shadowRoot;
            const card = root.querySelector('ha-card').getBoundingClientRect();
            const pills = [...root.querySelectorAll('.pill')].map(p => p.getBoundingClientRect());
            const media = root.querySelector('.media').getBoundingClientRect();
            return { cardRight: card.right, lastPillRight: pills[pills.length - 1].right,
                     minPill: Math.min(...pills.map(p => p.width)), mediaWidth: media.width };
        }"""
    )
    check(geo["lastPillRight"] <= geo["cardRight"], f"narrow: pills stay inside card {geo}")
    check(geo["minPill"] >= 42, "narrow: no pill shrinks below its icon square")
    check(geo["mediaWidth"] >= 40, "narrow: header icon keeps its size")
    page.locator("#narrow-wrap").screenshot(path=f"{SHOTS}/06-narrow-always.png")
    page.evaluate("() => document.getElementById('narrow-wrap').remove()")

    # 12. v1.1: any entity, appearance, animation toggle
    r = page.evaluate(
        """() => {
            const C = customElements.get('light-pills-card');
            const s = (entity_id, state) => ({ entity_id, state, attributes: {} });
            const active = [
                s('switch.a', 'on'), s('cover.a', 'open'), s('lock.a', 'unlocked'), s('climate.a', 'heat'),
                s('media_player.a', 'playing'), s('fan.a', 'on')].map(C.isActive);
            const inactive = [
                s('switch.a', 'off'), s('cover.a', 'closed'), s('lock.a', 'locked'), s('light.a', 'unavailable'),
                s('button.a', '2026-01-01'), s('sensor.a', '21.5'), s('scene.a', 'scening')].map(C.isActive);
            const taps = ['light.a', 'switch.a', 'cover.a', 'script.a', 'lock.a', 'sensor.a', 'climate.a']
                .map(C.defaultTapAction);
            const make = (cfg) => { const c = document.createElement('light-pills-card');
                c.setConfig({ lights: ['switch.a', 'light.b'], ...cfg }); return c.shadowRoot; };
            const def = make({}), classic = make({ appearance: 'classic' }), still = make({ animation: false });
            let bad = null;
            try { make({ appearance: 'pink' }); } catch (e) { bad = e.message; }
            const E = customElements.get('light-pills-card-editor');
            const stripped = E.formToConfig({ ...E.configToForm({ type: 'x', lights: ['light.a', 'light.b'] }), type: 'x' });
            const kept = E.formToConfig({ ...E.configToForm({ type: 'x', animation: false, appearance: 'classic',
                lights: ['light.a', 'light.b'] }), type: 'x' });
            return {
                active, inactive, taps, bad, stripped, kept,
                defClass: def.querySelector('ha-card').className,
                classicClass: classic.querySelector('ha-card').className,
                stillClass: still.querySelector('ha-card').className,
                ripplesDefault: def.querySelectorAll('ha-ripple').length,
                ripplesStill: still.querySelectorAll('ha-ripple').length,
                domainColour: def.querySelector('.pill').style.getPropertyValue('--lpc-domain-color'),
            };
        }"""
    )
    check(all(r["active"]), f"isActive true for on/open/unlocked/heat/playing {r['active']}")
    check(not any(r["inactive"]), f"isActive false for off/closed/locked/unavailable/button/sensor/scene {r['inactive']}")
    check(r["taps"] == ["toggle", "toggle", "toggle", "toggle", "more-info", "more-info", "more-info"],
          f"default tap action per domain {r['taps']}")
    check(r["defClass"] == "preset-theme", f"theme appearance is the default ({r['defClass']})")
    check(r["classicClass"] == "preset-classic", "appearance: classic applies the classic preset")
    check("static" in r["stillClass"] and r["ripplesStill"] == 0 and r["ripplesDefault"] == 2,
          "animation: false adds .static and removes the ripple")
    check("--state-switch-active-color" in r["domainColour"], f"pill uses HA domain colour ({r['domainColour']})")
    check(r["bad"] is not None, f"rejects unknown appearance: {r['bad']}")
    check(r["stripped"] == {"type": "x", "lights": [{"entity": "light.a"}, {"entity": "light.b"}]},
          f"editor doesn't write default values {r['stripped']}")
    check(r["kept"].get("animation") is False and r["kept"].get("appearance") == "classic",
          "editor keeps non-default animation and appearance")

    # 13. Showcase screenshot
    page.evaluate("() => window.allOff()")
    set_states(page, {"light.example_1": "on", "light.living_room": "on", "light.bedside": "on"})
    page.locator(".grid").screenshot(path=f"{SHOTS}/05-showcase.png")

    check(not errors, f"no page errors {errors}")
    browser.close()

print(f"\n{len(failures)} failure(s)")
sys.exit(1 if failures else 0)
