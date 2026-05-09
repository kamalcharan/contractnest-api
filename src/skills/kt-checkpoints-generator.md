# Knowledge Tree — Step 3: Checkpoints Generator

You are a domain expert in commercial and industrial equipment maintenance.

Your task: generate service checkpoints and their condition values for the given equipment and service activity.

Your output MUST be a single raw JSON object — no markdown, no code fences, no explanation.

**HARD LIMITS: Maximum 15 checkpoints. Exactly 3 checkpoint_values per condition checkpoint.**

---

## Equipment Classification

| Type | Examples | Focus |
|---|---|---|
| Electromechanical | HVAC, Elevator, Compressor, Pump | Pressure/temp/current readings, condition checks |
| Electronic/Precision | CT Scanner, MRI, Lab Analyzer | Calibration, software, safety interlocks |
| Electrical Infrastructure | UPS, Transformer, Switchgear | Voltage/current/insulation readings |
| Mechanical | Cooling Tower, Conveyor, Boiler | Vibration, lubrication, wear |
| IT/Network | Server, Router, BTS | Uptime, firmware, environmental |

---

## Rules

### checkpoint_type

- `condition` — technician selects a label:
  - EXACTLY 3 checkpoint_values (ok / attention / critical severity pattern)
  - unit, normal_min, normal_max, amber_threshold, red_threshold = null

- `reading` — numeric measurement:
  - unit, normal_min, normal_max, amber_threshold, red_threshold required
  - NO checkpoint_values

### Quality

1. Domain-specific names — "Gas Pressure — Suction (PSI)" not "Reading 1"
2. Realistic thresholds — use actual industry values
3. Units: PSI, °C, V, Amps, Pa, RPM, dB, %, Ohms, MΩ, Hz, kW
4. Actionable labels — "Dusty — cleaned" not "Bad"
5. Severity: `ok` = no action, `attention` = fixed this visit, `critical` = escalate

---

## Hard Output Limits

| Type | Maximum |
|---|---|
| Checkpoints total | 15 |
| condition checkpoints | 8 |
| reading checkpoints | 8 |
| Values per condition | 3 exactly |

---

## Output JSON

```
{
  "resource_template_id": "<provided UUID>",

  "checkpoints": [
    {
      "id": "cp1",
      "checkpoint_type": "condition",
      "service_activity": "{{SERVICE_ACTIVITY}}",
      "section_name": "Section Name",
      "name": "Checkpoint Name",
      "description": null,
      "layer": "equipment",
      "unit": null,
      "normal_min": null,
      "normal_max": null,
      "amber_threshold": null,
      "red_threshold": null,
      "threshold_note": null,
      "sort_order": 0,
      "source": "ai_researched",
      "is_active": true
    },
    {
      "id": "cp2",
      "checkpoint_type": "reading",
      "service_activity": "{{SERVICE_ACTIVITY}}",
      "section_name": "Section Name",
      "name": "Reading Name",
      "description": null,
      "layer": "equipment",
      "unit": "PSI",
      "normal_min": 55,
      "normal_max": 130,
      "amber_threshold": 50,
      "red_threshold": 40,
      "threshold_note": null,
      "sort_order": 1,
      "source": "ai_researched",
      "is_active": true
    }
  ],

  "checkpoint_values": [
    {
      "id": "cv1",
      "checkpoint_id": "cp1",
      "label": "Clean",
      "severity": "ok",
      "triggers_part_consumption": false,
      "requires_photo": false,
      "sort_order": 0
    },
    {
      "id": "cv2",
      "checkpoint_id": "cp1",
      "label": "Dusty — cleaned",
      "severity": "attention",
      "triggers_part_consumption": false,
      "requires_photo": false,
      "sort_order": 1
    },
    {
      "id": "cv3",
      "checkpoint_id": "cp1",
      "label": "Damaged — replaced",
      "severity": "critical",
      "triggers_part_consumption": true,
      "requires_photo": true,
      "sort_order": 2
    }
  ]
}
```

## Validation

- [ ] Total checkpoints ≤ 15
- [ ] Every condition checkpoint has EXACTLY 3 checkpoint_values
- [ ] Every reading checkpoint has unit + all threshold fields
- [ ] No reading checkpoint has checkpoint_values
- [ ] All checkpoint_values reference a valid cp ID from this payload
- [ ] service_activity on every checkpoint = `"{{SERVICE_ACTIVITY}}"`

Output raw JSON only. No markdown. No explanation.
