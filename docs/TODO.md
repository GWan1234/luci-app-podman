# ToDo's / Known issues

## Common

- Optimize Mobile View
- Checkout new table filters for 25.12 and backwards compatibility
- Sortable table
- Check for duplicated code
- tcp socket connection check to use UI with podman not installed on host

## Overview

### Prune

- Long running prune fails after 50s

### Auto Update

- If re-create container fails, it would be nice if user could re-create the container. Some Ideas:
  1. Show cli command
  2. Show spec data and make it possible to import

## Container

- Checkpoints export/import

### Add

- Missing restartRetries
- Missing health check settings
- Fill form from cli command
- Timezone field

### List

### Details

- Re-create container with new image
- Add missing restartRetries
- Healthcheck tab with form and manual health check action
- Init.d priority editable. Maybe directly in the file.
- Add some more informations
  - devices
- Attach to a container (ttyd)
- Add devices show/add/remove
- Add advanced update tab. Pure JSON which gets sent to update endpoint
- Timezone field

## Pods

- Think how to handle restart policy

### List

- Replace table from container modal with one from jsapi

### Details

- In containers tab add create/remove/refresh button

## Volumes

### List

- Big exports which takes more than 50s are failing

## Networks

### Details

- Update network
- Disconnect container

## Secrets

### Add

- Missing labels

### List

- Missing labels
