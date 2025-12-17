# API Reference

Base URL: `http://localhost:5000/api`

## Upload

### POST /upload
Upload and process a PDF file.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `file` (PDF file)

**Response:**
```json
{
  "success": true,
  "load": {
    "_id": "...",
    "carrier_id": {...},
    "load_number": "...",
    ...
  },
  "message": "PDF processed and load created successfully"
}
```

## Loads

### GET /loads
Get all loads with optional filters.

**Query Parameters:**
- `carrier_id`: Filter by carrier ID
- `driver_id`: Filter by driver ID
- `cancelled`: Filter by cancelled status (true/false)
- `confirmed`: Filter by confirmed status (true/false)

**Response:**
```json
[
  {
    "_id": "...",
    "carrier_id": {...},
    "driver_id": {...},
    "load_number": "...",
    "carrier_pay": 1000,
    "pickup_date": "2024-01-15",
    "delivery_date": "2024-01-20",
    "pickup_city": "New York",
    "pickup_state": "NY",
    "delivery_city": "Los Angeles",
    "delivery_state": "CA",
    "cancelled": false,
    "confirmed": true,
    "date_conflict_ids": []
  }
]
```

### GET /loads/grouped
Get loads grouped by carrier.

**Response:**
```json
[
  {
    "carrier": {
      "_id": "...",
      "name": "Carrier Name",
      "aliases": []
    },
    "loads": [...]
  }
]
```

### GET /loads/:id
Get a specific load by ID.

### PUT /loads/:id
Update a load.

**Request Body:**
```json
{
  "load_number": "...",
  "carrier_pay": 1000,
  "pickup_date": "2024-01-15",
  "delivery_date": "2024-01-20",
  ...
}
```

### PATCH /loads/:id/cancel
Cancel or uncancel a load.

**Request Body:**
```json
{
  "cancelled": true
}
```

### PATCH /loads/:id/confirm
Confirm a load (required for loads with date conflicts).

### DELETE /loads/:id
Delete a load.

### GET /loads/:id/conflicts
Get list of loads that conflict with this load.

## Carriers

### GET /carriers
Get all carriers.

### GET /carriers/:id
Get a specific carrier.

### POST /carriers
Create a new carrier.

**Request Body:**
```json
{
  "name": "Carrier Name",
  "aliases": ["Alias 1", "Alias 2"]
}
```

### PUT /carriers/:id
Update a carrier.

### DELETE /carriers/:id
Delete a carrier.

## Drivers

### GET /drivers
Get all drivers.

### GET /drivers/:id
Get a specific driver.

### POST /drivers
Create a new driver.

**Request Body:**
```json
{
  "name": "Driver Name",
  "carrier_id": "...",
  "aliases": []
}
```

### PUT /drivers/:id
Update a driver.

### DELETE /drivers/:id
Delete a driver.

## Rules

### GET /rules
Get all invoice rules.

### GET /rules/:id
Get a specific rule.

### POST /rules
Create a new rule.

**Request Body:**
```json
{
  "rule_name": "Rule Name",
  "earliest_pickup_date": "2024-01-01",
  "latest_delivery_date": "2024-12-31",
  "carrier_id": "..." // optional
}
```

### PUT /rules/:id
Update a rule.

### DELETE /rules/:id
Delete a rule.

## Invoices

### GET /invoices
Get all generated invoices.

### GET /invoices/:id
Get a specific invoice.

### GET /invoices/:id/pdf
Download invoice PDF file.

### POST /invoices/generate
Generate a new invoice.

**Request Body:**
```json
{
  "load_ids": ["...", "..."], // OR
  "rule_id": "...", // Use rule to filter loads
  "includeUnconfirmed": false,
  "invoiceData": {
    "invoiceNumber": "INV-001",
    "billToName": "...",
    "payableToName": "...",
    ...
  }
}
```

**Response:**
```json
{
  "success": true,
  "invoice": {
    "_id": "...",
    "invoice_number": "INV-001",
    "load_ids": [...],
    "pdf_path": "/app/invoices/INV-001.pdf"
  },
  "message": "Invoice generated successfully"
}
```

## Health Check

### GET /health
Check if the backend is running.

**Response:**
```json
{
  "status": "ok",
  "message": "Backend is running"
}
```

