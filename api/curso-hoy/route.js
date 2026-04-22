export const dynamic = "force-dynamic";
export const revalidate = 0;

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_SOURCE_ID = process.env.NOTION_SOURCE_ID;
const NOTION_VERSION = process.env.NOTION_VERSION || "2022-06-28";

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const CACHE_KEY = "curso_hoy:last_good:v1";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0, must-revalidate",
};

globalThis.__cursoHoyMemoryCache ??= null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function todayISO(timeZone = process.env.TZ_NAME || "America/Mexico_City") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;

  return `${y}-${m}-${d}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeForCompare(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function uniqueSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function readRichText(prop) {
  if (!prop) return "";
  if (prop.type === "title") {
    return (prop.title || []).map(x => x.plain_text || "").join("").trim();
  }
  if (prop.type === "rich_text") {
    return (prop.rich_text || []).map(x => x.plain_text || "").join("").trim();
  }
  if (prop.type === "select") {
    return prop.select?.name || "";
  }
  if (prop.type === "multi_select") {
    return (prop.multi_select || []).map(x => x.name).join(", ");
  }
  if (prop.type === "status") {
    return prop.status?.name || "";
  }
  if (prop.type === "number") {
    return prop.number == null ? "" : String(prop.number);
  }
  if (prop.type === "formula") {
    const t = prop.formula?.type;
    if (t === "string") return prop.formula.string || "";
    if (t === "number") return prop.formula.number == null ? "" : String(prop.formula.number);
    if (t === "boolean") return String(!!prop.formula.boolean);
    if (t === "date") return prop.formula.date?.start || "";
  }
  return "";
}

function readDate(prop) {
  if (!prop) return "";
  if (prop.type === "date") return prop.date?.start || "";
  if (prop.type === "formula" && prop.formula?.type === "date") {
    return prop.formula.date?.start || "";
  }
  return "";
}

function pickProp(props, candidates) {
  for (const key of Object.keys(props || {})) {
    const norm = normalizeForCompare(key);
    if (candidates.some(c => normalizeForCompare(c) === norm)) {
      return props[key];
    }
  }
  return null;
}

function extractRow(page) {
  const props = page?.properties || {};

  const materia = readRichText(
    pickProp(props, [
      "Materia",
      "Asignatura",
      "Curso",
      "Clase",
      "Nombre materia",
    ])
  );

  const tema = readRichText(
    pickProp(props, [
      "Tema",
      "Contenido",
      "Actividad",
      "Título",
      "Titulo",
      "Nombre",
    ])
  );

  const unidad = readRichText(
    pickProp(props, [
      "Unidad",
      "Parcial",
      "Bloque",
      "Módulo",
      "Modulo",
      "Corte",
    ])
  );

  const anexo = readRichText(
    pickProp(props, [
      "Anexo",
      "Detalle",
      "Descripción",
      "Descripcion",
      "Notas",
      "Referencia",
      "Libro",
    ])
  );

  const fechaRaw = readDate(
    pickProp(props, [
      "Fecha",
      "Fecha clase",
      "Fecha de estudio",
      "Día",
      "Dia",
    ])
  );

  const fechaIso = normalizeText(fechaRaw).slice(0, 10);

  return {
    materia: normalizeText(materia),
    tema: normalizeText(tema),
    unidad: normalizeText(unidad),
    anexo: normalizeText(anexo),
    fecha_iso: fechaIso,
  };
}

async function notionFetch(path, body) {
  const res = await fetch(`https://api.notion.com${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Authorization": `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.message || "Error consultando Notion");
    err.status = res.status;
    err.code = data?.code || "notion_error";
    err.detail = data;
    throw err;
  }

  return data;
}

async function queryNotionAllPages() {
  if (!NOTION_TOKEN || !NOTION_SOURCE_ID) {
    throw new Error("Faltan NOTION_TOKEN o NOTION_SOURCE_ID");
  }

  const bodyBase = {
    page_size: 100,
  };

  let all = [];
  let usedPath = null;

  async function runPaged(path) {
    let results = [];
    let cursor = null;

    do {
      const payload = {
        ...bodyBase,
        ...(cursor ? { start_cursor: cursor } : {}),
      };

      const data = await notionFetch(path, payload);
      results.push(...(data.results || []));
      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);

    return results;
  }

  try {
    usedPath = `/v1/data_sources/${NOTION_SOURCE_ID}/query`;
    all = await runPaged(usedPath);
  } catch (e1) {
    usedPath = `/v1/databases/${NOTION_SOURCE_ID}/query`;
    all = await runPaged(usedPath);
  }

  return { results: all, usedPath };
}

function buildCursoHoyFromPages(pages) {
  const hoy = todayISO();

  const allRows = pages.map(extractRow).filter(r => r.materia);
  const todasLasMaterias = uniqueSorted(allRows.map(r => r.materia));

  if (!todasLasMaterias.length) {
    throw new Error("No se encontraron materias válidas en Notion");
  }

  const materiasMap = new Map(
    todasLasMaterias.map(m => [
      m,
      {
        materia: m,
        total: 0,
        items: [],
        estado: "al_dia",
      },
    ])
  );

  for (const row of allRows) {
    if (row.fecha_iso !== hoy) continue;
    if (!row.tema) continue;

    const item = {
      fecha_iso: row.fecha_iso,
      fecha_key: row.fecha_iso,
      unidad: row.unidad || "",
      tema: row.tema,
      anexo: row.anexo || "",
    };

    const bucket = materiasMap.get(row.materia);
    bucket.items.push(item);
  }

  const materias = [...materiasMap.values()].map(m => {
    const total = m.items.length;
    return {
      ...m,
      total,
      estado: total === 0 ? "al_dia" : "con_temas",
    };
  });

  return {
    ok: true,
    day: "HOY",
    mode: "TEMAS DE HOY",
    fecha_hoy: hoy,
    total_materias_hoy: materias.filter(m => m.total > 0).length,
    materias,
  };
}

function validateStableResponse(data) {
  if (!data || data.ok !== true) {
    throw new Error("La respuesta no viene ok=true");
  }

  if (!Array.isArray(data.materias) || data.materias.length === 0) {
    throw new Error("La respuesta no trae materias válidas");
  }

  for (const m of data.materias) {
    if (!normalizeText(m.materia)) {
      throw new Error("Una materia viene sin nombre");
    }

    if (!Number.isInteger(m.total) || m.total < 0) {
      throw new Error(`La materia ${m.materia} tiene total inválido`);
    }

    if (!Array.isArray(m.items)) {
      throw new Error(`La materia ${m.materia} no trae items array`);
    }

    if (m.estado === "con_temas") {
      if (m.total <= 0) {
        throw new Error(`La materia ${m.materia} dice con_temas pero total <= 0`);
      }
      if (m.items.length !== m.total) {
        throw new Error(`La materia ${m.materia} tiene total distinto a items.length`);
      }
    }

    if (m.estado === "al_dia") {
      if (m.total !== 0 || m.items.length !== 0) {
        throw new Error(`La materia ${m.materia} dice al_dia pero trae datos`);
      }
    }
  }

  return true;
}

async function kvCommand(args) {
  if (!KV_URL || !KV_TOKEN) return null;

  const res = await fetch(KV_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("No se pudo leer/escribir en KV");
  }

  const data = await res.json();
  return data?.result ?? null;
}

async function readLastGood() {
  if (KV_URL && KV_TOKEN) {
    const raw = await kvCommand(["GET", CACHE_KEY]);
    return raw ? JSON.parse(raw) : null;
  }

  return globalThis.__cursoHoyMemoryCache;
}

async function writeLastGood(value) {
  if (KV_URL && KV_TOKEN) {
    await kvCommand(["SET", CACHE_KEY, JSON.stringify(value)]);
    return;
  }

  globalThis.__cursoHoyMemoryCache = value;
}

export async function GET() {
  let lastGood = null;

  try {
    lastGood = await readLastGood();

    const { results, usedPath } = await queryNotionAllPages();
    const fresh = buildCursoHoyFromPages(results);

    validateStableResponse(fresh);

    const stable = {
      ...fresh,
      stale: false,
      generated_at: new Date().toISOString(),
      source: usedPath,
    };

    await writeLastGood(stable);

    return json(stable, 200);
  } catch (err) {
    if (lastGood) {
      return json(
        {
          ...lastGood,
          stale: true,
          fallback_reason: err?.message || "Error desconocido",
        },
        200
      );
    }

    return json(
      {
        ok: false,
        error: "NO HAY UNA VERSION VALIDA DISPONIBLE",
        detail: err?.message || "Error desconocido",
      },
      503
    );
  }
}
