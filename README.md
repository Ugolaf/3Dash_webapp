# 3Dash

A 3D floorplan dashboard for [Home Assistant](https://www.home-assistant.io/). Load your own 3D model, map it to your smart home entities, and control everything from an interactive view in your browser.

## Features

- **3D floorplan** -- load a custom `.glb` model of your home and navigate it freely
- **Light control** -- toggle, dim, and color-pick lights directly from the 3D scene (supports on/off, dimmable, RGB, RGBW, and IR remote types); one light can be drawn as several parts (e.g. two garden lamps driven by one entity)
- **Roller shutters** -- animated covers on your windows, with open/close/stop control and sun-shadow blocking
- **Multiple floors** -- one model per floor, linked by clickable staircases
- **Exterior overview** -- a 3/4 aerial view of the whole house (roof, garden) to control outdoor shutters and lights; a top bar jumps to any floor
- **Climate** -- wall-mounted split AC units; click one to set its mode, target temperature, fan speed and swing; while running it blows animated warm (heat) or cold (cool) air
- **Room temperature** -- a floating label per room bound to an HA temperature sensor (optional humidity), colored from cold blue to hot red with a matching glow on the floor; click it for the history graph and a shortcut to the room's climate unit
- **Cameras** -- place dome cameras in the scene and open their live Home Assistant feed
- **Alarm mode** -- the whole scene blinks red while a chosen Home Assistant alarm entity is triggered
- **Wall displays** -- render live sensor data (temperature, humidity, energy, etc.) on surfaces inside the model
- **Network tubes** -- animated tubes that visualize real-time network throughput
- **Sun and weather** -- sun position tracks your real location; optional rain/snow particle effects
- **Side panel** -- configurable cards for scripts, indicators, and graphs
- **Config editor** -- define floors, lights, shutters, displays, cameras, climate units, room sensors, staircases, shadow walls, and tubes from a built-in UI
- **Onboarding wizard** -- guided setup for first-time users
- **Backup / restore** -- export and import your full configuration as a ZIP
- **Demo mode** -- explore the dashboard without a Home Assistant instance
- **PWA** -- installable as a progressive web app with offline support
- **Dark and light themes**

## Tech stack

React, TypeScript, Babylon.js, Vite, Home Assistant WebSocket API.

## Getting started

### Option 1 -- GitHub hosted version

Use the hosted version directly at **https://ugolaf.github.io/3Dash_webapp/**.

No installation required. Your Home Assistant instance must be accessible over HTTPS for the WebSocket connection to work from the hosted page.

### Option 2 -- Home Assistant add-on

The easiest way to self-host. Runs on the same machine as your Home Assistant instance.

[![Add repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fugolaf%2F3Dash_webapp)

Or manually:

1. In Home Assistant, go to **Settings > Add-ons > Add-on Store**.
2. Open the overflow menu and select **Repositories**.
3. Add `https://github.com/ugolaf/3Dash_webapp`.
4. Install **3Dash** from the store and start it.
5. Open `http://<your-ha-ip>:8099` in your browser.

> When running behind HTTPS, the add-on automatically uses `wss://` for the WebSocket connection. If you use a self-signed certificate, your browser must trust it for the connection to work.

### Option 3 -- Self-host on any machine

For advanced users who want to build and serve 3Dash themselves.

```bash
git clone https://github.com/ugolaf/3Dash_webapp.git
cd 3Dash_webapp
npm ci
npm run build
```

Serve the `dist/` directory with any static file server (Nginx, Caddy, etc.). For development with hot reload, use `npm run dev` instead.

## Configuration

All configuration happens in the browser -- no config files to edit manually.

| What | Where |
|---|---|
| Home Assistant URL, port, and token | Onboarding wizard or Settings |
| Location (for sun tracking) | Onboarding wizard or Settings |
| Theme, rendering, camera | Settings modal |
| Alarm entity | Settings > Connection |
| Floors, exterior overview, and their models | Config editor (floor bar) |
| Lights, shutters, displays, cameras, climate units, room sensors, staircases, shadow walls, tubes | Config editor |

Configuration is persisted in `localStorage`. The 3D models (one per floor) are stored in `IndexedDB`.

### Floors and exterior overview

In the config editor, the floor bar at the top of the sidebar manages floors:

- **+** adds a floor, **⬆** uploads its `.glb` model, **✎** renames it, **×** deletes it.
- **⌂** adds the exterior overview: upload a model of the whole house (roof, garden) and place outdoor shutters and lights on it like on any floor. It opens in a 3/4 aerial view and is listed first.

On the dashboard, the bar at the top switches between the overview and each floor; staircases placed on a floor also switch floors when clicked. A shutter configured on both a floor and the overview with the same entity ID stays in sync.

**Several lamps, one entity:** in the light form, enable **Shape > Multi-part** and use **+ Add Part** for each lamp, then size the **Hitbox** so it covers all of them (the parts themselves are not clickable). If the lamps are separate Home Assistant entities, group them first with a Home Assistant *light group* helper and configure the group.

## Project structure

```
src/
  babylon/       3D scene, model loading, lights, displays, tubes, sun, weather
  components/    React UI (HUD, modals, side panel, cards, forms, guided tour)
  pages/         Dashboard, config editor, onboarding
  services/      HA WebSocket client, config/settings persistence, storage
  contexts/      React contexts (demo mode, camera, theme)
  types/         TypeScript type definitions
  utils/         Color conversion and floor helpers
public/          Static assets (default 3D model, fonts, icons, PWA manifests)
3dash-addon/     Home Assistant add-on (Dockerfile, nginx config, run script)
```

## License

This project is provided as-is. See the repository for license details.
