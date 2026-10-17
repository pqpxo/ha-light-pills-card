/*!
 * Light Pills Card for Home Assistant
 * A compact room card with 2-4 pills for lights, switches and more.
 * Pills expand to show their name, sized automatically.
 * https://github.com/pqpxo/ha-light-pills-card | MIT licence
 */

const VERSION = '1.1.0';
const CARD_TAG = 'light-pills-card';
const EDITOR_TAG = 'light-pills-card-editor';
const MIN_LIGHTS = 2;
const MAX_LIGHTS = 4;
const EXPAND_MODES = ['single', 'on', 'always', 'never'];
const APPEARANCES = ['theme', 'classic'];
const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;

/* ----------------------------------------------------------------------
 * Entities
 * -------------------------------------------------------------------- */

/** Domains where tapping toggles by default. Everything else opens more-info. */
const TAP_TOGGLE_DOMAINS = new Set([
  'light', 'switch', 'fan', 'input_boolean', 'group', 'automation', 'humidifier',
  'siren', 'valve', 'cover', 'remote', 'script', 'scene', 'button', 'input_button',
]);

/** Momentary or value-only domains never count as "on". */
const NEVER_ACTIVE_DOMAINS = new Set([
  'button', 'input_button', 'scene', 'event', 'sensor', 'number', 'input_number',
  'select', 'input_select', 'text', 'input_text', 'input_datetime', 'datetime',
  'date', 'time', 'counter', 'weather', 'sun', 'zone', 'image', 'tag',
]);

const domainOf = (entityId) => String(entityId || '').split('.')[0];

/** Whether an entity is "on", following Home Assistant's own rules per domain. */
function isActive(stateObj) {
  if (!stateObj) return false;
  const domain = domainOf(stateObj.entity_id);
  const { state } = stateObj;
  if (state === 'unavailable' || state === 'unknown') return false;
  if (NEVER_ACTIVE_DOMAINS.has(domain)) return false;
  if (state === 'off' && domain !== 'alert') return false;
  switch (domain) {
    case 'alarm_control_panel':
      return state !== 'disarmed';
    case 'alert':
      return state !== 'idle';
    case 'cover':
    case 'valve':
      return state !== 'closed';
    case 'device_tracker':
    case 'person':
      return state !== 'not_home';
    case 'lawn_mower':
      return state === 'mowing' || state === 'error';
    case 'lock':
      return state !== 'locked';
    case 'media_player':
      return state !== 'standby';
    case 'vacuum':
      return !['idle', 'docked', 'paused'].includes(state);
    case 'plant':
      return state === 'problem';
    case 'group':
      return ['on', 'home', 'open', 'locked', 'problem'].includes(state);
    case 'timer':
      return state === 'active';
    case 'camera':
      return state === 'streaming';
    default:
      return true;
  }
}

function defaultTapAction(entityId) {
  return !entityId || TAP_TOGGLE_DOMAINS.has(domainOf(entityId)) ? 'toggle' : 'more-info';
}

/* ----------------------------------------------------------------------
 * Styling
 *
 * Each styling option maps to a CSS custom property (--lpc-<option>) that the
 * card sets on its host, so themes and card-mod can set them too. When an
 * option isn't set, the active appearance supplies a default through a
 * matching --lpc-d-<option> property.
 * -------------------------------------------------------------------- */

const STYLE_OPTIONS = [
  'background', 'border_radius', 'box_shadow', 'border', 'height', 'padding',
  'name_color', 'name_font_size', 'name_font_weight', 'name_letter_spacing', 'image_size',
  'pill_size', 'pill_icon_size', 'pill_radius', 'pill_gap', 'pill_background',
  'pill_background_on', 'pill_text_color', 'pill_font_size', 'pill_font_weight',
  'icon_color_on', 'icon_color_off', 'icon_opacity_off', 'animation_duration',
];
const UNITLESS = new Set(['name_font_weight', 'pill_font_weight', 'icon_opacity_off']);

const kebab = (option) => option.replace(/_/g, '-');
const cssVar = (option) => `--lpc-${kebab(option)}`;
/** `var(--lpc-x, var(--lpc-d-x))` for use in the stylesheet. */
const v = (option) => `var(${cssVar(option)}, var(--lpc-d-${kebab(option)}))`;

const SHARED_DEFAULTS = {
  height: '70px',
  padding: '0 12px 0 14px',
  name_font_size: '21px',
  name_font_weight: '500',
  name_letter_spacing: '-0.9px',
  image_size: '40px',
  pill_size: '42px',
  pill_icon_size: '24px',
  pill_radius: '13px',
  pill_gap: '5px',
  pill_font_size: '15px',
  pill_font_weight: '600',
  animation_duration: '0.25s',
};

const PRESETS = {
  // Follows the Home Assistant theme, light or dark, like the built-in cards
  theme: {
    ...SHARED_DEFAULTS,
    background: 'var(--ha-card-background, var(--card-background-color, #fff))',
    border_radius: 'var(--ha-card-border-radius, 12px)',
    box_shadow: 'var(--ha-card-box-shadow, none)',
    border: 'var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0))',
    name_color: 'var(--primary-text-color, #212121)',
    pill_background: 'rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.07)',
    pill_background_on: `color-mix(in srgb, ${v('icon_color_on')} 22%, transparent)`,
    pill_text_color: 'var(--primary-text-color, #212121)',
    // Each pill sets --lpc-domain-color to Home Assistant's colour for its domain
    icon_color_on: 'var(--lpc-domain-color, var(--state-light-active-color, var(--state-active-color, #ffc107)))',
    icon_color_off: 'var(--secondary-text-color, #727272)',
    icon_opacity_off: '1',
  },
  // The original dark navy design
  classic: {
    ...SHARED_DEFAULTS,
    background: '#35425c',
    border_radius: '15px',
    box_shadow: 'rgba(0, 0, 0, 0.35) 0px 5px 15px',
    border: 'none',
    name_color: '#ffffff',
    pill_background: '#4B5975',
    pill_background_on: v('pill_background'),
    pill_text_color: '#ffffff',
    icon_color_on: '#FFD08A',
    icon_color_off: '#ffffff',
    icon_opacity_off: '0.6',
  },
};

/** Plain-English defaults for the editor's helper text. */
const DEFAULT_HELP = {
  theme: {
    background: 'theme card background',
    border_radius: 'theme card radius',
    box_shadow: 'theme card shadow',
    border: 'theme card border',
    name_color: 'theme text colour',
    pill_background: 'faint tint of the text colour',
    pill_background_on: 'tint of the icon colour',
    pill_text_color: 'theme text colour',
    icon_color_on: 'Home Assistant state colour, amber for lights',
    icon_color_off: 'theme secondary text colour',
  },
  classic: {
    pill_background_on: 'same as pill background',
  },
};

/** Turn a YAML value into a CSS value: bare numbers become px (or s/ms for durations). */
function toCss(option, value) {
  if (typeof value !== 'number') return String(value);
  if (UNITLESS.has(option)) return String(value);
  if (option === 'animation_duration') return value <= 5 ? `${value}s` : `${value}ms`;
  return `${value}px`;
}

/** Accept `- light.x` shorthand as well as `- entity: light.x`. */
function normaliseLight(light) {
  if (typeof light === 'string') return { entity: light };
  return light && typeof light === 'object' ? { ...light } : {};
}

/** YAML 1.1 (YAML-mode dashboards) reads a bare `on` as true and `off` as false. */
function normaliseExpand(expand) {
  if (expand === true) return 'on';
  if (expand === false) return 'never';
  return expand;
}

function fireEvent(node, type, detail) {
  const event = new Event(type, { bubbles: true, composed: true, cancelable: false });
  event.detail = detail;
  node.dispatchEvent(event);
  return event;
}

function presetBlock(name) {
  const decls = Object.entries(PRESETS[name])
    .map(([option, value]) => `--lpc-d-${kebab(option)}: ${value};`)
    .join('\n    ');
  // Declared on the pills as well, so per-pill values (the domain colour) resolve per pill
  return `ha-card.preset-${name},\n  ha-card.preset-${name} .pill {\n    ${decls}\n  }`;
}

const STYLES = `
  :host {
    display: block;
  }
  ${presetBlock('theme')}
  ${presetBlock('classic')}
  @supports not (background: color-mix(in srgb, red 50%, blue)) {
    ha-card.preset-theme,
    ha-card.preset-theme .pill {
      --lpc-d-pill-background-on: rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.14);
    }
  }
  ha-card.preset-classic .pill {
    --ha-ripple-color: #ffffff;
  }

  ha-card {
    background: ${v('background')};
    border-radius: ${v('border_radius')};
    box-shadow: ${v('box_shadow')};
    border: ${v('border')};
    overflow: visible;
  }
  .row {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    height: ${v('height')};
    padding: ${v('padding')};
  }

  /*
   * Header: icon/image, name and optional count. It takes whatever the pills
   * leave, so if space runs out the name truncates first, then the pill labels.
   */
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1 1 0;
    min-width: 0;
    height: 100%;
    border-radius: inherit;
    outline: none;
  }
  .header.has-media {
    min-width: ${v('image_size')};
  }
  .header.clickable {
    cursor: pointer;
  }
  .header.clickable:focus-visible {
    outline: 2px solid ${v('icon_color_on')};
    outline-offset: 2px;
  }
  .media {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: ${v('image_size')};
    height: ${v('image_size')};
  }
  .media[hidden] {
    display: none;
  }
  .media img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .media ha-icon {
    --mdc-icon-size: ${v('image_size')};
    color: ${v('icon_color_off')};
    opacity: ${v('icon_opacity_off')};
    transition: color ${v('animation_duration')} ease, opacity ${v('animation_duration')} ease;
  }
  .header.any-on .media ha-icon {
    color: ${v('icon_color_on')};
    opacity: 1;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: ${v('name_color')};
  }
  .name {
    font-size: ${v('name_font_size')};
    font-weight: ${v('name_font_weight')};
    letter-spacing: ${v('name_letter_spacing')};
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count {
    font-size: 14px;
    font-weight: 400;
    letter-spacing: -0.5px;
    opacity: 0.7;
    white-space: nowrap;
  }
  .count[hidden] {
    display: none;
  }

  /* Pills */
  .pills {
    display: flex;
    align-items: center;
    gap: ${v('pill_gap')};
    flex: 0 1 auto;
    min-width: 0;
    margin-left: auto;
  }
  .pill {
    all: unset;
    box-sizing: border-box;
    position: relative;
    flex: 0 1 auto;
    /*
     * Automatic width: column 1 is the icon, column 2 is the label.
     * Animating the label track from 0fr to 1fr grows the pill to exactly
     * the width of its text, so "TV" and "Living Room" both fit with no
     * hard-coded widths.
     */
    display: inline-grid;
    grid-template-columns: ${v('pill_icon_size')} 0fr;
    align-items: center;
    height: ${v('pill_size')};
    min-width: ${v('pill_size')};
    padding: 0 calc((${v('pill_size')} - ${v('pill_icon_size')}) / 2);
    border-radius: ${v('pill_radius')};
    background-color: ${v('pill_background')};
    color: ${v('pill_text_color')};
    cursor: pointer;
    overflow: hidden;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
    transition:
      grid-template-columns ${v('animation_duration')} ease,
      background-color ${v('animation_duration')} ease,
      opacity ${v('animation_duration')} ease;
  }
  .pill.on {
    background-color: ${v('pill_background_on')};
  }
  .pill.expanded {
    grid-template-columns: ${v('pill_icon_size')} 1fr;
  }
  .pill.unavailable {
    opacity: 0.4;
  }
  .pill:focus-visible {
    outline: 2px solid ${v('icon_color_on')};
    outline-offset: 2px;
  }
  @media (hover: hover) {
    .pill:hover {
      filter: brightness(1.08);
    }
  }
  .pill ha-ripple {
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .pill .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: ${v('pill_icon_size')};
    height: ${v('pill_icon_size')};
    --mdc-icon-size: ${v('pill_icon_size')};
    color: ${v('icon_color_off')};
    opacity: ${v('icon_opacity_off')};
    transition: color ${v('animation_duration')} ease, opacity ${v('animation_duration')} ease;
  }
  .pill.on .icon {
    color: ${v('icon_color_on')};
    opacity: 1;
  }
  .label-wrap {
    min-width: 0;
    overflow: hidden;
  }
  /*
   * No text-overflow: ellipsis here. The label is narrower than its text for
   * the whole expand animation, so an ellipsis would flash "T..." before "TV".
   * Plain clipping reveals the text as a smooth wipe instead.
   */
  .label {
    display: block;
    padding: 0 3px 0 6px;
    white-space: nowrap;
    font-size: ${v('pill_font_size')};
    font-weight: ${v('pill_font_weight')};
    line-height: 1;
    opacity: 0;
    transition: opacity ${v('animation_duration')} ease;
  }
  .pill.expanded .label {
    opacity: 0.9;
  }

  /*
   * Motion. No transitions on first paint (so pills don't grow when the
   * dashboard loads), with animation: false, or when the device asks for
   * reduced motion.
   */
  .no-anim,
  .no-anim *,
  ha-card.static,
  ha-card.static * {
    transition: none !important;
  }
  @media (prefers-reduced-motion: reduce) {
    ha-card,
    ha-card * {
      transition: none !important;
    }
  }
`;

class LightPillsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._pills = [];
    this._appliedVars = [];
    this._lastStates = new Map();
  }

  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
  }

  static getStubConfig(hass) {
    const ids = hass && hass.states ? Object.keys(hass.states) : [];
    const preferred = ['light', 'switch', 'fan', 'input_boolean'];
    const picks = preferred.flatMap((domain) => ids.filter((id) => domainOf(id) === domain)).slice(0, 3);
    while (picks.length < MIN_LIGHTS) picks.push(`light.example_${picks.length + 1}`);
    return { name: 'Lights', lights: picks.map((entity) => ({ entity })) };
  }

  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');

    const lights = Array.isArray(config.lights) ? config.lights.map(normaliseLight) : [];
    if (lights.length < MIN_LIGHTS || lights.length > MAX_LIGHTS) {
      throw new Error(`Add between ${MIN_LIGHTS} and ${MAX_LIGHTS} entities under "lights:" (found ${lights.length}).`);
    }
    lights.forEach((light, i) => {
      if (!light.entity || typeof light.entity !== 'string') {
        throw new Error(`Pill ${i + 1} needs an "entity".`);
      }
    });
    const expand = normaliseExpand(config.expand);
    if (expand !== undefined && !EXPAND_MODES.includes(expand)) {
      throw new Error(`"expand" must be one of: ${EXPAND_MODES.join(', ')}.`);
    }
    if (config.appearance !== undefined && !APPEARANCES.includes(config.appearance)) {
      throw new Error(`"appearance" must be one of: ${APPEARANCES.join(', ')}.`);
    }

    this._config = {
      show_icon: true,
      show_count: false,
      animation: true,
      ...config,
      appearance: config.appearance || 'theme',
      expand: expand || 'single',
      lights,
    };
    this._lastStates.clear();
    this._applyStyleVars();
    this._build();
    if (this._hass) this._update(true);
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._update(false);
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  /* ---------- rendering ---------- */

  _applyStyleVars() {
    this._appliedVars.forEach((prop) => this.style.removeProperty(prop));
    this._appliedVars = [];
    STYLE_OPTIONS.forEach((option) => {
      const value = this._config[option];
      if (value === undefined || value === null || value === '') return;
      this.style.setProperty(cssVar(option), toCss(option, value));
      this._appliedVars.push(cssVar(option));
    });
  }

  _build() {
    const c = this._config;
    const animated = c.animation !== false;
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>${STYLES}</style>
      <ha-card class="preset-${c.appearance}${animated ? '' : ' static'}">
        <div class="row no-anim">
          <div class="header">
            <div class="media"></div>
            <div class="text">
              <div class="name"></div>
              <div class="count" hidden></div>
            </div>
          </div>
          <div class="pills"></div>
        </div>
      </ha-card>
    `;

    this._row = root.querySelector('.row');
    this._header = root.querySelector('.header');
    this._nameEl = root.querySelector('.name');
    this._countEl = root.querySelector('.count');
    this._firstPaint = true;

    // Header media: image takes priority over icon
    const media = root.querySelector('.media');
    this._headerIcon = null;
    this._header.classList.toggle('has-media', c.show_icon !== false);
    if (c.show_icon === false) {
      media.hidden = true;
    } else if (c.image) {
      const img = document.createElement('img');
      img.src = c.image;
      img.alt = '';
      media.appendChild(img);
    } else {
      const icon = document.createElement('ha-icon');
      icon.icon = c.icon || 'mdi:lightbulb-group';
      media.appendChild(icon);
      this._headerIcon = icon;
    }

    this._nameEl.textContent = c.name ?? '';

    // Header actions only when something is configured
    const headerHasAction = ['tap_action', 'hold_action'].some(
      (key) => c[key] && c[key].action && c[key].action !== 'none',
    );
    if (headerHasAction) {
      this._header.classList.add('clickable');
      this._header.setAttribute('role', 'button');
      this._header.tabIndex = 0;
      this._bindActions(this._header, () => ({
        entity: c.entity,
        tap_action: c.tap_action || { action: 'none' },
        hold_action: c.hold_action || { action: 'none' },
      }));
    }

    // Pills
    const pillsEl = root.querySelector('.pills');
    this._pills = c.lights.map((light) => {
      const domain = domainOf(light.entity);
      const button = document.createElement('button');
      button.className = 'pill';
      button.type = 'button';
      // Home Assistant's state colour for this domain, used by the theme appearance
      button.style.setProperty(
        '--lpc-domain-color',
        `var(--state-${domain}-active-color, var(--state-active-color, #ffc107))`,
      );
      button.innerHTML = `
        ${animated ? '<ha-ripple></ha-ripple>' : ''}
        <ha-state-icon class="icon"></ha-state-icon>
        <span class="label-wrap"><span class="label"></span></span>
      `;
      const icon = button.querySelector('.icon');
      const label = button.querySelector('.label');

      this._bindActions(button, () => ({
        entity: light.entity,
        tap_action: light.tap_action || { action: defaultTapAction(light.entity) },
        hold_action: light.hold_action || { action: 'more-info' },
        double_tap_action: { action: 'none' },
      }));

      pillsEl.appendChild(button);
      return { light, button, icon, label, name: null };
    });
  }

  _update(force) {
    const hass = this._hass;
    const c = this._config;
    if (!hass || !c) return;

    // Skip work when none of our entities changed
    const watched = [...c.lights.map((l) => l.entity), c.entity].filter(Boolean);
    const changed = force || this._firstPaint || watched.some((e) => this._lastStates.get(e) !== hass.states[e]);
    if (!changed) return;
    watched.forEach((e) => this._lastStates.set(e, hass.states[e]));

    const stateObjs = c.lights.map((l) => hass.states[l.entity]);
    const onCount = stateObjs.filter(isActive).length;
    const mode = c.expand;

    this._pills.forEach((pill, i) => {
      const stateObj = stateObjs[i];
      const on = isActive(stateObj);
      const unavailable = !stateObj || stateObj.state === 'unavailable';

      const name = pill.light.name ?? (stateObj && stateObj.attributes.friendly_name) ?? pill.light.entity;
      if (name !== pill.name) {
        pill.label.textContent = name;
        pill.button.setAttribute('aria-label', name);
        pill.button.title = name;
        pill.name = name;
      }

      const expanded =
        !!name &&
        (mode === 'always' || (mode === 'on' && on) || (mode === 'single' && on && onCount === 1));

      pill.icon.hass = hass;
      pill.icon.stateObj = stateObj;
      // Missing entity and no icon configured: show a placeholder rather than an empty pill
      pill.icon.icon = pill.light.icon || (stateObj ? undefined : 'mdi:lightbulb-question-outline');
      pill.button.classList.toggle('on', on);
      pill.button.classList.toggle('expanded', expanded);
      pill.button.classList.toggle('unavailable', unavailable);
      pill.button.setAttribute('aria-pressed', String(on));
    });

    this._header.classList.toggle('any-on', onCount > 0);
    if (this._headerIcon && c.entity && !c.icon) {
      // Allow the header icon to follow a configured entity's icon when no icon is set
      const ent = hass.states[c.entity];
      if (ent && ent.attributes.icon) this._headerIcon.icon = ent.attributes.icon;
    }

    if (c.show_count) {
      this._countEl.hidden = false;
      const total = c.lights.length;
      this._countEl.textContent = onCount === 0 ? 'All off' : onCount === total ? 'All on' : `${onCount} of ${total} on`;
    } else {
      this._countEl.hidden = true;
    }

    if (this._firstPaint) {
      this._firstPaint = false;
      // Re-enable transitions after the initial state has painted
      requestAnimationFrame(() => requestAnimationFrame(() => this._row && this._row.classList.remove('no-anim')));
    }
  }

  /* ---------- actions ---------- */

  _bindActions(el, getActionConfig) {
    let timer = null;
    let held = false;
    let startX = 0;
    let startY = 0;

    const clear = () => {
      clearTimeout(timer);
      timer = null;
    };

    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      held = false;
      startX = ev.clientX;
      startY = ev.clientY;
      const cfg = getActionConfig();
      if (!cfg.hold_action || cfg.hold_action.action === 'none') return;
      clear();
      timer = setTimeout(() => {
        held = true;
        timer = null;
        this._runAction(cfg, 'hold');
      }, HOLD_MS);
    });
    el.addEventListener('pointermove', (ev) => {
      if (timer && Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_TOLERANCE) clear();
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => el.addEventListener(type, clear));
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());

    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (held) {
        held = false;
        return;
      }
      this._runAction(getActionConfig(), 'tap');
    });

    el.addEventListener('keydown', (ev) => {
      // <button> handles Enter/Space itself; this covers the header div
      if (el.tagName !== 'BUTTON' && (ev.key === 'Enter' || ev.key === ' ')) {
        ev.preventDefault();
        this._runAction(getActionConfig(), 'tap');
      }
    });
  }

  _runAction(config, action) {
    const actionConfig = config[`${action}_action`];
    if (!actionConfig || actionConfig.action === 'none') return;
    // Home Assistant's frontend handles toggle, more-info, navigate, url,
    // perform-action, assist and confirmation dialogs for this event.
    fireEvent(this, 'hass-action', { config, action });
  }
}

/* ======================================================================
 * Visual editor
 * ==================================================================== */

const LABELS = {
  name: 'Card name',
  icon: 'Icon',
  image: 'Image URL (overrides icon, e.g. /local/bulb.png)',
  appearance: 'Appearance',
  expand: 'Show name',
  show_icon: 'Show icon / image',
  show_count: 'Show "x of y on"',
  animation: 'Animate pills',
  entity: 'Entity',
  tap_action: 'Tap action',
  hold_action: 'Hold action',
  background: 'Background',
  border_radius: 'Border radius',
  box_shadow: 'Box shadow',
  border: 'Border',
  height: 'Height',
  padding: 'Padding',
  name_color: 'Name colour',
  name_font_size: 'Name font size',
  name_font_weight: 'Name font weight',
  name_letter_spacing: 'Name letter spacing',
  image_size: 'Icon / image size',
  pill_size: 'Pill size',
  pill_icon_size: 'Pill icon size',
  pill_radius: 'Pill border radius',
  pill_gap: 'Gap between pills',
  pill_background: 'Pill background',
  pill_background_on: 'Pill background when on',
  pill_text_color: 'Pill text colour',
  pill_font_size: 'Pill font size',
  pill_font_weight: 'Pill font weight',
  icon_color_on: 'Icon colour when on',
  icon_color_off: 'Icon colour when off',
  icon_opacity_off: 'Icon opacity when off',
  animation_duration: 'Animation duration',
};

/** Shown in the editor when unset; stripped again on save to keep YAML short. */
const EDITOR_DEFAULTS = {
  appearance: 'theme',
  expand: 'single',
  show_icon: true,
  show_count: false,
  animation: true,
};

const text = (name) => ({ name, selector: { text: {} } });

function lightSchema(n, entity) {
  const required = n <= MIN_LIGHTS;
  return {
    name: `light_${n}`,
    type: 'expandable',
    title: required ? `Pill ${n}` : `Pill ${n} (optional)`,
    icon: 'mdi:lightbulb-outline',
    schema: [
      { name: 'entity', required, selector: { entity: {} } },
      {
        name: '',
        type: 'grid',
        schema: [
          { name: 'name', label: 'Name (shown when expanded)', selector: { text: {} } },
          { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
        ],
      },
      { name: 'tap_action', selector: { ui_action: { default_action: defaultTapAction(entity) } } },
      { name: 'hold_action', selector: { ui_action: { default_action: 'more-info' } } },
    ],
  };
}

function buildSchema(config) {
  const lights = (config.lights || []).map(normaliseLight);
  return [
    text('name'),
    {
      name: '',
      type: 'grid',
      schema: [{ name: 'icon', selector: { icon: {} } }, text('image')],
    },
    {
      name: 'appearance',
      selector: {
        select: {
          mode: 'dropdown',
          options: [
            { value: 'theme', label: 'Follow Home Assistant theme' },
            { value: 'classic', label: 'Classic (dark navy)' },
          ],
        },
      },
    },
    {
      name: 'expand',
      selector: {
        select: {
          mode: 'dropdown',
          options: [
            { value: 'single', label: "When it's the only one on" },
            { value: 'on', label: 'Whenever it is on' },
            { value: 'always', label: 'Always' },
            { value: 'never', label: 'Never (icons only)' },
          ],
        },
      },
    },
    {
      name: '',
      type: 'grid',
      schema: [
        { name: 'show_icon', selector: { boolean: {} } },
        { name: 'show_count', selector: { boolean: {} } },
        { name: 'animation', selector: { boolean: {} } },
      ],
    },
    ...Array.from({ length: MAX_LIGHTS }, (_, i) => lightSchema(i + 1, lights[i] && lights[i].entity)),
    {
      name: 'card_appearance',
      type: 'expandable',
      flatten: true,
      title: 'Card styling',
      icon: 'mdi:palette-outline',
      schema: [
        {
          name: '',
          type: 'grid',
          schema: [
            text('background'),
            text('name_color'),
            text('border_radius'),
            text('border'),
            text('height'),
            text('padding'),
            text('name_font_size'),
            { name: 'name_font_weight', selector: { number: { min: 100, max: 900, step: 100, mode: 'box' } } },
            text('name_letter_spacing'),
            text('image_size'),
          ],
        },
        text('box_shadow'),
      ],
    },
    {
      name: 'pill_appearance',
      type: 'expandable',
      flatten: true,
      title: 'Pill styling',
      icon: 'mdi:pill',
      schema: [
        {
          name: '',
          type: 'grid',
          schema: [
            text('pill_background'),
            text('pill_background_on'),
            text('icon_color_on'),
            text('icon_color_off'),
            text('pill_text_color'),
            { name: 'icon_opacity_off', selector: { number: { min: 0, max: 1, step: 0.05, mode: 'slider' } } },
            text('pill_size'),
            text('pill_icon_size'),
            text('pill_radius'),
            text('pill_gap'),
            text('pill_font_size'),
            { name: 'pill_font_weight', selector: { number: { min: 100, max: 900, step: 100, mode: 'box' } } },
            text('animation_duration'),
          ],
        },
      ],
    },
    {
      name: 'card_interactions',
      type: 'expandable',
      flatten: true,
      title: 'Card interactions (name and icon area)',
      icon: 'mdi:gesture-tap',
      schema: [
        { name: 'entity', selector: { entity: {} } },
        { name: 'tap_action', selector: { ui_action: { default_action: 'none' } } },
        { name: 'hold_action', selector: { ui_action: { default_action: 'none' } } },
      ],
    },
  ];
}

function helperText(name, appearance) {
  if (name === 'animation') return 'Off: pills change instantly, with no tap ripple';
  if (!STYLE_OPTIONS.includes(name)) return undefined;
  const preset = APPEARANCES.includes(appearance) ? appearance : 'theme';
  const help = DEFAULT_HELP[preset][name] || PRESETS[preset][name];
  return `Default: ${help}`;
}

const isEmpty = (val) => val === undefined || val === null || val === '';

function stripEmpty(obj) {
  const out = {};
  Object.entries(obj).forEach(([key, val]) => {
    if (!isEmpty(val)) out[key] = val;
  });
  return out;
}

/** Card config -> ha-form data (lights array flattened into light_1..light_4). */
function configToForm(config) {
  const { lights = [], ...rest } = config;
  const data = { ...EDITOR_DEFAULTS, ...stripEmpty(rest) };
  data.expand = normaliseExpand(data.expand);
  for (let i = 0; i < MAX_LIGHTS; i += 1) {
    data[`light_${i + 1}`] = normaliseLight(lights[i]);
  }
  return data;
}

/** ha-form data -> card config. Empty light slots and default values are dropped. */
function formToConfig(data) {
  const lightKeys = Array.from({ length: MAX_LIGHTS }, (_, i) => `light_${i + 1}`);
  const rest = {};
  Object.entries(data).forEach(([key, val]) => {
    if (!lightKeys.includes(key) && EDITOR_DEFAULTS[key] !== val) rest[key] = val;
  });
  const lights = lightKeys
    .map((key) => stripEmpty(data[key] || {}))
    .filter((light) => !isEmpty(light.entity));
  const { type, ...options } = stripEmpty(rest);
  return { type, ...options, lights };
}

async function loadHaForm() {
  if (customElements.get('ha-form')) return;
  try {
    // Creating a built-in card and asking for its editor makes HA load ha-form and its selectors
    const helpers = window.loadCardHelpers ? await window.loadCardHelpers() : null;
    if (helpers) {
      const card = await helpers.createCardElement({ type: 'tile', entity: 'sun.sun' });
      if (card && card.constructor && card.constructor.getConfigElement) {
        await card.constructor.getConfigElement();
      }
    }
  } catch (err) {
    // Fall through and wait for definition
  }
  await Promise.race([
    customElements.whenDefined('ha-form'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

class LightPillsCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = null;
    this._hass = null;
    this._form = null;
    this._schemaKey = null;
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  connectedCallback() {
    loadHaForm().then(() => this._render());
  }

  _render() {
    if (!this._config || !customElements.get('ha-form')) return;
    if (!this._form) {
      this._form = document.createElement('ha-form');
      // Nested ha-forms receive the same schema objects, so a schema-level label wins
      this._form.computeLabel = (schema) => schema.label || LABELS[schema.name] || schema.name;
      this._form.computeHelper = (schema) => helperText(schema.name, this._config && this._config.appearance);
      this._form.addEventListener('value-changed', (ev) => this._valueChanged(ev));
      this.appendChild(this._form);
    }
    // The schema depends on the chosen entities (default tap action per domain)
    const lights = (this._config.lights || []).map(normaliseLight);
    const key = lights.map((l) => domainOf(l.entity)).join(',');
    if (key !== this._schemaKey) {
      this._form.schema = buildSchema(this._config);
      this._schemaKey = key;
    }
    this._form.hass = this._hass;
    this._form.data = configToForm(this._config);
  }

  _valueChanged(ev) {
    ev.stopPropagation();
    const config = formToConfig({ ...ev.detail.value, type: this._config.type });
    this._config = config;
    fireEvent(this, 'config-changed', { config });
  }
}

/* ---------- registration ---------- */

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, LightPillsCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, LightPillsCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: 'Light Pills Card',
    description: 'A room card with 2-4 pills for lights, switches and more. Pills expand to show their name.',
    preview: true,
    documentationURL: 'https://github.com/pqpxo/ha-light-pills-card',
  });
}

// Exposed for tests and for other cards that want to reuse them
LightPillsCard.version = VERSION;
LightPillsCard.isActive = isActive;
LightPillsCard.defaultTapAction = defaultTapAction;
LightPillsCardEditor.configToForm = configToForm;
LightPillsCardEditor.formToConfig = formToConfig;

console.info(
  `%c LIGHT-PILLS-CARD %c v${VERSION} `,
  'color:#FFD08A;background:#35425c;font-weight:700;border-radius:4px 0 0 4px;padding:2px 4px',
  'color:#35425c;background:#FFD08A;font-weight:700;border-radius:0 4px 4px 0;padding:2px 4px',
);
