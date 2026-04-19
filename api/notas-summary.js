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
    process.env.NOTION_NOTAS_ID || process.env.NOTION_DATABASE_ID;

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

  function getTitleFromProperties(properties) {
    if (!properties) return "";
    const titleProp = Object.values(properties).find(
      (prop) => prop && prop.type === "title"
    );
    if (!titleProp || !Array.isArray(titleProp.title)) return "";
    return titleProp.title.map((t) => t.plain_text || "").join("").trim();
  }

  function getNumericProperty(properties, key) {
    const prop = properties?.[key];
    if (!prop) return 0;

    if (typeof prop.number === "number") {
      return prop.number;
    }

    if (prop.formula) {
      if (typeof prop.formula.number === "number") return prop.formula.number;
      if (typeof prop.formula.string === "string") {
        const parsed = Number(prop.formula.string.replace(",", "."));
        return Number.isFinite(parsed) ? parsed : 0;
      }
    }

    if (prop.rollup) {
      if (typeof prop.rollup.number === "number") return prop.rollup.number;

      if (Array.isArray(prop.rollup.array)) {
        const nums = prop.rollup.array
          .map((item) => {
            if (typeof item.number === "number") return item.number;
            if (typeof item?.formula?.number === "number") return item.formula.number;
            if (typeof item?.formula?.string === "string") {
              const parsed = Number(item.formula.string.replace(",", "."));
              return Number.isFinite(parsed) ? parsed : 0;
            }
            return 0;
          })
          .filter((n) => typeof n === "number");

        return nums.reduce((a, b) => a + b, 0);
      }
    }

    if (Array.isArray(prop.rich_text) && prop.rich_text.length) {
      const text = prop.rich_text.map((t) => t.plain_text || "").join("").trim();
      const parsed = Number(text.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  function getRelationIds(properties) {
    const rel = properties?.["Materias"]?.relation;
    if (!Array.isArray(rel)) return [];
    return rel.map((item) => item.id);
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
      throw new Error("LA BASE DE NOTAS NO DEVOLVIÓ NINGÚN DATA SOURCE");
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

  try {
    const resolvedDataSourceId = await resolveDataSourceId();
    const pages = await queryAllPages(resolvedDataSourceId);

    const rawItems = await Promise.all(
      pages.map(async (page) => {
        const properties = page.properties || {};
        const nombre = normalizeText(getTitleFromProperties(properties));
        const porcentaje = getNumericProperty(properties, "PORCENTAJE");
        const nota = getNumericProperty(properties, "NOTA");

        // Si existe una propiedad real NOTA FINAL, la toma.
        // Si no existe o viene en 0, la calcula.
        const notaFinalReal = getNumericProperty(properties, "NOTA FINAL");
        const notaFinalCalculada =
          nota > 0 && porcentaje > 0 ? (porcentaje * nota) / 100 : 0;

        const notaFinal = notaFinalReal > 0 ? notaFinalReal : notaFinalCalculada;

        const materiaIds = getRelationIds(properties);
        const materiaTitles = await Promise.all(materiaIds.map(getPageTitle));
        const materia = normalizeText(materiaTitles.filter(Boolean).join(", "));

        return {
          id: page.id,
          nombre,
          porcentaje,
          nota,
          nota_final: notaFinal,
          materia
        };
      })
    );

    const grouped = new Map();

    for (const item of rawItems) {
      const materia = item.materia || "SIN MATERIA";

      if (!grouped.has(materia)) {
        grouped.set(materia, {
          materia,
          total_nota_final: 0,
          porcentaje_evaluado: 0,
          items_registrados: []
        });
      }

      const group = grouped.get(materia);
      const tieneNota = item.nota > 0 || item.nota_final > 0;

      if (tieneNota) {
        group.total_nota_final += item.nota_final;

        // Solo suma porcentaje evaluado cuando realmente hay nota > 0
        if (item.nota > 0) {
          group.porcentaje_evaluado += item.porcentaje;
        }

        group.items_registrados.push({
          nombre: item.nombre,
          porcentaje: item.porcentaje,
          nota: item.nota,
          nota_final: item.nota_final
        });
      }
    }

    const materias = Array.from(grouped.values())
      .map((group) => {
        const notasValidas = group.items_registrados
          .map((item) => item.nota)
          .filter((value) => value > 0);

        const promedio =
          notasValidas.length > 0
            ? notasValidas.reduce((a, b) => a + b, 0) / notasValidas.length
            : 0;

        return {
          materia: group.materia,
          total_nota_final: Number(group.total_nota_final.toFixed(4)),
          porcentaje_evaluado: Number(group.porcentaje_evaluado.toFixed(2)),
          promedio_notas: Number(promedio.toFixed(2)),
          total_items_registrados: group.items_registrados.length,
          items_registrados: group.items_registrados
            .filter((item) => item.nota > 0 || item.nota_final > 0)
            .sort((a, b) => b.porcentaje - a.porcentaje)
        };
      })
      .filter(
        (group) =>
          group.total_items_registrados > 0 && group.materia !== "SIN MATERIA"
      )
      .sort((a, b) => a.materia.localeCompare(b.materia));

    return json({
      ok: true,
      source_or_database_id: NOTION_SOURCE_OR_DATABASE_ID,
      data_source_id: resolvedDataSourceId,
      materias
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "ERROR CONSULTANDO NOTAS EN NOTION",
        detail: String(error.message || error)
      },
      500
    );
  }
}
