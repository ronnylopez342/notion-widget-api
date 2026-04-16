export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;

  if (!NOTION_API_KEY || !NOTION_DATA_SOURCE_ID) {
    return res.status(500).json({
      ok: false,
      error: "FALTAN LAS VARIABLES DE ENTORNO EN VERCEL"
    });
  }

  const headers = {
    "Authorization": `Bearer ${NOTION_API_KEY}`,
    "Notion-Version": "2026-03-11",
    "Content-Type": "application/json"
  };

  const doneStates = new Set([
    "hecho",
    "done",
    "completado",
    "completed",
    "listo",
    "finalizado"
  ]);

  const relationTitleCache = new Map();

  function getTitleFromProperties(properties) {
    if (!properties) return "";
    const titleProp = Object.values(properties).find((prop) => prop && prop.type === "title");
    if (!titleProp || !Array.isArray(titleProp.title)) return "";
    return titleProp.title.map((t) => t.plain_text).join("").trim();
  }

  function getStatusName(properties) {
    const prop = properties?.["ESTADO"];
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

  async function queryAllPages() {
    let allResults = [];
    let hasMore = true;
    let nextCursor = undefined;

    while (hasMore) {
      const response = await fetch(
        `https://api.notion.com/v1/data_sources/${NOTION_DATA_SOURCE_ID}/query`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            sorts: [
              {
                property: "FECHA DE VENCIMIENTO",
                direction: "ascending"
              }
            ],
            page_size: 100,
            start_cursor: nextCursor
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const data = await response.json();
      allResults = allResults.concat(data.results || []);
      hasMore = Boolean(data.has_more);
      nextCursor = data.next_cursor;
    }

    return allResults;
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

  function normalizeDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  try {
    const pages = await queryAllPages();

    const items = await Promise.all(
      pages.map(async (page) => {
        const properties = page.properties || {};
        const objetivo = getTitleFromProperties(properties);
        const fecha = getDateValue(properties);
        const estado = getStatusName(properties);
        const materiaIds = getRelationIds(properties);
        const materiaTitles = await Promise.all(materiaIds.map(getPageTitle));

        return {
          id: page.id,
          objetivo,
          fecha,
          estado,
          materia: materiaTitles.filter(Boolean).join(", ")
        };
      })
    );

    const pendingItems = items.filter((item) => {
      const estado = (item.estado || "").toLowerCase().trim();
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

    return res.status(200).json({
      ok: true,
      today: now.toISOString(),
      week: {
        start: weekStart.toISOString(),
        end: weekEnd.toISOString(),
        total: thisWeek.length,
        items: thisWeek
      },
      upcoming
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "ERROR CONSULTANDO NOTION",
      detail: String(error.message || error)
    });
  }
}
