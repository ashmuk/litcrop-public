# ADR-20260317: Device Communication Protocol

## Status
Accepted

## Context
LitCrop camera nodes need to upload images and metadata to the cloud backend. For the PoC, the "camera node" is a simulated CLI script, but the communication protocol chosen now will carry forward to real hardware (Raspberry Pi + LTE) at MVP.

Requirements:
- Upload JPEG images (max 2MB) with metadata
- 10-minute capture interval (configurable)
- Must work over LTE connectivity
- Must handle intermittent connectivity gracefully
- Simple enough for a shell script or Node.js CLI to implement

### Decision Drivers
- Simplicity: PoC uses a simulated script; protocol must be trivially implementable
- Reliability: Must detect and retry failed uploads
- Cost: LTE data usage and cloud service costs
- Future path: Must support real hardware without protocol change
- Standard: Prefer well-understood protocols

## Options Considered

### Option A: HTTPS POST (multipart/form-data)
- **Description**: Standard HTTP upload to the REST API endpoint. Each image is a single POST request with multipart form data.
- **Pros**:
  - Universal; works from any language or CLI tool (curl, wget, fetch)
  - No special client libraries required
  - Works through any firewall/proxy
  - Standard HTTP status codes for success/failure
  - TLS encryption in transit
  - API Gateway handles HTTPS termination
- **Cons**:
  - No built-in delivery guarantee (application must handle retries)
  - Each upload is independent; no session or connection reuse
  - Not optimized for constrained devices (full HTTP overhead per request)
- **Effort**: Low

### Option B: AWS IoT Core (MQTT)
- **Description**: Use MQTT protocol via AWS IoT Core for device-to-cloud communication.
- **Pros**:
  - Purpose-built for IoT devices
  - Persistent connections; low overhead per message
  - Built-in device authentication (X.509 certificates)
  - QoS levels for delivery guarantee
  - Device shadow for state management
- **Cons**:
  - Significant complexity for PoC (certificate provisioning, IoT policies, rules engine)
  - MQTT message size limit is 128KB; images require chunking or S3 presigned URL pattern
  - IoT Core has a cost per message ($1/million messages)
  - Overkill for a simulated script
  - Learning curve for MQTT and IoT Core
- **Effort**: High

### Option C: S3 Presigned Upload URLs
- **Description**: Device requests a presigned URL from the API, then uploads directly to S3.
- **Pros**:
  - Offloads upload bandwidth from Lambda/API Gateway
  - Larger file support (no API Gateway payload limit concern)
  - S3 handles the heavy lifting
- **Cons**:
  - Two-step process: request URL, then upload
  - More complex client implementation
  - Metadata must be sent separately or via S3 object metadata headers
  - S3 event notification needed to trigger metadata storage
  - Over-engineering for 2MB files at PoC scale
- **Effort**: Medium

## Decision
We choose **Option A: HTTPS POST (multipart/form-data)** for the PoC.

The simulated camera node will be a Node.js CLI script that:
1. Reads a JPEG file from a sample images directory
2. Sends `POST /api/v1/plots/{plotId}/images` with multipart form data
3. Includes metadata: `captured_at`, `node_id`, optional `metadata` JSON
4. Retries with exponential backoff on failure (FR-5.4)
5. Logs success/failure for each upload

## Consequences

### Positive
- Simplest possible implementation; can prototype in an afternoon
- Uses the same REST API as the dashboard; no separate infrastructure
- Works from anywhere with HTTPS connectivity
- Standard curl commands for manual testing
- Zero additional AWS service costs

### Negative / Risks
- No built-in delivery guarantee; retry logic is application-level
- HTTP overhead per request (headers, TLS handshake) — irrelevant at 10-min intervals
- No device management capabilities (no remote configuration, no OTA updates)

### Mitigations
- Exponential backoff retry logic in the upload script (max 3 retries)
- Local queue/buffer if connectivity is lost (write to disk, retry on reconnect)
- At MVP, evaluate migrating to IoT Core MQTT if device management needs arise

### Rollback Plan
- Protocol is standard HTTPS; can switch to any alternative without backend changes
- The REST API endpoint remains regardless of client protocol
- IoT Core MQTT can be added alongside HTTPS (both can coexist)

## References
- Vision.md: "Start with simple HTTPS-based uploads"
- REQUIREMENTS.md: FR-2.x (upload contract), FR-5.x (simulated camera node)
- PLANS.md: "Device Communication Protocol" ADR candidate
