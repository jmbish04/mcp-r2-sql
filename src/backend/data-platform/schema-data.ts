/**
 * @fileoverview GENERATED from docs/cslb-schema.json — do not hand-edit table data.
 *
 * Snapshot of the discovered R2 Data Catalog warehouse schema (Phase 0 gate).
 * Regenerate by re-running the introspection (scripts/introspect.ts) and
 * copying the result into docs/cslb-schema.json, then mirroring it here.
 *
 * Used by: the NL->SQL system prompt, the query guard's table validation,
 * the schema-browser endpoints, the vetting tool, and /api/diagnostics.
 */

export interface DiscoveredColumn {
  name: string;
  type: string;
  required: boolean;
}

export interface DiscoveredTable {
  columns: DiscoveredColumn[];
  total_records: number;
  total_data_files: number;
  total_files_size_bytes: number;
  last_operation: string | null;
  last_updated_ms: number | null;
  partition: { name: string; transform: string }[];
  snapshot_count: number;
}

export interface DiscoveredSchema {
  discovered_at: string;
  namespace: string;
  namespaces: string[];
  ingestion_mode: string;
  notes: string[];
  tables: Record<string, DiscoveredTable>;
}

/** The discovered warehouse schema (see docs/cslb-schema.json for provenance). */
export const DISCOVERED_SCHEMA: DiscoveredSchema = {
  "discovered_at": "2026-06-12T16:40:00Z",
  "namespace": "sf_dbi",
  "namespaces": [
    "default",
    "sf_dbi",
    "gold",
    "search"
  ],
  "ingestion_mode": "batch",
  "notes": [
    "IMPORTANT: despite the bucket name, there is NO CSLB master-license table in this warehouse. The closest vetting source is sf_dbi.permit_contractors (firm_name, license1, role, permit linkage).",
    "Contractor/architect/engineer vetting therefore runs against sf_dbi.permit_contractors; role column distinguishes contractor vs architect vs engineer entries.",
    "All sf_dbi tables are day-partitioned on ingested_at.",
    "data_as_of / data_loaded_at are upstream DataSF freshness strings; ingested_at is the local Iceberg load timestamp."
  ],
  "tables": {
    "bp_issuance": {
      "columns": [
        {
          "name": "bpa",
          "type": "string",
          "required": false
        },
        {
          "name": "addenda",
          "type": "string",
          "required": false
        },
        {
          "name": "bpa_addenda",
          "type": "string",
          "required": false
        },
        {
          "name": "permit_type",
          "type": "string",
          "required": false
        },
        {
          "name": "otc_ih",
          "type": "string",
          "required": false
        },
        {
          "name": "status",
          "type": "string",
          "required": false
        },
        {
          "name": "block",
          "type": "string",
          "required": false
        },
        {
          "name": "lot",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number",
          "type": "string",
          "required": false
        },
        {
          "name": "street_name",
          "type": "string",
          "required": false
        },
        {
          "name": "street_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "unit",
          "type": "string",
          "required": false
        },
        {
          "name": "description",
          "type": "string",
          "required": false
        },
        {
          "name": "filed_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "issued_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "issued_status",
          "type": "string",
          "required": false
        },
        {
          "name": "issued_year",
          "type": "string",
          "required": false
        },
        {
          "name": "calendar_days",
          "type": "string",
          "required": false
        },
        {
          "name": "business_days",
          "type": "string",
          "required": false
        },
        {
          "name": "data_as_of",
          "type": "string",
          "required": false
        },
        {
          "name": "data_loaded_at",
          "type": "string",
          "required": false
        },
        {
          "name": "row_hash",
          "type": "string",
          "required": false
        },
        {
          "name": "unique_id",
          "type": "string",
          "required": false
        },
        {
          "name": "fire_only_permit",
          "type": "boolean",
          "required": false
        },
        {
          "name": "unit_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "ingested_at",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "ingest_run_id",
          "type": "string",
          "required": false
        }
      ],
      "total_records": 26654,
      "total_data_files": 2,
      "total_files_size_bytes": 3294013,
      "last_operation": "append",
      "last_updated_ms": 1770634899280,
      "partition": [
        {
          "name": "ingested_at_day",
          "transform": "day"
        }
      ],
      "snapshot_count": 2
    },
    "bp_review": {
      "columns": [
        {
          "name": "primary_key",
          "type": "string",
          "required": false
        },
        {
          "name": "bpa",
          "type": "string",
          "required": false
        },
        {
          "name": "addenda",
          "type": "string",
          "required": false
        },
        {
          "name": "bpa_addenda",
          "type": "string",
          "required": false
        },
        {
          "name": "permit_type",
          "type": "string",
          "required": false
        },
        {
          "name": "block",
          "type": "string",
          "required": false
        },
        {
          "name": "lot",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "street_name",
          "type": "string",
          "required": false
        },
        {
          "name": "street_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "description",
          "type": "string",
          "required": false
        },
        {
          "name": "filed_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "status",
          "type": "string",
          "required": false
        },
        {
          "name": "department",
          "type": "string",
          "required": false
        },
        {
          "name": "station",
          "type": "string",
          "required": false
        },
        {
          "name": "review_type",
          "type": "string",
          "required": false
        },
        {
          "name": "review_number",
          "type": "string",
          "required": false
        },
        {
          "name": "review_results",
          "type": "string",
          "required": false
        },
        {
          "name": "arrive_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "start_year",
          "type": "string",
          "required": false
        },
        {
          "name": "start_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "start_date_source",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "sla_days",
          "type": "string",
          "required": false
        },
        {
          "name": "due_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "finish_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "calendar_days",
          "type": "string",
          "required": false
        },
        {
          "name": "met_cal_sla",
          "type": "boolean",
          "required": false
        },
        {
          "name": "data_as_of",
          "type": "string",
          "required": false
        },
        {
          "name": "data_loaded_at",
          "type": "string",
          "required": false
        },
        {
          "name": "row_hash",
          "type": "string",
          "required": false
        },
        {
          "name": "unique_id",
          "type": "string",
          "required": false
        },
        {
          "name": "fire_only_permit",
          "type": "string",
          "required": false
        },
        {
          "name": "unit",
          "type": "string",
          "required": false
        },
        {
          "name": "unit_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "ingested_at",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "ingest_run_id",
          "type": "string",
          "required": false
        }
      ],
      "total_records": 21644,
      "total_data_files": 1,
      "total_files_size_bytes": 1643280,
      "last_operation": "append",
      "last_updated_ms": 1770631291955,
      "partition": [
        {
          "name": "ingested_at_day",
          "transform": "day"
        }
      ],
      "snapshot_count": 1
    },
    "permit_contractors": {
      "columns": [
        {
          "name": "firm_name",
          "type": "string",
          "required": false
        },
        {
          "name": "firm_address",
          "type": "string",
          "required": false
        },
        {
          "name": "firm_city",
          "type": "string",
          "required": false
        },
        {
          "name": "firm_state",
          "type": "string",
          "required": false
        },
        {
          "name": "firm_zipcode",
          "type": "string",
          "required": false
        },
        {
          "name": "pts_agent_id",
          "type": "string",
          "required": false
        },
        {
          "name": "license1",
          "type": "string",
          "required": false
        },
        {
          "name": "permit_number",
          "type": "string",
          "required": false
        },
        {
          "name": "permit_type",
          "type": "string",
          "required": false
        },
        {
          "name": "permit_type_definition",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number",
          "type": "string",
          "required": false
        },
        {
          "name": "street_name",
          "type": "string",
          "required": false
        },
        {
          "name": "street_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "status",
          "type": "string",
          "required": false
        },
        {
          "name": "description",
          "type": "string",
          "required": false
        },
        {
          "name": "existing_construction_type_description",
          "type": "string",
          "required": false
        },
        {
          "name": "proposed_construction_type_description",
          "type": "string",
          "required": false
        },
        {
          "name": "location",
          "type": "struct<coordinates: list<double>, type: string>",
          "required": false
        },
        {
          "name": "data_as_of",
          "type": "string",
          "required": false
        },
        {
          "name": "data_loaded_at",
          "type": "string",
          "required": false
        },
        {
          "name": "permit_creation_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "status_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "filed_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "issued_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "existing_use",
          "type": "string",
          "required": false
        },
        {
          "name": "proposed_use",
          "type": "string",
          "required": false
        },
        {
          "name": "existing_occupancy",
          "type": "string",
          "required": false
        },
        {
          "name": "proposed_occupancy",
          "type": "string",
          "required": false
        },
        {
          "name": "role",
          "type": "string",
          "required": false
        },
        {
          "name": "row_hash",
          "type": "string",
          "required": false
        },
        {
          "name": "unique_id",
          "type": "string",
          "required": false
        },
        {
          "name": "completed_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "ingested_at",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "ingest_run_id",
          "type": "string",
          "required": false
        }
      ],
      "total_records": 60580,
      "total_data_files": 2,
      "total_files_size_bytes": 7797697,
      "last_operation": "append",
      "last_updated_ms": 1770634966010,
      "partition": [
        {
          "name": "ingested_at_day",
          "transform": "day"
        }
      ],
      "snapshot_count": 2
    },
    "building_inspections": {
      "columns": [
        {
          "name": "reference_number",
          "type": "string",
          "required": false
        },
        {
          "name": "reference_number_type",
          "type": "string",
          "required": false
        },
        {
          "name": "block",
          "type": "string",
          "required": false
        },
        {
          "name": "lot",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number",
          "type": "string",
          "required": false
        },
        {
          "name": "avs_street_name",
          "type": "string",
          "required": false
        },
        {
          "name": "avs_street_sfx",
          "type": "string",
          "required": false
        },
        {
          "name": "bid_district",
          "type": "string",
          "required": false
        },
        {
          "name": "inspector",
          "type": "string",
          "required": false
        },
        {
          "name": "ampm",
          "type": "string",
          "required": false
        },
        {
          "name": "scheduled_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "appointment_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "request_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "request_taken_by",
          "type": "string",
          "required": false
        },
        {
          "name": "request_taken_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "code",
          "type": "string",
          "required": false
        },
        {
          "name": "inspection_description",
          "type": "string",
          "required": false
        },
        {
          "name": "parcel_number",
          "type": "string",
          "required": false
        },
        {
          "name": "eas_baseid",
          "type": "string",
          "required": false
        },
        {
          "name": "point_source",
          "type": "string",
          "required": false
        },
        {
          "name": "zip_code",
          "type": "string",
          "required": false
        },
        {
          "name": "point",
          "type": "struct<coordinates: list<double>, type: string>",
          "required": false
        },
        {
          "name": "supervisor_district",
          "type": "string",
          "required": false
        },
        {
          "name": "analysis_neighborhood",
          "type": "string",
          "required": false
        },
        {
          "name": "data_as_of",
          "type": "string",
          "required": false
        },
        {
          "name": "data_loaded_at",
          "type": "string",
          "required": false
        },
        {
          "name": "row_hash",
          "type": "string",
          "required": false
        },
        {
          "name": "unique_id",
          "type": "string",
          "required": false
        },
        {
          "name": "inspector_district",
          "type": "string",
          "required": false
        },
        {
          "name": "result",
          "type": "string",
          "required": false
        },
        {
          "name": "unit",
          "type": "string",
          "required": false
        },
        {
          "name": "changed_by",
          "type": "string",
          "required": false
        },
        {
          "name": "rescheduled_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "unit_sfx",
          "type": "string",
          "required": false
        },
        {
          "name": "ingested_at",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "ingest_run_id",
          "type": "string",
          "required": false
        }
      ],
      "total_records": 112132,
      "total_data_files": 2,
      "total_files_size_bytes": 9046983,
      "last_operation": "append",
      "last_updated_ms": 1770635046343,
      "partition": [
        {
          "name": "ingested_at_day",
          "transform": "day"
        }
      ],
      "snapshot_count": 2
    },
    "plumbing_inspections": {
      "columns": [
        {
          "name": "reference_number",
          "type": "string",
          "required": false
        },
        {
          "name": "reference_number_type",
          "type": "string",
          "required": false
        },
        {
          "name": "block",
          "type": "string",
          "required": false
        },
        {
          "name": "lot",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number",
          "type": "string",
          "required": false
        },
        {
          "name": "avs_street_name",
          "type": "string",
          "required": false
        },
        {
          "name": "avs_street_sfx",
          "type": "string",
          "required": false
        },
        {
          "name": "pid_district",
          "type": "string",
          "required": false
        },
        {
          "name": "inspector_district",
          "type": "string",
          "required": false
        },
        {
          "name": "inspector",
          "type": "string",
          "required": false
        },
        {
          "name": "ampm",
          "type": "string",
          "required": false
        },
        {
          "name": "scheduled_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "appointment_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "request_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "request_taken_by",
          "type": "string",
          "required": false
        },
        {
          "name": "request_taken_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "code",
          "type": "string",
          "required": false
        },
        {
          "name": "inspection_description",
          "type": "string",
          "required": false
        },
        {
          "name": "result",
          "type": "string",
          "required": false
        },
        {
          "name": "parcel_number",
          "type": "string",
          "required": false
        },
        {
          "name": "eas_baseid",
          "type": "string",
          "required": false
        },
        {
          "name": "point_source",
          "type": "string",
          "required": false
        },
        {
          "name": "zip_code",
          "type": "string",
          "required": false
        },
        {
          "name": "point",
          "type": "struct<coordinates: list<double>, type: string>",
          "required": false
        },
        {
          "name": "supervisor_district",
          "type": "string",
          "required": false
        },
        {
          "name": "analysis_neighborhood",
          "type": "string",
          "required": false
        },
        {
          "name": "data_as_of",
          "type": "string",
          "required": false
        },
        {
          "name": "data_loaded_at",
          "type": "string",
          "required": false
        },
        {
          "name": "row_hash",
          "type": "string",
          "required": false
        },
        {
          "name": "unique_id",
          "type": "string",
          "required": false
        },
        {
          "name": "rescheduled_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "changed_by",
          "type": "string",
          "required": false
        },
        {
          "name": "unit",
          "type": "string",
          "required": false
        },
        {
          "name": "unit_sfx",
          "type": "string",
          "required": false
        },
        {
          "name": "cancelled_by",
          "type": "string",
          "required": false
        },
        {
          "name": "ingested_at",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "ingest_run_id",
          "type": "string",
          "required": false
        }
      ],
      "total_records": 57049,
      "total_data_files": 2,
      "total_files_size_bytes": 4770628,
      "last_operation": "append",
      "last_updated_ms": 1770635087390,
      "partition": [
        {
          "name": "ingested_at_day",
          "transform": "day"
        }
      ],
      "snapshot_count": 2
    },
    "building_permits": {
      "columns": [
        {
          "name": "permit_number",
          "type": "string",
          "required": false
        },
        {
          "name": "permit_type",
          "type": "string",
          "required": false
        },
        {
          "name": "permit_type_definition",
          "type": "string",
          "required": false
        },
        {
          "name": "permit_creation_date",
          "type": "string",
          "required": false
        },
        {
          "name": "block",
          "type": "string",
          "required": false
        },
        {
          "name": "lot",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number",
          "type": "string",
          "required": false
        },
        {
          "name": "street_name",
          "type": "string",
          "required": false
        },
        {
          "name": "street_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "description",
          "type": "string",
          "required": false
        },
        {
          "name": "status",
          "type": "string",
          "required": false
        },
        {
          "name": "status_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "filed_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "issued_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "approved_date",
          "type": "string",
          "required": false
        },
        {
          "name": "number_of_existing_stories",
          "type": "string",
          "required": false
        },
        {
          "name": "number_of_proposed_stories",
          "type": "string",
          "required": false
        },
        {
          "name": "estimated_cost",
          "type": "double",
          "required": false
        },
        {
          "name": "revised_cost",
          "type": "string",
          "required": false
        },
        {
          "name": "existing_use",
          "type": "string",
          "required": false
        },
        {
          "name": "existing_units",
          "type": "string",
          "required": false
        },
        {
          "name": "proposed_use",
          "type": "string",
          "required": false
        },
        {
          "name": "proposed_units",
          "type": "string",
          "required": false
        },
        {
          "name": "plansets",
          "type": "string",
          "required": false
        },
        {
          "name": "existing_occupancy",
          "type": "string",
          "required": false
        },
        {
          "name": "proposed_occupancy",
          "type": "string",
          "required": false
        },
        {
          "name": "existing_construction_type",
          "type": "string",
          "required": false
        },
        {
          "name": "existing_construction_type_description",
          "type": "string",
          "required": false
        },
        {
          "name": "proposed_construction_type",
          "type": "string",
          "required": false
        },
        {
          "name": "proposed_construction_type_description",
          "type": "string",
          "required": false
        },
        {
          "name": "last_permit_activity_date",
          "type": "string",
          "required": false
        },
        {
          "name": "application_submission_method",
          "type": "string",
          "required": false
        },
        {
          "name": "adu",
          "type": "string",
          "required": false
        },
        {
          "name": "primary_address_flag",
          "type": "string",
          "required": false
        },
        {
          "name": "supervisor_district",
          "type": "string",
          "required": false
        },
        {
          "name": "neighborhoods_analysis_boundaries",
          "type": "string",
          "required": false
        },
        {
          "name": "zipcode",
          "type": "string",
          "required": false
        },
        {
          "name": "location",
          "type": "struct<coordinates: list<double>, type: string>",
          "required": false
        },
        {
          "name": "point_source",
          "type": "string",
          "required": false
        },
        {
          "name": "record_id",
          "type": "string",
          "required": false
        },
        {
          "name": "data_as_of",
          "type": "string",
          "required": false
        },
        {
          "name": "data_loaded_at",
          "type": "string",
          "required": false
        },
        {
          "name": "row_hash",
          "type": "string",
          "required": false
        },
        {
          "name": "unique_id",
          "type": "string",
          "required": false
        },
        {
          "name": "fire_only_permit",
          "type": "string",
          "required": false
        },
        {
          "name": "completed_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "reroof",
          "type": "string",
          "required": false
        },
        {
          "name": "structural_notification",
          "type": "string",
          "required": false
        },
        {
          "name": "unit",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "unit_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "first_construction_document_date",
          "type": "string",
          "required": false
        },
        {
          "name": "site_permit",
          "type": "string",
          "required": false
        },
        {
          "name": "category",
          "type": "string",
          "required": false
        },
        {
          "name": "days_to_issue",
          "type": "double",
          "required": false
        },
        {
          "name": "is_high_value",
          "type": "boolean",
          "required": false
        },
        {
          "name": "ingested_at",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "ingest_run_id",
          "type": "string",
          "required": false
        }
      ],
      "total_records": 34119,
      "total_data_files": 2,
      "total_files_size_bytes": 5706090,
      "last_operation": "append",
      "last_updated_ms": 1770635119557,
      "partition": [
        {
          "name": "ingested_at_day",
          "transform": "day"
        }
      ],
      "snapshot_count": 2
    },
    "plumbing_permits": {
      "columns": [
        {
          "name": "permit_number",
          "type": "string",
          "required": false
        },
        {
          "name": "application_date",
          "type": "string",
          "required": false
        },
        {
          "name": "block",
          "type": "string",
          "required": false
        },
        {
          "name": "lot",
          "type": "string",
          "required": false
        },
        {
          "name": "parcel_number",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number",
          "type": "string",
          "required": false
        },
        {
          "name": "street_name",
          "type": "string",
          "required": false
        },
        {
          "name": "street_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "description",
          "type": "string",
          "required": false
        },
        {
          "name": "status",
          "type": "string",
          "required": false
        },
        {
          "name": "filed_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "issued_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "completed_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "neighborhoods_analysis_boundaries",
          "type": "string",
          "required": false
        },
        {
          "name": "supervisor_district",
          "type": "string",
          "required": false
        },
        {
          "name": "zipcode",
          "type": "string",
          "required": false
        },
        {
          "name": "location",
          "type": "struct<coordinates: list<double>, type: string>",
          "required": false
        },
        {
          "name": "point_source",
          "type": "string",
          "required": false
        },
        {
          "name": "data_as_of",
          "type": "string",
          "required": false
        },
        {
          "name": "data_loaded_at",
          "type": "string",
          "required": false
        },
        {
          "name": "row_hash",
          "type": "string",
          "required": false
        },
        {
          "name": "unique_id",
          "type": "string",
          "required": false
        },
        {
          "name": "unit",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "unit_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "cost",
          "type": "double",
          "required": false
        },
        {
          "name": "raw_dates",
          "type": "struct<completed_date: string, filed_date: string, issued_date: string>",
          "required": false
        },
        {
          "name": "permit_type_label",
          "type": "string",
          "required": false
        },
        {
          "name": "tags",
          "type": "list<string>",
          "required": false
        },
        {
          "name": "days_to_issue",
          "type": "double",
          "required": false
        },
        {
          "name": "is_high_value",
          "type": "boolean",
          "required": false
        },
        {
          "name": "ingested_at",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "ingest_run_id",
          "type": "string",
          "required": false
        }
      ],
      "total_records": 19685,
      "total_data_files": 2,
      "total_files_size_bytes": 2118559,
      "last_operation": "append",
      "last_updated_ms": 1770635165261,
      "partition": [
        {
          "name": "ingested_at_day",
          "transform": "day"
        }
      ],
      "snapshot_count": 2
    },
    "electrical_permits": {
      "columns": [
        {
          "name": "permit_number",
          "type": "string",
          "required": false
        },
        {
          "name": "application_creation_date",
          "type": "string",
          "required": false
        },
        {
          "name": "block",
          "type": "string",
          "required": false
        },
        {
          "name": "lot",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number",
          "type": "string",
          "required": false
        },
        {
          "name": "street_name",
          "type": "string",
          "required": false
        },
        {
          "name": "street_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "unit",
          "type": "string",
          "required": false
        },
        {
          "name": "description",
          "type": "string",
          "required": false
        },
        {
          "name": "status",
          "type": "string",
          "required": false
        },
        {
          "name": "filed_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "issued_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "completed_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "permit_valuation",
          "type": "string",
          "required": false
        },
        {
          "name": "neighborhoods_analysis_boundaries",
          "type": "string",
          "required": false
        },
        {
          "name": "supervisor_district",
          "type": "string",
          "required": false
        },
        {
          "name": "zip_code",
          "type": "string",
          "required": false
        },
        {
          "name": "location",
          "type": "struct<coordinates: list<double>, type: string>",
          "required": false
        },
        {
          "name": "point_source",
          "type": "string",
          "required": false
        },
        {
          "name": "data_as_of",
          "type": "string",
          "required": false
        },
        {
          "name": "data_loaded_at",
          "type": "string",
          "required": false
        },
        {
          "name": "row_hash",
          "type": "string",
          "required": false
        },
        {
          "name": "unique_id",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "unit_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "cost",
          "type": "double",
          "required": false
        },
        {
          "name": "permit_type_label",
          "type": "string",
          "required": false
        },
        {
          "name": "tags",
          "type": "list<string>",
          "required": false
        },
        {
          "name": "days_to_issue",
          "type": "double",
          "required": false
        },
        {
          "name": "is_high_value",
          "type": "boolean",
          "required": false
        },
        {
          "name": "ingested_at",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "ingest_run_id",
          "type": "string",
          "required": false
        }
      ],
      "total_records": 20616,
      "total_data_files": 1,
      "total_files_size_bytes": 2274703,
      "last_operation": "append",
      "last_updated_ms": 1770631619520,
      "partition": [
        {
          "name": "ingested_at_day",
          "transform": "day"
        }
      ],
      "snapshot_count": 1
    },
    "complaints": {
      "columns": [
        {
          "name": "complaint_number",
          "type": "string",
          "required": false
        },
        {
          "name": "date_filed",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "closed_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "block",
          "type": "string",
          "required": false
        },
        {
          "name": "lot",
          "type": "string",
          "required": false
        },
        {
          "name": "parcel_number",
          "type": "string",
          "required": false
        },
        {
          "name": "street_number",
          "type": "string",
          "required": false
        },
        {
          "name": "street_name",
          "type": "string",
          "required": false
        },
        {
          "name": "street_suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "zip_code",
          "type": "string",
          "required": false
        },
        {
          "name": "complaint_description",
          "type": "string",
          "required": false
        },
        {
          "name": "status",
          "type": "string",
          "required": false
        },
        {
          "name": "receiving_division",
          "type": "string",
          "required": false
        },
        {
          "name": "assigned_division",
          "type": "string",
          "required": false
        },
        {
          "name": "analysis_neighborhood",
          "type": "string",
          "required": false
        },
        {
          "name": "supervisor_district",
          "type": "string",
          "required": false
        },
        {
          "name": "point",
          "type": "struct<coordinates: list<double>, type: string>",
          "required": false
        },
        {
          "name": "point_source",
          "type": "string",
          "required": false
        },
        {
          "name": "data_as_of",
          "type": "string",
          "required": false
        },
        {
          "name": "data_loaded_at",
          "type": "string",
          "required": false
        },
        {
          "name": "row_hash",
          "type": "string",
          "required": false
        },
        {
          "name": "unique_id",
          "type": "string",
          "required": false
        },
        {
          "name": "date_1st_nov_issued",
          "type": "string",
          "required": false
        },
        {
          "name": "date_final_warning_letter_issued",
          "type": "string",
          "required": false
        },
        {
          "name": "last_inspection_date",
          "type": "string",
          "required": false
        },
        {
          "name": "date_abated",
          "type": "string",
          "required": false
        },
        {
          "name": "nov_type",
          "type": "string",
          "required": false
        },
        {
          "name": "unit",
          "type": "string",
          "required": false
        },
        {
          "name": "director_hearing_date",
          "type": "string",
          "required": false
        },
        {
          "name": "date_referred_to_city_attorney",
          "type": "string",
          "required": false
        },
        {
          "name": "date_2nd_nov_issued",
          "type": "string",
          "required": false
        },
        {
          "name": "is_active",
          "type": "boolean",
          "required": false
        },
        {
          "name": "severity",
          "type": "string",
          "required": false
        },
        {
          "name": "resolution_days",
          "type": "double",
          "required": false
        },
        {
          "name": "is_long_running",
          "type": "boolean",
          "required": false
        },
        {
          "name": "ingested_at",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "ingest_run_id",
          "type": "string",
          "required": false
        }
      ],
      "total_records": 18009,
      "total_data_files": 1,
      "total_files_size_bytes": 2639769,
      "last_operation": "append",
      "last_updated_ms": 1770631651043,
      "partition": [
        {
          "name": "ingested_at_day",
          "transform": "day"
        }
      ],
      "snapshot_count": 1
    },
    "permit_addenda": {
      "columns": [
        {
          "name": "primary_key",
          "type": "string",
          "required": false
        },
        {
          "name": "application_number",
          "type": "string",
          "required": false
        },
        {
          "name": "addenda_number",
          "type": "long",
          "required": false
        },
        {
          "name": "step",
          "type": "long",
          "required": false
        },
        {
          "name": "station",
          "type": "string",
          "required": false
        },
        {
          "name": "arrive",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "assign_date",
          "type": "string",
          "required": false
        },
        {
          "name": "start_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "finish_date",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "approved_date",
          "type": "string",
          "required": false
        },
        {
          "name": "plan_checked_by",
          "type": "string",
          "required": false
        },
        {
          "name": "addenda_status",
          "type": "string",
          "required": false
        },
        {
          "name": "department",
          "type": "string",
          "required": false
        },
        {
          "name": "review_results",
          "type": "string",
          "required": false
        },
        {
          "name": "data_as_of",
          "type": "string",
          "required": false
        },
        {
          "name": "data_loaded_at",
          "type": "string",
          "required": false
        },
        {
          "name": "row_hash",
          "type": "string",
          "required": false
        },
        {
          "name": "unique_id",
          "type": "string",
          "required": false
        },
        {
          "name": "hold_description",
          "type": "string",
          "required": false
        },
        {
          "name": "title",
          "type": "string",
          "required": false
        },
        {
          "name": "in_hold",
          "type": "string",
          "required": false
        },
        {
          "name": "permit_number",
          "type": "string",
          "required": false
        },
        {
          "name": "raw_dates",
          "type": "struct<arrive: string, finish_date: string, start_date: string>",
          "required": false
        },
        {
          "name": "processing_hours",
          "type": "double",
          "required": false
        },
        {
          "name": "is_completed",
          "type": "boolean",
          "required": false
        },
        {
          "name": "is_stuck_addenda",
          "type": "boolean",
          "required": false
        },
        {
          "name": "ingested_at",
          "type": "timestamp",
          "required": false
        },
        {
          "name": "ingest_run_id",
          "type": "string",
          "required": false
        }
      ],
      "total_records": 177451,
      "total_data_files": 1,
      "total_files_size_bytes": 18008350,
      "last_operation": "append",
      "last_updated_ms": 1770635380615,
      "partition": [
        {
          "name": "ingested_at_day",
          "transform": "day"
        }
      ],
      "snapshot_count": 1
    }
  }
};
