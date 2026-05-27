# Mystica Server

Backend server for the Mystica / 天机阁 fortune-telling app.

## Setup

1. Set environment variable: `ANTHROPIC_API_KEY=your_key_here`
2. Run: `npm install && npm start`

## Endpoints

- `GET /` — health check
- `POST /reading` — proxy to Anthropic API
