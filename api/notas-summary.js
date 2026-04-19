<div id="notas-dashboard"></div>

<script>
const API_URL = "https://notion-widget-api-7nsm.vercel.app/api/notas-summary";

const SUBJECT_ORDER = [
  "TECNOLOGÍA E INFRAESTRUCTURA DE CÓMPUTO",
  "ELEMENTOS ESENCIALES DE LENGUAJES DE PROGRAMACIÓN",
  "DESARROLLO DE SW EN EQUIPO",
  "CÁLCULO INTEGRAL CON ECUACIONES DIFERENCIALES",
  "COMPLEMENTARIA CÁLCULO INTEGRAL",
  "ÁLGEBRA LINEAL 1",
  "COMPLEMENTARIA ÁLGEBRA LINEAL 1",
  "FUNDAMENTOS DE BASES DE DATOS",
  "ENGLISH 8"
];

function normalizeKey(text) {
  return String(text || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SUBJECT_ORDER_MAP = new Map(
  SUBJECT_ORDER.map((name, index) => [normalizeKey(name), index])
);

function formatNumber(value, maxDecimals = 4) {
  const num = Number(value || 0);
  return num.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTone(score) {
  if (score >= 4.5) {
    return {
      emoji: "🏆",
      color: "#2563eb",
      soft: "#eff6ff",
      border: "rgba(37,99,235,.18)"
    };
  }

  if (score >= 3.8) {
    return {
      emoji: "🟢",
      color: "#16a34a",
      soft: "#f0fdf4",
      border: "rgba(22,163,74,.18)"
    };
  }

  if (score >= 3.0) {
    return {
      emoji: "🟡",
      color: "#d97706",
      soft: "#fffbeb",
      border: "rgba(217,119,6,.18)"
    };
  }

  return {
    emoji: "🔴",
    color: "#dc2626",
    soft: "#fef2f2",
    border: "rgba(220,38,38,.18)"
  };
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchNotas() {
  try {
    const response = await fetch(API_URL, { method: "GET" });
    if (!response.ok) {
      throw new Error("NO SE PUDO LEER EL ENDPOINT DE NOTAS");
    }
    return await response.json();
  } catch (error) {
    return {
      ok: false,
      error: String(error.message || error)
    };
  }
}

function renderNotas(data) {
  const root = document.getElementById("notas-dashboard");

  if (!data || !data.ok || !Array.isArray(data.materias)) {
    root.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: transparent; }
        .error-wrap {
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          padding: 14px;
        }
        .error-card {
          background: #ffffff;
          border: 1px solid rgba(220,38,38,.18);
          border-radius: 20px;
          padding: 18px;
          box-shadow: 0 12px 28px rgba(15,23,42,.08);
          text-transform: uppercase;
        }
        .error-title {
          font-size: 22px;
          font-weight: 900;
          color: #991b1b;
          margin-bottom: 8px;
        }
        .error-text {
          font-size: 15px;
          line-height: 1.5;
          color: #7f1d1d;
          font-weight: 800;
        }
      </style>
      <div class="error-wrap">
        <div class="error-card">
          <div class="error-title">NO PUDE LEER LAS NOTAS</div>
          <div class="error-text">REVISA LA API DE NOTAS EN VERCEL Y VUELVE A INTENTAR.</div>
        </div>
      </div>
    `;
    return;
  }

  const materias = data.materias
    .filter((m) => (m.total_items_registrados || 0) > 0)
    .sort((a, b) => {
      const aIndex = SUBJECT_ORDER_MAP.has(normalizeKey(a.materia))
        ? SUBJECT_ORDER_MAP.get(normalizeKey(a.materia))
        : 999;
      const bIndex = SUBJECT_ORDER_MAP.has(normalizeKey(b.materia))
        ? SUBJECT_ORDER_MAP.get(normalizeKey(b.materia))
        : 999;

      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.materia.localeCompare(b.materia);
    });

  const cards = materias.map((materia) => {
    const score = Number(materia.total_nota_final || 0);
    const progress = clamp(Number(materia.porcentaje_evaluado || 0), 0, 100);
    const promedio = Number(materia.promedio_notas || 0);
    const tone = getTone(score);

    return `
      <div class="note-card" style="--tone:${tone.color}; --soft:${tone.soft}; --border:${tone.border}; --progress:${progress}%;">
        <div class="subject-line">
          <span class="subject-emoji">${tone.emoji}</span>
          <span class="subject-name">${escapeHtml(materia.materia)}</span>
        </div>

        <div class="card-body">
          <div class="ring">
            <div class="ring-center">
              <div class="ring-number">${formatNumber(progress, 0)}%</div>
              <div class="ring-label">EVALUADO</div>
            </div>
          </div>

          <div class="stats-side">
            <div class="score-label">NOTA ACUMULADA</div>
            <div class="score-value">${formatNumber(score, 4)}</div>
            <div class="score-sub">DE 5.0</div>

            <div class="mini-stat">
              <span class="mini-stat-label">PROMEDIO</span>
              <strong>${formatNumber(promedio, 2)}</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  root.innerHTML = `
    <style>
      * { box-sizing: border-box; }

      html, body {
        margin: 0;
        padding: 0;
        background: transparent;
      }

      .wrap {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 12px;
      }

      .board, .board * {
        text-transform: uppercase;
      }

      .board {
        border-radius: 24px;
        padding: 14px;
        background: #ffffff;
        border: 1px solid rgba(148,163,184,.18);
        box-shadow: 0 14px 32px rgba(15,23,42,.08);
      }

      .hero {
        text-align: center;
        padding: 4px 4px 12px;
      }

      .hero-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 999px;
        background: #f8fafc;
        border: 1px solid rgba(148,163,184,.18);
        color: #0f172a;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .05em;
      }

      .hero-title {
        font-size: clamp(22px, 3.4vw, 34px);
        line-height: 1.08;
        font-weight: 900;
        color: #0f172a;
        margin: 12px 0 6px;
      }

      .hero-sub {
        font-size: clamp(13px, 1.5vw, 16px);
        line-height: 1.45;
        color: #475569;
        font-weight: 800;
        max-width: 760px;
        margin: 0 auto;
      }

      .notes-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
      }

      .note-card {
        background: #ffffff;
        border: 1px solid var(--border);
        border-radius: 20px;
        padding: 14px;
        box-shadow: 0 8px 18px rgba(15,23,42,.05);
      }

      .subject-line {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 12px;
      }

      .subject-emoji {
        font-size: 16px;
        line-height: 1.1;
      }

      .subject-name {
        font-size: 17px;
        line-height: 1.22;
        color: #0f172a;
        font-weight: 900;
      }

      .card-body {
        display: grid;
        grid-template-columns: 82px 1fr;
        gap: 12px;
        align-items: center;
      }

      .ring {
        width: 82px;
        height: 82px;
        border-radius: 50%;
        background: conic-gradient(var(--tone) var(--progress), #e2e8f0 0);
        display: grid;
        place-items: center;
        position: relative;
        margin: 0 auto;
      }

      .ring::before {
        content: "";
        position: absolute;
        inset: 9px;
        border-radius: 50%;
        background: #ffffff;
      }

      .ring-center {
        position: relative;
        z-index: 1;
        text-align: center;
      }

      .ring-number {
        font-size: 18px;
        line-height: 1;
        color: var(--tone);
        font-weight: 900;
      }

      .ring-label {
        margin-top: 3px;
        font-size: 9px;
        color: #64748b;
        font-weight: 900;
        letter-spacing: .08em;
      }

      .stats-side {
        min-width: 0;
      }

      .score-label {
        font-size: 10px;
        color: #64748b;
        font-weight: 900;
        letter-spacing: .08em;
        margin-bottom: 4px;
      }

      .score-value {
        font-size: clamp(23px, 2.6vw, 30px);
        line-height: 1.05;
        color: var(--tone);
        font-weight: 900;
      }

      .score-sub {
        margin-top: 2px;
        font-size: 12px;
        color: #475569;
        font-weight: 800;
      }

      .mini-stat {
        margin-top: 10px;
        background: var(--soft);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 8px 10px;
      }

      .mini-stat-label {
        display: block;
        font-size: 9px;
        color: #64748b;
        font-weight: 900;
        letter-spacing: .08em;
        margin-bottom: 3px;
      }

      .mini-stat strong {
        font-size: 16px;
        color: #0f172a;
        font-weight: 900;
      }

      @media (max-width: 760px) {
        .wrap {
          padding: 10px;
        }

        .board {
          padding: 12px;
        }

        .notes-grid {
          grid-template-columns: 1fr;
        }

        .card-body {
          grid-template-columns: 1fr;
          justify-items: center;
          text-align: center;
        }

        .subject-line {
          justify-content: center;
          text-align: center;
        }

        .stats-side {
          width: 100%;
        }
      }
    </style>

    <div class="wrap">
      <div class="board">
        <div class="hero">
          <div class="hero-pill">📚 NOTAS UNIVERSIDAD</div>
          <div class="hero-title">ASÍ VAS EN CADA MATERIA</div>
          <div class="hero-sub">
            SOLO VES LO IMPORTANTE: QUÉ TANTO LLEVAS EVALUADO, TU NOTA ACUMULADA Y TU PROMEDIO.
          </div>
        </div>

        <div class="notes-grid">
          ${cards}
        </div>
      </div>
    </div>
  `;
}

async function init() {
  const data = await fetchNotas();
  renderNotas(data);
}

init();
setInterval(init, 300000);
</script>
