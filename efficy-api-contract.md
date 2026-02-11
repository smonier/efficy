# Efficy Integration API Contract

## Scope
This contract defines how the Jahia JavaScript module (`efficy-components`) must communicate with the OSGi backend module (`efficy-service`) for all Efficy CRM operations.

Frontend clients must never call Efficy directly.

## Base URL
All backend endpoints are exposed under:

`/modules/efficy-service/api/v1`

If Jahia runs behind a context path, prepend `window.contextJsParameters.contextPath`.

## Endpoints

### 1. Health
- `GET /health`
- Purpose: runtime readiness check.
- Response: `{"status":"UP"}`

### 2. Domain endpoint for demandes list
- `GET /me/demandes?pageSize={n}`
- Purpose: retrieve demandes for the currently logged Jahia user.
- Constraints:
  - `pageSize`: positive integer, capped by backend config `efficy.max_page_size`
- Behavior:
  - Backend resolves the Jahia logged user email (`j:email`)
  - Backend resolves the Efficy person by `PerMail`
  - Backend retrieves demandes by that person `PerID` (`DmdPerID`)
- Response shape: Efficy JSON payload (passthrough)

### 2b. Domain endpoint for current Efficy person
- `GET /me/person`
- Purpose: resolve the current logged Jahia user to their Efficy `Person` record.
- Behavior:
  - Backend resolves Jahia `j:email`
  - Looks up `Person` by `PerMail`
- Response shape: Efficy JSON payload (passthrough, restricted to `PerID`)

### 3. Generic Efficy proxy endpoints
- `GET|POST|PUT|DELETE /advanced/{efficyPath}`
- `GET|POST|PUT|DELETE /base/{efficyPath}`
- `GET|POST|PUT|DELETE /service/{efficyPath}`

Where:
- `advanced` maps to `efficy.advanced_resource`
- `base` maps to `efficy.base_resource`
- `service` maps to `efficy.service_resource`

These endpoints provide full coverage for legacy calls while keeping auth and routing centralized server-side.

## Legacy-to-new mapping

### Legacy helper mapping
- Legacy `apiGet(path, false)` -> `GET /advanced/{path}`
- Legacy `apiPost(path, body, false)` -> `POST /advanced/{path}`
- Legacy `apiPut(path, body, false)` -> `PUT /advanced/{path}`
- Legacy `apiGet(path, true)` -> `GET /base/{path}`
- Legacy `apiPost(path, body, true)` -> `POST /base/{path}`
- Legacy `apiPut(path, body, true)` -> `PUT /base/{path}`
- Legacy `apiGetService(path)` -> `GET /service/{path}`
- Legacy `apiPostService(path, body)` -> `POST /service/{path}`

### Known legacy Efficy operations (reimplemented through routes above)
- `Person`:
  - lookup by email
  - read by id
  - update fields
  - attach document
  - list enterprise members
- `Demande`:
  - list by logged user email -> `PerMail` -> `PerID` -> `DmdPerID`
  - read by id
  - create demande
  - update attachments
- `Qualification` / `QualificationLabel`
- `Actor`
- `Attachment` and `service/attachments`
- `Document`
- `Enterprise`
- `FAQ`, `FAQHeaderTagCode`, `Tag`
- `Opportunity`
- `service/referential_for`

## Authentication strategy
- Default: backend uses configured static token (`efficy.token`) and injects `Authorization` header toward Efficy.
- Optional: if `efficy.forward_client_authorization=true`, backend can forward client-provided `Authorization`.
- Frontend credentials are never embedded in JS bundle.

## Error handling strategy
- Upstream non-2xx responses are preserved (status + body) to maintain debugging fidelity.
- Backend validation errors return 4xx JSON: `{"error":"..."}`.
- Efficy transport failures return 502 JSON.
- Unexpected backend failures return 500 JSON.

## Security controls
- Route whitelist restricted to `/modules/efficy-service/api/*`.
- Path sanitization rejects `..` traversal patterns.
- Allowed HTTP methods are constrained.
- Request timeout is configurable (`connect/read timeout`).
- User email propagation is explicit via `X-User-Email` header when available.
