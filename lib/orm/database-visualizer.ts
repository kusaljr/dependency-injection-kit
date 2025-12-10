#!/usr/bin/env bun

const PORT = 8848;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ Missing DATABASE_URL environment variable.");
  process.exit(1);
}

const isPostgres = DATABASE_URL.startsWith("postgres");
const isMysql = DATABASE_URL.startsWith("mysql");

if (!isPostgres && !isMysql) {
  console.error("❌ Unsupported DB. Must be postgres:// or mysql://");
  process.exit(1);
}

// === Database Adapter ===
const db = {
  query: async (queryStr: string, params: any[] = []) => {
    if (isPostgres) {
      const { sql } = await import("bun");
      return await sql.unsafe(queryStr, params);
    }
  },

  getSchema: async () => {
    if (isPostgres) {
      const { sql } = await import("bun");

      // 1. Columns
      const cols = await sql`
         SELECT table_name, column_name, data_type
         FROM information_schema.columns 
         WHERE table_schema = 'public' 
         ORDER BY table_name, ordinal_position;
       `;

      // 2. Foreign Keys
      const fks = await sql`
        SELECT
            tc.table_name AS from_table,
            kcu.column_name AS from_column,
            ccu.table_name AS to_table
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public';
       `;

      // 3. Primary Keys
      const pks = await sql`
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public';
      `;

      return processSchemaRows(cols, fks, pks);
    }

    if (isMysql) {
      // MySQL has COLUMN_KEY info directly in columns table
      const cols = await db.query(`
        SELECT 
          TABLE_NAME as table_name, 
          COLUMN_NAME as column_name, 
          DATA_TYPE as data_type,
          COLUMN_KEY as col_key
        FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME, ORDINAL_POSITION
      `);

      const fks = await db.query(`
        SELECT 
          TABLE_NAME as from_table, 
          COLUMN_NAME as from_column, 
          REFERENCED_TABLE_NAME as to_table
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
      `);

      return processSchemaRows(cols, fks, []); // MySQL PKs handled inside processSchemaRows via col_key
    }
  },
};

function processSchemaRows(cols: any[], fks: any[], pks: any[]) {
  const tables: Record<string, any> = {};

  // Create a lookup set for Postgres PKs
  const pkLookup = new Set(pks.map((p) => `${p.table_name}.${p.column_name}`));

  // Create a lookup for FKs to mark columns
  const fkLookup = new Set(fks.map((f) => `${f.from_table}.${f.from_column}`));

  for (const row of cols) {
    if (!tables[row.table_name]) {
      tables[row.table_name] = {
        name: row.table_name,
        columns: [],
        references: [],
      };
    }

    let isPk = false;
    // Postgres check
    if (pkLookup.has(`${row.table_name}.${row.column_name}`)) isPk = true;
    // MySQL check
    if (row.col_key === "PRI") isPk = true;

    tables[row.table_name].columns.push({
      name: row.column_name,
      type: row.data_type,
      isPk: isPk,
      isFk: fkLookup.has(`${row.table_name}.${row.column_name}`),
    });
  }

  for (const fk of fks) {
    if (tables[fk.from_table]) {
      tables[fk.from_table].references.push({
        toTable: fk.to_table,
        fromColumn: fk.from_column,
      });
    }
  }

  return Object.values(tables);
}

// === SERVER HTML ===
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>DB Visualizer</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root {
      --bg: #0f172a;
      --panel: #1e293b;
      --border: #334155;
      --text-main: #f8fafc;
      --text-sub: #94a3b8;
      --accent: #3b82f6;
      --pk-color: #fbbf24;
      --fk-color: #38bdf8;
    }
    body {
      margin: 0; background: var(--bg); color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif; overflow: hidden;
    }
    
    header {
      position: fixed; top: 0; left: 0; padding: 15px 20px; z-index: 10;
      display: flex; align-items: center; gap: 10px;
      background: rgba(15, 23, 42, 0.9); border-bottom: 1px solid var(--border);
      width: 100%;
    }
    h1 { margin: 0; font-size: 18px; font-weight: 600; }

    /* Graph Area */
    #graph-container {
      width: 100vw; height: 100vh;
      background-image: radial-gradient(#334155 1px, transparent 1px);
      background-size: 20px 20px;
    }

    /* Node Styles */
    .node-rect {
      fill: var(--panel);
      stroke: var(--border);
      stroke-width: 1px;
      rx: 6; ry: 6;
    }
    .node-container {
      width: 100%; height: 100%;
      display: flex; flex-direction: column;
      color: white;
      background: var(--panel);
    }
    .node-header {
      background: #020617; padding: 8px 10px;
      font-weight: 700; font-size: 14px;
      border-bottom: 1px solid var(--border);
      border-radius: 6px 6px 0 0;
      display: flex; justify-content: space-between; align-items: center;
      cursor: pointer;
    }
    .node-header:hover { background: #0f172a; color: var(--accent); }
    
    .node-body { padding: 4px 0; }
    
    .col-row { 
      display: flex; justify-content: space-between; align-items: center;
      font-size: 12px; padding: 4px 10px; 
      border-bottom: 1px solid #33415522;
    }
    .col-left { display: flex; gap: 6px; align-items: center; }
    .col-name { color: var(--text-main); }
    .col-type { color: var(--text-sub); font-family: monospace; font-size: 10px; }
    
    .icon-pk { color: var(--pk-color); font-size: 10px; width: 12px; }
    .icon-fk { color: var(--fk-color); font-size: 10px; width: 12px; }
    .icon-spacer { width: 12px; display: inline-block; }

    /* Links */
    .link { 
      fill: none; stroke: #64748b; stroke-width: 1.5px; opacity: 0.6;
      transition: stroke 0.2s;
    }
    .link:hover { stroke: var(--accent); opacity: 1; stroke-width: 2px; }

    /* Drawer */
    .drawer {
      position: fixed; top: 0; right: 0; width: 600px; max-width: 90vw; height: 100%;
      background: rgba(30, 41, 59, 0.98); border-left: 1px solid var(--border);
      box-shadow: -10px 0 30px rgba(0,0,0,0.6);
      transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex; flex-direction: column; z-index: 100;
    }
    .drawer.open { transform: translateX(0); }
    .drawer-header { padding: 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; }
    .close-btn { background: none; border: none; color: white; cursor: pointer; font-size: 18px; }
    .drawer-content { flex: 1; overflow: auto; padding: 20px; }
    
    /* Table inside Drawer */
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 10px; color: var(--text-sub); border-bottom: 1px solid var(--border); }
    td { padding: 10px; border-bottom: 1px solid #ffffff11; }
    
    .pagination { padding: 15px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; }
    .btn { background: var(--accent); color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; }

  </style>
</head>
<body>

  <header>
    <i class="fa-solid fa-project-diagram" style="color: var(--accent);"></i>
    <h1>Schema Architect</h1>
  </header>

  <div id="graph-container">
    <svg id="viz-svg" width="100%" height="100%">
      <g id="zoom-layer"></g>
    </svg>
  </div>

  <div class="drawer" id="drawer">
    <div class="drawer-header">
      <h2 id="drawer-title" style="margin:0; font-size:18px;">Data</h2>
      <button class="close-btn" onclick="closeDrawer()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="drawer-content" id="drawer-body"></div>
    <div class="pagination">
      <button class="btn" onclick="changePage(-1)">Prev</button>
      <span id="page-info"></span>
      <button class="btn" onclick="changePage(1)">Next</button>
    </div>
  </div>

  <script>
    let currentTable = null;
    let currentPage = 1;

    async function init() {
      const data = await fetch('/api/schema').then(r => r.json());
      drawDiagram(data);
    }

    function drawDiagram(tables) {
      // 1. Setup Dagre Graph
      const g = new dagre.graphlib.Graph();
      g.setGraph({ 
        rankdir: 'LR', // Left-to-Right layout usually best for Schemas
        nodesep: 50,   // horizontal separation
        ranksep: 100,  // vertical separation between ranks
        marginx: 50, 
        marginy: 50 
      });
      g.setDefaultEdgeLabel(() => ({}));

      // 2. Add Nodes to Graph (Calculate sizes)
      const ROW_HEIGHT = 24;
      const HEADER_HEIGHT = 36;
      const NODE_WIDTH = 240;

      tables.forEach(t => {
        // Limit displayed columns to avoid super long nodes
        const displayCols = t.columns; 
        const height = HEADER_HEIGHT + (displayCols.length * ROW_HEIGHT) + 10; // +10 padding
        
        g.setNode(t.name, { 
          label: t.name, 
          width: NODE_WIDTH, 
          height: height,
          data: t
        });
      });

      // 3. Add Edges
      tables.forEach(t => {
        t.references.forEach(ref => {
          g.setEdge(t.name, ref.toTable, { 
            style: "stroke: #64748b; fill: none;",
            arrowheadStyle: "fill: #64748b" 
          });
        });
      });

      // 4. Calculate Layout
      dagre.layout(g);

      // 5. Render with D3
      const svg = d3.select("#viz-svg");
      const zoomLayer = svg.select("#zoom-layer");
      
      // Setup Zoom
      const zoom = d3.zoom().on("zoom", (e) => {
        zoomLayer.attr("transform", e.transform);
      });
      svg.call(zoom);

      // Render Edges (Links)
      // We use smooth curves
      const line = d3.line()
        .x(d => d.x)
        .y(d => d.y)
        .curve(d3.curveBasis);

      g.edges().forEach(e => {
        const edge = g.edge(e);
        zoomLayer.append("path")
          .attr("class", "link")
          .attr("d", line(edge.points))
          .attr("marker-end", "url(#arrow)");
      });

      // Define Arrowhead
      svg.append('defs').append('marker')
        .attr('id', 'arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 9).attr('refY', 5)
        .attr('markerWidth', 6).attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#64748b');

      // Render Nodes
      const nodes = g.nodes().map(v => {
        const node = g.node(v);
        return { 
          id: v, 
          x: node.x - (node.width / 2), 
          y: node.y - (node.height / 2), 
          width: node.width, 
          height: node.height,
          data: node.data 
        };
      });

      const nodeGroup = zoomLayer.selectAll(".node")
        .data(nodes)
        .enter()
        .append("foreignObject")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("width", d => d.width)
        .attr("height", d => d.height);

      nodeGroup.append("xhtml:div")
        .attr("class", "node-container")
        .html(d => {
          const table = d.data;
          
          let rowsHtml = table.columns.map(col => {
            let icon = '<span class="icon-spacer"></span>';
            if (col.isPk) icon = '<i class="fa-solid fa-key icon-pk"></i>';
            else if (col.isFk) icon = '<i class="fa-solid fa-link icon-fk"></i>';
            
            return \`
              <div class="col-row">
                <div class="col-left">
                  \${icon}
                  <span class="col-name">\${col.name}</span>
                </div>
                <span
                style="font-family: monospace; font-size: 6px;"
                class="col-type">\${col.type}</span>
              </div>
            \`;
          }).join('');

          return \`
            <div class="node-rect" style="height:100%">
              <div class="node-header" onclick="openDrawer('\${table.name}')">
                <span>\${table.name}</span>
                <i class="fa-solid fa-table"></i>
              </div>
              <div class="node-body">
                \${rowsHtml}
              </div>
            </div>
          \`;
        });
      
      // Center the graph initially
      const initialScale = 0.8;
      const graphWidth = g.graph().width;
      const graphHeight = g.graph().height;
      const svgWidth = document.getElementById('viz-svg').clientWidth;
      const svgHeight = document.getElementById('viz-svg').clientHeight;
      
      const xOffset = (svgWidth - graphWidth * initialScale) / 2;
      const yOffset = (svgHeight - graphHeight * initialScale) / 2;

      svg.call(zoom.transform, d3.zoomIdentity.translate(xOffset, yOffset).scale(initialScale));
    }

    // --- Drawer Logic (Same as before) ---
    function openDrawer(name) {
      currentTable = name; currentPage = 1;
      document.getElementById('drawer-title').innerText = name;
      document.getElementById('drawer').classList.add('open');
      loadTableData();
    }
    function closeDrawer() { document.getElementById('drawer').classList.remove('open'); }
    function changePage(d) { currentPage += d; if(currentPage<1) currentPage=1; loadTableData(); }

    async function loadTableData() {
      const body = document.getElementById('drawer-body');
      body.innerHTML = 'Loading...';
      document.getElementById('page-info').innerText = currentPage;
      
      try {
        const res = await fetch(\`/api/data?table=\${currentTable}&page=\${currentPage}\`);
        const rows = await res.json();
        
        if(rows.error || rows.length === 0) {
          body.innerHTML = 'No data.'; return;
        }

        const keys = Object.keys(rows[0]);
        let html = '<table><thead><tr>' + keys.map(k=>\`<th>\${k}</th>\`).join('') + '</tr></thead><tbody>';
        rows.forEach(r => {
          html += '<tr>' + keys.map(k=>\`<td>\${r[k] === null ? 'null' : r[k]}</td>\`).join('') + '</tr>';
        });
        html += '</tbody></table>';
        body.innerHTML = html;
      } catch(e) { body.innerText = "Error"; }
    }

    init();
  </script>
</body>
</html>
`;

// === BUN SERVER ===
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/")
      return new Response(html, { headers: { "Content-Type": "text/html" } });

    if (url.pathname === "/api/schema") {
      try {
        const schema = await db.getSchema();
        return Response.json(schema);
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    if (url.pathname === "/api/data") {
      const table = url.searchParams.get("table");
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = 50;
      const offset = (page - 1) * limit;

      if (!table)
        return Response.json({ error: "Missing table" }, { status: 400 });

      try {
        const query = `SELECT * FROM ${table} LIMIT ${limit} OFFSET ${offset}`;
        const rows = await db.query(query);
        const safeRows = JSON.parse(
          JSON.stringify(rows, (key, value) =>
            typeof value === "bigint" ? value.toString() : value
          )
        );
        return Response.json(safeRows);
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Dikit DB Visualizer running at http://localhost:${PORT}`);
