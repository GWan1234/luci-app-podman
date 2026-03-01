# Sub-Plan: Chunk 2 — Session Expiry Handling

## Problem

Expired sessions return a JSON-RPC error:
```json
{"jsonrpc":"2.0","id":8,"error":{"code":-32002,"message":"Access denied"}}
```

Currently `catchError` in `Model.js` only shows a notification. It does not detect auth errors or redirect to the login page. Additionally, `inspect` calls in all models have no `.catch` at all — so an auth error during inspect silently crashes the calling code.

---

## Open Question: How does LuCI's `rpc.declare` deliver the auth error?

Before implementing, verify which path the error takes:

- **Path A (rejection)**: LuCI rejects the promise → error lands in `.catch()` as `err.message = "Access denied"`.
- **Path B (null result)**: LuCI swallows the error and returns `null`/default value (from `expect`) → `checkResponse` receives a falsy/empty response, no rejection.

**How to verify**: Temporarily add `console.log(err)` in `catchError` and trigger a session-expired RPC call, or check the LuCI `rpc.js` source on the router.

If Path B, `checkResponse` also needs an auth check. Both paths are covered in the steps below.

---

## Steps

### Step 1 — Update `catchError` in `Model.js`

Add auth detection **before** the notification logic. Inline the check (no `this.` dependency) to avoid binding issues since `catchError` is passed as an unbound reference in `.catch(this.catchError)`.

```javascript
catchError: function (err) {
    const msg = err?.message || String(err);
    if (msg.includes('Access denied')) {
        window.location.href = L.url('admin');
        return;
    }
    ui.hideModal();
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    podmanUI.timeNotification(msg, 'error');
},
```

All existing action methods (`.catch(this.catchError)`) automatically get auth redirect for free.

---

### Step 2 — Update `checkResponse` in `Model.js` (covers Path B)

If LuCI returns a null/empty response instead of rejecting, `checkResponse` is the safety net:

```javascript
checkResponse: async function (response) {
    if (!response) {
        // Likely an auth error swallowed by rpc.declare — redirect
        window.location.href = L.url('admin');
        return;
    }
    if (response.response && response.response !== 200) {
        ui.hideModal();
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        podmanUI.timeNotification(response.message, 'error');
        throw new Error(response.message);
    }
    return response;
},
```

> **Note**: Only add the `!response` guard if testing confirms Path B occurs. Otherwise it may incorrectly redirect on valid empty responses (e.g. list calls returning empty arrays).

---

### Step 3 — Add `catchAuth` helper to `Model.js`

For `inspect` calls we cannot use `catchError` (it swallows the error and returns `undefined`, which crashes callers that read the return value). Instead, `catchAuth` redirects on auth errors and **re-throws** everything else so callers still get the error:

```javascript
catchAuth: function (err) {
    const msg = err?.message || String(err);
    if (msg.includes('Access denied')) {
        window.location.href = L.url('admin');
        return;
    }
    throw err;
},
```

---

### Step 4 — Apply `catchAuth` to all `inspect` calls in models

Each model's `inspect` (and `inspectManifest`) currently has no `.catch`. Add `catchAuth`:

| Model | Method | Change |
|---|---|---|
| `Container` | `inspect` | `.catch(this.catchAuth)` |
| `Image` | `inspect` | `.catch(this.catchAuth)` |
| `Image` | `inspectManifest` | `.catch(this.catchAuth)` |
| `Network` | `inspect` | `.catch(this.catchAuth)` |
| `Volume` | `inspect` | `.catch(this.catchAuth)` |
| `Secret` | `inspect` | `.catch(this.catchAuth)` |

---

### Step 5 — Re-enable inspect error handling in `TableSelectSection`

The `.catch` on `item.inspect()` in `handleInspect` is currently commented out. Once `inspect` calls have `catchAuth` on the model side, re-enable a proper catch in `TableSelectSection.handleInspect`:

```javascript
handleInspect: function (item, hiddenFields) {
    podmanUI.showSpinningModal(_('Fetching information...'), _('Loading details'));

    item.inspect()
        .then((data) => {
            ui.hideModal();
            this.showInspectModal(data, hiddenFields);
        })
        .catch((err) => {
            ui.hideModal();
            podmanUI.errorNotification(_('Failed to inspect: %s').format(err.message));
        });
},
```

Auth errors are handled inside `inspect()` itself via `catchAuth` (redirect happens there). The `.catch` in `handleInspect` only fires for non-auth errors.

---

## Implementation Order

1. Step 3 — add `catchAuth` to `Model.js`
2. Step 1 — update `catchError` in `Model.js`
3. Step 4 — add `.catch(this.catchAuth)` to all inspect calls in models
4. Step 5 — re-enable catch in `TableSelectSection.handleInspect`
5. Step 2 — add `checkResponse` null guard **only after** testing confirms Path B occurs

---

## Files to Change

- `htdocs/luci-static/resources/podman/model/Model.js`
- `htdocs/luci-static/resources/podman/model/Container.js`
- `htdocs/luci-static/resources/podman/model/Image.js`
- `htdocs/luci-static/resources/podman/model/Network.js`
- `htdocs/luci-static/resources/podman/model/Volume.js`
- `htdocs/luci-static/resources/podman/model/Secret.js`
- `htdocs/luci-static/resources/podman/TableSelectSection.js`
