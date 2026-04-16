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
    process.env.NOTION_DATABASE_ID || process.env.NOTION_DATA_SOURCE_ID;

  if (!NOTION_API_KEY || !NOTION_SOURCE_OR_DATABASE_ID) {
    return json(
      {
        ok: false,
        error: "FALTAN LAS VARIABLES DE ENTORNO EN VERCEL"
      },
      500
    );
  }

  const headers = {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    "Notion-Version": "2026-03-11",
    "Content-Type": "application/json"
  };

  const doneStates = new Set([
    "hecho",
    "done",
    "completado",
    "completed",
    "listo",
    "finalizado",
    "terminado"
  ]);

  const relationTitleCache = new Map();

  function getTitleFromProperties(properties) {
    if (!properties) return "";
    const titleProp = Object.values(properties).find(
      (prop) => prop && prop.type === "title"
    );
    if (!titleProp || !Array.isArray(titleProp.title)) return "";
    return titleProp.title.map((t) => t.plain_text || "").join("").trim();
  }

  function getStatusName(properties) {
    const prop = properties?.["ESTADO"];
    if (!prop) return "";
    if (prop.status?.name) return prop.status.name;
    if (prop.select?.name) return prop.select.name;
    return "";
  }

  function getTipoName(properties) {
    const prop = properties?.["TIPO"];
    if (!prop) return "";
    if (prop.status?.name) return prop.status.name;
    if (prop.select?.name) return prop.select.name;
    return "";
  }

  function getDateValue(properties) {
    return properties?.["FECHA DE VENCIMIENTO"]?.date?.start || null;
  }

  function getRelationIds(properties) {
    const rel = properties?.["MATERIA"]?.relation;
    if (!Array.isArray(rel)) return [];
    return rel.map((item) => item.id);
  }

  function normalizeDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function classifyTipo(tipo) {
    const t = normalizeText(tipo);

    if (
      t.includes("entregable") ||
      t.includes("entrega") ||
      t.includes("quiz") ||
      t.includes("parcial") ||
      t.includes("proyecto") ||
      t.includes("taller") ||
      t.includes("caso")
    ) {
      return "entregable";
    }

    if (
      t.includes("estudio autonomo") ||
      t.includes("autonomo") ||
      t.includes("estudiar") ||
      t.includes("lectura") ||
      t.includes("repaso")
    ) {
      return "estudio_autonomo";
    }

    return "otro";
  }

  function startOfWeekMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function endOfWeekSunday(date) {
    const d = startOfWeekMonday(date);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
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
      if (dataSource?.id) {
        return dataSource.id;
      }
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
      throw new Error("LA BASE NO DEVOLVIO NINGUN DATA SOURCE");
    }

    return dataSourceId;
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

  async function queryAllPages(dataSourceId) {
    let allResults = [];
    let hasMore = true;
    let nextCursor = undefined;

    while (hasMore) {
      const body = {
        sorts: [
          {
            property: "FECHA DE VENCIMIENTO",
            direction: "ascending"
          }
        ],
        page_size: 100
      };

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
        const objetivo = getTitleFromProperties(properties);
        const fecha = getDateValue(properties);
        const estado = getStatusName(properties);
        const tipo = getTipoName(properties);
        const categoria = classifyTipo(tipo);
        const materiaIds = getRelationIds(properties);
        const materiaTitles = await Promise.all(materiaIds.map(getPageTitle));

        return {
          id: page.id,
          objetivo,
          fecha,
          estado,
          tipo,
          categoria,
          materia: materiaTitles.filter(Boolean).join(", ")
        };
      })
    );

    const pendingItems = items.filter((item) => {
      const estado = normalizeText(item.estado);
      return !doneStates.has(estado);
    });

    const now = new Date();
    const weekStart = startOfWeekMonday(now);
    const weekEnd = endOfWeekSunday(now);

    const thisWeek = pendingItems
      .filter((item) => {
        const d = normalizeDate(item.fecha);
        return d && d >= weekStart && d <= weekEnd;
      })
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    const upcoming = pendingItems
      .filter((item) => normalizeDate(item.fecha))
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .slice(0, 12);

    const entregablesWeek = thisWeek.filter(
      (item) => item.categoria === "entregable"
    );

    const estudioAutonomoWeek = thisWeek.filter(
      (item) => item.categoria === "estudio_autonomo"
    );

    const otrosWeek = thisWeek.filter(
      (item) => item.categoria === "otro"
    );

    return json({
      ok: true,
      today: now.toISOString(),
      source_or_database_id: NOTION_SOURCE_OR_DATABASE_ID,
      data_source_id: resolvedDataSourceId,
      week: {
        start: weekStart.toISOString(),
        end: weekEnd.toISOString(),
        total: thisWeek.length,
        entregables_total: entregablesWeek.length,
        estudio_autonomo_total: estudioAutonomoWeek.length,
        otros_total: otrosWeek.length,
        items: thisWeek,
        entregables: entregablesWeek,
        estudio_autonomo: estudioAutonomoWeek,
        otros: otrosWeek
      },
      upcoming
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "ERROR CONSULTANDO NOTION",
        detail: String(error.message || error)
      },
      500
    );
  }
}
