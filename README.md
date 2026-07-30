# Mermaid API

Render Mermaid diagram code to PNG or SVG images via a simple HTTP API. Designed for one-click deployment on Railway.

[![Deploy to Railway](https://railway.app/button.svg)](https://railway.com/deploy/UTCX9-)

## Features

- **POST /render** — Render diagrams from JSON body `{ code, format, theme, scale }`
- **GET /render** — Render diagrams from query string `?code=...&format=...`
- **PNG or SVG output** — Choose between raster or vector output
- **Multiple themes** — `default`, `dark`, `forest`, `neutral`
- **Concurrent rendering** — Browser pool with configurable concurrency
- **Health check** — `GET /health` for Railway health monitoring
- **Input sanitization** — HTML-escaped Mermaid code before rendering

## Deploy and Host

Click the Deploy to Railway button above to launch the Mermaid API service in minutes. Chromium and Puppeteer are pre-installed in the container — no additional configuration needed.

## About Hosting

This template runs a Node.js Express server with Puppeteer for headless Chromium rendering on Railway. A browser pool manages concurrent diagram rendering with automatic browser reuse and resource cleanup.

## Why Deploy

- Self-host a diagram-as-code API without external service dependencies
- No rate limits or API keys — full control over your rendering pipeline
- Eliminate cloud diagram service costs with your own single-container deployment
- Scale horizontally by increasing MAX_CONCURRENT for higher throughput

## Common Use Cases

- CI/CD pipeline — auto-generate architecture diagrams from Markdown
- Documentation sites — embed live-updating Mermaid diagrams
- API gateway backend — render diagrams on demand for web/mobile apps
- Notification and reporting — auto-generated diagram attachments

## Dependencies for

- Node.js 20 — JavaScript runtime
- Chromium 120+ — Headless browser for SVG-to-PNG rendering
- Puppeteer 23 — Browser automation and screenshot API

### Deployment Dependencies

| Dependency | Description |
|------------|-------------|
| Railway account | Must have access to 1+ service |
| No database needed | Fully self-contained — no companion services required |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `NODE_ENV` | `production` | Node.js environment |
| `CHROMIUM_PATH` | `/usr/bin/chromium` | Path to Chromium binary |
| `MAX_CONCURRENT` | `4` | Max concurrent browser instances |

## API Usage

### POST /render

```json
POST /render
Content-Type: application/json

{
  "code": "graph TD;\\nA-->B;\\nA-->C;\\nB-->D;\\nC-->D;",
  "format": "png",
  "theme": "default",
  "scale": 2
}
```

Returns the rendered diagram as PNG or SVG binary.

### GET /render

```
GET /render?code=graph%20TD%3B%0AA--%3EB%3B&format=svg&theme=dark
```

Returns the rendered diagram as PNG or SVG binary.

## Supported Diagram Types

All Mermaid diagram types are supported:
- Flowcharts (`graph TD`, `graph LR`, etc.)
- Sequence diagrams (`sequenceDiagram`)
- Class diagrams (`classDiagram`)
- State diagrams (`stateDiagram-v2`)
- Gantt charts (`gantt`)
- Pie charts (`pie`)
- ER diagrams (`erDiagram`)
- Git graphs (`gitGraph`)
- User journey diagrams (`journey`)
- Requirement diagrams (`requirementDiagram`)
- C4 diagrams (`C4Context`, etc.)
- Timeline diagrams (`timeline`)
- Mind maps (`mindmap`)
- And more...

## Themes

| Theme | Description |
|-------|-------------|
| `default` | Light theme (default) |
| `dark` | Dark theme |
| `forest` | Green-toned theme |
| `neutral` | Neutral gray theme |

## FAQ

**Q: Why does the first request take several seconds?**
A: Puppeteer needs to launch a Chromium instance on the first request. Subsequent requests reuse the browser pool.

**Q: What is the maximum input size?**
A: 50,000 characters of Mermaid code. Larger inputs return a 400 error.

**Q: Can I use this for production workloads?**
A: Yes — the service includes a managed browser pool, input validation, and proper error handling. Scale MAX_CONCURRENT for higher throughput.

## License

MIT
