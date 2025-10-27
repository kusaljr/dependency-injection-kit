#!/usr/bin/env bun
import { createConnection } from "mysql2/promise";
import pgStructure from "pg-structure";

const PORT = 8848;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ Missing DATABASE_URL environment variable.");
  process.exit(1);
}

const dbType = DATABASE_URL.startsWith("postgres")
  ? "postgres"
  : DATABASE_URL.startsWith("mysql")
  ? "mysql"
  : null;

if (!dbType) {
  console.error(
    "❌ Unsupported DATABASE_URL (must start with postgres:// or mysql://)"
  );
  process.exit(1);
}

// === Introspect DB schema ===
async function getSchema() {
  if (dbType === "postgres") {
    const db = await pgStructure(DATABASE_URL, { includeSchemas: ["public"] });
    const schema = db.schemas.get("public");
    return Array.from(schema.tables.values()).map((table: any) => ({
      name: table.name,
      columns: Array.from(table.columns.values()).map((col: any) => ({
        name: col.name,
        type: col.type.name,
      })),
      references: Array.from(table.foreignKeys.values()).map((fk: any) => ({
        from: fk.columns[0].name,
        toTable: fk.referencedTable.name,
        toColumn: fk.referencedColumns[0].name,
      })),
    }));
  }

  if (dbType === "mysql") {
    const connection = await createConnection(DATABASE_URL as string);
    const [rows] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()`
    );
    await connection.end();

    const tables: Record<string, any[]> = {};
    for (const row of rows as any[]) {
      if (!tables[row.TABLE_NAME]) tables[row.TABLE_NAME] = [];
      tables[row.TABLE_NAME].push({
        name: row.COLUMN_NAME,
        type: row.DATA_TYPE,
      });
    }

    return Object.entries(tables).map(([name, columns]) => ({ name, columns }));
  }
}
const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Database Visualizer</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    html, body {
      margin: 0; padding: 0; height: 100%;
      background: #f7f9fb; overflow: hidden;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #222;
    }
    h1 {
      margin: 16px;
      font-size: 20px;
      font-weight: 600;
    }
    svg {
      width: 100%; height: calc(100% - 50px);
      background-size: 30px 30px;
      background-image:
        linear-gradient(to right, #eee 1px, transparent 1px),
        linear-gradient(to bottom, #eee 1px, transparent 1px);
    }

    .table-box {
      fill: #fff;
      stroke: #ccc;
      stroke-width: 1;
      rx: 6; ry: 6;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
    }
    .table-title {
      font-size: 14px;
      font-weight: 600;
      fill: #222;
    }
    .table-column {
      font-size: 12px;
      fill: #444;
    }
    .link {
      stroke: #aaa;
      stroke-width: 1.5;
      marker-end: url(#arrow);
    }
    .node:hover rect {
      stroke: #0078ff;
      stroke-width: 2;
    }
  </style>
</head>
<body>
  <h1>📊 Database Schema Visualization</h1>
  <svg></svg>
  <script>
    async function render() {
      const schema = await fetch('/schema').then(r => r.json());
      const svg = d3.select('svg');
      const width = window.innerWidth;
      const height = window.innerHeight - 50;

      // Arrow marker for links
      svg.append('defs').append('marker')
        .attr('id', 'arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 18)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#aaa');

      const nodes = schema.map(t => ({ id: t.name, columns: t.columns }));
      const links = schema.flatMap(t =>
        (t.references || []).map(r => ({ source: t.name, target: r.toTable }))
      );

      const sim = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(220))
        .force('charge', d3.forceManyBody().strength(-700))
        .force('center', d3.forceCenter(width/2, height/2));

      const link = svg.selectAll('line').data(links).enter()
        .append('line').attr('class', 'link');

      const node = svg.selectAll('g')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', 'node')
        .call(d3.drag()
          .on('start', dragstart)
          .on('drag', dragged)
          .on('end', dragend));

      node.each(function(d) {
        const g = d3.select(this);
        const paddingX = 10, paddingY = 10;
        const boxWidth = 220;

        // Create title
        const title = g.append('text')
          .attr('class', 'table-title')
          .attr('x', paddingX)
          .attr('y', paddingY + 10)
          .text(d.id);

        // Create columns text
        const columns = g.append('text')
          .attr('class', 'table-column')
          .attr('x', paddingX)
          .attr('y', paddingY + 25)
          .selectAll('tspan')
          .data(d.columns)
          .enter()
          .append('tspan')
          .attr('x', paddingX)
          .attr('dy', '1.2em')
          .text(c => '• ' + c.name + ' (' + c.type + ')')
          .call(wrapText, boxWidth - 2 * paddingX); // wrap long lines

        // Measure total height
        const totalHeight = g.node().getBBox().height + paddingY * 2;

        // Draw background box *behind* text
        g.insert('rect', ':first-child')
          .attr('class', 'table-box')
          .attr('width', boxWidth)
          .attr('height', totalHeight);
      });

      sim.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        node.attr('transform', d => \`translate(\${d.x - 110}, \${d.y - 20})\`);
      });

      // --- text wrapping helper ---
      function wrapText(tspans, width) {
        tspans.each(function() {
          const text = d3.select(this);
          const words = text.text().split(/\\s+/).reverse();
          let line = [];
          let lineNumber = 0;
          const lineHeight = 1.2; // ems
          const x = text.attr("x");
          const y = text.attr("y");
          let tspan = text.text(null).append("tspan").attr("x", x).attr("y", y);
          let word;
          while ((word = words.pop())) {
            line.push(word);
            tspan.text(line.join(" "));
            if (tspan.node().getComputedTextLength() > width) {
              line.pop();
              tspan.text(line.join(" "));
              line = [word];
              tspan = text.append("tspan")
                .attr("x", x)
                .attr("y", y)
                .attr("dy", ++lineNumber * lineHeight + "em")
                .text(word);
            }
          }
        });
      }

      function dragstart(event, d) {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      }
      function dragged(event, d) {
        d.fx = event.x; d.fy = event.y;
      }
      function dragend(event, d) {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      }
    }
    render();
  </script>
</body>
</html>
`;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/") {
      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/schema") {
      try {
        const schema = await getSchema();
        return new Response(JSON.stringify(schema), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error(err);
        return new Response(
          JSON.stringify({ error: "Failed to load schema" }),
          { status: 500 }
        );
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`🌐 Database visualizer running at http://localhost:${PORT}`);
