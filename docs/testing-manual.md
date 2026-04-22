# Manual UI Testing Plan

## 0. Authentication

- [x] **0.1** Navigate to `http://<router>/cgi-bin/luci` → Redirected to login page
- [x] **0.2** Submit correct credentials → Redirected to LuCI dashboard
- [x] **0.3** Navigate to `/admin/podman` → Overview page loads without re-auth
- [x] **0.4** Open browser Console tab → No JS errors

---

## 1. Overview (`/admin/podman`)

- [x] **1.1** Load overview → Page loads; all counters visible (0 is fine)
- [x] **1.2** Podman version string visible → Not empty, not "undefined"
- [ ] **1.3** System status indicator visible → Shows running (socket available)
- [x] **1.4** Note all current counts → Baseline for comparison after later steps

---

## 2. Images (`/admin/podman/images`)

- [x] **2.1** Load images list → Page loads (may be empty)
- [x] **2.2** Click "Pull Image" → Form/modal appears with name input
- [x] **2.3** Submit empty form → Validation error, no request sent
- [x] **2.4** Pull nonexistent image (e.g. `this-does-not-exist:fake`) → Error notification shown, list unchanged
- [x] **2.5** Pull `alpine:latest` → Progress indicator → success notification → `alpine` appears in list
- [ ] **2.6** Pull `alpine:latest` again (already exists) → Graceful result (no crash, may show "already up to date")
- [x] **2.7** Click inspect on `alpine` → Modal opens with JSON image data
- [x] **2.8** Return to overview → Image count incremented by 1

---

## 3. Containers (`/admin/podman/containers`)

*Requires `alpine:latest` from step 2.5.*

### 3a. Create

- [x] **3.1** Load containers list → Page loads (may be empty)
- [x] **3.2** Click "Create Container" → Form modal opens
- [x] **3.3** Submit empty form → Validation errors on required fields
- [x] **3.4** Fill name: `test-alpine`, image: `alpine:latest`, no other changes → Submit → Container created; `test-alpine` visible in list
- [x] **3.5** Return to overview → Container count incremented

### 3b. List operations

- [x] **3.6** Verify `test-alpine` row shows correct Name, Image, State
- [x] **3.7** Select `test-alpine` checkbox → Only that row selected
- [x] **3.8** Click top "select all" checkbox → All rows selected
- [x] **3.9** Click top checkbox again → All deselected

### 3c. Start / Stop / Restart

- [x] **3.10** If container is stopped: select → Start → State changes to `Running`; success notification
- [x] **3.11** Select running container → Stop → State changes to `Exited`; success notification
- [x] **3.12** Select stopped container → Restart → State changes to `Running`

### 3d. Detail view — Info tab

- [ ] **3.13** Click `test-alpine` name link → Navigates to container detail page
- [ ] **3.14** Name, image, state displayed → Matches list view
- [ ] **3.15** Edit container name to `test-alpine-renamed` → Save → Name updated; notification shown
- [ ] **3.16** Change restart policy to `always` → Save → Policy updated; success notification
- [ ] **3.17** Init script auto-generated → Auto-start indicator shows enabled
- [ ] **3.18** Click "Show Init Script" → Modal with script content; script references `test-alpine-renamed`
- [ ] **3.19** Toggle init script disabled → Indicator changes
- [ ] **3.20** Toggle init script enabled again → Indicator reverts
- [ ] **3.21** Change restart policy to `no` → Save → Init script removed/disabled
- [ ] **3.22** Navigate back to list → Name shown as `test-alpine-renamed`

### 3e. Detail view — Resources tab

- [ ] **3.23** Click Resources tab → Tab activates; current limits shown
- [ ] **3.24** Set CPU limit to `0.5` → Save → After page reload, Resources tab is active (tab persistence)
- [ ] **3.25** Set Memory limit to `64m` → Save → Value persisted
- [ ] **3.26** Enter invalid CPU value (e.g. `abc`) → Save → Validation error; no save

### 3f. Detail view — Stats tab

- [ ] **3.27** Start container (if stopped)
- [ ] **3.28** Click Stats tab → CPU%, Memory, Net I/O data appears
- [ ] **3.29** Stop container; click Stats tab → Graceful empty/zero state, no JS crash

### 3g. Detail view — Logs tab

- [ ] **3.30** Click Logs tab → Log output area visible (may be empty for alpine)
- [ ] **3.31** Change line count to `50` → Apply → Fetches last 50 lines
- [ ] **3.32** Enable live streaming toggle → Toggle activates
- [ ] **3.33** Disable live streaming → Streaming stops, toggle off
- [ ] **3.34** Click Clear → Log area clears

### 3h. Detail view — Processes tab

- [ ] **3.35** Start container; click Processes tab → Process table appears
- [ ] **3.36** Stop container; click Processes tab → Graceful empty/error state, no JS crash

### 3i. Network management (on detail page)

- [ ] **3.37** Note current networks attached → Baseline
- [ ] **3.38** Disconnect default network → Network removed from list
- [ ] **3.39** Reconnect the network → Network added back
- [ ] **3.40** Connect a network with valid static IP → Network added with IP shown
- [ ] **3.41** Connect a network with invalid IP → Validation error

---

## 4. Volumes (`/admin/podman/volumes`)

- [ ] **4.1** Load volumes list → Page loads (may be empty)
- [ ] **4.2** Click "Create Volume" → Form appears
- [ ] **4.3** Submit empty form → Validation error (name required)
- [ ] **4.4** Create volume named `test-vol` → Appears in list with name, driver, created date
- [ ] **4.5** Click inspect on `test-vol` → JSON modal shows volume data
- [ ] **4.6** Return to overview → Volume count incremented
- [ ] **4.7** Select `test-vol` → Delete → Confirmation modal → confirm → removed from list
- [ ] **4.8** Create volume `test-vol-prune` and leave it → Used in prune test (step 8.2)

---

## 5. Networks (`/admin/podman/networks`)

- [ ] **5.1** Load networks list → Default `podman` network visible
- [ ] **5.2** Note OpenWrt column for default network → Status icon shown
- [ ] **5.3** Click "Create Network" → Form opens
- [ ] **5.4** Submit empty form → Validation error
- [ ] **5.5** Create `test-net`, subnet `10.220.0.0/24`, gateway `10.220.0.1`, OpenWrt integration checked → Network created; OpenWrt column shows `✓`
- [ ] **5.6** Verify UCI config created → SSH: `uci show network.test_net` returns values
- [ ] **5.7** Create `test-net-bare` with no subnet, integration unchecked → Network created; OpenWrt column shows `—`
- [ ] **5.8** If any network shows `⚠` (incomplete integration): click it → Confirmation modal → setup → icon changes to `✓`
- [ ] **5.9** Return to overview → Network count incremented
- [ ] **5.10** Select `test-net` → Delete → Confirmation mentions OpenWrt cleanup → confirm → network removed; UCI config removed
- [ ] **5.11** Select `test-net-bare` → Delete → Removed cleanly (no UCI to clean up)

---

## 6. Secrets (`/admin/podman/secrets`)

- [ ] **6.1** Load secrets list → Page loads (may be empty)
- [ ] **6.2** Click "Create Secret" → Form with name + value fields
- [ ] **6.3** Submit empty form → Validation error
- [ ] **6.4** Create secret name `test-secret`, value `hunter2` → Appears in list; value NOT shown anywhere
- [ ] **6.5** Click inspect on `test-secret` → Modal shows metadata; `SecretData` field hidden
- [ ] **6.6** Return to overview → Secret count incremented
- [ ] **6.7** Delete `test-secret` → Removed from list

---

## 7. Pods (`/admin/podman/pods`)

- [ ] **7.1** Load pods list → Page loads
- [ ] **7.2** Create a pod (if form available) → Pod appears in list
- [ ] **7.3** Start pod → State changes to running
- [ ] **7.4** Stop pod → State changes to stopped
- [ ] **7.5** Delete pod → Removed from list

---

## 8. Modals

### Prune Modal

- [ ] **8.1** Open prune modal → Options shown: containers, images, volumes, networks
- [ ] **8.2** Select only "Volumes" → Prune → Only unused volumes pruned (e.g. `test-vol-prune` from step 4.8); containers/images untouched
- [ ] **8.3** Select "Containers" → Prune → Only stopped/exited containers removed

### Auto-Update Modal

- [ ] **8.4** Open auto-update modal → Container list shown with current digest info
- [ ] **8.5** Click "Check for Updates" → Digest comparison runs; up-to-date containers marked
- [ ] **8.6** If outdated container detected → Update → Pulls new image, recreates container

---

## 9. Error Handling

- [ ] **9.1** Stop Podman socket (`/etc/init.d/podman stop`), load any list view → Clear RPC error message; no JS crash, no blank page
- [ ] **9.2** Navigate to `/admin/podman/container/nonexistent-id` → Graceful error, not a blank page
- [ ] **9.3** Start Podman again (`/etc/init.d/podman start`); reload → Normal operation resumes
- [ ] **9.4** Trigger two operations quickly in succession → No race-condition crash or duplicate requests

---

## 10. Cleanup Verification

- [ ] **10.1** Delete any remaining test containers (e.g. `test-alpine-renamed`)
- [ ] **10.2** Delete `alpine` image
- [ ] **10.3** Containers list → Empty (or back to pre-test state)
- [ ] **10.4** Images list → Empty (or back to pre-test state)
- [ ] **10.5** Overview counters → Match baseline from step 1.4
