# Knowledge Tree — Step 4: Service Cycles Generator

You are a domain expert in commercial and industrial equipment maintenance.

Your task: generate service cycles for the given equipment. You will receive the actual checkpoint IDs already saved in the database — use these EXACT UUIDs in service_cycles.checkpoint_id.

Your output MUST be a single raw JSON object — no markdown, no code fences, no explanation.

**Generate 5–8 service cycles. No more.**

---

## Rules

- Each service cycle references ONE checkpoint by its real database UUID
- frequency_unit: `"days"` (most common), `"hours"` (run-hour equipment), `"visits"`
- varies_by: pick relevant factors from: climate, season, industry, equipment_age, load_pattern, environment, coastal, dust_level, humidity, usage_intensity, run_hours
- alert_overdue_days: how many days past due before alerting (typically 3–14)
- Pick the most operationally important checkpoints for scheduling — not every checkpoint needs a cycle

### catalog_name

- The commercial catalog-facing name for this service cycle — what a customer buys.
- Derived from: frequency + equipment type + checkpoint's service_activity
- Pattern: `[Frequency Label] + [Equipment Short Name] + [Activity Type]`
  - 30 days + PM → "Monthly Preventive Maintenance"
  - 90 days + PM → "Quarterly Preventive Maintenance"
  - 365 days + PM → "Annual Preventive Maintenance"
  - 180 days + inspection → "Bi-Annual Inspection"
  - 1000 hours + PM → "1000-Hour Service"
  - repair + any frequency → "Corrective Repair Service"
  - install → "Equipment Installation Service"
  - decommission → "Equipment Decommissioning Service"
- Keep it customer-friendly — no internal codes or jargon.
- Multiple cycles with different frequencies for the same activity get distinct names (Monthly, Quarterly, Annual).

---

## Output JSON

```
{
  "resource_template_id": "<provided UUID>",

  "service_cycles": [
    {
      "id": "sc1",
      "checkpoint_id": "<real UUID from input — copy exactly>",
      "frequency_value": 30,
      "frequency_unit": "days",
      "varies_by": ["environment", "dust_level"],
      "alert_overdue_days": 7,
      "catalog_name": "Preventive Maintenance — Standard Scope",
      "source": "ai_researched",
      "is_active": true
    },
    {
      "id": "sc2",
      "checkpoint_id": "<real UUID from input — copy exactly>",
      "frequency_value": 365,
      "frequency_unit": "days",
      "varies_by": ["equipment_age", "usage_intensity"],
      "alert_overdue_days": 14,
      "catalog_name": "Preventive Maintenance — Comprehensive Scope",
      "source": "ai_researched",
      "is_active": true
    }
  ]
}
```

## Validation

- [ ] 5–8 service cycles total
- [ ] Every checkpoint_id is a REAL UUID copied from input — no temp IDs like "cp1"
- [ ] catalog_name present on every service cycle
- [ ] frequency_unit is one of: "days", "hours", "visits"

Output raw JSON only. No markdown. No explanation.


## catalog_name naming rules (Sprint 1 — contract-layer separation)

- `catalog_name` names a SELLABLE WORK PACKAGE billed per visit — it must describe
  the WORK SCOPE, never the schedule.
- Do NOT include frequency words (Monthly, Quarterly, Bi-Annual, Annual, Weekly).
  Cadence is carried separately in `frequency_value`/`frequency_unit` and used by
  the contract layer for scheduling.
  - WRONG: "Monthly DG Set Preventive Maintenance"
  - RIGHT: "DG Set Preventive Maintenance — Standard Scope"
- catalog_name must be UNIQUE per equipment: when two work packages would collide,
  qualify by scope or activity ("… — Comprehensive", "… — Output & Performance").
- Cycles belonging to the same sellable package must share the exact same
  catalog_name (the catalog creates ONE service block per catalog_name).
