# Plan: Image Update & Auth Issues

## Chunk 1 — Debug `updateImage` in Container model

**Problem**: `updateImage` pulls the image but does not recreate the container.

**Flow to investigate**:
```
getImage() → image.update() [pull] → stop() → remove() → ContainerRPC.recreate(getCreateCommandString())
```

**Things to check**:
- Does `getCreateCommandString()` return a valid value? It reads `Config.CreateCommand` from the inspect data — if the container was loaded from the list (not inspect), this field may be missing/empty.
- Does the backend `container_recreate` RPC method work correctly with the create command string?
- Is `checkResponse` swallowing an error silently somewhere in the chain?

**Plan**:
1. Read backend `container_recreate` implementation in `podman.uc`
2. Verify `getCreateCommandString()` has data (may require calling `inspect()` first)
3. Fix accordingly — likely need to inspect before recreate if `Config` is not populated

---

## Chunk 2 — Session expiry handling for RPC calls

**Problem**: Expired sessions return `{"code":-32002,"message":"Access denied"}` from the JSON-RPC layer. Currently `catchError` in `Model.js` just shows a notification — it does not detect auth errors and redirect to login.

**Note**: `_stream` uses `fetch`, not RPC — auth for streams is already handled in `podman.uc` controller. This chunk only concerns the `rpc.declare` call path.

**Plan**:
1. Update `catchError` in `model/Model.js` to detect auth errors (code `-32002` or message `"Access denied"`) and redirect to login page (`window.location.href = L.url('admin')`)
2. Add `.catch(this.catchError)` to `inspect` calls in all models — previously omitted to avoid silent crashes, but now safe since `catchError` will properly redirect on auth errors and surface other errors via notification
   - `Container.inspect`
   - `Image.inspect`, `Image.inspectManifest`
   - `Network.inspect`
   - `Volume.inspect`
   - `Secret.inspect`

---

## Chunk 3 — Stream image pull (large)

**Problem**: Image pulls time out after ~20 seconds if the download takes longer. The current RPC call is a blocking one-shot request.

**Note**: This is the most complex chunk. Depends on Chunk 1 being resolved first since `updateImage` uses pull internally.

**Plan**:

### Backend
- Add a new streaming endpoint in `podman.uc` for image pull (similar to the existing `stream/logs`, `stream/top`, `stream/stats` endpoints)
- Endpoint streams pull progress JSON lines from Podman API back to the client

### Frontend
- Add `streamPull(imageName, onChunk)` method to `Image` model using the same `_stream` pattern from `Container`
- Show live pull progress in a modal (progress lines streamed to the UI)
- Update `Image.update()` to use the streaming pull instead of the blocking RPC call

### updateImage flow change
- `updateImage` in `Container` calls `image.update()` — once `update()` is streaming, the stop/remove/recreate steps should only run after the stream completes successfully
- Need a way for the streaming pull to signal completion/failure back to the caller
