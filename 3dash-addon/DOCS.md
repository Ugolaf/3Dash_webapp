# 3Dash -- Documentation

## Getting started

Once the add-on is installed and running, open 3Dash in your browser at:

```
http://<your-ha-ip>:8099
```

Replace `<your-ha-ip>` with the IP address of your Home Assistant machine (e.g. `http://192.168.1.100:8099`).

The onboarding wizard will guide you through the initial setup:

1. Enter your Home Assistant URL and port (default: `8123`).
2. Provide a **long-lived access token** (create one in your HA profile under **Security > Long-lived access tokens**).
3. Set your location (latitude/longitude) for accurate sun positioning.
4. Upload a `.glb` 3D model of your home.

The default port is `8099`. You can change it in **Settings > Add-ons > 3Dash > Configuration**.

## Configuration

All configuration happens in the browser -- no files to edit manually.

| What | Where |
|---|---|
| Home Assistant connection | Onboarding wizard or Settings |
| Location (for sun tracking) | Onboarding wizard or Settings |
| Theme, rendering, camera | Settings modal |
| Alarm entity | Settings > Connection |
| Floors, exterior overview, and their models | Config editor (floor bar) |
| Lights, shutters, displays, cameras, climate units, staircases, shadow walls, tubes | Config editor |

## Floors and exterior overview

Each floor has its own `.glb` model. In the config editor, the floor bar adds (**+**), uploads a model for (**⬆**), renames (**✎**) or deletes (**×**) a floor. The **⌂** button adds an exterior overview: a model of the whole house, roof and garden on which you place outdoor shutters and lights. On the dashboard, the bar at the top switches between the overview and each floor.

To drive several lamps from one click, enable **Multi-part** in the light form and add a part per lamp, then size the hitbox to cover them. Separate Home Assistant entities must first be grouped with a *light group* helper.

## SSL / HTTPS

When running behind HTTPS, the add-on automatically uses `wss://` for the WebSocket connection. If you use a self-signed certificate, your browser must trust it for the connection to work.

## Backup and restore

You can export your full configuration (floors, entities, settings, and every floor's 3D model) as a ZIP file from the settings panel. Use this to back up your setup or transfer it to another instance.

## Support

For issues and feature requests, visit the [GitHub repository](https://github.com/ugolaf/3Dash_webapp).
