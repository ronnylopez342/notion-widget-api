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

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeUpper(value) {
    return normalizeText(value).toUpperCase();
  }

  function getTitleFromProperties(properties) {
    if (!properties) return "";
    const titleProp = Object.values(properties).find(
      (prop) => prop && prop.type === "title"
    );
    if (!titleProp || !Array.isArray(titleProp.title)) return "";
    return titleProp.title.map((t) => t.plain_text || "").join("").trim();
  }

  function getTextProperty(properties, key) {
    const prop = properties?.[key];
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

  function getNumberProperty(properties, candidates) {
    for (const key of candidates) {
      const prop = properties?.[key];
      if (!prop) continue;

      if (typeof prop.number === "number") return prop.number;

      if (prop.formula && typeof prop.formula.number === "number") {
        return prop.formula.number;
      }

      if (Array.isArray(prop.rich_text)) {
        const raw = prop.rich_text.map((t) => t.plain_text || "").join("").trim();
        const parsed = Number(raw.replace(",", "."));
        if (Number.isFinite(parsed)) return parsed;
      }
    }

    return 0;
  }

  function getDateProperty(properties, key) {
    const prop = properties?.[key];
    if (!prop || !prop.date || !prop.date.start) return "";
    return String(prop.date.start).slice(0, 10);
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

    const items = pages
      .map((page) => {
        const properties = page.properties || {};

        const numero = getNumberProperty(properties, ["#", "NÚMERO", "NUMERO"]);
        const tema =
          normalizeUpper(getTextProperty(properties, "TEMA")) ||
          normalizeUpper(getTitleFromProperties(properties));

        const fecha_iso = getDateProperty(properties, "FECHA");
        const unidad = normalizeUpper(getTextProperty(properties, "UNIDAD"));
        const estado =
          normalizeUpper(getTextProperty(properties, "ESTADO")) ||
          normalizeUpper(getTextProperty(properties, "EST"));
        const anexo =
          normalizeUpper(getTextProperty(properties, "ANEXO")) ||
          normalizeUpper(getTextProperty(properties, "ANEXOS"));

        return {
          id: page.id,
          numero,
          tema,
          fecha_iso,
          unidad,
          estado,
          anexo
        };
      })
      .filter((item) => item.tema)
      .sort((a, b) => {
        if (a.fecha_iso && b.fecha_iso && a.fecha_iso !== b.fecha_iso) {
          return a.fecha_iso.localeCompare(b.fecha_iso);
        }

        if (a.fecha_iso && !b.fecha_iso) return -1;
        if (!a.fecha_iso && b.fecha_iso) return 1;

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
