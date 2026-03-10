import { useState, useEffect, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Theme system
// ---------------------------------------------------------------------------
const THEMES = {
  slate: {
    light: {
      bg: "#faf8f5", surface: "#ffffff", surfaceHover: "#f0ece6",
      border: "#e0d8cc", borderActive: "#c0b5a5",
      text: "#2a2520", textMuted: "#706558", textDim: "#a09585",
      accent: "#b45309", accentDim: "#92400e", accentGlow: "rgba(180, 83, 9, 0.1)",
      success: "#059669", warning: "#d97706", danger: "#dc2626",
    },
    dark: {
      bg: "#110f0b", surface: "#1a1710", surfaceHover: "#22201a",
      border: "#2e2a1e", borderActive: "#4a4230",
      text: "#ede8dc", textMuted: "#9a9080", textDim: "#665e4e",
      accent: "#d97706", accentDim: "#92400e", accentGlow: "rgba(217, 119, 6, 0.14)",
      success: "#34d399", warning: "#fbbf24", danger: "#f87171",
    },
  },
  frost: {
    light: {
      bg: "#f5f7fa", surface: "#ffffff", surfaceHover: "#eef1f6",
      border: "#dde2ea", borderActive: "#b0bac8",
      text: "#1a2030", textMuted: "#5a6578", textDim: "#8a95a8",
      accent: "#6366f1", accentDim: "#4f46e5", accentGlow: "rgba(99, 102, 241, 0.1)",
      success: "#059669", warning: "#d97706", danger: "#dc2626",
    },
    dark: {
      bg: "#080810", surface: "#10101e", surfaceHover: "#18182a",
      border: "#20203a", borderActive: "#30305a",
      text: "#e0e0f0", textMuted: "#6868a0", textDim: "#404070",
      accent: "#818cf8", accentDim: "#6366f1", accentGlow: "rgba(129, 140, 248, 0.12)",
      success: "#34d399", warning: "#fbbf24", danger: "#f87171",
    },
  },
};

const _store = { theme: "slate", mode: "dark" };
function savePrefs(t, m) { _store.theme = t; _store.mode = m; }
function loadPrefs() { return { ..._store }; }

function getSystemDark() {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return true; }
}
function resolveColors(theme, mode) {
  const isDark = mode === "dark" || (mode === "system" && getSystemDark());
  return THEMES[theme]?.[isDark ? "dark" : "light"] ?? THEMES.slate.dark;
}

const font = `'DM Sans', 'Outfit', system-ui, sans-serif`;
const mono = `'JetBrains Mono', 'Fira Code', monospace`;

// ---------------------------------------------------------------------------
// Responsive hook
// ---------------------------------------------------------------------------
function useBreakpoint() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return { isMobile: w < 768, isTablet: w >= 768 && w < 1024, isDesktop: w >= 1024, width: w };
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
const MODELS = [
  { id: "grok-imagine-image", name: "Imagine", types: ["t2i", "i2i"], icon: "✦" },
  { id: "grok-2-image", name: "Grok 2", types: ["t2i"], icon: "◈" },
  { id: "grok-imagine-video", name: "Video", types: ["t2v", "i2v"], icon: "▶" },
];
const RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];
const DURATIONS = [1, 3, 5, 8, 10, 15];

const GALLERY = [
  { id: 1, type: "image", prompt: "Cyberpunk cityscape at night, neon reflections on wet streets", cost: 5, time: "2m ago", ratio: "16:9", model: "grok-imagine-image" },
  { id: 2, type: "image", prompt: "Ethereal forest spirit with bioluminescent wings", cost: 5, time: "15m ago", ratio: "1:1", model: "grok-imagine-image" },
  { id: 3, type: "video", prompt: "Ocean waves crashing on volcanic rocks at sunset", cost: 25, time: "1h ago", ratio: "16:9", model: "grok-imagine-video" },
  { id: 4, type: "image", prompt: "Minimalist Japanese garden with morning mist", cost: 8, time: "2h ago", ratio: "3:4", model: "grok-2-image" },
  { id: 5, type: "image", prompt: "Abstract geometric crystal formation in void", cost: 5, time: "3h ago", ratio: "1:1", model: "grok-imagine-image" },
  { id: 6, type: "image", prompt: "Retro-futuristic space station corridor", cost: 5, time: "5h ago", ratio: "16:9", model: "grok-imagine-image" },
  { id: 7, type: "video", prompt: "Northern lights dancing over frozen lake", cost: 25, time: "6h ago", ratio: "16:9", model: "grok-imagine-video" },
  { id: 8, type: "image", prompt: "Watercolor portrait in impressionist style", cost: 8, time: "1d ago", ratio: "3:4", model: "grok-2-image" },
];

const TXN = [
  { id: 1, type: "credit", amount: 500, balance: 1247, desc: "Starter package", time: "2h ago" },
  { id: 2, type: "debit", amount: -5, balance: 747, desc: "Cyberpunk cityscape", time: "2m ago" },
  { id: 3, type: "debit", amount: -25, balance: 757, desc: "Ocean waves video", time: "1h ago" },
  { id: 4, type: "refund", amount: 5, balance: 790, desc: "Moderation refund", time: "3h ago" },
  { id: 5, type: "debit", amount: -8, balance: 785, desc: "Japanese garden", time: "2h ago" },
];

const PKGS = [
  { id: "starter", name: "Starter", tokens: 500, price: "4.99", bonus: 0 },
  { id: "creator", name: "Creator", tokens: 1200, price: "9.99", bonus: 10, popular: true },
  { id: "pro", name: "Pro", tokens: 3000, price: "19.99", bonus: 20 },
  { id: "studio", name: "Studio", tokens: 8000, price: "49.99", bonus: 30 },
];

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function I({ name, size = 18, color }) {
  const s = { width: size, height: size, display: "block" };
  const p = { fill: "none", stroke: color || "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    create: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M12 5v14M5 12h14"/></svg>,
    gallery: <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>,
    more: <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>,
    billing: <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10h8M9 14h6"/></svg>,
    profile: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    jobs: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>,
    download: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
    play: <svg style={s} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>,
    spark: <svg style={s} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2L9 12l-7 0 5.5 5L5 22l7-4.5L19 22l-2.5-5L22 12l-7 0z"/></svg>,
    upload: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
    collapse: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="15 18 9 12 15 6"/></svg>,
    expand: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="9 18 15 12 9 6"/></svg>,
    sun: <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    moon: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
    monitor: <svg style={s} viewBox="0 0 24 24" {...p}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
    x: <svg style={s} viewBox="0 0 24 24" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    chevRight: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="9 18 15 12 9 6"/></svg>,
  };
  return icons[name] || null;
}

// ---------------------------------------------------------------------------
// Bottom Tab Bar (mobile)
// ---------------------------------------------------------------------------
// TAB_ITEMS is a simple array — add entries here to extend the bar
const TAB_ITEMS = [
  { id: "create", icon: "create", label: "Create" },
  { id: "gallery", icon: "gallery", label: "Gallery" },
  { id: "more", icon: "more", label: "More" },
];

function BottomTabs({ active, onNav, c, badge }) {
  return (
    <nav style={{
      display: "flex", borderTop: `1px solid ${c.border}`,
      background: c.bg, padding: "6px 0 max(6px, env(safe-area-inset-bottom))",
      position: "relative", zIndex: 50,
    }}>
      {TAB_ITEMS.map(t => {
        const isActive = active === t.id;
        return (
          <button key={t.id} onClick={() => onNav(t.id)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            gap: 2, padding: "6px 0", border: "none", cursor: "pointer",
            background: "transparent", color: isActive ? c.accent : c.textDim,
            fontFamily: font, fontSize: 10, fontWeight: isActive ? 700 : 500,
            transition: "color 0.15s", position: "relative",
          }}>
            <span style={{ position: "relative" }}>
              <I name={t.icon} size={22} />
              {t.id === "gallery" && badge && (
                <span style={{
                  position: "absolute", top: -4, right: -8, minWidth: 16, height: 16,
                  borderRadius: 8, background: c.accent, color: "#fff",
                  fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center",
                  justifyContent: "center", padding: "0 4px", fontFamily: mono,
                }}>{badge}</span>
              )}
            </span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// "More" Sheet (mobile)
// ---------------------------------------------------------------------------
// MORE_ITEMS array — add entries here to extend the menu
const MORE_ITEMS = [
  { id: "billing", icon: "billing", label: "Billing & Tokens" },
  { id: "jobs", icon: "jobs", label: "Job History" },
  { id: "profile", icon: "profile", label: "Profile & Settings" },
];

function MoreSheet({ open, onClose, onNav, c }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      backdropFilter: "blur(4px)", zIndex: 200,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: c.surface, borderRadius: "20px 20px 0 0",
        width: "100%", maxWidth: 480,
        padding: "12px 0 max(16px, env(safe-area-inset-bottom))",
        animation: "slideUp 0.25s ease-out",
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: c.border, margin: "0 auto 16px" }} />

        {MORE_ITEMS.map(item => (
          <button key={item.id} onClick={() => { onNav(item.id); onClose(); }} style={{
            display: "flex", alignItems: "center", gap: 14,
            width: "100%", padding: "14px 24px", border: "none",
            background: "transparent", cursor: "pointer",
            color: c.text, fontFamily: font, fontSize: 15, fontWeight: 500,
            textAlign: "left",
          }}>
            <span style={{ color: c.textMuted }}><I name={item.icon} size={20} /></span>
            <span style={{ flex: 1 }}>{item.label}</span>
            <span style={{ color: c.textDim }}><I name="chevRight" size={16} /></span>
          </button>
        ))}

        <div style={{ padding: "8px 24px 0" }}>
          <button onClick={onClose} style={{
            width: "100%", padding: "12px 0", borderRadius: 12,
            border: `1px solid ${c.border}`, background: "transparent",
            color: c.textMuted, fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: font,
          }}>Cancel</button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop Sidebar Nav Item
// ---------------------------------------------------------------------------
function SideNavItem({ icon, label, active, onClick, badge, c, collapsed }) {
  return (
    <button onClick={onClick} title={collapsed ? label : undefined} style={{
      display: "flex", alignItems: "center", gap: collapsed ? 0 : 10,
      justifyContent: collapsed ? "center" : "flex-start",
      padding: collapsed ? "10px 0" : "10px 14px",
      borderRadius: 10, border: "none", cursor: "pointer", width: "100%",
      background: active ? c.accentGlow : "transparent",
      color: active ? c.accent : c.textMuted,
      fontFamily: font, fontSize: 13, fontWeight: active ? 600 : 400,
      transition: "all 0.25s", position: "relative", minHeight: 40,
    }}>
      <span style={{ flexShrink: 0 }}><I name={icon} size={18} /></span>
      {!collapsed && <span style={{ whiteSpace: "nowrap", overflow: "hidden" }}>{label}</span>}
      {!collapsed && badge && (
        <span style={{
          marginLeft: "auto", background: c.accentDim, color: "#fff",
          fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 8, fontFamily: mono,
        }}>{badge}</span>
      )}
      {collapsed && badge && (
        <span style={{ position: "absolute", top: 4, right: 6, width: 8, height: 8, borderRadius: "50%", background: c.accent }} />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Create View
// ---------------------------------------------------------------------------
function CreateView({ c, isMobile }) {
  const [model, setModel] = useState(MODELS[0]);
  const [genType, setGenType] = useState("t2i");
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("1:1");
  const [numImg, setNumImg] = useState(1);
  const [dur, setDur] = useState(5);
  const [res, setRes] = useState("720p");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const isVid = model.types.includes("t2v") || model.types.includes("i2v");
  const needsImg = genType === "i2i" || genType === "i2v";
  const cost = isVid ? 25 : (model.id === "grok-2-image" ? 8 : 5);
  const total = isVid ? cost : cost * numImg;

  useEffect(() => {
    if (!generating) return;
    const iv = setInterval(() => {
      setProgress(p => { if (p >= 100) { setGenerating(false); clearInterval(iv); return 0; } return p + (isVid ? 1.5 : 4); });
    }, 100);
    return () => clearInterval(iv);
  }, [generating]);

  const lbl = { fontSize: 11, color: c.textMuted, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8, display: "block" };
  const chipActive = (a) => ({
    padding: isMobile ? "8px 10px" : "8px 12px", borderRadius: 8, cursor: "pointer",
    border: `1px solid ${a ? c.accentDim : c.border}`,
    background: a ? c.accentGlow : "transparent",
    color: a ? c.accent : c.textMuted,
    fontSize: 12, fontWeight: 500, fontFamily: font, transition: "all 0.15s",
    flex: 1, textAlign: "center",
  });

  // --- Layout ---
  const scrollContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: isMobile ? "16px 16px 0" : 0 }}>
      {/* Model */}
      <div>
        <label style={lbl}>Model</label>
        <div style={{ display: "flex", gap: 6 }}>
          {MODELS.map(m => (
            <button key={m.id} onClick={() => { setModel(m); setGenType(m.types[0]); }} style={{
              flex: 1, padding: "10px 6px", borderRadius: 10,
              border: `1px solid ${model.id === m.id ? c.accentDim : c.border}`,
              background: model.id === m.id ? c.accentGlow : c.surface, cursor: "pointer",
              color: model.id === m.id ? c.accent : c.textMuted, fontSize: 12, fontWeight: 500,
              fontFamily: font, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              transition: "all 0.2s",
            }}>
              <span style={{ fontSize: 16 }}>{m.icon}</span><span>{m.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Type */}
      <div>
        <label style={lbl}>Type</label>
        <div style={{ display: "flex", gap: 6 }}>
          {model.types.map(t => {
            const lb = { t2i: "Text→Image", i2i: "Img→Image", t2v: "Text→Video", i2v: "Img→Video" };
            return <button key={t} onClick={() => setGenType(t)} style={chipActive(genType === t)}>{lb[t]}</button>;
          })}
        </div>
      </div>

      {/* Upload */}
      {needsImg && (
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); }}
          style={{
            border: `2px dashed ${dragOver ? c.accent : c.border}`, borderRadius: 12,
            padding: isMobile ? 20 : 24, textAlign: "center",
            background: dragOver ? c.accentGlow : "transparent", cursor: "pointer",
          }}>
          <I name="upload" size={24} />
          <p style={{ margin: "8px 0 0", fontSize: 13, color: c.textMuted }}>
            Drop image or <span style={{ color: c.accent, textDecoration: "underline" }}>browse</span>
          </p>
        </div>
      )}

      {/* Prompt */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Prompt</label>
          <span style={{ fontSize: 11, color: c.textDim, fontFamily: mono }}>{prompt.length}/4096</span>
        </div>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="Describe what you want to create..." rows={isMobile ? 3 : 4}
          style={{
            width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${c.border}`,
            background: c.surface, color: c.text, fontFamily: font, fontSize: 14,
            resize: "vertical", outline: "none", lineHeight: 1.5, boxSizing: "border-box",
          }} />
      </div>

      {/* Params */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={lbl}>Aspect Ratio</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {RATIOS.map(r => (
              <button key={r} onClick={() => setRatio(r)} style={{
                padding: "6px 8px", borderRadius: 6, fontSize: 11, fontFamily: mono, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${ratio === r ? c.accentDim : c.border}`,
                background: ratio === r ? c.accentGlow : "transparent",
                color: ratio === r ? c.accent : c.textMuted,
              }}>{r}</button>
            ))}
          </div>
        </div>
        {isVid ? (
          <div>
            <label style={lbl}>Duration</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {DURATIONS.map(d => (
                <button key={d} onClick={() => setDur(d)} style={{
                  padding: "6px 8px", borderRadius: 6, fontSize: 11, fontFamily: mono, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${dur === d ? c.accentDim : c.border}`,
                  background: dur === d ? c.accentGlow : "transparent",
                  color: dur === d ? c.accent : c.textMuted,
                }}>{d}s</button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label style={lbl}>Images</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4].map(n => (
                <button key={n} onClick={() => setNumImg(n)} style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  fontFamily: mono, cursor: "pointer",
                  border: `1px solid ${numImg === n ? c.accentDim : c.border}`,
                  background: numImg === n ? c.accentGlow : "transparent",
                  color: numImg === n ? c.accent : c.textMuted,
                }}>{n}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Result area (below params on mobile, side panel on desktop) */}
      {isMobile && (
        <div style={{
          borderRadius: 12, border: `1px solid ${c.border}`, minHeight: 200, overflow: "hidden",
          background: `radial-gradient(ellipse at center, ${c.accentDim}08, transparent 70%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 80, /* space for sticky bar */
        }}>
          {generating ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", border: `3px solid ${c.border}`, borderTopColor: c.accent, animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
              <p style={{ color: c.textMuted, fontSize: 13 }}>{isVid ? "Generating video" : "Generating image"}...</p>
              <p style={{ color: c.textDim, fontSize: 12, fontFamily: mono }}>{Math.min(100, Math.round(progress))}%</p>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.25 }}>✦</div>
              <p style={{ color: c.textMuted, fontSize: 13 }}>Results appear here</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Sticky generate bar (mobile)
  const stickyBar = isMobile ? (
    <div style={{
      position: "sticky", bottom: 0, left: 0, right: 0,
      padding: "12px 16px", background: c.bg,
      borderTop: `1px solid ${c.border}`,
      zIndex: 40,
    }}>
      <button onClick={() => { if (prompt.trim()) { setGenerating(true); setProgress(0); }}}
        disabled={!prompt.trim() || generating} style={{
          width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
          cursor: prompt.trim() && !generating ? "pointer" : "not-allowed",
          background: generating
            ? `linear-gradient(90deg, ${c.accentDim} ${progress}%, ${c.surface} ${progress}%)`
            : prompt.trim() ? `linear-gradient(135deg, ${c.accentDim}, ${c.accent})` : c.surface,
          color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: font,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          opacity: !prompt.trim() && !generating ? 0.4 : 1,
          boxShadow: prompt.trim() && !generating ? `0 -2px 20px ${c.accentDim}44` : "none",
          transition: "all 0.3s",
        }}>
        {generating ? (
          <><span style={{ fontFamily: mono }}>{Math.min(100, Math.round(progress))}%</span> Generating...</>
        ) : (
          <><I name="spark" size={18} /> Generate <span style={{ fontFamily: mono, opacity: 0.7, fontSize: 13, marginLeft: 4 }}>◈ {total}</span></>
        )}
      </button>
    </div>
  ) : null;

  // Desktop: side-by-side layout
  if (!isMobile) {
    return (
      <div style={{ display: "flex", gap: 24, height: "100%" }}>
        <div style={{ flex: "0 0 400px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", paddingBottom: 20 }}>
          {scrollContent.props.children}
          {/* Desktop generate button inline */}
          <button onClick={() => { if (prompt.trim()) { setGenerating(true); setProgress(0); }}}
            disabled={!prompt.trim() || generating} style={{
              width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
              cursor: prompt.trim() && !generating ? "pointer" : "not-allowed",
              background: generating
                ? `linear-gradient(90deg, ${c.accentDim} ${progress}%, ${c.surface} ${progress}%)`
                : prompt.trim() ? `linear-gradient(135deg, ${c.accentDim}, ${c.accent})` : c.surface,
              color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: font,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              opacity: !prompt.trim() && !generating ? 0.4 : 1,
              boxShadow: prompt.trim() && !generating ? `0 4px 20px ${c.accentDim}66` : "none",
              transition: "all 0.3s",
            }}>
            {generating ? (
              <><span style={{ fontFamily: mono, fontSize: 13 }}>{Math.min(100, Math.round(progress))}%</span> Generating...</>
            ) : (
              <><I name="spark" size={16} /> Generate <span style={{ opacity: 0.7, fontFamily: mono, fontSize: 12, marginLeft: 4 }}>◈ {total}</span></>
            )}
          </button>
        </div>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          background: `radial-gradient(ellipse at center, ${c.accentDim}08, transparent 70%)`,
          borderRadius: 16, border: `1px solid ${c.border}`, minHeight: 400, overflow: "hidden",
        }}>
          {generating ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", border: `3px solid ${c.border}`, borderTopColor: c.accent, animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
              <p style={{ color: c.textMuted, fontSize: 14 }}>Creating {isVid ? "video" : "image"}...</p>
              <p style={{ color: c.textDim, fontSize: 12, fontFamily: mono, marginTop: 4 }}>{Math.min(100, Math.round(progress))}%</p>
            </div>
          ) : (
            <div style={{ textAlign: "center", maxWidth: 280, padding: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>✦</div>
              <p style={{ color: c.textMuted, fontSize: 14, lineHeight: 1.6 }}>Your generated content will appear here</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Mobile: single column scroll + sticky bar
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto" }}>{scrollContent}</div>
      {stickyBar}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gallery View
// ---------------------------------------------------------------------------
function GalleryView({ c, isMobile }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const filtered = GALLERY.filter(i => filter === "all" || i.type === filter);
  const grad = (id) => { const h = (id * 67) % 360; return `linear-gradient(135deg, hsl(${h},30%,12%), hsl(${(h+40)%360},35%,18%), hsl(${(h+80)%360},25%,10%))`; };

  const cols = isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(200px, 1fr))";

  return (
    <div style={{ padding: isMobile ? 12 : 0 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
        {["all", "image", "video"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "6px 14px", borderRadius: 20, whiteSpace: "nowrap",
            border: `1px solid ${filter === f ? c.accentDim : c.border}`,
            background: filter === f ? c.accentGlow : "transparent",
            color: filter === f ? c.accent : c.textMuted,
            fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font,
          }}>{f === "all" ? "All" : f === "image" ? "Images" : "Videos"}</button>
        ))}
        <span style={{ marginLeft: "auto", color: c.textDim, fontSize: 11, alignSelf: "center", whiteSpace: "nowrap" }}>{filtered.length} items</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: cols, gap: isMobile ? 8 : 12 }}>
        {filtered.map(item => (
          <div key={item.id} onClick={() => setSelected(item)} style={{
            borderRadius: isMobile ? 10 : 12, overflow: "hidden", cursor: "pointer",
            border: `1px solid ${c.border}`, background: c.surface, transition: "all 0.2s",
          }}>
            <div style={{
              aspectRatio: item.ratio.replace(":", "/"), background: grad(item.id),
              display: "flex", alignItems: "center", justifyContent: "center",
              maxHeight: isMobile ? 160 : 220, position: "relative",
            }}>
              {item.type === "video" && (
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <I name="play" size={12} />
                </div>
              )}
              <span style={{ position: "absolute", top: 6, right: 6, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.6)", fontSize: 9, fontFamily: mono, color: "#aaa" }}>
                {item.type === "video" ? "MP4" : "IMG"}
              </span>
            </div>
            <div style={{ padding: isMobile ? "8px 10px" : "10px 12px" }}>
              <p style={{ fontSize: 11, color: c.text, lineHeight: 1.4, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.prompt}</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 9, color: c.textDim }}>{item.time}</span>
                <span style={{ fontSize: 9, color: c.textDim, fontFamily: mono }}>◈{item.cost}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {selected && (
        <div onClick={() => setSelected(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 300, padding: isMobile ? 16 : 40, cursor: "pointer",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: c.surface, borderRadius: 16, border: `1px solid ${c.border}`,
            maxWidth: 540, width: "100%", cursor: "default", overflow: "hidden",
          }}>
            <div style={{ aspectRatio: "16/9", background: grad(selected.id), display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              {selected.type === "video" && <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><I name="play" size={20} /></div>}
              <button onClick={() => setSelected(null)} style={{ position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: 8, background: "rgba(0,0,0,0.5)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                <I name="x" size={16} />
              </button>
            </div>
            <div style={{ padding: isMobile ? 16 : 20 }}>
              <p style={{ fontSize: 14, color: c.text, lineHeight: 1.6, margin: "0 0 12px" }}>{selected.prompt}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <span style={{ padding: "3px 8px", borderRadius: 6, background: c.accentGlow, color: c.accent, fontSize: 10, fontFamily: mono }}>{selected.model}</span>
                <span style={{ padding: "3px 8px", borderRadius: 6, background: c.border, color: c.textMuted, fontSize: 10 }}>{selected.ratio}</span>
                <span style={{ padding: "3px 8px", borderRadius: 6, background: c.border, color: c.textMuted, fontSize: 10, fontFamily: mono }}>◈{selected.cost}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.text, fontSize: 13, cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <I name="download" size={14} /> Download
                </button>
                <button style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${c.accentDim}, ${c.accent})`, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                  Re-generate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing View
// ---------------------------------------------------------------------------
function BillingView({ c, isMobile }) {
  const [tab, setTab] = useState("overview");
  return (
    <div style={{ padding: isMobile ? 16 : 0 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${c.border}`, paddingBottom: 1, overflowX: "auto" }}>
        {[["overview", "Overview"], ["buy", "Buy Tokens"], ["history", "History"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "8px 16px", border: "none", cursor: "pointer", whiteSpace: "nowrap",
            borderBottom: `2px solid ${tab === k ? c.accent : "transparent"}`,
            background: "transparent", color: tab === k ? c.accent : c.textMuted,
            fontSize: 13, fontWeight: tab === k ? 600 : 400, fontFamily: font, marginBottom: -1,
          }}>{l}</button>
        ))}
      </div>
      {tab === "overview" && (
        <div>
          <div style={{ background: `linear-gradient(135deg, ${c.accentDim}18, ${c.surface})`, border: `1px solid ${c.accentDim}33`, borderRadius: 16, padding: isMobile ? 20 : 28, marginBottom: 20 }}>
            <p style={{ fontSize: 11, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Token Balance</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: isMobile ? 32 : 42, fontWeight: 800, color: c.text, fontFamily: mono }}>1,247</span>
              <span style={{ fontSize: 13, color: c.textMuted }}>tokens</span>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
              <div><p style={{ fontSize: 10, color: c.textDim, margin: "0 0 2px" }}>Account</p><p style={{ fontSize: 12, color: c.text, margin: 0, fontWeight: 600 }}>Personal</p></div>
              <div><p style={{ fontSize: 10, color: c.textDim, margin: "0 0 2px" }}>This Month</p><p style={{ fontSize: 12, color: c.danger, margin: 0, fontWeight: 600, fontFamily: mono }}>-253</p></div>
              <div><p style={{ fontSize: 10, color: c.textDim, margin: "0 0 2px" }}>Generations</p><p style={{ fontSize: 12, color: c.text, margin: 0, fontWeight: 600, fontFamily: mono }}>47</p></div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: c.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Cost per Generation</p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 8 }}>
            {[{ l: "Imagine", s: "Image", cost: 5, i: "✦" }, { l: "Grok 2", s: "Image", cost: 8, i: "◈" }, { l: "Video", s: "Video", cost: 25, i: "▶" }].map((x, i) => (
              <div key={i} style={{ padding: isMobile ? 12 : 16, borderRadius: 10, border: `1px solid ${c.border}`, background: c.surface }}>
                <span style={{ fontSize: 18 }}>{x.i}</span>
                <p style={{ fontSize: 11, color: c.text, fontWeight: 600, margin: "6px 0 2px" }}>{x.l}</p>
                <p style={{ fontSize: 16, color: c.accent, fontWeight: 800, margin: 0, fontFamily: mono }}>◈{x.cost}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "buy" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            {PKGS.map(p => (
              <div key={p.id} style={{
                padding: 16, borderRadius: 12, position: "relative", cursor: "pointer",
                border: `1px solid ${p.popular ? c.accentDim : c.border}`,
                background: p.popular ? `linear-gradient(135deg, ${c.accentDim}14, ${c.surface})` : c.surface,
              }}>
                {p.popular && <span style={{ position: "absolute", top: -8, right: 12, padding: "2px 8px", borderRadius: 6, background: `linear-gradient(135deg, ${c.accentDim}, ${c.accent})`, color: "#fff", fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>Popular</span>}
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: c.text, margin: 0 }}>{p.name}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: c.text, margin: 0, fontFamily: mono }}>${p.price}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: c.accent, fontWeight: 600, fontFamily: mono }}>◈{p.tokens.toLocaleString()}</span>
                  {p.bonus > 0 && <span style={{ padding: "1px 6px", borderRadius: 4, background: `${c.success}22`, color: c.success, fontSize: 10, fontWeight: 600 }}>+{p.bonus}%</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer", background: "#635bff", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: font }}>Stripe</button>
            <button style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${c.border}`, cursor: "pointer", background: "transparent", color: c.text, fontSize: 13, fontWeight: 600, fontFamily: font }}>Crypto</button>
          </div>
        </div>
      )}
      {tab === "history" && (
        <div>{TXN.map(t => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${c.border}` }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0,
              background: t.type === "credit" ? `${c.success}18` : t.type === "refund" ? `${c.warning}18` : `${c.danger}18`,
              color: t.type === "credit" ? c.success : t.type === "refund" ? c.warning : c.danger,
            }}>{t.type === "credit" ? "+" : t.type === "refund" ? "↩" : "−"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, color: c.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.desc}</p>
              <p style={{ fontSize: 10, color: c.textDim, margin: "1px 0 0" }}>{t.time}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0, fontFamily: mono, color: t.amount > 0 ? c.success : c.text }}>{t.amount > 0 ? "+" : ""}{t.amount}</p>
            </div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile View with theme controls
// ---------------------------------------------------------------------------
function ProfileView({ c, isMobile, theme, mode, onTheme, onMode }) {
  const themeOpts = [
    { id: "slate", label: "Slate", desc: "Warm earth, amber", swL: THEMES.slate.light, swD: THEMES.slate.dark },
    { id: "frost", label: "Frost", desc: "Cool blue, indigo", swL: THEMES.frost.light, swD: THEMES.frost.dark },
  ];
  const modeOpts = [
    { id: "light", label: "Light", icon: "sun" },
    { id: "dark", label: "Dark", icon: "moon" },
    { id: "system", label: "System", icon: "monitor" },
  ];

  return (
    <div style={{ maxWidth: 520, padding: isMobile ? 16 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: `linear-gradient(135deg, ${c.accentDim}, ${c.accent})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#fff", flexShrink: 0 }}>M</div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: c.text, margin: 0 }}>Miša</p>
          <p style={{ fontSize: 12, color: c.textMuted, margin: "2px 0 0" }}>misa@example.com</p>
        </div>
      </div>

      {[{ l: "Display Name", v: "Miša" }, { l: "Account Type", v: "Personal" }, { l: "Member Since", v: "Jan 2026" }].map((f, i) => (
        <div key={i} style={{ padding: "12px 0", borderBottom: `1px solid ${c.border}` }}>
          <p style={{ fontSize: 10, color: c.textDim, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 3px" }}>{f.l}</p>
          <p style={{ fontSize: 14, color: c.text, margin: 0 }}>{f.v}</p>
        </div>
      ))}

      {/* Appearance */}
      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 11, color: c.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px" }}>Appearance</p>
        <p style={{ fontSize: 12, color: c.textDim, margin: "0 0 8px", fontWeight: 600 }}>Theme</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {themeOpts.map(t => {
            const a = theme === t.id;
            return (
              <button key={t.id} onClick={() => onTheme(t.id)} style={{
                flex: 1, padding: 12, borderRadius: 10, cursor: "pointer", textAlign: "left",
                border: `2px solid ${a ? c.accent : c.border}`,
                background: a ? c.accentGlow : c.surface, transition: "all 0.2s",
              }}>
                <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                  {[t.swL.bg, t.swL.accent, t.swD.bg, t.swD.accent].map((col, i) => (
                    <div key={i} style={{ width: 16, height: 16, borderRadius: 5, background: col, border: `1px solid ${c.border}` }} />
                  ))}
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: a ? c.accent : c.text, margin: "0 0 1px", fontFamily: font }}>{t.label}</p>
                <p style={{ fontSize: 10, color: c.textDim, margin: 0 }}>{t.desc}</p>
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: c.textDim, margin: "0 0 8px", fontWeight: 600 }}>Mode</p>
        <div style={{ display: "inline-flex", borderRadius: 10, border: `1px solid ${c.border}`, overflow: "hidden", background: c.surface }}>
          {modeOpts.map((m, i) => {
            const a = mode === m.id;
            return (
              <button key={m.id} onClick={() => onMode(m.id)} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "8px 14px", border: "none", cursor: "pointer",
                background: a ? c.accentGlow : "transparent",
                color: a ? c.accent : c.textMuted,
                fontSize: 12, fontWeight: a ? 700 : 400, fontFamily: font,
                borderRight: i < 2 ? `1px solid ${c.border}` : "none",
                transition: "all 0.2s",
              }}>
                <I name={m.icon} size={14} />{m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
        <button style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.text, fontSize: 13, cursor: "pointer", fontFamily: font, textAlign: "left" }}>Change Password</button>
        <button style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.text, fontSize: 13, cursor: "pointer", fontFamily: font, textAlign: "left" }}>Logout All Devices</button>
        <button style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${c.danger}33`, background: "transparent", color: c.danger, fontSize: 13, cursor: "pointer", fontFamily: font, textAlign: "left" }}>Delete Account</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jobs stub (accessible from More menu)
// ---------------------------------------------------------------------------
function JobsView({ c, isMobile }) {
  return (
    <div style={{ padding: isMobile ? 16 : 0, textAlign: "center", paddingTop: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.25 }}><I name="jobs" size={48} /></div>
      <p style={{ color: c.textMuted, fontSize: 14 }}>Job History</p>
      <p style={{ color: c.textDim, fontSize: 12 }}>Running and completed generation jobs appear here</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function ApexPWA() {
  const [theme, setTheme] = useState(() => loadPrefs().theme);
  const [mode, setMode] = useState(() => loadPrefs().mode);
  const [view, setView] = useState("create");
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [, bump] = useState(0);
  const { isMobile, isDesktop } = useBreakpoint();

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => bump(n => n + 1);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const handleTheme = useCallback(t => { setTheme(t); savePrefs(t, mode); }, [mode]);
  const handleMode = useCallback(m => { setMode(m); savePrefs(theme, m); }, [theme]);

  const c = resolveColors(theme, mode);
  const activeTab = ["create", "gallery"].includes(view) ? view : "more";

  const handleNav = (id) => {
    if (id === "more") { setMoreOpen(true); return; }
    setView(id);
  };

  const views = {
    create: <CreateView c={c} isMobile={isMobile} />,
    gallery: <GalleryView c={c} isMobile={isMobile} />,
    billing: <BillingView c={c} isMobile={isMobile} />,
    profile: <ProfileView c={c} isMobile={isMobile} theme={theme} mode={mode} onTheme={handleTheme} onMode={handleMode} />,
    jobs: <JobsView c={c} isMobile={isMobile} />,
  };

  const titles = { create: "Create", gallery: "Gallery", billing: "Billing", profile: "Profile", jobs: "Jobs" };
  const sideW = collapsed ? 60 : 220;

  // ─── MOBILE LAYOUT ───
  if (isMobile) {
    return (
      <div style={{ fontFamily: font, background: c.bg, color: c.text, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", transition: "background 0.35s" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

        {/* Top bar */}
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", borderBottom: `1px solid ${c.border}`, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 900, background: `linear-gradient(135deg, ${c.accent}, ${c.accentDim})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>apex</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{titles[view]}</span>
          </div>
          <div onClick={() => setView("billing")} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
            background: `${c.accentDim}18`, border: `1px solid ${c.accentDim}33`,
            borderRadius: 16, fontSize: 12, fontWeight: 600, color: c.accent, fontFamily: mono,
            cursor: "pointer",
          }}>
            <span style={{ fontSize: 9 }}>◈</span>1,247
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, overflow: view === "create" ? "hidden" : "auto" }}>
          {views[view]}
        </div>

        {/* Bottom tabs */}
        <BottomTabs active={activeTab} onNav={handleNav} c={c} badge="8" />

        {/* More sheet */}
        <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onNav={setView} c={c} />
      </div>
    );
  }

  // ─── DESKTOP LAYOUT ───
  return (
    <div style={{ fontFamily: font, background: c.bg, color: c.text, height: "100vh", display: "flex", overflow: "hidden", transition: "background 0.35s" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <aside style={{
        width: sideW, borderRight: `1px solid ${c.border}`, display: "flex", flexDirection: "column",
        padding: collapsed ? "16px 6px" : "16px 12px", background: c.bg, flexShrink: 0,
        transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)", overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start",
          gap: 10, padding: collapsed ? "4px 0" : "4px 14px", marginBottom: 24, minHeight: 32,
        }}>
          {collapsed ? (
            <span style={{ fontSize: 20, fontWeight: 900, background: `linear-gradient(135deg, ${c.accent}, ${c.accentDim})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>A</span>
          ) : (<>
            <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", background: `linear-gradient(135deg, ${c.accent}, ${c.accentDim})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>apex</span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: c.accentGlow, color: c.accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>PWA</span>
          </>)}
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          <SideNavItem icon="create" label="Create" active={view === "create"} onClick={() => setView("create")} c={c} collapsed={collapsed} />
          <SideNavItem icon="gallery" label="Gallery" active={view === "gallery"} onClick={() => setView("gallery")} badge="8" c={c} collapsed={collapsed} />
          <SideNavItem icon="jobs" label="Jobs" active={view === "jobs"} onClick={() => setView("jobs")} c={c} collapsed={collapsed} />
          <SideNavItem icon="billing" label="Billing" active={view === "billing"} onClick={() => setView("billing")} c={c} collapsed={collapsed} />
        </nav>
        <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 2 }}>
          <SideNavItem icon="profile" label="Profile" active={view === "profile"} onClick={() => setView("profile")} c={c} collapsed={collapsed} />
          <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand" : "Collapse"} style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
            background: "transparent", color: c.textDim, marginTop: 4,
          }}>
            <I name={collapsed ? "expand" : "collapse"} size={16} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 24px", borderBottom: `1px solid ${c.border}`, flexShrink: 0,
        }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{titles[view]}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div onClick={() => setView("billing")} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
              background: `${c.accentDim}18`, border: `1px solid ${c.accentDim}33`,
              borderRadius: 20, fontSize: 13, fontWeight: 600, color: c.accent, fontFamily: mono,
              cursor: "pointer",
            }}>
              <span style={{ fontSize: 10 }}>◈</span>1,247
            </div>
            <div onClick={() => setView("profile")} style={{
              width: 32, height: 32, borderRadius: 8,
              background: `linear-gradient(135deg, ${c.accentDim}, ${c.accent})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer",
            }}>M</div>
          </div>
        </header>
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {views[view]}
        </div>
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
