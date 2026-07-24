# PulseAI Analytics Platform

Analytics platform built with Next.js and Claude Agent SDK that processes trading analytics queries using an autonomous AI agent with MCP (Model Context Protocol) tool calling architecture.

## Architecture

### Frontend (Next.js)
- **Web Interface**: React-based chat interface for interactive analytics
- **Real-time Chat**: Streaming responses from the AI agent
- **Show Thinking Panel**: Collapsible panel displaying detailed AI reasoning

### Backend Agent System
- **TradeLab Agent**: Autonomous analytical AI system using Claude Agent SDK
- **MCP Server**: Custom Model Context Protocol server with specialized tools
- **Database Integration**: DuckDB metric store

### Claude Agent SDK Integration
- **Streaming Queries**: Real-time response processing
- **Tool Calling**: Structured tool execution with MCP
- **Thinking Tags**: Detailed reasoning captured separately from final answers

## Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- DuckDB
- Python 3 (for chart generation)

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env.local
# Configure your Claude API credentials
```

3. **Setup database:**
```bash
npm run build-db
```

4. **Start development server:**
```bash
npm run dev
```

## Usage

### Web Interface
Access the web application at `http://localhost:3000/chat`

### Example Queries
- "Show me the top 10 users by trading volume"
- "Calculate win rates for all active traders"
- "Create a chart showing trading patterns"

## Features

### AI-Powered Analytics
- **Natural Language Processing**: Understands trading analytics queries
- **Schema-Aware**: Automatically maps queries to database structure
- **Multi-format Output**: CSV, JSON, Python scripts, and visualizations
- **Image Generation**: Chart creation with matplotlib/seaborn
- **Show Thinking**: Detailed reasoning display in collapsible panel

### Tool Ecosystem
- **Schema Retrieval**: Database schema and documentation
- **SQL Generation**: Query creation and optimization
- **Data Execution**: CSV and JSON output formats
- **Python Integration**: Script generation and execution
- **Image Generation**: Chart creation saved to `public/output/`

### Web Features
- **Real-time Chat**: Streaming responses with tool execution visibility
- **Image Rendering**: Automatic detection and display of generated charts
- **Thinking Panel**: Full AI reasoning separate from final answers
- **Responsive Design**: Mobile-friendly interface

## File Structure

```
src/
├── app/
│   ├── api/chat/           # Chat API endpoint
│   ├── chat/               # Chat interface
│   └── components/         # React components
├── lib/
│   ├── tools/              # MCP tool implementations
│   ├── imageUtils.ts       # Image detection utilities
│   └── prompts.ts          # Agent prompts
└── types/
    └── claude-agent-sdk.d.ts

agent/
└── tradelab_agent.ts       # Main agent implementation

mcp_servers/
└── tradelab_mcp_server.ts  # MCP server configuration

db/
└── metric_store.duckdb     # DuckDB database

public/
└── output/                 # Generated charts and images

script/
└── build_db.js             # Database build script
```
### Database Setup
```bash
npm run build-db    # Build from source data
```

## Agent Pipeline

The TradeLab Agent follows this analytical pipeline:

1. **Intent Identification**: Parse user query and determine requirements
2. **Schema Retrieval**: Fetch database schema and documentation
3. **SQL Generation**: Create optimized queries based on schema mapping
4. **Execution Decision**: Choose between CSV or JSON output format
5. **Query Execution**: Run SQL and capture results
6. **Post-processing**: Generate Python scripts for complex analysis
7. **Final Delivery**: Present findings with evidence

## MCP Tools

### Core Tools
- `getSchema`: Database schema and documentation retrieval
- `sql_query_writer`: SQL query file generation
- `sql_query_executor`: Execute queries, return CSV
- `json_sql_query_executor`: Execute queries, return JSON
- `python_script_writer`: Generate Python analysis scripts
- `python_script_executor`: Execute Python scripts with data

## API Endpoints

- `POST /api/chat` - Process analytics queries with streaming responses

## Development

### Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build-db` - Rebuild database

### Tech Stack
- **Frontend**: Next.js, React, TypeScript
- **Backend**: Node.js, DuckDB
- **AI**: Claude Agent SDK, Anthropic Claude
- **Styling**: Tailwind CSS with Neo Blue Pro theme
- **Database**: DuckDB
- **Charts**: Python matplotlib/seaborn

## Image Generation

Python scripts automatically save charts to `public/output/` directory:
- Uses `os.getcwd()` for project root detection
- Creates timestamped filenames: `chart_<timestamp>.png`
- Frontend automatically detects and displays latest images

## PDF Generation (Single Source of Truth)

PDF reports produced by the Anthropic PDF skill are stored exclusively in `public/generated_pdfs/`.

Rationale:
- Eliminates duplicate storage (previously copied to both `public/generated_pdfs/` and `public/output/`).
- Simplifies frontend logic: all PDF URLs resolve as `/generated_pdfs/<filename>.pdf`.
- Reduces maintenance and disk usage.

Frontend detection looks for message lines containing:
```
File: <name>.pdf
Location: public/generated_pdfs/<name>.pdf
```
and builds the served URL by stripping the leading `public/`.

Legacy messages referencing `public/output/` are automatically remapped to the new directory.

If you migrate older stored PDFs, move them into `public/generated_pdfs/` and update any hard-coded references.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request