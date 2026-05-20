# FSM Verilog Designer UI

Frontend for the FSM editor, analysis view and generated Verilog preview.

## Run

```bash
npm install
npm run dev
```

By default the app calls `http://localhost:8000`. Override it with:

```bash
cp .env.example .env
```

Then set:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

## Quality Checks

```bash
npm run lint
npm run build
```

## Current Direction

- Normalized client-side FSM model in `src/lib/fsmModel.js`
- Zustand store with controlled mutations in `src/store/fsmStore.js`
- Form-first editing flow instead of `prompt()` interactions
- Client-side validation before backend requests
