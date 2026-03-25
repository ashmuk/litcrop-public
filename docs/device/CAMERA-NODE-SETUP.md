# Camera Node Setup Guide (LitCrop MVP+)

> Date: 2026-03-22
> Hardware: Raspberry Pi Zero 2 W + Camera Module 3 + RPZ-PowerMGR
> Spec: `docs/device/MVP-CAMERA-NODE-SPEC.md`
> Script: `scripts/camera-node/capture.sh`

---

## Prerequisites

- Raspberry Pi Zero 2 W (assembled with Camera Module 3 and RPZ-PowerMGR)
- microSD card (64GB recommended)
- Wi-Fi network (2.4GHz) accessible from deployment location
- A computer with SD card reader for initial setup
- LitCrop app account with a farm and at least one bed created

---

## 1. Flash Raspberry Pi OS

1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
2. Select **Raspberry Pi OS Lite (64-bit)** — no desktop needed
3. Click the gear icon to pre-configure:
   - **Hostname**: `litcrop-cam-01`
   - **Enable SSH**: Yes (use password authentication)
   - **Username/Password**: `litcrop` / (your choice)
   - **Wi-Fi**: Enter your 2.4GHz network SSID and password
   - **Locale**: Set timezone to `Asia/Tokyo` (or your local timezone)
4. Flash to SD card
5. Insert SD card into Pi, power on, wait ~2 minutes for first boot

### Verify connectivity

```bash
# From your computer (same Wi-Fi network)
ping litcrop-cam-01.local

# SSH in
ssh litcrop@litcrop-cam-01.local
```

---

## 2. Enable Camera

Camera is enabled by default on Raspberry Pi OS Bookworm (2023+). No `raspi-config` step needed.

Verify the camera is detected:

```bash
# On the Pi via SSH
rpicam-hello --list-cameras
# Expected: Available cameras: 1
# If you see "Available cameras: 0" — check the ribbon cable connection and re-seat both ends.
```

Test capture:

```bash
# Test capture (saves to test.jpg)
rpicam-still --output test.jpg --width 1920 --height 1080 --nopreview --immediate
ls -la test.jpg   # Should show ~300-500KB JPEG
```

If `rpicam-still` is not found, install it:

```bash
sudo apt update && sudo apt install -y rpicam-apps-lite
```

---

## 3. Install LitCrop on the Pi

### Quick install (recommended)

From your dev machine, copy the installer to the Pi and run it:

```bash
# From your dev machine (in the litcrop repo root)
scp -r scripts/camera-node litcrop@litcrop-cam-01.local:/tmp/litcrop-install

# SSH into the Pi
ssh litcrop@litcrop-cam-01.local

# Run the installer
cd /tmp/litcrop-install
sudo bash install.sh
```

The install script will:
- Create `/opt/litcrop/`, `/etc/litcrop/`, `/var/spool/litcrop/`
- Install `capture.sh` and `refresh-token.sh`
- Create config from template (if not exists)
- Install `curl` if missing
- Check camera detection
- Optionally set up systemd timer for scheduled capture
- Optionally set up token refresh cron

### Manual install (if you prefer)

```bash
# On the Pi
sudo mkdir -p /opt/litcrop /etc/litcrop /var/spool/litcrop
sudo cp /tmp/litcrop-install/capture.sh /opt/litcrop/capture.sh
sudo cp /tmp/litcrop-install/refresh-token.sh /opt/litcrop/refresh-token.sh
sudo chmod +x /opt/litcrop/capture.sh /opt/litcrop/refresh-token.sh
sudo cp /tmp/litcrop-install/node.conf.example /etc/litcrop/node.conf
sudo apt install -y curl
```

---

## 4. Get Auth Token

The LitCrop API requires a Cognito JWT. For MVP+, we use a pre-provisioned token from an existing user account.

### Install AWS CLI (required for token commands)

Run this on **your dev machine** (not the Pi) if the AWS CLI is not already installed:

```bash
# macOS (Homebrew)
brew install awscli

# Debian/Ubuntu (including Raspberry Pi OS if running commands on the Pi)
sudo apt install -y awscli

# Set the region (ap-northeast-1 for LitCrop)
aws configure set region ap-northeast-1
```

### Get token via AWS CLI

```bash
# On your dev machine (not the Pi)
aws cognito-idp initiate-auth \
  --client-id <COGNITO_CLIENT_ID> \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=<email>,PASSWORD=<password> \
  --region ap-northeast-1 \
  --query 'AuthenticationResult.IdToken' \
  --output text
```

> **Why IdToken, not AccessToken?** The API Gateway JWT authorizer validates the `aud` (audience) claim,
> which is only present in the **ID token**. Access tokens from Cognito do not include `aud` and will be
> rejected with HTTP 401. Both tokens expire after 1 hour; the refresh script below handles renewal.

Replace `<COGNITO_CLIENT_ID>` with the app client ID from the CDK stack outputs, and `<email>`/`<password>` with a valid LitCrop user account (e.g., Kiku the farm manager).

### Get token via browser (alternative)

1. Log in to LitCrop in your browser
2. Open DevTools → Application → Local Storage
3. Find the **ID token** (key contains `idToken`, not `accessToken`)
4. Copy the token value

### Token lifetime

- ID tokens expire after **1 hour** (Cognito default)
- For the field evaluation (~2 weeks), you'll need to refresh the token periodically
- **Automated refresh**: The installer optionally sets this up for you via `scripts/camera-node/refresh-token.sh`.

  The script reads `REFRESH_TOKEN` and `COGNITO_CLIENT_ID` from `/etc/litcrop/node.conf` — set them there,
  not in the script itself. To set up manually:

  1. Add to `/etc/litcrop/node.conf`:
     ```
     REFRESH_TOKEN="<your-cognito-refresh-token>"
     COGNITO_CLIENT_ID="<cognito-app-client-id>"
     ```
  2. Ensure the config file is protected: `sudo chmod 600 /etc/litcrop/node.conf`
  3. Add to cron (refresh every 50 minutes, before the 60-minute expiry):

```bash
# On the Pi
sudo crontab -e
# Add:
*/50 * * * * /opt/litcrop/refresh-token.sh
```

> **Note**: For BETA, this should be replaced with a proper service account (Cognito machine-to-machine client credentials). See MVP-CAMERA-NODE-SPEC.md §6.6.

---

## 5. Configure

Edit `/etc/litcrop/node.conf` on the Pi:

```bash
sudo nano /etc/litcrop/node.conf
```

Required values to set:

```bash
NODE_ID="field-01-camera-01"          # Unique name for this camera
BED_ID="<bed-uuid>"                    # From LitCrop app (see below)
API_BASE_URL="<YOUR_API_URL>"          # Find in CDK stack outputs or CloudFormation console
AUTH_TOKEN="<jwt-token>"               # From Step 4
```

### Finding the bed UUID

1. Open LitCrop in your browser
2. Navigate to your farm → Crops → Layout view
3. Tap the bed you want this camera to monitor
4. The URL will show `?id=<bed-uuid>` — copy that UUID

---

## 6. Test

Run a single capture + upload:

```bash
sudo /opt/litcrop/capture.sh
```

Check the log:

```bash
cat /var/log/litcrop-node.log
```

Expected output:

```
[2026-04-01T06:00:00+09:00] [START] node=field-01-camera-01 bed=<uuid> trigger=scheduled
[2026-04-01T06:00:00+09:00] [CAPTURE] 1920x1080 q75 → field-01-camera-01_2026-04-01T06-00-00+09-00.jpg
[2026-04-01T06:00:02+09:00] [CAPTURE] OK — 412345 bytes
[2026-04-01T06:00:02+09:00] [UPLOAD] Attempt 1/3 → https://...
[2026-04-01T06:00:03+09:00] [UPLOAD] OK — HTTP 201
```

Verify in the LitCrop app: the image should appear in the bed's image timeline within seconds.

---

## 7. Set Up Scheduled Capture

### Option A: Cron (simple, always-on Pi)

```bash
sudo crontab -e
# Add (captures every 10 minutes, 5am–8pm JST):
*/10 5-20 * * * /opt/litcrop/capture.sh >> /var/log/litcrop-node.log 2>&1
```

### Option B: RPZ-PowerMGR (battery-powered, wake/sleep)

If using RPZ-PowerMGR for battery operation, configure the wake timer:

```bash
# Set RPZ-PowerMGR to wake every 10 minutes
# Refer to: https://www.indoorcorgielec.com/resources/raspberry-pi/rpz-powermgr-battery-camera/

# Add to /etc/rc.local (runs on each boot):
/opt/litcrop/capture.sh
sudo shutdown -h now   # Power off after capture (RPZ-PowerMGR handles next wake)
```

### Option C: Systemd timer (recommended for always-on)

```bash
# /etc/systemd/system/litcrop-capture.service
sudo tee /etc/systemd/system/litcrop-capture.service << 'EOF'
[Unit]
Description=LitCrop Camera Capture
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/litcrop/capture.sh
User=root
EOF

# /etc/systemd/system/litcrop-capture.timer
sudo tee /etc/systemd/system/litcrop-capture.timer << 'EOF'
[Unit]
Description=LitCrop Capture Timer (every 10 minutes)

[Timer]
OnCalendar=*:0/10
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable litcrop-capture.timer
sudo systemctl start litcrop-capture.timer

# Check status
systemctl status litcrop-capture.timer
```

---

## 8. Field Deployment Checklist

Before leaving the camera in the field:

- [ ] Camera test capture works (`rpicam-still --output test.jpg`)
- [ ] Upload test succeeds (`/opt/litcrop/capture.sh` shows HTTP 201)
- [ ] Image appears in LitCrop app (bed detail page)
- [ ] Scheduled capture is running (cron/systemd/RPZ-PowerMGR)
- [ ] Token refresh is configured (cron every 50 minutes)
- [ ] Wi-Fi signal is stable at deployment location (test with `iwconfig`)
- [ ] Battery is charged (if using RPZ-PowerMGR)
- [ ] Enclosure is sealed (IP65, silica gel packets inside)
- [ ] Camera angle captures the target bed area
- [ ] Log file is being written (`tail -f /var/log/litcrop-node.log`)

---

## Troubleshooting

### Camera not detected

```bash
# Check if camera is connected
rpicam-hello --list-cameras
# Should show: Available cameras: 1
# If empty: check ribbon cable connection, re-seat both ends
```

### Upload fails with HTTP 401

Token expired. Run the refresh script:

```bash
sudo /opt/litcrop/refresh-token.sh
# Then retry
sudo /opt/litcrop/capture.sh
```

### Upload fails with HTTP 404

Wrong `BED_ID`. Verify the bed exists in the LitCrop app and copy the UUID from the URL.

### Upload fails — network timeout

Check Wi-Fi connectivity:

```bash
iwconfig wlan0        # Check signal strength
ping -c 3 google.com  # Check internet access
```

If signal is weak, consider a USB Wi-Fi antenna with better range.

### Images are too dark / too bright

Adjust camera settings in `capture.sh`. Add to the `rpicam-still` command:

```bash
--ev 1.0              # Exposure compensation (+1 brighter, -1 darker)
--awb auto            # Auto white balance
--shutter 10000       # Manual shutter speed (microseconds)
```

### Spool directory filling up

If uploads consistently fail, the spool directory will accumulate images. Check and clean:

```bash
ls -la /var/spool/litcrop/    # List queued files
du -sh /var/spool/litcrop/    # Check total size
# To clear old files (older than 7 days):
find /var/spool/litcrop/ -name "*.jpg" -mtime +7 -delete
```

---

## Quick Reference

| Item | Value |
|------|-------|
| Script | `/opt/litcrop/capture.sh` |
| Config | `/etc/litcrop/node.conf` |
| Config template | `scripts/camera-node/node.conf.example` |
| Log | `/var/log/litcrop-node.log` |
| Spool | `/var/spool/litcrop/` |
| API endpoint | `POST /api/v1/beds/{bedId}/images` |
| Max image size | 2MB |
| Default interval | 10 minutes |
| Token refresh | Every 50 minutes via cron |

---

> Generated 2026-03-22 | See also: docs/device/MVP-CAMERA-NODE-SPEC.md (hardware spec)
