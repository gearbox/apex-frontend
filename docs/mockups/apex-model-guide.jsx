// ---------------------------------------------------------------------------
// Apex — Model Guide mockup (variants A + B)
//
// A = ModelSummaryCard : always-visible teaser under the model chips
// B = ModelGuideSheet   : bottom sheet (mobile) / centred dialog (desktop)
//
// Conventions mirror mockups/apex-pwa-responsive.jsx — same THEMES map,
// in-memory prefs store, `c` colour-object threading, inline styles.
// Reference only; translate to Svelte 5 runes for implementation.
// ---------------------------------------------------------------------------
import { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Theme system
// ---------------------------------------------------------------------------
const THEMES = {
  slate: {
    light: {
      bg: '#faf8f5',
      surface: '#ffffff',
      surfaceHover: '#f0ece6',
      border: '#e0d8cc',
      borderActive: '#c0b5a5',
      text: '#2a2520',
      textMuted: '#706558',
      textDim: '#a09585',
      accent: '#b45309',
      accentDim: '#92400e',
      accentGlow: 'rgba(180, 83, 9, 0.1)',
      success: '#059669',
      warning: '#d97706',
      danger: '#dc2626',
    },
    dark: {
      bg: '#110f0b',
      surface: '#1a1710',
      surfaceHover: '#22201a',
      border: '#2e2a1e',
      borderActive: '#4a4230',
      text: '#ede8dc',
      textMuted: '#9a9080',
      textDim: '#665e4e',
      accent: '#d97706',
      accentDim: '#92400e',
      accentGlow: 'rgba(217, 119, 6, 0.14)',
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#f87171',
    },
  },
  frost: {
    light: {
      bg: '#f5f7fa',
      surface: '#ffffff',
      surfaceHover: '#eef1f6',
      border: '#dde2ea',
      borderActive: '#b0bac8',
      text: '#1a2030',
      textMuted: '#5a6578',
      textDim: '#8a95a8',
      accent: '#6366f1',
      accentDim: '#4f46e5',
      accentGlow: 'rgba(99, 102, 241, 0.1)',
      success: '#059669',
      warning: '#d97706',
      danger: '#dc2626',
    },
    dark: {
      bg: '#080810',
      surface: '#10101e',
      surfaceHover: '#181830',
      border: '#20203a',
      borderActive: '#33335a',
      text: '#e0e0f0',
      textMuted: '#8a8aa8',
      textDim: '#5a5a78',
      accent: '#818cf8',
      accentDim: '#6366f1',
      accentGlow: 'rgba(129, 140, 248, 0.14)',
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#f87171',
    },
  },
};

const _store = { theme: 'slate', mode: 'dark' };
function savePrefs(t, m) {
  _store.theme = t;
  _store.mode = m;
}

function resolveColors(theme, mode) {
  return THEMES[theme]?.[mode] ?? THEMES.slate.dark;
}

const font = `'DM Sans', 'Outfit', system-ui, sans-serif`;
const mono = `'JetBrains Mono', 'Fira Code', monospace`;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function I({ name, size = 18, color }) {
  const s = { width: size, height: size, display: 'block' };
  const p = {
    fill: 'none',
    stroke: color || 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  const icons = {
    info: (
      <svg style={s} viewBox="0 0 24 24" {...p}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    ),
    close: (
      <svg style={s} viewBox="0 0 24 24" {...p}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    ),
    chevronRight: (
      <svg style={s} viewBox="0 0 24 24" {...p}>
        <path d="m9 18 6-6-6-6" />
      </svg>
    ),
    check: (
      <svg style={s} viewBox="0 0 24 24" {...p}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
    alert: (
      <svg style={s} viewBox="0 0 24 24" {...p}>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    ),
    coins: (
      <svg style={s} viewBox="0 0 24 24" {...p}>
        <circle cx="8" cy="8" r="6" />
        <path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" />
      </svg>
    ),
    bulb: (
      <svg style={s} viewBox="0 0 24 24" {...p}>
        <path d="M9 18h6M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z" />
      </svg>
    ),
    image: (
      <svg style={s} viewBox="0 0 24 24" {...p}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    ),
    copy: (
      <svg style={s} viewBox="0 0 24 24" {...p}>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    ),
  };
  return icons[name] || null;
}

// ---------------------------------------------------------------------------
// Mock content — mirrors the ModelGuide shape in the implementation prompt.
// Prose here stands in for Paraglide message thunks; `costs` and `capabilities`
// stand in for live ModelInfo / pricing data.
// ---------------------------------------------------------------------------
const MODEL_GUIDES = [
  {
    modelKey: 'grok-imagine-image',
    name: 'Grok Imagine',
    icon: '✦',
    tagline: 'Fast, photoreal images from a plain sentence.',
    capabilities: {
      modes: ['t2i', 'i2i'],
      maxImages: 10,
      maxPrompt: 4096,
      negativePrompt: false,
      aspectRatios: ['1:1', '16:9', '9:16'],
      ageGate: false,
    },
    costs: [
      { mode: 't2i', tokens: 5 },
      { mode: 'i2i', tokens: 5 },
    ],
    billedBySession: false,
    goodAt: [
      'Photoreal people, products and places.',
      'Getting a usable image on the first try, without tuning anything.',
      'Turning a rough idea into four variations in seconds.',
    ],
    chooseWhen: [
      'You want a picture now and do not want to think about settings.',
      'You are exploring ideas and will keep the ones you like.',
    ],
    restrictions: [
      'Text inside the image (signs, labels, logos) usually comes out garbled.',
      'No negative prompt — describe what you want, not what you do not want.',
      'Three aspect ratios only: square, landscape, portrait.',
    ],
    billingRules: [
      'Tokens are taken when you press Generate, not when the image appears.',
      'If the request is rejected before it starts, nothing is charged.',
      'Refunds appear in Billing → history as a refund entry.',
    ],
    tips: [
      'Name the subject, then the setting, then the light. "A ceramic mug on a windowsill, morning light".',
      'Add a camera word for realism: portrait, close-up, wide shot.',
      'Change one thing at a time between attempts so you can tell what helped.',
    ],
    examples: [
      {
        prompt: 'A ceramic coffee mug on a wooden windowsill, soft morning light, shallow depth of field',
        mode: 't2i',
        aspectRatio: '1:1',
      },
      {
        prompt: 'Portrait of an elderly fisherman mending a net, overcast harbour, natural light',
        mode: 't2i',
        aspectRatio: '9:16',
      },
      {
        prompt: 'Wide shot of a mountain road at dusk, low fog, headlights approaching',
        mode: 't2i',
        aspectRatio: '16:9',
      },
    ],
  },
  {
    modelKey: 'grok-2-image-1212',
    name: 'Grok 2',
    icon: '◈',
    tagline: 'Follows long, detailed descriptions closely.',
    capabilities: {
      modes: ['t2i'],
      maxImages: 4,
      maxPrompt: 4096,
      negativePrompt: false,
      aspectRatios: ['1:1', '16:9', '9:16'],
      ageGate: false,
    },
    costs: [{ mode: 't2i', tokens: 8 }],
    billedBySession: false,
    goodAt: [
      'Scenes with several elements that all need to be present.',
      'Illustration and stylised work rather than photorealism.',
    ],
    chooseWhen: [
      'Imagine keeps dropping details you asked for.',
      'You have written a long, specific description and want it honoured.',
    ],
    restrictions: [
      'Text to image only — it cannot edit an image you upload.',
      'Slower and dearer per image than Imagine.',
    ],
    billingRules: [
      'Tokens are taken when you press Generate, not when the image appears.',
      'Cost is per image, so four images cost four times one.',
    ],
    tips: [
      'Put the most important element in the first sentence.',
      'Describe placement explicitly: "on the left", "in the background".',
    ],
    examples: [
      {
        prompt:
          'A cluttered watchmaker workshop: brass tools on the left, an open pocket watch centre, a cat asleep on the right',
        mode: 't2i',
        aspectRatio: '16:9',
      },
      {
        prompt:
          'Flat vector illustration of a harbour town, three fishing boats, red roofs, single sailing gull',
        mode: 't2i',
        aspectRatio: '1:1',
      },
    ],
  },
  {
    modelKey: 'aisha-image',
    name: 'Aisha',
    icon: '◆',
    tagline: 'Full control over quality and sampling — needs a GPU session.',
    capabilities: {
      modes: ['t2i', 'i2i'],
      maxImages: 4,
      maxPrompt: 4096,
      negativePrompt: true,
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      ageGate: true,
    },
    costs: [
      { mode: 't2i', tokens: 3 },
      { mode: 'i2i', tokens: 3 },
    ],
    billedBySession: true,
    goodAt: [
      'Getting exactly the look you want by adjusting quality and sampling.',
      'Excluding things you do not want, using a negative prompt.',
      'Larger images and more aspect ratios than the Grok models.',
    ],
    chooseWhen: [
      'You already know roughly what you want and are refining it.',
      'You plan to generate a batch in one sitting.',
    ],
    restrictions: [
      'Needs a GPU session started before you can generate.',
      'Requires age verification before the first session.',
      'The session keeps costing tokens while it is running, even when idle.',
    ],
    billingRules: [
      'Starting a session takes a reservation up front.',
      'While the session runs you are charged by the minute, whether or not you generate.',
      'Each generation is charged separately when you press Generate.',
      'When you stop the session the total is settled — you are billed for any shortfall or refunded the difference.',
    ],
    tips: [
      'Start the session, generate everything you need, then stop it.',
      'Use the negative prompt for what to avoid: "blurry, extra fingers, watermark".',
      'Raise quality only after the composition is right — drafts are cheaper to iterate on.',
    ],
    examples: [
      {
        prompt: 'Studio product shot of a matte black bottle on grey seamless paper, softbox lighting',
        mode: 't2i',
        aspectRatio: '4:3',
      },
      {
        prompt: 'Oil painting of a winter orchard, bare branches, long blue shadows across snow',
        mode: 't2i',
        aspectRatio: '3:4',
      },
    ],
  },
];

const MODE_LABELS = {
  t2i: 'Text → image',
  i2i: 'Image → image',
  t2v: 'Text → video',
  i2v: 'Image → video',
};

// ---------------------------------------------------------------------------
// Variant A — ModelSummaryCard (the always-visible teaser)
// ---------------------------------------------------------------------------
function ModelSummaryCard({ c, guide, onOpen, guideOpen, triggerRef }) {
  if (!guide) return null;

  const primaryCost = guide.costs[0]?.tokens ?? null;

  const chip = {
    padding: '3px 8px',
    borderRadius: 999,
    border: `1px solid ${c.border}`,
    color: c.textMuted,
    fontSize: 11,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        background: c.surface,
        borderRadius: 14,
        padding: 12,
        fontFamily: font,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 15, color: c.accent }}>{guide.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: c.text, flex: 1 }}>{guide.name}</span>
        {primaryCost !== null && (
          <span
            style={{
              fontFamily: mono,
              fontSize: 12,
              color: c.accent,
              background: c.accentGlow,
              border: `1px solid ${c.accentDim}44`,
              borderRadius: 999,
              padding: '2px 9px',
            }}
          >
            ◈ {primaryCost}
          </span>
        )}
      </div>

      <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.5, color: c.textMuted }}>
        {guide.tagline}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {guide.capabilities.modes.map((mo) => (
          <span key={mo} style={chip}>
            {MODE_LABELS[mo]}
          </span>
        ))}
        <span style={chip}>up to {guide.capabilities.maxImages}</span>
        {guide.capabilities.negativePrompt && <span style={chip}>negative prompt</span>}
        {guide.capabilities.ageGate && (
          <span style={{ ...chip, color: c.warning, borderColor: `${c.warning}55` }}>18+</span>
        )}
      </div>

      <button
        ref={triggerRef}
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={guideOpen}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '8px 12px',
          borderRadius: 10,
          border: `1px solid ${c.accentDim}`,
          background: c.accentGlow,
          color: c.accent,
          fontSize: 13,
          fontWeight: 500,
          fontFamily: font,
          cursor: 'pointer',
        }}
      >
        <I name="info" size={15} />
        Learn more about this model
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant B — sheet building blocks
// ---------------------------------------------------------------------------
function SectionHeading({ c, icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
      <span style={{ color: c.textDim, display: 'flex' }}>
        <I name={icon} size={14} />
      </span>
      <h3
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: c.textMuted,
        }}
      >
        {children}
      </h3>
    </div>
  );
}

function BulletList({ c, items }) {
  if (!items || items.length === 0) return null;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7 }}>
      {items.map((t) => (
        <li key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: 999,
              background: c.accentDim,
              marginTop: 8,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, lineHeight: 1.55, color: c.text }}>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ c, icon, title, items, children, last }) {
  return (
    <section
      style={{
        padding: '14px 0',
        borderBottom: last ? 'none' : `1px solid ${c.border}`,
      }}
    >
      <SectionHeading c={c} icon={icon}>
        {title}
      </SectionHeading>
      {items ? <BulletList c={c} items={items} /> : children}
    </section>
  );
}

function CapabilityRows({ c, caps }) {
  const rows = [
    ['Modes', caps.modes.map((mo) => MODE_LABELS[mo]).join(', ')],
    ['Images per request', `up to ${caps.maxImages}`],
    ['Prompt length', `${caps.maxPrompt.toLocaleString()} characters`],
    ['Negative prompt', caps.negativePrompt ? 'Supported' : 'Not supported'],
    ['Aspect ratios', caps.aspectRatios.join('  ·  ')],
    ['Age verification', caps.ageGate ? 'Required before first use' : 'Not required'],
  ];
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: c.textMuted, flex: '0 0 40%' }}>{k}</span>
          <span style={{ fontSize: 12.5, color: c.text, fontFamily: mono }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function BillingBlock({ c, guide }) {
  return (
    <div>
      <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
        {guide.costs.map((row) => (
          <div key={row.mode} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: c.textMuted, flex: '0 0 40%' }}>
              {MODE_LABELS[row.mode]}
            </span>
            <span style={{ fontSize: 12.5, color: c.accent, fontFamily: mono }}>
              {row.tokens === null ? '—' : `◈ ${row.tokens} per image`}
            </span>
          </div>
        ))}
      </div>

      {guide.billedBySession && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: 10,
            borderRadius: 10,
            background: `${c.warning}12`,
            border: `1px solid ${c.warning}33`,
            marginBottom: 10,
          }}
        >
          <span style={{ color: c.warning, flexShrink: 0, marginTop: 1 }}>
            <I name="alert" size={14} />
          </span>
          <span style={{ fontSize: 12.5, lineHeight: 1.5, color: c.text }}>
            This model runs on a GPU session that is billed by the minute while it is on, separately
            from what each image costs.
          </span>
        </div>
      )}

      <BulletList c={c} items={guide.billingRules} />
    </div>
  );
}

function ExamplesBlock({ c, examples, onUsePrompt }) {
  if (!examples || examples.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 12.5, color: c.textDim, lineHeight: 1.5 }}>
        Example generations are coming soon.
      </p>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {examples.map((ex) => (
        <div
          key={ex.prompt}
          style={{
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            overflow: 'hidden',
            background: c.bg,
          }}
        >
          {/* Image slot — renders only when a static asset exists. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              height: 76,
              background: c.surfaceHover,
              color: c.textDim,
              fontSize: 11,
              borderBottom: `1px solid ${c.border}`,
            }}
          >
            <I name="image" size={14} />
            {ex.aspectRatio} · asset slot (optional)
          </div>
          <div style={{ padding: 10 }}>
            <p
              style={{
                margin: '0 0 8px',
                fontFamily: mono,
                fontSize: 11.5,
                lineHeight: 1.55,
                color: c.text,
              }}
            >
              {ex.prompt}
            </p>
            <button
              onClick={() => onUsePrompt(ex)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: 'transparent',
                color: c.textMuted,
                fontSize: 12,
                fontFamily: font,
                cursor: 'pointer',
              }}
            >
              <I name="copy" size={13} />
              Use this prompt
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant B — ModelGuideSheet
// ---------------------------------------------------------------------------
function ModelGuideSheet({ c, isMobile, guide, onClose, onUsePrompt }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!guide) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 160,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={guide.name}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 520,
          maxHeight: isMobile ? '88%' : '100%',
          display: 'flex',
          flexDirection: 'column',
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: isMobile ? '18px 18px 0 0' : 16,
          fontFamily: font,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px 10px', borderBottom: `1px solid ${c.border}` }}>
          {isMobile && (
            <div
              style={{
                width: 32,
                height: 3,
                borderRadius: 999,
                background: c.border,
                margin: '0 auto 10px',
              }}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 17, color: c.accent }}>{guide.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: c.text }}>
                {guide.name}
              </h2>
              <p style={{ margin: '1px 0 0', fontSize: 12, color: c.textMuted }}>{guide.tagline}</p>
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 30,
                height: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: c.textMuted,
                cursor: 'pointer',
              }}
            >
              <I name="close" size={17} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          <Section c={c} icon="check" title="What this model is good at" items={guide.goodAt} />
          <Section c={c} icon="chevronRight" title="When to choose it" items={guide.chooseWhen} />
          <Section c={c} icon="info" title="Capabilities">
            <CapabilityRows c={c} caps={guide.capabilities} />
          </Section>
          <Section c={c} icon="alert" title="Important restrictions" items={guide.restrictions} />
          <Section c={c} icon="coins" title="When you're charged or refunded">
            <BillingBlock c={c} guide={guide} />
          </Section>
          <Section c={c} icon="bulb" title="Prompt tips and best practices" items={guide.tips} />
          <Section c={c} icon="image" title="Real generations + prompts" last>
            <ExamplesBlock c={c} examples={guide.examples} onUsePrompt={onUsePrompt} />
          </Section>
        </div>

        {/* Sticky footer CTA */}
        <div
          style={{
            padding: 12,
            borderTop: `1px solid ${c.border}`,
            background: c.surface,
          }}
        >
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '11px 16px',
              borderRadius: 10,
              border: 'none',
              background: c.accent,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: font,
              cursor: 'pointer',
            }}
          >
            Start creating
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Host — Create-page context + review controls
// ---------------------------------------------------------------------------
export default function ApexModelGuideMockup() {
  const [theme, setTheme] = useState(_store.theme);
  const [mode, setMode] = useState(_store.mode);
  const [forceMobile, setForceMobile] = useState(true);
  const [modelKey, setModelKey] = useState(MODEL_GUIDES[0].modelKey);
  const [guideOpen, setGuideOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const triggerRef = useRef(null);

  const c = resolveColors(theme, mode);
  const isMobile = forceMobile;
  const guide = MODEL_GUIDES.find((g) => g.modelKey === modelKey) ?? null;

  useEffect(() => {
    savePrefs(theme, mode);
  }, [theme, mode]);

  function closeGuide() {
    setGuideOpen(false);
    triggerRef.current?.focus();
  }

  function usePrompt(ex) {
    setPrompt(ex.prompt);
    closeGuide();
  }

  const toggle = (active) => ({
    padding: '5px 11px',
    borderRadius: 8,
    border: `1px solid ${active ? c.accentDim : c.border}`,
    background: active ? c.accentGlow : 'transparent',
    color: active ? c.accent : c.textMuted,
    fontSize: 12,
    fontFamily: font,
    cursor: 'pointer',
  });

  const label = {
    fontSize: 11,
    color: c.textMuted,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginBottom: 8,
    display: 'block',
  };

  const createColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
      {/* Model chips — unchanged by this feature */}
      <div>
        <label style={label}>Model</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {MODEL_GUIDES.map((g) => (
            <button
              key={g.modelKey}
              onClick={() => setModelKey(g.modelKey)}
              style={{
                flex: 1,
                padding: '10px 6px',
                borderRadius: 10,
                border: `1px solid ${modelKey === g.modelKey ? c.accentDim : c.border}`,
                background: modelKey === g.modelKey ? c.accentGlow : c.surface,
                color: modelKey === g.modelKey ? c.accent : c.textMuted,
                fontSize: 12,
                fontWeight: 500,
                fontFamily: font,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 16 }}>{g.icon}</span>
              <span>{g.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Variant A lives here ── */}
      <ModelSummaryCard
        c={c}
        guide={guide}
        guideOpen={guideOpen}
        triggerRef={triggerRef}
        onOpen={() => setGuideOpen(true)}
      />

      {/* Downstream controls, abbreviated for context */}
      <div>
        <label style={label}>Type</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {guide?.capabilities.modes.map((mo, i) => (
            <span
              key={mo}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${i === 0 ? c.accentDim : c.border}`,
                background: i === 0 ? c.accentGlow : 'transparent',
                color: i === 0 ? c.accent : c.textMuted,
                fontSize: 12,
                fontFamily: font,
              }}
            >
              {MODE_LABELS[mo]}
            </span>
          ))}
        </div>
      </div>

      <div>
        <label style={label}>Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to see…"
          rows={3}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: 11,
            borderRadius: 10,
            border: `1px solid ${c.border}`,
            background: c.surface,
            color: c.text,
            fontSize: 13,
            fontFamily: font,
            resize: 'none',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );

  return (
    <div
      style={{
        fontFamily: font,
        background: c.bg,
        color: c.text,
        padding: 16,
        minHeight: 600,
        transition: 'background 0.35s ease, color 0.35s ease',
      }}
    >
      {/* Review toolbar — not part of the app */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          alignItems: 'center',
          paddingBottom: 12,
          marginBottom: 16,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <div style={{ display: 'flex', gap: 5 }}>
          <button style={toggle(theme === 'slate')} onClick={() => setTheme('slate')}>
            Slate
          </button>
          <button style={toggle(theme === 'frost')} onClick={() => setTheme('frost')}>
            Frost
          </button>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button style={toggle(mode === 'dark')} onClick={() => setMode('dark')}>
            Dark
          </button>
          <button style={toggle(mode === 'light')} onClick={() => setMode('light')}>
            Light
          </button>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button style={toggle(forceMobile)} onClick={() => setForceMobile(true)}>
            Mobile
          </button>
          <button style={toggle(!forceMobile)} onClick={() => setForceMobile(false)}>
            Desktop
          </button>
        </div>
        <span style={{ fontSize: 11.5, color: c.textDim, marginLeft: 'auto' }}>
          A = summary card · B = guide sheet
        </span>
      </div>

      {/* Device frame */}
      <div
        style={{
          position: 'relative',
          width: isMobile ? 390 : '100%',
          maxWidth: isMobile ? 390 : 860,
          height: 620,
          margin: '0 auto',
          overflow: 'hidden',
          background: c.bg,
          border: `1px solid ${c.border}`,
          borderRadius: 18,
        }}
      >
        <div style={{ height: '100%', overflowY: 'auto' }}>
          {isMobile ? (
            createColumn
          ) : (
            <div style={{ display: 'flex', gap: 20, padding: 4 }}>
              <div style={{ width: 400, flexShrink: 0 }}>{createColumn}</div>
              <div
                style={{
                  flex: 1,
                  margin: '16px 16px 16px 0',
                  border: `1px dashed ${c.border}`,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: c.textDim,
                  fontSize: 12,
                }}
              >
                Results panel
              </div>
            </div>
          )}
        </div>

        {guideOpen && (
          <ModelGuideSheet
            c={c}
            isMobile={isMobile}
            guide={guide}
            onClose={closeGuide}
            onUsePrompt={usePrompt}
          />
        )}
      </div>
    </div>
  );
}
