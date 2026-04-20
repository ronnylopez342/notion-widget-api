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
    process.env.NOTION_CONTENIDO_ID || process.env.NOTION_DATABASE_ID;

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

  function getRichText(properties, key) {
    const prop = properties?.[key];
    if (!prop) return "";

    if (Array.isArray(prop.rich_text)) {
      return prop.rich_text.map((t) => t.plain_text || "").join("").trim();
    }

    if (typeof prop.number === "number") return String(prop.number);
    if (prop.select?.name) return prop.select.name;
    if (prop.status?.name) return prop.status.name;

    return "";
  }

  function getDate(properties, key) {
    const prop = properties?.[key];
    if (!prop || !prop.date || !prop.date.start) return "";
    return String(prop.date.start).slice(0, 10);
  }

  function resolveSelectLike(properties, key) {
    const prop = properties?.[key];
    if (!prop) return "";

    if (prop.select?.name) return prop.select.name;
    if (prop.status?.name) return prop.status.name;
    if (Array.isArray(prop.rich_text)) {
      return prop.rich_text.map((t) => t.plain_text || "").join("").trim();
    }

    return "";
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

    const match = cleaned.match(/(\d{1,2})\/([a-z]+)(?:\/(\d{2,4}))?/);

    if (!match) return null;

    const day = Number(match[1]);
    const monthToken = match[2];
    const yearToken = match[3];

    if (!day || !(monthToken in months)) return null;

    const month = months[monthToken];
    const now = new Date();
    let year = now.getFullYear();

    if (yearToken) {
      year = Number(yearToken.length === 2 ? `20${yearToken}` : yearToken);
    }

    const date = new Date(year, month, day);
    if (Number.isNaN(date.getTime())) return null;

    return date;
  }

  function startOfDay(date) {
    const x = new Date(date);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function endOfDay(date) {
    const x = new Date(date);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  function addDays(date, days) {
    const x = new Date(date);
    x.setDate(x.getDate() + days);
    return x;
  }

  function dateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function mondayOfWeek(date) {
    const d = startOfDay(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(d, diff);
  }

  function getWeekRange(date) {
    const start = mondayOfWeek(date);
    const end = endOfDay(addDays(start, 6));
    return { start, end };
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

  function groupByUnidad(items) {
    const map = new Map();

    for (const item of items) {
      const unidad = item.unidad || "SIN UNIDAD";

      if (!map.has(unidad)) {
        map.set(unidad, {
          unidad,
          total: 0,
          temas: []
        });
      }

      const group = map.get(unidad);
      group.total += 1;
      group.temas.push({
        tema: item.tema,
        fecha: item.fecha_texto || item.fecha_iso || item.fecha_key,
        anexos: item.anexos
      });
    }

    return Array.from(map.values())
      .map((group) => ({
        unidad: group.unidad,
        total: group.total,
        temas: group.temas
      }))
      .sort((a, b) => a.unidad.localeCompare(b.unidad));
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
      throw new Error("LA BASE DE CONTENIDO NO DEVOLVIÓ NINGÚN DATA SOURCE");
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

    const now = new Date();
    const today = startOfDay(now);
    const weekRange = getWeekRange(now);
    const todayKey = dateKey(today);
    const weekStartKey = dateKey(weekRange.start);
    const weekEndKey = dateKey(weekRange.end);

    const items = pages
      .map((page) => {
        const properties = page.properties || {};

        const tema =
          normalizeUpper(getRichText(properties, "TEMA")) ||
          normalizeUpper(getTitleFromProperties(properties));

        const unidad = normalizeUpper(getRichText(properties, "UNIDAD"));
        const anexos = normalizeUpper(getRichText(properties, "ANEXOS"));
        const estado =
          normalizeUpper(resolveSelectLike(properties, "EST")) ||
          normalizeUpper(resolveSelectLike(properties, "ESTADO"));

        const fechaISO = getDate(properties, "FECHA");
        const fechaTexto = normalizeUpper(getRichText(properties, "FECHA"));

        let parsedDate = null;

        if (fechaISO) {
          parsedDate = new Date(`${fechaISO}T00:00:00`);
        } else if (fechaTexto) {
          parsedDate = parseSpanishDateText(fechaTexto);
        }

        const fechaKey = parsedDate ? dateKey(parsedDate) : "";
        const pending = isPendingStatus(estado) || !estado;

        return {
          id: page.id,
          tema,
          unidad,
          anexos,
          estado,
          fecha_iso: fechaISO,
          fecha_texto: fechaTexto,
          fecha_key: fechaKey,
          pending
        };
      })
      .filter((item) => item.tema && item.fecha_key);

    const todayItems = items
      .filter((item) => item.pending && item.fecha_key === todayKey)
      .sort((a, b) => a.fecha_key.localeCompare(b.fecha_key));

    const weekItems = items
      .filter(
        (item) =>
          item.pending &&
          item.fecha_key >= weekStartKey &&
          item.fecha_key <= weekEndKey
      )
      .sort((a, b) => a.fecha_key.localeCompare(b.fecha_key));

    const futureItems = items
      .filter((item) => item.pending && item.fecha_key > todayKey)
      .sort((a, b) => a.fecha_key.localeCompare(b.fecha_key));

    const overdueItems = items
      .filter((item) => item.pending && item.fecha_key < todayKey)
      .sort((a, b) => b.fecha_key.localeCompare(a.fecha_key));

    let modo = "semana";
    let baseItems = weekItems;

    if (weekItems.length === 0 && futureItems.length > 0) {
      modo = "proximos";
      baseItems = futureItems.slice(0, 12);
    } else if (weekItems.length === 0 && futureItems.length === 0 && overdueItems.length > 0) {
      modo = "atrasados";
      baseItems = overdueItems.slice(0, 12);
    }

    const grouped = groupByUnidad(baseItems);

    return json({
      ok: true,
      today: today.toISOString(),
      base_id: NOTION_SOURCE_OR_DATABASE_ID,
      data_source_id: resolvedDataSourceId,
      summary: {
        hoy_total: todayItems.length,
        semana_total: weekItems.length,
        proximos_total: futureItems.length,
        atrasados_total: overdueItems.length,
        modo_semana: modo
      },
      hoy: todayItems.map((item) => ({
        tema: item.tema,
        unidad: item.unidad,
        fecha: item.fecha_texto || item.fecha_iso || item.fecha_key,
        anexos: item.anexos
      })),
      semana: grouped
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "ERROR CONSULTANDO CONTENIDO EN NOTION",
        detail: String(error.message || error)
      },
      500
    );
  }
}
