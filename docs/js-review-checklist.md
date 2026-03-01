# JS File Review Checklist

## 1. Method & Property Ordering

Order within `extend({...})`:

1. `__init__` (if present)
2. `load` (if present)
3. `render` (if present)
4. Lifecycle methods (`onTabActive`, `onTabInactive`, etc.)
5. Action handlers (`startStream`, `stopStream`, etc.)
6. Render helpers (`renderLogToolbar`, `renderStatsTable`, etc.)
7. Utility methods (`trimLogOutput`, `formatElapsedTime`, etc.)

## 2. Unused Requires

Remove any `'require X'` where `X` is never referenced in the file.

Common offenders found across this codebase:
- `baseclass` — rarely referenced directly
- `dom` — only needed if `dom.content`, `dom.find`, etc. are called
- `ui` — only needed if `ui.showModal`, `ui.addNotification`, etc. are called
- `podmanRPC` — only needed if RPC calls are made
- `podmanForm` / `podmanStream` — only if used

## 3. DOM Element Caching

Do not call `document.querySelector` / `document.getElementById` repeatedly for the same element.

- Cache element references as instance properties (`this.logViewer`, `this.tableContent`, etc.)
- Set them during `render` or in the relevant render helper
- Use the cached reference everywhere else

**Example — bad:**
```javascript
startStream: function () {
    document.querySelector('#log-lines input').disabled = true;
    // ...
},
stopStream: function () {
    document.querySelector('#log-lines input').disabled = false;
    // ...
},
```

**Example — good:**
```javascript
renderLogToolbar: function () {
    const linesField = new podmanUI.Numberfield(...).render();
    this.logLinesInput = linesField.querySelector('input');
    // ...
},
startStream: function () {
    this.logLinesInput.disabled = true;
    // ...
},
```

## 4. Modern JS

- `element.setAttribute('disabled', 'disabled')` → `element.disabled = true`
- `element.removeAttribute('disabled')` → `element.disabled = false`
- `value <= 9 ? '0' : '' + value` → `String(value).padStart(2, '0')`
- Quoted object keys only when necessary: `{ 'style': ... }` → `{ style: ... }`
- Use `const` / `let`, arrow functions for callbacks, `function` for lifecycle methods

## 5. Null Guards

Remove checks that can never be false given the surrounding context:

- Closure-captured DOM references are always valid within the callback scope
- `dom.content(element, value)` already handles null elements safely — no pre-check needed

## 6. Naming Conventions

- Methods that return a DOM element: prefix with `render` (e.g. `renderStatsTable`, `renderLogToolbar`)
- Stream handles: `xyzStream` not `xyzStreamHandle` (e.g. `statsStream`, `logsStream`, `processStream`)
- Cached element refs: descriptive, e.g. `this.logViewer`, `this.tableContent`, `this.logLinesInput`

## 7. Duplicated Code

### Repeated querySelector for the same element
→ Cache (see section 3)

### Repeated formatting branches
For a set of `if/else if` chains where only one attribute differs, reduce to a smaller set:

```javascript
// Instead of 5 branches for units y/d/h/m/s:
if (unit === 's' || unit === 'm') {
    result.push(String(value).padStart(2, '0') + unit);
} else {
    result.push(value + unit);
}
```

### Repeated toolbar state updates across start/stop methods
→ Extract `setStreamingState(active)` helper (optional, judgment call for readability)

## 8. Data-Driven Patterns

Replace repeated identical calls with a data structure + loop when the structure is clear:

```javascript
// Instead of 7 identical dom.content calls:
const updates = [
    ['cpu',    stats.CPU.toFixed(2) + '%'],
    ['memory', format.bytes(stats.MemUsage) || '-'],
    // ...
];
for (const [key, value] of updates) {
    dom.content(this.statElements[key], value);
}
```

Only apply when it improves readability — do not compress code just to reduce line count.

## 9. Performance

Flag (do not necessarily fix) patterns that run on every tick/update:

- `textContent.split('\n')` on every incoming log line — consider a line counter to skip when below limit
- `document.querySelector` on every update — fix by caching (see section 3)
- Expensive calculations inside loops that could be extracted — e.g. `100 / titles.length` computed once before a `forEach`

## 10. Variable Aliases

Remove single-use aliases that add no clarity:

```javascript
// Unnecessary:
const titles = ps.Titles;
titles.forEach(...);

// Just use directly:
ps.Titles.forEach(...);
```

Only keep aliases when the variable is used multiple times or the original path is deeply nested.

## Notes

- **Do not remove JSDoc block comments** above `extend({})` — judgment call per file
- **Do not touch `async` on methods** that don't use `await` — skipped intentionally
- `baseclass` may be implicit in the extend chain — verify before removing
