# 3Dash

A 3D floorplan dashboard for Home Assistant. Load your own 3D model, map it to your smart home entities, and control everything from an interactive view in your browser.

## How to access

Once the add-on is running, open 3Dash in your browser at:

```
http://<your-ha-ip>:8099
```

Replace `<your-ha-ip>` with the IP address of your Home Assistant machine (e.g. `http://192.168.1.100:8099`).

Your browser may show a certificate warning on first visit -- this is normal (self-signed SSL). Accept it to proceed.

## Features

- 3D floorplan with custom `.glb` models
- Light control (on/off, dimmable, RGB, RGBW, IR remote)
- Roller shutters with open/close/stop control
- Multiple floors linked by staircases, plus an exterior overview (roof, garden, outdoor shutters and lights)
- Climate units (split AC) with mode, temperature, fan and swing control and animated airflow
- Room temperature labels from HA sensors, color-coded by comfort, with history graph
- Dome cameras with live Home Assistant feeds
- Alarm mode (scene blinks red while the alarm is triggered)
- Wall displays with live sensor data
- Animated network throughput tubes
- Real-time sun positioning and weather effects
- Configurable side panel with scripts, indicators, and graphs
- Built-in config editor and onboarding wizard
- Backup and restore
- Dark and light themes
