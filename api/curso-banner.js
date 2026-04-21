function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

export async function GET() {
  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const NOTION_SOURCE_OR_DATABASE_ID =
    process.env.NOTION_CONTENIDOS_ID || process.env.NOTION_DATABASE_ID;

  if (!NOTION_API_KEY || !NOTION_SOURCE_OR_DATABASE_ID) {
    return json(
      {
        ok: false,
        error: "FALTAN VARIABLES DE ENTORNO EN VERCEL"
      },
      500
    );
  }

  const headers = {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    "Notion-Version": "2026-03-11",
    "Content-Type": "application/json"
  };

  const relationTitleCache = new Map();

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeUpper(value) {
    return normalizeText(value).toUpperCase();
  }

  function removeAccents(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeLoose(value) {
    return removeAccents(normalizeText(value)).toLowerCase();
  }

  function getTitleFromProperties(properties) {
    if (!properties) return "";
    const titleProp = Object.values(properties).find(
      (prop) => prop && prop.type === "title"
    );
    if (!titleProp || !Array.isArray(titleProp.title)) return "";
    return titleProp.title.map((t) => t.plain_text || "").join("").trim();
  }

  function findProperty(properties, candidateNames) {
    if (!properties) return null;

    const normalizedCandidates = candidateNames.map((name) => normalizeLoose(name));

    for (const [key, value] of Object.entries(properties)) {
      if (normalizedCandidates.includes(normalizeLoose(key))) {
        return value;
      }
    }

    return null;
  }

  function getTextFromProperty(prop) {
    if (!prop) return "";

    if (Array.isArray(prop.rich_text)) {
      return prop.rich_text.map((t) => t.plain_text || "").join("").trim();
    }

    if (Array.isArray(prop.title)) {
      return prop.title.map((t) => t.plain_text || "").join("").trim();
    }

    if (prop.select?.name) return prop.select.name;
    if (prop.status?.name) return prop.status.name;

    if (typeof prop.number === "number") return String(prop.number);

    if (prop.formula) {
      if (typeof prop.formula.string === "string") return prop.formula.string;
      if (typeof prop.formula.number === "number") return String(prop.formula.number);
    }

    return "";
  }

  function getTextByNames(properties, names) {
    return normalizeText(getTextFromProperty(findProperty(properties, names)));
  }

  function getDateByNames(properties, names) {
    const prop = findProperty(properties, names);
    if (!prop || !prop.date || !prop.date.start) return "";
    return String(prop.date.start).slice(0, 10);
  }

  function getNumberByNames(properties, names) {
    const prop = findProperty(properties, names);
    if (!prop) return 0;

    if (typeof prop.number === "number") return prop.number;

    if (prop.formula && typeof prop.formula.number === "number") {
      return prop.formula.number;
    }

    if (Array.isArray(prop.rich_text)) {
      const raw = prop.rich_text.map((t) => t.plain_text || "").join("").trim();
      const parsed = Number(raw.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  function getRelationIdsByNames(properties, names) {
    const prop = findProperty(properties, names);
    const rel = prop?.relation;
    if (!Array.isArray(rel)) return [];
    return rel.map((item) => item.id);
  }

  async function getPageTitle(pageId) {
    if (relationTitleCache.has(pageId)) {
      return relationTitleCache.get(pageId);
    }

    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "GET",
      headers
    });

    if (!response.ok) {
      relationTitleCache.set(pageId, "");
      return "";
    }

    const page = await response.json();
    const title = getTitleFromProperties(page.properties);
    relationTitleCache.set(pageId, title);
    return title;
  }

  function parseSpanishDateText(text) {
    const raw = normalizeLoose(text);
    if (!raw) return null;

    const months = {
      ene: 0,
      enero: 0,
      feb: 1,
      febrero: 1,
      mar: 2,
      marzo: 2,
      abr: 3,
      abril: 3,
      may: 4,
      mayo: 4,
      jun: 5,
      junio: 5,
      jul: 6,
      julio: 6,
      ago: 7,
      agosto: 7,
      sep: 8,
      sept: 8,
      septiembre: 8,
      oct: 9,
      octubre: 9,
      nov: 10,
      noviembre: 10,
      dic: 11,
      diciembre: 11
    };

    const weekdays = [
      "lunes",
      "martes",
      "miercoles",
      "miércoles",
      "jueves",
      "viernes",
      "sabado",
      "sábado",
      "domingo"
    ];

    let cleaned = raw.replace(/\./g, "").replace(/\s+/g, "");

    for (const dayName of weekdays) {
      const prefix = `${normalizeLoose(dayName)}/`;
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.slice(prefix.length);
        break;
      }
    }

    const match = cleaned.match(/(\d{1,2})[\/-]([a-z]+|\d{1,2})(?:[\/-](\d{2,4}))?/);

    if (!match) return null;

    const day = Number(match[1]);
    const monthToken = match[2];
    const yearToken = match[3];

    if (!day) return null;

    let month;

    if (/^\d+$/.test(monthToken)) {
      month = Number(monthToken) - 1;
    } else {
      if (!(monthToken in months)) return null;
      month = months[monthToken];
    }

    const now = new Date();
    let year = now.getFullYear();

    if (yearToken) {
      year = Number(yearToken.length === 2 ? `20${yearToken}` : yearToken);
    }

    const date = new Date(year, month, day);
    if (Number.isNaN(date.getTime())) return null;

    return date;
  }

  function dateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function isPendingStatus(value) {
    const norm = normalizeLoose(value);
    return (
      norm.includes("pend") ||
      norm.includes("por hacer") ||
      norm.includes("to do") ||
      norm.includes("sin empezar") ||
      norm.includes("pending")
    );
  }

  async function resolveDataSourceId() {
    const dataSourceResponse = await fetch(
      `https://api.notion.com/v1/data_sources/${NOTION_SOURCE_OR_DATABASE_ID}`,
      {
        method: "GET",
        headers
      }
    );

    if (dataSourceResponse.ok) {
      const dataSource = await dataSourceResponse.json();
      if (dataSource?.id) return dataSource.id;
    }

    const databaseResponse = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_SOURCE_OR_DATABASE_ID}`,
      {
        method: "GET",
        headers
      }
    );

    if (!databaseResponse.ok) {
      const dataSourceError = await dataSourceResponse.text().catch(() => "");
      const databaseError = await databaseResponse.text().catch(() => "");
      throw new Error(
        `NO SE PUDO LEER NI COMO DATA SOURCE NI COMO DATABASE. DATA_SOURCE: ${dataSourceError} | DATABASE: ${databaseError}`
      );
    }

    const database = await databaseResponse.json();
    const dataSourceId = database?.data_sources?.[0]?.id;

    if (!dataSourceId) {
      throw new Error("LA BASE CONTENIDOS.CSV NO DEVOLVIÓ NINGÚN DATA SOURCE");
    }

    return dataSourceId;
  }

  async function queryAllPages(dataSourceId) {
    let allResults = [];
    let hasMore = true;
    let nextCursor = undefined;

    while (hasMore) {
      const body = { page_size: 100 };

      if (nextCursor) {
        body.start_cursor = nextCursor;
      }

      const response = await fetch(
        `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ERROR EN QUERY A DATA SOURCE: ${errorText}`);
      }

      const data = await response.json();
      allResults = allResults.concat(data.results || []);
      hasMore = Boolean(data.has_more);
      nextCursor = data.next_cursor || undefined;
    }

    return allResults;
  }

  try {
    const resolvedDataSourceId = await resolveDataSourceId();
    const pages = await queryAllPages(resolvedDataSourceId);

    const items = await Promise.all(
      pages.map(async (page) => {
        const properties = page.properties || {};

        const numero = getNumberByNames(properties, ["#", "NÚMERO", "NUMERO"]);
        const tema =
          normalizeUpper(getTextByNames(properties, ["TEMA"])) ||
          normalizeUpper(getTitleFromProperties(properties));

        const fechaISO = getDateByNames(properties, ["FECHA"]);
        const fechaTexto = normalizeUpper(getTextByNames(properties, ["FECHA"]));
        const unidad = normalizeUpper(getTextByNames(properties, ["UNIDAD"]));
        const estado = normalizeUpper(getTextByNames(properties, ["ESTADO", "EST"]));
        const anexo = normalizeUpper(getTextByNames(properties, ["ANEXO", "ANEXOS"]));

        let parsedDate = null;
        if (fechaISO) {
          parsedDate = new Date(`${fechaISO}T00:00:00`);
        } else if (fechaTexto) {
          parsedDate = parseSpanishDateText(fechaTexto);
        }

        const fecha_key = parsedDate ? dateKey(parsedDate) : "";

        const prioridadIds = getRelationIdsByNames(properties, [
          "PRIORIDADES",
          "PRIORIDAD",
          "MATERIAS",
          "MATERIA"
        ]);

        const prioridadTitles = await Promise.all(prioridadIds.map(getPageTitle));
        const materiaRelacion = normalizeUpper(prioridadTitles.filter(Boolean).join(", "));

        const materiaTexto = normalizeUpper(
          getTextByNames(properties, ["MATERIA", "MATERIAS"])
        );

        const materia = materiaRelacion || materiaTexto || "SIN MATERIA";
        const pendiente = isPendingStatus(estado) || !estado;

        return {
          id: page.id,
          numero,
          tema,
          fecha_iso: fechaISO,
          fecha_texto: fechaTexto,
          fecha_key,
          unidad,
          estado,
          anexo,
          materia,
          pendiente
        };
      })
    );

    items.sort((a, b) => {
      if (a.materia !== b.materia) {
        return a.materia.localeCompare(b.materia);
      }

      if (a.fecha_key && b.fecha_key && a.fecha_key !== b.fecha_key) {
        return a.fecha_key.localeCompare(b.fecha_key);
      }

      if (a.fecha_key && !b.fecha_key) return -1;
      if (!a.fecha_key && b.fecha_key) return 1;

      if (a.numero !== b.numero) {
        return a.numero - b.numero;
      }

      return a.tema.localeCompare(b.tema);
    });

    return json({
      ok: true,
      source_or_database_id: NOTION_SOURCE_OR_DATABASE_ID,
      data_source_id: resolvedDataSourceId,
      total: items.length,
      items
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "ERROR CONSULTANDO CONTENIDOS.CSV EN NOTION",
        detail: String(error.message || error)
      },
      500
    );
  }
}
