import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { createDb } from "./db";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cors from "cors";

// JWT signing secret. ALWAYS set JWT_SECRET in production — the fallback below
// is only there so the dev server still boots on a fresh clone without env vars.
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-123";
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.warn(
    "[security] JWT_SECRET is not set in production. Using the fallback dev secret — " +
    "tokens are guessable. Set JWT_SECRET in your environment."
  );
}

async function startServer() {
  const app = express();
  // Railway / Heroku / Render inject the actual port to listen on via
  // process.env.PORT. Falling back to 3000 keeps local dev working.
  const PORT = parseInt(process.env.PORT || "3000", 10);

  try {
    const db = createDb();

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        display_name TEXT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        department TEXT,
        tl_id INTEGER,
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS form_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT,
        field_type TEXT,
        options TEXT,
        section TEXT,
        required INTEGER DEFAULT 1,
        call_type TEXT
      );

      CREATE TABLE IF NOT EXISTS evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        agent_id INTEGER,
        qa_id INTEGER,
        brand TEXT,
        call_type TEXT,
        final_score REAL,
        status TEXT DEFAULT 'Pending Review',
        critical_failure INTEGER DEFAULT 0,
        data JSON
      );

      CREATE TABLE IF NOT EXISTS coaching_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER,
        tl_id INTEGER,
        weaknesses TEXT,
        notes TEXT,
        plan TEXT,
        status TEXT DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS escalation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evaluation_id INTEGER,
        user_id INTEGER,
        role TEXT,
        action TEXT, -- escalated, approved, reevaluated, rejected
        comment TEXT,
        old_score REAL,
        new_score REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        message TEXT,
        evaluation_id INTEGER,
        is_read INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database tables initialized successfully");

    // Table for dynamic form settings
    await db.exec(`
      CREATE TABLE IF NOT EXISTS form_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        field_type TEXT NOT NULL,
        label_en TEXT NOT NULL,
        label_ar TEXT,
        value TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // New-style coaching workflow (created from a specific call/evaluation).
    // Lives alongside the old `coaching_sessions` table so the old UI keeps working.
    await db.exec(`
      CREATE TABLE IF NOT EXISTS coaching_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evaluation_id INTEGER NOT NULL,
        tl_id INTEGER NOT NULL,
        agent_id INTEGER NOT NULL,
        customer_phone TEXT,
        call_type TEXT,
        error_description TEXT,
        tl_comment TEXT NOT NULL,
        status TEXT DEFAULT 'Pending Employee Approval',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        agent_approved_at TIMESTAMP,
        session_started_at TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);

    // Draft Management — saved-but-not-submitted evaluations.
    // owner_id  → the QA who saved it (visible to them + supervisors)
    // data      → JSON snapshot of the entire form (responses, feedback, etc.)
    // title     → auto-generated label shown in the side panel
    // status    → 'draft' | 'completed' (set to 'completed' once an evaluation
    //              is submitted from this draft, so we keep an audit trail
    //              instead of hard-deleting; the panel only lists 'draft' rows)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS evaluation_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        agent_id INTEGER,
        brand TEXT,
        call_type TEXT,
        title TEXT,
        data JSON,
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);

    // Table for dynamic Audit Logs / Activity Trail
    await db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        action_type TEXT,
        section TEXT,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration for existing tables
    try { await db.exec("ALTER TABLE escalation_logs ADD COLUMN IF NOT EXISTS old_score REAL"); } catch(e) {}
    try { await db.exec("ALTER TABLE escalation_logs ADD COLUMN IF NOT EXISTS new_score REAL"); } catch(e) {}

    // QA scope columns — JSON arrays of allowed brand values and department names.
    // NULL / empty → QA sees nothing (deny-by-default).
    try { await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_departments TEXT"); } catch(e) {}
    try { await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_brands TEXT"); } catch(e) {}

    // Call-Center Supervisor link — TLs report to a single cc_supervisor.
    // NULL on a TL = unassigned (visible to every cc_supervisor for now).
    try { await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS cc_supervisor_id INTEGER"); } catch(e) {}

    // WOW Calls — QA can flag an exceptional call as a "WOW" for the
    // company-wide showcase page. Tri-state boolean stored as INTEGER for
    // SQLite compat; default 0 leaves every existing call untouched.
    try { await db.exec("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS is_wow INTEGER DEFAULT 0"); } catch(e) {}

    // Agent-initiated escalation (dispute). An Agent can request a re-review of
    // their own call; their TL then approves (→ the call enters the normal
    // Quality escalation flow) or rejects (→ request closed, optional reason
    // shown back to the Agent). One request per call, ever.
    //   agent_escalation_status:   NULL | 'pending' | 'approved' | 'rejected'
    //   agent_escalation_reason:   the Agent's reason when requesting
    //   agent_escalation_response: the TL's comment on approve / reject
    try { await db.exec("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS agent_escalation_status TEXT"); } catch(e) {}
    try { await db.exec("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS agent_escalation_reason TEXT"); } catch(e) {}
    try { await db.exec("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS agent_escalation_response TEXT"); } catch(e) {}
    try { await db.exec("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS agent_escalation_at TIMESTAMP"); } catch(e) {}

    // QA edit trail — a QA can edit an existing call; every save records who
    // changed what and when, so a supervisor can audit it. The two columns on
    // `evaluations` give a cheap "was this row ever edited?" flag (drives the
    // blue row highlight) and point at the most recent editor.
    try { await db.exec("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMP"); } catch(e) {}
    try { await db.exec("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS last_edited_by INTEGER"); } catch(e) {}

    // Registration timestamp — when the QA actually logged the evaluation, as
    // opposed to `date` (the call date the QA types, which may be earlier).
    // Drives the "calls registered per QA" productivity card so a call logged
    // today counts today regardless of the call date. No DEFAULT: new rows set
    // it explicitly on INSERT; pre-existing rows are backfilled once from the
    // call date below (idempotent — only touches NULLs).
    try { await db.exec("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP"); } catch(e) {}
    try { await db.exec("UPDATE evaluations SET created_at = date::timestamp WHERE created_at IS NULL AND date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'"); } catch(e) {}
    await db.exec(`
      CREATE TABLE IF NOT EXISTS evaluation_edits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evaluation_id INTEGER NOT NULL,
        editor_id INTEGER,
        editor_name TEXT,
        changes JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Admin manual override of a QA's calls count for a specific day.
    // Used by the Admin Supervisor to correct a day's number from the
    // QA KPIs detail page; flows through to the total and the score.
    await db.exec(`
      CREATE TABLE IF NOT EXISTS qa_kpi_day_overrides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qa_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        override_count INTEGER NOT NULL,
        note TEXT,
        set_by_user_id INTEGER,
        set_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (qa_id, date)
      );
    `);

    // Attendance — manual Check-In / Check-Out by QAs. Drives the
    // dynamic calls target (35 × attended days) in the QA KPI engine.
    //   date         YYYY-MM-DD, lets us group by day cheaply
    //   check_in_at  set on first /check-in of the day
    //   check_out_at NULL while the QA is on shift, set on /check-out
    // A day with BOTH timestamps populated counts as "attended".
    await db.exec(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        check_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        check_out_at TIMESTAMP,
        UNIQUE (user_id, date)
      );
    `);
    // Per-day calls target for the attendance-driven KPI.
    try { await db.exec("ALTER TABLE qa_kpi_config ADD COLUMN IF NOT EXISTS calls_per_attended_day INTEGER DEFAULT 35"); } catch(e) {}

    // -----------------------------------------------------------------
    // QA KPI infrastructure — four metrics aggregated into a monthly
    // score per QA: Calls (40%) + Duration (10%) + Tasks (20%) +
    // Accuracy (30%). All tables additive — no changes to existing
    // ones, so this feature can be removed cleanly without rollback.
    // -----------------------------------------------------------------

    // Session tracking for the Duration metric. Heartbeat-driven:
    //   - on login, insert a row with logout_at = NULL
    //   - frontend pings /api/sessions/heartbeat every few minutes,
    //     bumping last_seen_at (and effective logout_at)
    //   - explicit /api/sessions/logout finalises the session
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        logout_at TIMESTAMP,
        duration_seconds INTEGER DEFAULT 0
      );
    `);

    // Approved leave days — subtracted from the monthly working-day
    // target so the Duration KPI doesn't penalise people who were
    // legitimately off.
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_leaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        leave_date TEXT NOT NULL,
        leave_type TEXT,
        note TEXT,
        approved_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Accuracy cases — TL flags a QA-attributed mistake. Supervisor can
    // adjust qa_share to 0.5 for shared-responsibility cases. QA can
    // comment/dispute. severity controls deduction weight.
    await db.exec(`
      CREATE TABLE IF NOT EXISTS accuracy_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qa_id INTEGER NOT NULL,
        tl_id INTEGER NOT NULL,
        evaluation_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        severity TEXT DEFAULT 'medium',
        qa_share REAL DEFAULT 1.0,
        status TEXT DEFAULT 'open',
        qa_comment TEXT,
        supervisor_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      );
    `);

    // Per-QA KPI configuration. user_id NULL = system-wide defaults.
    // Weights must sum to 1.0 (frontend enforces; backend trusts).
    await db.exec(`
      CREATE TABLE IF NOT EXISTS qa_kpi_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        calls_target INTEGER DEFAULT 910,
        duration_hours_per_day REAL DEFAULT 8,
        duration_days_per_month INTEGER DEFAULT 26,
        escalation_sla_hours INTEGER DEFAULT 24,
        weight_calls REAL DEFAULT 0.4,
        weight_duration REAL DEFAULT 0.1,
        weight_tasks REAL DEFAULT 0.2,
        weight_accuracy REAL DEFAULT 0.3,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Seed system-wide defaults if missing.
    try {
      const existing = await db.prepare("SELECT id FROM qa_kpi_config WHERE user_id IS NULL").get();
      if (!existing) {
        await db.prepare(
          "INSERT INTO qa_kpi_config (user_id, calls_target, duration_hours_per_day, duration_days_per_month, escalation_sla_hours, weight_calls, weight_duration, weight_tasks, weight_accuracy) VALUES (NULL, 910, 8, 26, 24, 0.4, 0.1, 0.2, 0.3)"
        ).run();
      }
    } catch (e) {
      console.error('Failed to seed qa_kpi_config defaults:', e);
    }

    // Canonical brand list — single source of truth across the app.
    // This migration runs ONCE (gated by a marker row in form_settings)
    // and:
    //   1. Soft-deletes (is_active=0) any existing brand rows that
    //      aren't in the canonical list — keeps them around so old
    //      evaluations still resolve, but they no longer appear in
    //      dropdowns or QA scope pickers.
    //   2. Inserts/reactivates every canonical brand with the right
    //      label and sort order.
    //
    // To revise the list in the future, change CANONICAL_BRANDS and
    // bump the marker version string.
    try {
      const CANONICAL_BRANDS = [
        'Shakir', 'Yelo', 'BBT', 'Mishmash', 'Tabel',
        'Slice', 'Pattie', 'Chili', 'Just C', 'FM',
      ];
      const MARKER_VERSION = 'brands_v3_2026_06';
      const marker = await db.prepare(
        "SELECT id FROM form_settings WHERE field_type = '_meta' AND value = ?"
      ).get(MARKER_VERSION) as any;

      if (!marker) {
        // 1. Deactivate everything that isn't in the canonical list.
        const placeholders = CANONICAL_BRANDS.map(() => '?').join(',');
        await db.prepare(
          `UPDATE form_settings SET is_active = 0
           WHERE field_type = 'brand' AND value NOT IN (${placeholders})`
        ).run(...CANONICAL_BRANDS);

        // 2. Upsert each canonical brand. If a row with the same value
        //    already exists, reactivate it + fix its label/sort order;
        //    otherwise insert it.
        for (let i = 0; i < CANONICAL_BRANDS.length; i++) {
          const brand = CANONICAL_BRANDS[i];
          const existing = await db.prepare(
            "SELECT id FROM form_settings WHERE field_type = 'brand' AND value = ?"
          ).get(brand) as any;
          if (existing) {
            await db.prepare(
              "UPDATE form_settings SET label_en = ?, label_ar = ?, is_active = 1, sort_order = ? WHERE id = ?"
            ).run(brand, brand, i, existing.id);
          } else {
            await db.prepare(
              "INSERT INTO form_settings (field_type, label_en, label_ar, value, is_active, sort_order) VALUES ('brand', ?, ?, ?, 1, ?)"
            ).run(brand, brand, brand, i);
          }
        }

        // 3. Drop the marker so this migration is idempotent.
        await db.prepare(
          "INSERT INTO form_settings (field_type, label_en, value, is_active, sort_order) VALUES ('_meta', 'brands canonical list applied', ?, 0, 0)"
        ).run(MARKER_VERSION);
        console.log(`Brand list synced (${MARKER_VERSION})`);
      }
    } catch (err) {
      console.error('Brand list migration failed:', err);
    }

    // ----------------------------------------------------------------
    // QA Scorecards v1 — seed the per-call-type attribute lists from
    // the official QA Manual. Idempotent via a marker row.
    //
    // Each attribute is stored ONCE in form_settings; its JSON value
    // carries:
    //   call_types        — array of call_type values it applies to
    //   weights_by_type   — { 'New Order': 7, 'Inquiry': 8, ... }
    //   critical          — Leads-to-Zero flag (from Master Dictionary)
    //   category          — CTC / CTB / CTS / NON
    //   section           — kept = 'evaluation_criteria' (single bucket)
    //
    // The frontend filters by formData.call_type and reads
    // weights_by_type[selected_call_type] as the live weight.
    // ----------------------------------------------------------------
    try {
      const SCORECARD_MARKER = 'scorecards_v1_manual_2026_07';
      const marker = await db.prepare(
        "SELECT id FROM form_settings WHERE field_type = '_meta' AND value = ?"
      ).get(SCORECARD_MARKER) as any;

      if (!marker) {
        // 1. Make sure all five call types exist as form_settings rows.
        const REQUIRED_CALL_TYPES = ['New Order', 'Inquiry', 'Follow Up', 'Complaints', 'Outbound'];
        for (const ct of REQUIRED_CALL_TYPES) {
          const exists = await db.prepare(
            "SELECT id FROM form_settings WHERE field_type = 'call_type' AND value = ?"
          ).get(ct) as any;
          if (exists) {
            await db.prepare("UPDATE form_settings SET is_active = 1 WHERE id = ?").run(exists.id);
          } else {
            await db.prepare(
              "INSERT INTO form_settings (field_type, label_en, label_ar, value, is_active, sort_order) VALUES ('call_type', ?, ?, ?, 1, 0)"
            ).run(ct, ct, ct);
          }
        }

        // 2. Ensure a single "Evaluation Criteria" section exists and
        //    deactivate any other eval_sections so the new questions
        //    don't get filtered out by section.
        await db.prepare("UPDATE form_settings SET is_active = 0 WHERE field_type = 'eval_section'").run();
        const sectionExists = await db.prepare(
          "SELECT id FROM form_settings WHERE field_type = 'eval_section' AND value = 'evaluation_criteria'"
        ).get() as any;
        if (sectionExists) {
          await db.prepare("UPDATE form_settings SET label_en = ?, is_active = 1, sort_order = 0 WHERE id = ?")
            .run('Evaluation Criteria', sectionExists.id);
        } else {
          await db.prepare(
            "INSERT INTO form_settings (field_type, label_en, label_ar, value, is_active, sort_order) VALUES ('eval_section', 'Evaluation Criteria', 'معايير التقييم', 'evaluation_criteria', 1, 0)"
          ).run();
        }

        // 3. Deactivate existing eval_questions so only the manual's
        //    canonical attributes show up going forward.
        await db.prepare("UPDATE form_settings SET is_active = 0 WHERE field_type = 'eval_question'").run();

        // 4. Manual scorecards — { attribute → { call_type → weight } }.
        const SCORECARDS: Record<string, { weight: number; category: string }[] & { [k: string]: any }> = {} as any;
        // Helper: register an attribute for a call type.
        const M: Record<string, Record<string, { weight: number; category: string; critical: boolean }>> = {};
        const reg = (attr: string, callType: string, weight: number, category: string, critical: boolean) => {
          if (!M[attr]) M[attr] = {};
          M[attr][callType] = { weight, category, critical };
        };

        // From the manual — Leads-to-Zero attributes (case-sensitive match by name)
        const LTZ = new Set([
          'Professional Tone', 'Menu Knowledge', 'Customer Verification',
          'Information Accuracy', 'Policy Compliance', 'Complaint Documentation',
          'FCR & Escalation',
        ]);
        const isLTZ = (name: string) => LTZ.has(name);

        // ---- New Order ----
        const NO = 'New Order';
        reg('Opening', NO, 4, 'NON', isLTZ('Opening'));
        reg('Active Listening', NO, 7, 'CTC', isLTZ('Active Listening'));
        reg('Professional Tone', NO, 8, 'CTC', isLTZ('Professional Tone'));
        reg('Menu Knowledge', NO, 7, 'CTS', isLTZ('Menu Knowledge'));
        reg('System Navigation', NO, 5, 'CTS', isLTZ('System Navigation'));
        reg('Upselling', NO, 5, 'CTB', isLTZ('Upselling'));
        reg('Customer Verification', NO, 10, 'CTS', isLTZ('Customer Verification'));
        reg('Order Confirmation', NO, 10, 'CTS', isLTZ('Order Confirmation'));
        reg('Empathy', NO, 5, 'CTC', isLTZ('Empathy'));
        reg('Skill of Language', NO, 5, 'CTC', isLTZ('Skill of Language'));
        reg('SOP Compliance', NO, 7, 'CTB', isLTZ('SOP Compliance'));
        reg('Policy Compliance', NO, 7, 'CTS', isLTZ('Policy Compliance'));
        reg('Hold Management', NO, 4, 'CTC', isLTZ('Hold Management'));
        reg('Time Management', NO, 5, 'CTC', isLTZ('Time Management'));
        reg('Closing', NO, 6, 'CTC', isLTZ('Closing'));
        reg('Handling Special Requests', NO, 5, 'CTS', isLTZ('Handling Special Requests'));

        // ---- Inquiry ----
        const IN = 'Inquiry';
        reg('Opening', IN, 4, 'NON', isLTZ('Opening'));
        reg('Active Listening', IN, 7, 'CTC', isLTZ('Active Listening'));
        reg('Professional Tone', IN, 8, 'CTC', isLTZ('Professional Tone'));
        reg('Understanding Customer Need', IN, 8, 'CTS', isLTZ('Understanding Customer Need'));
        reg('Information Accuracy', IN, 8, 'CTS', isLTZ('Information Accuracy'));
        reg('Documentation', IN, 4, 'CTB', isLTZ('Documentation'));
        reg('Menu Knowledge', IN, 8, 'CTS', isLTZ('Menu Knowledge'));
        reg('System Navigation', IN, 8, 'CTS', isLTZ('System Navigation'));
        reg('Policy Compliance', IN, 8, 'CTS', isLTZ('Policy Compliance'));
        reg('Skill of Language', IN, 5, 'CTC', isLTZ('Skill of Language'));
        reg('Explanation Clarity', IN, 8, 'CTC', isLTZ('Explanation Clarity'));
        reg('Empathy', IN, 5, 'CTC', isLTZ('Empathy'));
        reg('Handling Skills', IN, 4, 'CTC', isLTZ('Handling Skills'));
        reg('Hold Management', IN, 4, 'CTC', isLTZ('Hold Management'));
        reg('Time Management', IN, 5, 'CTC', isLTZ('Time Management'));
        reg('Closing', IN, 6, 'CTC', isLTZ('Closing'));

        // ---- Follow Up ----
        const FU = 'Follow Up';
        reg('Opening', FU, 4, 'NON', isLTZ('Opening'));
        reg('Active Listening', FU, 7, 'CTC', isLTZ('Active Listening'));
        reg('Professional Tone', FU, 8, 'CTC', isLTZ('Professional Tone'));
        reg('Customer Verification', FU, 10, 'CTS', isLTZ('Customer Verification'));
        reg('Order Lookup Accuracy', FU, 8, 'CTS', isLTZ('Order Lookup Accuracy'));
        reg('Information Accuracy', FU, 10, 'CTS', isLTZ('Information Accuracy'));
        reg('Status Of Order', FU, 5, 'CTC', isLTZ('Status Of Order'));
        reg('Ownership', FU, 8, 'CTS', isLTZ('Ownership'));
        reg('Empathy', FU, 5, 'CTC', isLTZ('Empathy'));
        reg('Handling Skills', FU, 4, 'CTC', isLTZ('Handling Skills'));
        reg('Next Step Clarity', FU, 3, 'CTC', isLTZ('Next Step Clarity'));
        reg('Explanation Clarity', FU, 8, 'CTC', isLTZ('Explanation Clarity'));
        reg('Time Management', FU, 5, 'CTC', isLTZ('Time Management'));
        reg('Hold Management', FU, 4, 'CTC', isLTZ('Hold Management'));
        reg('Closing', FU, 6, 'CTC', isLTZ('Closing'));
        reg('Skill of Language', FU, 5, 'CTC', isLTZ('Skill of Language'));

        // ---- Complaints ----
        const CO = 'Complaints';
        reg('Opening', CO, 4, 'NON', isLTZ('Opening'));
        reg('Active Listening', CO, 7, 'CTC', isLTZ('Active Listening'));
        reg('Empathy', CO, 6, 'CTC', isLTZ('Empathy'));
        reg('Skill of Language', CO, 6, 'CTC', isLTZ('Skill of Language'));
        reg('Handling Skills', CO, 6, 'CTC', isLTZ('Handling Skills'));
        reg('Explanation Clarity', CO, 8, 'CTC', isLTZ('Explanation Clarity'));
        reg('SOP Compliance', CO, 10, 'CTS', isLTZ('SOP Compliance'));
        reg('Complaint Documentation', CO, 7, 'CTB', isLTZ('Complaint Documentation'));
        reg('FCR & Escalation', CO, 10, 'CTS', isLTZ('FCR & Escalation'));
        reg('Next Step Clarity', CO, 8, 'CTC', isLTZ('Next Step Clarity'));
        reg('Ownership', CO, 8, 'CTS', isLTZ('Ownership'));
        reg('Professional Tone', CO, 8, 'CTC', isLTZ('Professional Tone'));
        reg('Calm Under Pressure', CO, 6, 'CTC', isLTZ('Calm Under Pressure'));
        reg('Closing', CO, 6, 'CTC', isLTZ('Closing'));

        // ---- Outbound ----
        const OU = 'Outbound';
        reg('Opening & Introduction', OU, 5, 'NON', isLTZ('Opening & Introduction'));
        reg('Purpose of Call', OU, 10, 'CTS', isLTZ('Purpose of Call'));
        reg('Active Listening', OU, 7, 'CTC', isLTZ('Active Listening'));
        reg('Customer Verification', OU, 10, 'CTS', isLTZ('Customer Verification'));
        reg('Information Accuracy', OU, 10, 'CTS', isLTZ('Information Accuracy'));
        reg('Customer Needs Assessment', OU, 8, 'CTS', isLTZ('Customer Needs Assessment'));
        reg('Objection Handling', OU, 8, 'CTC', isLTZ('Objection Handling'));
        reg('Policy Compliance', OU, 8, 'CTB', isLTZ('Policy Compliance'));
        reg('Next Step Clarity', OU, 5, 'CTC', isLTZ('Next Step Clarity'));
        reg('Professional Tone', OU, 8, 'CTC', isLTZ('Professional Tone'));
        reg('Time Management', OU, 5, 'CTC', isLTZ('Time Management'));
        reg('Hold Management', OU, 5, 'CTC', isLTZ('Hold Management'));
        reg('Closing', OU, 6, 'CTC', isLTZ('Closing'));
        reg('Empathy', OU, 5, 'CTC', isLTZ('Empathy'));

        // 5. Insert one row per unique attribute.
        let sortOrder = 0;
        for (const [attr, byType] of Object.entries(M)) {
          const call_types = Object.keys(byType);
          const weights_by_type: Record<string, number> = {};
          let category = 'NON';
          let critical = false;
          for (const ct of call_types) {
            weights_by_type[ct] = byType[ct].weight;
            category = byType[ct].category;
            critical = critical || byType[ct].critical;
          }
          // legacy "weight" field gets the highest variant so summing
          // doesn't underflow if any consumer ignores weights_by_type.
          const legacyWeight = Math.max(...Object.values(weights_by_type));
          const value = JSON.stringify({
            section: 'evaluation_criteria',
            weight: legacyWeight,
            critical,
            category,
            call_types,
            weights_by_type,
          });
          await db.prepare(
            "INSERT INTO form_settings (field_type, label_en, label_ar, value, is_active, sort_order) VALUES ('eval_question', ?, ?, ?, 1, ?)"
          ).run(attr, attr, value, sortOrder++);
        }

        // 6. Stamp the marker so the migration is idempotent across restarts.
        await db.prepare(
          "INSERT INTO form_settings (field_type, label_en, value, is_active, sort_order) VALUES ('_meta', 'scorecards v1 from QA Manual applied', ?, 0, 0)"
        ).run(SCORECARD_MARKER);
        console.log(`Scorecards v1 seeded (${SCORECARD_MARKER})`);
      }
    } catch (err) {
      console.error('Scorecards v1 migration failed:', err);
    }

    // Cleanup migration — dedupe call_type rows case-insensitively.
    // The previous scorecard seed used a case-sensitive equality check,
    // so older lower-case rows like "New order" / "Follow up" survived
    // alongside the new canonical "New Order" / "Follow Up". Result:
    // the call type dropdown showed each option twice.
    //
    // Idempotent via a fresh marker. For each canonical name:
    //   1. Find every row whose value matches case-insensitively.
    //   2. Keep the first (lowest id), rewrite its value to the
    //      canonical casing, and set is_active = 1.
    //   3. Deactivate any other matching row so it disappears from
    //      the dropdown without losing the historical record on
    //      existing evaluations.
    //   4. Deactivate any call_type row not in the canonical list.
    try {
      const DEDUP_MARKER = 'call_types_dedup_2026_07';
      const already = await db.prepare(
        "SELECT id FROM form_settings WHERE field_type = '_meta' AND value = ?"
      ).get(DEDUP_MARKER) as any;

      if (!already) {
        const CANONICAL = ['New Order', 'Inquiry', 'Follow Up', 'Complaints', 'Outbound'];
        const canonicalLower = new Set(CANONICAL.map(c => c.toLowerCase()));

        for (const canonical of CANONICAL) {
          const matches = await db.prepare(
            "SELECT id, value FROM form_settings WHERE field_type = 'call_type' AND LOWER(value) = LOWER(?) ORDER BY id ASC"
          ).all(canonical) as any[];

          if (matches.length === 0) {
            await db.prepare(
              "INSERT INTO form_settings (field_type, label_en, label_ar, value, is_active, sort_order) VALUES ('call_type', ?, ?, ?, 1, 0)"
            ).run(canonical, canonical, canonical);
            continue;
          }
          // Keep the first row, rewrite to canonical casing, activate it.
          const keep = matches[0];
          await db.prepare(
            "UPDATE form_settings SET value = ?, label_en = ?, is_active = 1 WHERE id = ?"
          ).run(canonical, canonical, keep.id);
          // Deactivate the others.
          for (let i = 1; i < matches.length; i++) {
            await db.prepare("UPDATE form_settings SET is_active = 0 WHERE id = ?").run(matches[i].id);
          }
        }

        // Deactivate any call_type row that isn't in the canonical list.
        const all = await db.prepare(
          "SELECT id, value FROM form_settings WHERE field_type = 'call_type'"
        ).all() as any[];
        for (const r of all) {
          if (!canonicalLower.has(String(r.value || '').toLowerCase())) {
            await db.prepare("UPDATE form_settings SET is_active = 0 WHERE id = ?").run(r.id);
          }
        }

        await db.prepare(
          "INSERT INTO form_settings (field_type, label_en, value, is_active, sort_order) VALUES ('_meta', 'call_types deduplicated', ?, 0, 0)"
        ).run(DEDUP_MARKER);
        console.log(`call_type dropdown deduplicated (${DEDUP_MARKER})`);
      }
    } catch (err) {
      console.error('call_type dedup migration failed:', err);
    }

    // ----------------------------------------------------------------
    // Bulk user seed — onboarding roster pulled from the admin's
    // spreadsheet. Idempotent via a marker; runs once per environment.
    //
    //   Pass 1 — INSERT every user with a unique username. Skipped
    //            silently if the username is already in the table
    //            (so re-running against a partially-seeded DB is safe).
    //   Pass 2 — Resolve every "Team Leader" name to the TL's user.id
    //            and UPDATE the agent's tl_id. TLs not present in this
    //            roster are logged and left unlinked.
    //
    // EMPLOYEE / AGENT both map to role='agent'. TL maps to 'tl'.
    // Department defaults to 'Swish' (admin can rebucket via User
    // Management). Default password = username + '123' where the
    // spreadsheet showed "(set in new system)".
    // ----------------------------------------------------------------
    try {
      const SEED_MARKER = 'bulk_users_seed_v1_2026_07';
      const seenMarker = await db.prepare(
        "SELECT id FROM form_settings WHERE field_type = '_meta' AND value = ?"
      ).get(SEED_MARKER) as any;

      if (!seenMarker) {
        type SeedUser = { name: string; username: string; password: string; role: 'agent' | 'tl'; tl_name: string | null };
        const USERS: SeedUser[] = [
          // ---- TLs first so they exist before agents reference them
          { name: 'Ahmed Bahaa',     username: 'Ahmed_Bahaa',                      password: 'Ahmed_Bahaa123',                      role: 'tl', tl_name: null },
          { name: 'Ahmed Hussain',   username: 'ahmedhussien20485@gmail.com',      password: 'ahmedhussien20485@gmail.com123',      role: 'tl', tl_name: null },
          { name: 'Atef Salem',      username: 'Atef_Salem',                       password: 'Atef_Salem123',                       role: 'tl', tl_name: null },
          { name: 'Mohamed Nashaat', username: 'mohamednashaat589@gmail.comm',     password: 'mohamednashaat589@gmail.comm123',     role: 'tl', tl_name: null },
          { name: 'Mostafa Mahmoud', username: 'M.eldeeb@swishhh.net',             password: 'M.eldeeb@swishhh.net123',             role: 'tl', tl_name: null },

          // ---- Agents (incl. EMPLOYEE rows from the sheet)
          { name: 'Abdelrahman Abdallah',     username: 'abdoalaa920@gmail.com',                password: 'abdoalaa920@gmail.com123',                role: 'agent', tl_name: null },
          { name: 'Abdullah Mahmoud',         username: 'Abdullah.Mahmoud9946@gmail.com',       password: 'Abdullah.Mahmoud9946@gmail.com123',       role: 'agent', tl_name: 'Mostafa Mahmoud' },
          { name: 'Ahmed Bader',              username: 'Ahmed Bader',                          password: 'Ahmed Bader',                             role: 'agent', tl_name: null },
          { name: 'Ahmed Ezzat',              username: 'Ahmed Ezzat',                          password: 'Ahmed Ezzat',                             role: 'agent', tl_name: null },
          { name: 'Hesham Sayed',             username: 'Hesham Sayed',                         password: 'Hesham Sayed',                            role: 'agent', tl_name: null },
          { name: 'Malak Hany',               username: 'malakhanyy2005@icloud.com',            password: 'malakhanyy2005@icloud.com123',            role: 'agent', tl_name: 'Mostafa Mahmoud' },
          { name: 'Mostafa Mahmoud Abdelgawad', username: 'Mostafa Mahmoud Abdelgawad',         password: 'Mostafa Mahmoud Abdelgawad',              role: 'agent', tl_name: null },
          { name: 'Shref Ouda',               username: 'sherifouda97@gmail.com',               password: 'sherifouda97@gmail.com123',               role: 'agent', tl_name: 'Mostafa Mahmoud' },
          { name: 'Walaa zain',               username: 'Walaa_zain',                           password: 'Walaa_zain123',                           role: 'agent', tl_name: 'Mostafa Mahmoud' },
          { name: 'Yousif Hamdy',             username: 'Yousif Hamdy',                         password: 'Yousif Hamdy',                            role: 'agent', tl_name: null },
          { name: 'Ahmed Kader',              username: 'Ahmed_Kader',                          password: 'Ahmed_Kader123',                          role: 'agent', tl_name: 'Ahmed Bahaa' },
          { name: 'Ahmed Kamel',              username: 'ahmed.mohamed.kamel2016@gmail.com',    password: 'ahmed.mohamed.kamel2016@gmail.com123',    role: 'agent', tl_name: 'Ahmed Bahaa' },
          { name: 'Ahmed Mahmoud',            username: 'Ahmed_Mahmoud',                        password: 'Ahmed_Mahmoud123',                        role: 'agent', tl_name: 'Ahmed Bahaa' },
          { name: 'loay mohamed',             username: 'louaymahfouz@gmail.com',               password: 'louaymahfouz@gmail.com123',               role: 'agent', tl_name: 'Ahmed Bahaa' },
          { name: 'Mahmoud Ahmed Hassan',     username: 'elsherifmahmoud31@gmail.com',          password: 'elsherifmahmoud31@gmail.com123',          role: 'agent', tl_name: 'Ahmed Bahaa' },
          { name: 'Samah Yasser',             username: 'yassersamah32@gmail.com',              password: 'yassersamah32@gmail.com123',              role: 'agent', tl_name: 'Ahmed Bahaa' },
          { name: 'Abdelwahab Gomaa',         username: 'abdo.gomaa121099@gmail.com',           password: 'abdo.gomaa121099@gmail.com123',           role: 'agent', tl_name: 'Ahmed Hussain' },
          { name: 'Mahmoud Hamed',            username: 'moda.tegara@gmail.com',                password: 'moda.tegara@gmail.com123',                role: 'agent', tl_name: 'Ahmed Hussain' },
          { name: 'Mahmoud Kamal',            username: 'Mahmoudkamaleldein90@gmail.com',       password: 'Mahmoudkamaleldein90@gmail.com123',       role: 'agent', tl_name: 'Ahmed Hussain' },
          { name: 'Marwan Adel',              username: 'Marwan_Adel',                          password: 'Marwan_Adel123',                          role: 'agent', tl_name: 'Ahmed Hussain' },
          { name: 'Mohamed Anwar',            username: 'Muhammadellwan@gmail.com',             password: 'Muhammadellwan@gmail.com123',             role: 'agent', tl_name: 'Ahmed Hussain' },
          { name: 'Ali Mohamed',              username: 'alimuhamedali79@gmail.com',            password: 'alimuhamedali79@gmail.com123',            role: 'agent', tl_name: 'Ahmed Shokr' /* not in roster — will stay unlinked */ },
          { name: 'Ahmed Alaa',               username: 'alaaahmed253@gmail.com',               password: 'alaaahmed253@gmail.com123',               role: 'agent', tl_name: 'Atef Salem' },
          { name: 'Ahmed Disouky',            username: 'reddragon3k@gmail.com',                password: 'reddragon3k@gmail.com123',                role: 'agent', tl_name: 'Atef Salem' },
          { name: 'Ahmed Husseinibrahem',     username: 'Ahlawyelmasry@gmail.com',              password: 'Ahlawyelmasry@gmail.com123',              role: 'agent', tl_name: 'Atef Salem' },
          { name: 'Mohamed Esmael',           username: 'me537537@gmail.com',                   password: 'me537537@gmail.com123',                   role: 'agent', tl_name: 'Atef Salem' },
          { name: 'Shaymaa Ahmed',            username: 'shaymaakhfaga98@gmail.com',            password: 'shaymaakhfaga98@gmail.com123',            role: 'agent', tl_name: 'Atef Salem' },
          { name: 'Soliman Ahmed',            username: 'Solom2002000@gmail.com',               password: 'Solom2002000@gmail.com123',               role: 'agent', tl_name: 'Atef Salem' },
          { name: 'Abdallah Fathy',           username: 'fathyabdallah378@gmail.com',           password: 'fathyabdallah378@gmail.com123',           role: 'agent', tl_name: 'Mohamed Nashaat' },
          { name: 'Aya Ramadan',              username: 'aya97ramadan@gmail.com',               password: 'aya97ramadan@gmail.com123',               role: 'agent', tl_name: 'Mohamed Nashaat' },
          { name: 'Milad Moussa',             username: 'miladmoussa2@gmail.com',               password: 'miladmoussa2@gmail.com123' /* spreadsheet said "set in new system" → use default */, role: 'agent', tl_name: 'Mohamed Nashaat' },
          { name: 'Mohamed Gharieb',          username: 'mohmmedgharieb@gmail.com',             password: 'mohmmedgharieb@gmail.com123',             role: 'agent', tl_name: 'Mohamed Nashaat' },
          { name: 'Mohamed Shokry',           username: 'moshokry85@gmail.com',                 password: 'moshokry85@gmail.com123',                 role: 'agent', tl_name: 'Mohamed Nashaat' },
          { name: 'Muhammed Gaber',           username: 'muhammed.gaberx@gmail.com',            password: 'muhammed.gaberx@gmail.com123',            role: 'agent', tl_name: 'Mohamed Nashaat' },
          // Second "Ahmed Mahmoud" — different username so the unique constraint is fine.
          { name: 'Ahmed Mahmoud',            username: 'Ahmed Mahmoud',                        password: 'Ahmed Mahmoud2252',                       role: 'agent', tl_name: 'Mostafa Mahmoud' },
        ];

        let inserted = 0;
        let skipped = 0;
        for (const u of USERS) {
          const existing = await db.prepare("SELECT id FROM users WHERE username = ?").get(u.username) as any;
          if (existing) { skipped++; continue; }
          const hashed = bcrypt.hashSync(u.password, 10);
          try {
            await db.prepare(
              "INSERT INTO users (display_name, username, password, role, department) VALUES (?, ?, ?, ?, 'Swish')"
            ).run(u.name, u.username, hashed, u.role);
            inserted++;
          } catch (e) {
            console.error(`Failed to insert ${u.username}:`, e);
          }
        }

        // Pass 2 — resolve TL links. Look up TL by display_name + role='tl'
        // so "Mostafa Mahmoud" (TL) doesn't collide with the unrelated
        // "Mostafa Mahmoud Abdelgawad" (agent) in the same roster.
        let linked = 0;
        let unresolved = 0;
        for (const u of USERS) {
          if (!u.tl_name) continue;
          const tl = await db.prepare(
            "SELECT id FROM users WHERE display_name = ? AND role = 'tl'"
          ).get(u.tl_name) as any;
          if (!tl) {
            console.warn(`Bulk seed: TL "${u.tl_name}" not in roster — leaving ${u.username} unlinked`);
            unresolved++;
            continue;
          }
          await db.prepare(
            "UPDATE users SET tl_id = ? WHERE username = ?"
          ).run(tl.id, u.username);
          linked++;
        }

        await db.prepare(
          "INSERT INTO form_settings (field_type, label_en, value, is_active, sort_order) VALUES ('_meta', 'bulk user roster seeded', ?, 0, 0)"
        ).run(SEED_MARKER);
        console.log(`Bulk users seeded — inserted ${inserted}, skipped ${skipped}, linked ${linked}, unresolved TL refs ${unresolved}`);
      }
    } catch (err) {
      console.error('Bulk users seed migration failed:', err);
    }

    // ----------------------------------------------------------------
    // One-shot reset — clears every test evaluation and everything that
    // hangs off them so the production numbers start clean. Gated by a
    // marker row in form_settings so subsequent deploys do nothing.
    //
    // Touched tables (all wiped):
    //   evaluations                 (the calls themselves)
    //   escalation_logs             (per-evaluation timeline)
    //   coaching_requests           (TL → agent coaching workflow)
    //   coaching_sessions           (legacy coaching table)
    //   accuracy_cases              (TL ↔ QA dispute cases)
    //   evaluation_drafts           (in-progress drafts)
    //   qa_kpi_day_overrides        (per-day Admin overrides)
    //   notifications WHERE evaluation_id IS NOT NULL  (linked alerts)
    //
    // Preserved: users, user_sessions, attendance_records, user_leaves,
    // audit_logs, form_settings, qa_kpi_config, tl_kpi_config.
    // ----------------------------------------------------------------
    try {
      const RESET_MARKER = 'reset_test_calls_2026_07';
      const already = await db.prepare(
        "SELECT id FROM form_settings WHERE field_type = '_meta' AND value = ?"
      ).get(RESET_MARKER) as any;

      if (!already) {
        const tables = [
          'qa_kpi_day_overrides',
          'accuracy_cases',
          'coaching_requests',
          'coaching_sessions',
          'escalation_logs',
          'evaluation_drafts',
          'evaluations',
        ];
        for (const t of tables) {
          try { await db.prepare(`DELETE FROM ${t}`).run(); } catch (e) {
            console.error(`Failed to clear ${t}:`, e);
          }
        }
        // Notifications: keep system messages, drop only the call-bound ones.
        try { await db.prepare("DELETE FROM notifications WHERE evaluation_id IS NOT NULL").run(); } catch {}

        await db.prepare(
          "INSERT INTO form_settings (field_type, label_en, value, is_active, sort_order) VALUES ('_meta', 'test calls reset', ?, 0, 0)"
        ).run(RESET_MARKER);
        console.log(`Test evaluation data wiped (${RESET_MARKER})`);
      }
    } catch (err) {
      console.error('Test-calls reset migration failed:', err);
    }

    // Seed initial form settings if empty or missing evaluation criteria
    try {
      const settingsCount = (await db.prepare("SELECT COUNT(*) as count FROM form_settings").get() as any).count;
      const evalCount = (await db.prepare("SELECT COUNT(*) as count FROM form_settings WHERE field_type = 'eval_section'").get() as any).count;
      
      if (settingsCount === 0 || evalCount === 0) {
        const initialSettings = [
          { type: 'brand', en: 'SWISH', ar: 'سويش', val: 'SWISH' },
          { type: 'brand', en: 'ALMOKH', ar: 'المخ', val: 'ALMOKH' },
          { type: 'call_direction', en: 'Inbound', ar: 'واردة', val: 'Inbound' },
          { type: 'call_direction', en: 'Outbound', ar: 'صادرة', val: 'Outbound' },
          { type: 'call_category', en: 'Support', ar: 'دعم فني', val: 'Support' },
          { type: 'call_category', en: 'Sales', ar: 'مبيعات', val: 'Sales' },
          { type: 'call_type', en: 'New Order', ar: 'طلب جديد', val: 'New Order' },
          { type: 'call_type', en: 'Inquiry', ar: 'استفسار', val: 'Inquiry' },
          
          // Evaluation Sections
          { type: 'eval_section', en: 'COMMUNICATION', ar: 'التواصل', val: 'communication' },
          { type: 'eval_section', en: 'PROCESS ADHERENCE', ar: 'الالتزام بالإجراءات', val: 'process' },
          { type: 'eval_section', en: 'PROBLEM SOLVING', ar: 'حل المشكلات', val: 'problem_solving' },
          { type: 'eval_section', en: 'EMPATHY', ar: 'التعاطف', val: 'empathy' },
          { type: 'eval_section', en: 'EFFICIENCY', ar: 'الكفاءة', val: 'efficiency' },

          // Communication
          { type: 'eval_question', en: 'Greeting & Opening', ar: 'التحية والافتتاح', val: JSON.stringify({ weight: 4, critical: false, section: 'communication' }) },
          { type: 'eval_question', en: 'Clarity of Speech', ar: 'وضوح الكلام', val: JSON.stringify({ weight: 2, critical: false, section: 'communication' }) },
          { type: 'eval_question', en: 'Listening Skills', ar: 'مهارات الاستماع', val: JSON.stringify({ weight: 5, critical: true, section: 'communication' }) },
          { type: 'eval_question', en: 'Tone & Energy', ar: 'نبرة الصوت والطاقة', val: JSON.stringify({ weight: 5, critical: false, section: 'communication' }) },
          { type: 'eval_question', en: 'Language Appropriateness', ar: 'ملاءمة اللغة', val: JSON.stringify({ weight: 5, critical: true, section: 'communication' }) },

          // Process
          { type: 'eval_question', en: 'Menu Knowledge', ar: 'المعرفة بالمنيو', val: JSON.stringify({ weight: 10, critical: true, section: 'process' }) },
          { type: 'eval_question', en: 'Call Flow Adherence', ar: 'الالتزام بمسار المكالمة', val: JSON.stringify({ weight: 7, critical: true, section: 'process' }) },
          { type: 'eval_question', en: 'Upselling', ar: 'البيع الإضافي', val: JSON.stringify({ weight: 5, critical: true, section: 'process' }) },
          { type: 'eval_question', en: 'Confirmation Step', ar: 'خطوة التأكيد', val: JSON.stringify({ weight: 8, critical: true, section: 'process' }) },
          { type: 'eval_question', en: 'Policy Compliance', ar: 'الالتزام بالسياسات', val: JSON.stringify({ weight: 3, critical: true, section: 'process' }) }
        ];

        const insertSetting = db.prepare("INSERT INTO form_settings (field_type, label_en, label_ar, value) VALUES (?, ?, ?, ?)");
        for (const s of initialSettings) {
          // Check if already exists to avoid duplicates if partially seeded
          const exists = await db.prepare("SELECT id FROM form_settings WHERE field_type = ? AND label_en = ?").get(s.type, s.en);
          if (!exists) {
            await insertSetting.run(s.type, s.en, s.ar, s.val);
          }
        }
      }
    } catch (e) {
      console.error("Migration/Seed error for form_settings:", e);
    }

    // Seed Admin User — only runs once when no supervisor exists yet.
    // Configure the bootstrap password via ADMIN_PASSWORD env var (default: "admin123").
    // After first login the supervisor should change their password from the UI.
    const adminExists = await db.prepare("SELECT * FROM users WHERE role = 'supervisor'").get();
    if (!adminExists) {
      const bootstrapPassword = process.env.ADMIN_PASSWORD || "admin123";
      const hashedPassword = bcrypt.hashSync(bootstrapPassword, 10);
      await db.prepare("INSERT INTO users (display_name, username, password, role, department) VALUES (?, ?, ?, ?, ?)")
        .run("Admin Supervisor", "admin", hashedPassword, "supervisor", "Quality");
      console.log(
        process.env.ADMIN_PASSWORD
          ? "[seed] Admin user created with ADMIN_PASSWORD from env."
          : "[seed] Admin user created with default password 'admin123'. CHANGE IT after first login."
      );
    }

    app.use(cors());
    app.use(express.json());

    // Automatic Audit Logging Middleware / Event System
    app.use((req, res, next) => {
      const method = req.method;
      const parsedUrl = req.path;

      // We only care about state modifiers and auth operations
      if (method === 'GET' && !parsedUrl.includes('/api/login') && !parsedUrl.includes('/api/logout')) {
        return next();
      }

      // Override res.json to capture final response payload (e.g., login status or user metadata)
      const originalJson = res.json;
      let capturedBody: any = null;

      res.json = function(body) {
        capturedBody = body;
        return originalJson.call(this, body);
      };

      res.on('finish', async () => {
        try {
          // Identify the logged in user performing this operation
          let userId: number | null = null;
          let userName: string | null = null;

          // 1. Try decoding standard JWT from Authorization Header
          const authHeader = req.headers['authorization'];
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
              const decoded = jwt.verify(token, JWT_SECRET) as any;
              if (decoded && decoded.id) {
                userId = decoded.id;
                const u = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(userId) as any;
                if (u) userName = u.display_name;
              }
            } catch (err) {
              // Ignore invalid token verification for logging fallback
            }
          }

          // 2. Fallbacks (custom tracking header or payload attributes)
          if (!userId && req.headers['x-user-id']) {
            userId = parseInt(req.headers['x-user-id'] as string);
            const u = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(userId) as any;
            if (u) userName = u.display_name;
          }

          if (!userId && req.body && req.body.user_id) {
            userId = parseInt(req.body.user_id);
            const u = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(userId) as any;
            if (u) userName = u.display_name;
          }

          if (!userId && req.body && req.body.qa_id) {
            userId = parseInt(req.body.qa_id);
            const u = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(userId) as any;
            if (u) userName = u.display_name;
          }

          // Special case: If logging login is successful, grab actor details from the response payload
          if (parsedUrl === '/api/login' && res.statusCode === 200 && capturedBody && capturedBody.user) {
            userId = capturedBody.user.id;
            userName = capturedBody.user.display_name;
          }

          // Grab network metadata (IP address and User Agent / Device)
          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
          const ipClean = typeof ip === 'string' ? ip.replace('::ffff:', '') : '127.0.0.1';
          const userAgent = req.headers['user-agent'] || 'Unknown Device';

          let actionType = 'ACTION';
          let section = 'System';
          let details = '';
          const status = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'error';

          // Determine logging values based on the request URL
          if (parsedUrl === '/api/login') {
            section = 'Authentication';
            actionType = 'LOGIN';
            if (status === 'success') {
              details = `User logged in successfully (as '${req.body.username}')`;
            } else {
              userName = req.body.username || 'unknown';
              details = `Failed login attempt for username '${req.body.username}'`;
            }
          } else if (parsedUrl === '/api/users' && method === 'POST') {
            section = 'User Management';
            actionType = 'CREATE_USER';
            details = `Created new user display name: "${req.body.display_name}", username: "${req.body.username}", role: "${req.body.role}"`;
          } else if (parsedUrl === '/api/evaluations' && method === 'POST') {
            section = 'Evaluations';
            actionType = 'CREATE_EVALUATION';
            details = `Created standard evaluation for Agent ID ${req.body.agent_id} (Brand: ${req.body.brand || 'N/A'}, Call Type: ${req.body.call_type || 'N/A'}, Score: ${req.body.final_score}%)`;
          } else if (parsedUrl.startsWith('/api/evaluations/') && method === 'PUT') {
            section = 'Evaluations';
            actionType = 'UPDATE_EVALUATION';
            const evalId = parsedUrl.split('/')[3];
            details = `Updated evaluation ID ${evalId} (Score: ${req.body.final_score}%, Status: ${req.body.status || 'Updated'})`;
          } else if (parsedUrl.includes('/tl-action')) {
            section = 'Workflow';
            actionType = 'TL_ACTION';
            const evalId = parsedUrl.split('/')[3];
            details = `TL performed action "${req.body.action}" on Evaluation ID ${evalId}. Comment: "${req.body.comment || ''}"`;
          } else if (parsedUrl.includes('/qa-action')) {
            section = 'Workflow';
            actionType = 'QA_ACTION';
            const evalId = parsedUrl.split('/')[3];
            details = `QA performed action "${req.body.action}" on Evaluation ID ${evalId}. Comment: "${req.body.comment || ''}"`;
          } else if (parsedUrl.includes('/escalation-respond')) {
            section = 'Workflow';
            actionType = 'ESCALATION_RESPONSE';
            const evalId = parsedUrl.split('/')[3];
            details = `Escalation response recorded for Evaluation ID ${evalId} (${req.body.role} - action: ${req.body.action})`;
          } else if (parsedUrl === '/api/settings/form' && method === 'POST') {
            section = 'Form Settings';
            actionType = req.body.id ? 'UPDATE_SETTING' : 'CREATE_SETTING';
            details = `${req.body.id ? 'Updated' : 'Created'} Form Criteria/Setting: type "${req.body.field_type}", key "${req.body.label_en}"`;
          } else if (parsedUrl.startsWith('/api/settings/form/') && method === 'DELETE') {
            section = 'Form Settings';
            actionType = 'DELETE_SETTING';
            const settingId = parsedUrl.split('/').pop();
            details = `Deleted Form Criteria/Setting ID: ${settingId}`;
          } else if (parsedUrl === '/api/coaching' && method === 'POST') {
            section = 'Coaching';
            actionType = 'CREATE_COACHING';
            details = `Created new coaching session for Agent ID ${req.body.agent_id} by TL ID ${req.body.tl_id}`;
          } else if (parsedUrl === '/api/drafts' && method === 'POST') {
            section = 'Drafts';
            actionType = 'CREATE_DRAFT';
            details = `Saved evaluation as draft for Agent ID ${req.body.agent_id || 'N/A'} (Brand: ${req.body.brand || 'N/A'}, Call Type: ${req.body.call_type || 'N/A'})`;
          } else if (parsedUrl.startsWith('/api/drafts/') && method === 'PUT') {
            section = 'Drafts';
            actionType = 'UPDATE_DRAFT';
            const draftId = parsedUrl.split('/')[3];
            details = `Updated draft ID ${draftId} (Agent ID ${req.body.agent_id || 'N/A'}, Brand: ${req.body.brand || 'N/A'})`;
          } else if (parsedUrl.startsWith('/api/drafts/') && method === 'DELETE') {
            section = 'Drafts';
            actionType = 'DELETE_DRAFT';
            const draftId = parsedUrl.split('/')[3];
            details = `Deleted draft ID ${draftId}`;
          } else if (parsedUrl === '/api/drafts' && method === 'DELETE') {
            section = 'Drafts';
            actionType = 'CLEAR_ALL_DRAFTS';
            const deletedCount = capturedBody?.deleted ?? 'unknown';
            details = `Cleared all drafts (${deletedCount} removed)`;
          } else if (parsedUrl.startsWith('/api/drafts/') && method === 'GET' && capturedBody?.id) {
            section = 'Drafts';
            actionType = 'RESTORE_DRAFT';
            const draftId = parsedUrl.split('/')[3];
            details = `Restored draft ID ${draftId} for editing`;
          } else if (parsedUrl.includes('/read')) {
            section = 'Notifications';
            actionType = 'READ_NOTIFICATION';
            const notifId = parsedUrl.split('/')[3];
            details = `Marked notification ID ${notifId} as read`;
          } else if (parsedUrl === '/api/notifications/read-all') {
            section = 'Notifications';
            actionType = 'READ_ALL_NOTIFICATIONS';
            details = `Marked all notifications as read for User ID ${req.body.user_id}`;
          } else {
            section = 'System';
            actionType = `${method}_OPERATION`;
            details = `Operation on ${parsedUrl} with payload: ${JSON.stringify(req.body).substring(0, 150)}`;
          }

          const actorName = userName || 'Guest / System';
          const actorId = userId || null;

          // Save audit logs securely to database
          await db.prepare(`
            INSERT INTO audit_logs (user_id, user_name, action_type, section, details, ip_address, user_agent, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(actorId, actorName, actionType, section, details, ipClean, userAgent, status);

        } catch (err) {
          console.error("AUDIT LOGGING MIDDLEWARE ERROR:", err);
        }
      });

      next();
    });

    // -----------------------------------------------------------------
    // QA scope helpers — every endpoint that lists evaluations/stats
    // funnels through these to enforce per-user department + brand
    // visibility. A QA whose arrays are empty sees nothing.
    // -----------------------------------------------------------------
    const parseJsonArray = (v: any): string[] => {
      if (!v) return [];
      if (Array.isArray(v)) return v.map(String);
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch { return []; }
    };

    /**
     * Three-state scope value:
     *   - null            → column is NULL (never configured, legacy user). Treat
     *                       as "no restriction" so existing accounts don't break
     *                       the moment the scope feature ships.
     *   - []              → column is '[]' (explicitly configured with no
     *                       entries). Treat as "deny everything" — the admin
     *                       did this on purpose.
     *   - ['x', 'y', ...] → real allow-list.
     */
    const parseScopeColumn = (v: any): string[] | null => {
      if (v === null || v === undefined) return null;
      if (Array.isArray(v)) return v.map(String);
      const s = String(v).trim();
      if (s === '') return null;
      try {
        const parsed = JSON.parse(s);
        if (!Array.isArray(parsed)) return null;
        return parsed.map(String);
      } catch { return null; }
    };

    const getQAScope = async (userId: any): Promise<{ departments: string[] | null; brands: string[] | null } | null> => {
      if (!userId) return null;
      const u = await db.prepare("SELECT role, allowed_departments, allowed_brands FROM users WHERE id = ?").get(userId) as any;
      if (!u || u.role !== 'qa') return null;
      return {
        departments: parseScopeColumn(u.allowed_departments),
        brands: parseScopeColumn(u.allowed_brands),
      };
    };

    /**
     * TL brand scope. Same null/[]/[...] tri-state as QA above.
     * Returns null when the caller isn't a TL at all (so non-TL paths
     * skip the brand filter completely).
     */
    const getTLBrandScope = async (userId: any): Promise<string[] | null | undefined> => {
      if (!userId) return undefined;
      const u = await db.prepare("SELECT role, allowed_brands FROM users WHERE id = ?").get(userId) as any;
      if (!u || u.role !== 'tl') return undefined;
      return parseScopeColumn(u.allowed_brands);
    };

    /**
     * Returns a SQL snippet + params that restricts an evaluations query to
     * the caller's allowed scope. `aliases.e` is the evaluations table alias
     * and `aliases.agentJoin` is the joined users table alias (for QA's
     * department filter — TLs only need brand).
     *
     * Scope policy (forgiving — empty or stale = unrestricted, NOT deny):
     *   - column NULL (legacy user)              → no filter
     *   - column [] (explicitly empty)           → no filter (matches the
     *                                              frontend; explicit deny
     *                                              should be done via role
     *                                              change, not an empty arr)
     *   - column [...] with no live overlap      → no filter (stale config,
     *                                              e.g. brands renamed by
     *                                              the canonical migration)
     *   - column [...] with live overlap         → filter to the overlap
     *
     * Name kept as buildQAScopeClause for backwards-compat with the many
     * call sites that already use it — the body also handles TLs.
     */
    const buildQAScopeClause = async (
      userId: any,
      role: any,
      aliases: { e: string; agentJoin: string }
    ): Promise<{ clause: string; params: any[] }> => {
      if (role === 'qa') {
        const scope = await getQAScope(userId);
        if (!scope) return { clause: '', params: [] };
        const parts: string[] = [];
        const params: any[] = [];

        // Brands — apply the filter only when the QA has a non-empty list
        // AND at least one entry is a brand that actually exists in any
        // evaluation. Otherwise treat as unrestricted (stale config).
        if (scope.brands && scope.brands.length > 0) {
          const liveBrands = await db.prepare(
            "SELECT DISTINCT brand FROM evaluations WHERE brand IS NOT NULL"
          ).all() as any[];
          const liveSet = new Set(liveBrands.map((r: any) => r.brand));
          const effective = scope.brands.filter(b => liveSet.has(b));
          if (effective.length > 0) {
            parts.push(`${aliases.e}.brand IN (${effective.map(() => '?').join(',')})`);
            params.push(...effective);
          }
        }

        // Departments — same logic: apply only when the QA has a list AND
        // at least one entry is a department any agent actually belongs to.
        if (scope.departments && scope.departments.length > 0) {
          const liveDepts = await db.prepare(
            "SELECT DISTINCT department FROM users WHERE role = 'agent' AND department IS NOT NULL"
          ).all() as any[];
          const liveSet = new Set(liveDepts.map((r: any) => r.department));
          const effective = scope.departments.filter(d => liveSet.has(d));
          if (effective.length > 0) {
            parts.push(`${aliases.agentJoin}.department IN (${effective.map(() => '?').join(',')})`);
            params.push(...effective);
          }
        }

        if (!parts.length) return { clause: '', params: [] };

        // SAFETY VALVE — a QA always sees evaluations they personally
        // logged, regardless of how their brand/department scope is
        // configured. Without this, a QA who picks a brand outside their
        // own scope (because the frontend dropdown was forgiving) ends up
        // creating a call they can't see. Wrap the scope filter in an OR
        // against e.qa_id so the user's own work is always visible.
        return {
          clause: ` AND ((${parts.join(' AND ')}) OR ${aliases.e}.qa_id = ?) `,
          params: [...params, userId],
        };
      }

      if (role === 'tl') {
        const brands = await getTLBrandScope(userId);
        if (brands === undefined) return { clause: '', params: [] }; // not a TL
        if (brands === null) return { clause: '', params: [] };       // legacy — unrestricted
        if (brands.length === 0) return { clause: '', params: [] };   // empty = unrestricted (was: deny)
        // Apply only when at least one assigned brand still exists on a real
        // evaluation. Otherwise the config is stale — treat as unrestricted
        // so the TL isn't silently locked out after a brand rename.
        const liveBrands = await db.prepare(
          "SELECT DISTINCT brand FROM evaluations WHERE brand IS NOT NULL"
        ).all() as any[];
        const liveSet = new Set(liveBrands.map((r: any) => r.brand));
        const effective = brands.filter(b => liveSet.has(b));
        if (effective.length === 0) return { clause: '', params: [] };
        const brandPh = effective.map(() => '?').join(',');
        return { clause: ` AND ${aliases.e}.brand IN (${brandPh}) `, params: [...effective] };
      }

      return { clause: '', params: [] };
    };

    // Health check
    app.get("/api/health", async (req, res) => {
      try {
        await db.prepare('SELECT 1').get();
        res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
      } catch (error) {
        res.status(500).json({ status: "error", message: "Database connection failed", detail: error instanceof Error ? error.message : String(error) });
      }
    });

    // Auth
    app.post("/api/login", async (req, res) => {
      const { username, password } = req.body;
      const user = await db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);

      // Open a session row for KPI Duration tracking. Wrapped in try/catch
      // so a session-table issue can never break login.
      let sessionId: any = null;
      try {
        const result = await db.prepare(
          "INSERT INTO user_sessions (user_id, login_at, last_seen_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ).run(user.id);
        sessionId = result.lastInsertRowid;
      } catch (e) {
        console.error('Failed to open session row:', e);
      }

      res.json({
        token,
        session_id: sessionId,
        user: {
          id: user.id,
          display_name: user.display_name,
          role: user.role,
          department: user.department,
          allowed_departments: parseJsonArray(user.allowed_departments),
          allowed_brands: parseJsonArray(user.allowed_brands),
        }
      });
    });

    // -----------------------------------------------------------------
    // Attendance — Check-In / Check-Out, drives the dynamic QA Calls
    // target (35 × attended days). QAs and supervisors use this; other
    // roles never reach the endpoints because the UI hides the widget.
    // -----------------------------------------------------------------
    const todayStr = () => new Date().toISOString().split('T')[0];

    // Get today's attendance row for a user (or null).
    app.get("/api/attendance/today", async (req, res) => {
      try {
        const { user_id } = req.query;
        if (!user_id) return res.status(400).json({ error: "user_id is required" });
        const row = await db.prepare(
          "SELECT id, user_id, date, check_in_at, check_out_at FROM attendance_records WHERE user_id = ? AND date = ?"
        ).get(user_id, todayStr());
        res.json(row || null);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.post("/api/attendance/check-in", async (req, res) => {
      try {
        const { user_id } = req.body;
        if (!user_id) return res.status(400).json({ error: "user_id required" });
        const date = todayStr();
        // Idempotent — re-check-in on the same day is a no-op (we already
        // have an open row). UNIQUE constraint catches concurrent inserts.
        const existing = await db.prepare(
          "SELECT id, check_in_at, check_out_at FROM attendance_records WHERE user_id = ? AND date = ?"
        ).get(user_id, date) as any;
        if (existing) {
          // If a previous Check-Out exists today, clearing it would mess
          // with the "attended days" count. Treat double-check-in as a
          // silent success unless the row was checked out (in which case
          // we just keep the original times — no shift-back-in flow yet).
          return res.json({ success: true, id: existing.id, already: true });
        }
        const result = await db.prepare(
          "INSERT INTO attendance_records (user_id, date, check_in_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
        ).run(user_id, date);
        res.json({ success: true, id: result.lastInsertRowid });
      } catch (e: any) {
        console.error('check-in failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    app.post("/api/attendance/check-out", async (req, res) => {
      try {
        const { user_id } = req.body;
        if (!user_id) return res.status(400).json({ error: "user_id required" });
        const date = todayStr();
        const existing = await db.prepare(
          "SELECT id, check_in_at, check_out_at FROM attendance_records WHERE user_id = ? AND date = ?"
        ).get(user_id, date) as any;
        if (!existing) {
          return res.status(400).json({ error: "Check in first before checking out." });
        }
        await db.prepare(
          "UPDATE attendance_records SET check_out_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(existing.id);
        res.json({ success: true });
      } catch (e: any) {
        console.error('check-out failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // Count "attended days" — rows in [from, to] where BOTH timestamps
    // are populated. Used by the QA KPI engine and the dashboard widget.
    app.get("/api/attendance/days", async (req, res) => {
      try {
        const { user_id, from_date, to_date } = req.query;
        if (!user_id) return res.status(400).json({ error: "user_id required" });
        const today = new Date();
        const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
        const monthEnd = todayStr();
        const fromD = (from_date as string) || monthStart;
        const toD = (to_date as string) || monthEnd;
        const row = await db.prepare(
          `SELECT COUNT(*) AS c FROM attendance_records
           WHERE user_id = ? AND date >= ? AND date <= ?
             AND check_in_at IS NOT NULL AND check_out_at IS NOT NULL`
        ).get(user_id, fromD, toD) as any;
        res.json({ from_date: fromD, to_date: toD, attended_days: Number(row?.c || 0) });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Session heartbeat — keeps logout_at / last_seen_at fresh while
    // the user is active. Frontend pings every 2 minutes.
    app.post("/api/sessions/heartbeat", async (req, res) => {
      try {
        const { session_id } = req.body;
        if (!session_id) return res.status(400).json({ error: "session_id required" });
        await db.prepare(
          `UPDATE user_sessions
           SET last_seen_at = CURRENT_TIMESTAMP,
               logout_at = CURRENT_TIMESTAMP,
               duration_seconds = CAST((EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_at))) AS INTEGER)
           WHERE id = ?`
        ).run(session_id);
        res.json({ success: true });
      } catch (e: any) {
        // PG-specific EXTRACT not portable; fall back to client-recalculated total.
        try {
          await db.prepare(
            `UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP, logout_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).run(req.body.session_id);
          res.json({ success: true });
        } catch (err: any) {
          console.error('heartbeat failed:', err);
          res.status(500).json({ error: err.message });
        }
      }
    });

    // Explicit logout — finalises the session. Idempotent: a missing
    // session_id is treated as success so the frontend can call this on
    // every logout button click without worrying about race conditions.
    app.post("/api/sessions/logout", async (req, res) => {
      try {
        const { session_id } = req.body;
        if (session_id) {
          await db.prepare(
            `UPDATE user_sessions SET logout_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).run(session_id);
        }
        res.json({ success: true });
      } catch (e: any) {
        console.error('logout failed:', e);
        res.json({ success: true }); // never block logout
      }
    });

    // Users Management
    app.get("/api/users", async (req, res) => {
      const users = await db.prepare(
        "SELECT id, display_name, username, role, department, tl_id, cc_supervisor_id, allowed_departments, allowed_brands FROM users"
      ).all() as any[];
      // Parse JSON columns so the client gets real arrays.
      res.json(users.map(u => ({
        ...u,
        allowed_departments: parseJsonArray(u.allowed_departments),
        allowed_brands: parseJsonArray(u.allowed_brands),
      })));
    });

    app.post("/api/users", async (req, res) => {
      const { display_name, username, password, role, department, tl_id, cc_supervisor_id, allowed_departments, allowed_brands } = req.body;
      const hashedPassword = bcrypt.hashSync(password, 10);
      // QAs store departments + brands. TLs store brands only (their team
      // scope already comes from agent.tl_id) + an optional cc_supervisor_id.
      // Other roles stay NULL so the existing visibility rules
      // (supervisor/agent) are untouched.
      const depsJson = role === 'qa' ? JSON.stringify(Array.isArray(allowed_departments) ? allowed_departments : []) : null;
      const brandsJson = (role === 'qa' || role === 'tl')
        ? JSON.stringify(Array.isArray(allowed_brands) ? allowed_brands : [])
        : null;
      const ccSupId = role === 'tl' ? (cc_supervisor_id || null) : null;
      try {
        await db.prepare(
          "INSERT INTO users (display_name, username, password, role, department, tl_id, cc_supervisor_id, allowed_departments, allowed_brands) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(display_name, username, hashedPassword, role, department, tl_id || null, ccSupId, depsJson, brandsJson);
        res.json({ success: true });
      } catch (e) {
        res.status(400).json({ error: "Username already exists" });
      }
    });

    app.put("/api/users/:id", async (req, res) => {
      try {
        const { display_name, username, password, role, department, tl_id, cc_supervisor_id, allowed_departments, allowed_brands } = req.body;
        const userId = req.params.id;

        const existing = await db.prepare("SELECT id FROM users WHERE id = ?").get(userId) as any;
        if (!existing) return res.status(404).json({ error: "User not found" });

        const depsJson = role === 'qa' ? JSON.stringify(Array.isArray(allowed_departments) ? allowed_departments : []) : null;
        const brandsJson = (role === 'qa' || role === 'tl')
          ? JSON.stringify(Array.isArray(allowed_brands) ? allowed_brands : [])
          : null;
        const ccSupId = role === 'tl' ? (cc_supervisor_id || null) : null;

        if (password && password.length > 0) {
          const hashedPassword = bcrypt.hashSync(password, 10);
          await db.prepare(`
            UPDATE users
            SET display_name = ?, username = ?, password = ?, role = ?, department = ?, tl_id = ?,
                cc_supervisor_id = ?, allowed_departments = ?, allowed_brands = ?
            WHERE id = ?
          `).run(display_name, username, hashedPassword, role, department, tl_id || null, ccSupId, depsJson, brandsJson, userId);
        } else {
          await db.prepare(`
            UPDATE users
            SET display_name = ?, username = ?, role = ?, department = ?, tl_id = ?,
                cc_supervisor_id = ?, allowed_departments = ?, allowed_brands = ?
            WHERE id = ?
          `).run(display_name, username, role, department, tl_id || null, ccSupId, depsJson, brandsJson, userId);
        }
        res.json({ success: true });
      } catch (e: any) {
        console.error("/api/users PUT failed:", e);
        res.status(500).json({ error: e.message || "Failed to update user" });
      }
    });

    app.delete("/api/users/:id", async (req, res) => {
      try {
        await db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message || "Failed to delete user" });
      }
    });

    // Form Config
    app.get("/api/forms", async (req, res) => {
      const forms = await db.prepare("SELECT * FROM form_config").all();
      res.json(forms);
    });

    app.post("/api/forms", async (req, res) => {
      const { label, field_type, options, section, required, call_type } = req.body;
      await db.prepare("INSERT INTO form_config (label, field_type, options, section, required, call_type) VALUES (?, ?, ?, ?, ?, ?)")
        .run(label, field_type, JSON.stringify(options), section, required ? 1 : 0, call_type);
      res.json({ success: true });
    });

    // Evaluations
    app.get("/api/evaluations", async (req, res) => {
      const { user_id, role, agent_id, from_date, to_date, status, search, coaching_status, wow_only } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      let baseQuery = `
        FROM evaluations e
        JOIN users a ON e.agent_id = a.id
        JOIN users q ON e.qa_id = q.id
        LEFT JOIN users le ON e.last_edited_by = le.id
        WHERE 1=1
      `;
      let params: any[] = [];

      if (role === 'agent') {
        // Agent only sees evaluations that completed the approval cycle:
        //   - Auto-approved (score ≥ 90 on creation)              → 'Sent to Agent'
        //   - TL approved a < 90 score                            → 'Sent to Agent'
        //   - Quality approved/rejected after a TL escalation     → 'Quality Approved' / 'Rejected by Quality'
        // Evaluations in 'Pending Review' or 'Escalated' are hidden from the Agent
        // because the cycle hasn't finished yet.
        baseQuery += " AND e.agent_id = ? AND e.status IN ('Sent to Agent', 'Quality Approved', 'Rejected by Quality')";
        params.push(user_id);
      } else if (role === 'tl') {
        // TL visibility is brand-based — assigned via User Management. We no
        // longer require a.tl_id = TL.id because in practice a brand-line
        // manager isn't necessarily the line manager of every agent on that
        // brand. buildQAScopeClause below applies the IN(allowed_brands)
        // filter. A TL with no brand configured falls back to a team filter
        // so they don't go dark — see the fallback after the scope clause.
      }

      // QA scope enforcement — restricts to assigned brands + departments.
      // Empty scope = no rows match (deny-by-default).
      const qaScope = await buildQAScopeClause(user_id, role, { e: 'e', agentJoin: 'a' });
      baseQuery += qaScope.clause;
      params.push(...qaScope.params);

      // Legacy fallback: a TL with no brand list configured used to be
      // limited to a.tl_id = self. Keep that for backwards-compat so an
      // un-migrated tenant doesn't suddenly see everything.
      if (role === 'tl') {
        const tlBrands = await getTLBrandScope(user_id);
        if (tlBrands === null) {
          baseQuery += " AND a.tl_id = ?";
          params.push(user_id);
        }
      }
      // supervisor: no additional filter — they see every evaluation in every state.

      if (agent_id && agent_id !== 'all') {
        baseQuery += " AND e.agent_id = ?";
        params.push(agent_id);
      }

      if (status && status !== 'all') {
        baseQuery += " AND e.status = ?";
        params.push(status);
      }

      if (from_date) {
        baseQuery += " AND e.date >= ?";
        params.push(from_date);
      }

      if (to_date) {
        baseQuery += " AND e.date <= ?";
        params.push(to_date);
      }

      if (search) {
        baseQuery += " AND (a.display_name LIKE ? OR e.brand LIKE ?)";
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern);
      }

      // WOW Calls filter — drives the dedicated /wow-calls page.
      if (wow_only === '1' || wow_only === 'true') {
        baseQuery += " AND e.is_wow = 1";
      }

      // Coaching filter: 'coached' = at least one completed coaching session
      // for this evaluation; 'not_coached' = no completed session yet.
      if (coaching_status === 'coached') {
        baseQuery += " AND EXISTS (SELECT 1 FROM coaching_requests cr WHERE cr.evaluation_id = e.id AND cr.status = 'Completed')";
      } else if (coaching_status === 'not_coached') {
        baseQuery += " AND NOT EXISTS (SELECT 1 FROM coaching_requests cr WHERE cr.evaluation_id = e.id AND cr.status = 'Completed')";
      }

      // Count total items
      const countResult = await db.prepare(`SELECT COUNT(*) as count ${baseQuery}`).get(...params) as { count: number };
      const totalItems = countResult.count;
      const totalPages = Math.ceil(totalItems / limit);

      // Get paginated data
      const query = `
        SELECT e.*, a.display_name as agent_name, q.display_name as qa_name,
               le.display_name as last_editor_name
        ${baseQuery}
        ORDER BY e.id DESC
        LIMIT ? OFFSET ?
      `;
      const evals = await db.prepare(query).all(...params, limit, offset) as any[];

      // Pull coaching session info for just the IDs on this page. We pick
      // the "most relevant" session per evaluation — completed first, then
      // the most recently created — so the row badge reflects the current
      // state. Empty list short-circuits the query.
      const evalIds = evals.map(e => e.id);
      const coachingMap = new Map<number, any>();
      if (evalIds.length) {
        const placeholders = evalIds.map(() => '?').join(',');
        const coachingRows = await db.prepare(`
          SELECT cr.id, cr.evaluation_id, cr.status, cr.created_at,
                 cr.session_started_at, cr.agent_approved_at, cr.completed_at,
                 cr.tl_comment, cr.error_description, cr.tl_id, cr.agent_id,
                 tl.display_name AS tl_name,
                 ag.display_name AS coaching_agent_name
          FROM coaching_requests cr
          LEFT JOIN users tl ON cr.tl_id = tl.id
          LEFT JOIN users ag ON cr.agent_id = ag.id
          WHERE cr.evaluation_id IN (${placeholders})
          ORDER BY
            CASE WHEN cr.status = 'Completed' THEN 0 ELSE 1 END,
            cr.id DESC
        `).all(...evalIds) as any[];

        // First match wins per evaluation_id (already ordered: completed first)
        coachingRows.forEach(row => {
          if (!coachingMap.has(row.evaluation_id)) {
            coachingMap.set(row.evaluation_id, {
              id: row.id,
              status: row.status,
              tl_id: row.tl_id,
              tl_name: row.tl_name,
              agent_id: row.agent_id,
              agent_name: row.coaching_agent_name,
              tl_comment: row.tl_comment,
              error_description: row.error_description,
              created_at: row.created_at,
              agent_approved_at: row.agent_approved_at,
              session_started_at: row.session_started_at,
              completed_at: row.completed_at,
            });
          }
        });
      }

      res.json({
        data: evals.map((e) => {
          let parsedData = {};
          try { parsedData = typeof e.data === 'string' ? JSON.parse(e.data) : (e.data || {}); } catch {}
          return { ...e, data: parsedData, coaching: coachingMap.get(e.id) || null };
        }),
        pagination: {
          totalItems,
          totalPages,
          currentPage: page,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
    });

    app.post("/api/evaluations", async (req, res) => {
      const { date, agent_id, qa_id, brand, call_type, final_score, critical_failure, data, draft_id, is_wow } = req.body;

      // Workflow rule:
      //   score >= 90  → goes straight to Agent + TL (no approval needed)
      //   score <  90  → goes to TL only; Agent does NOT see it until cycle ends
      const status = final_score >= 90 ? 'Sent to Agent' : 'Pending Review';

      const result = await db.prepare("INSERT INTO evaluations (date, agent_id, qa_id, brand, call_type, final_score, critical_failure, data, status, is_wow, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
        .run(date, agent_id, qa_id, brand, call_type, final_score, critical_failure ? 1 : 0, JSON.stringify(data), status, is_wow ? 1 : 0);

      const evaluation_id = result.lastInsertRowid;

      // If this evaluation came from a draft, mark the draft as completed
      // instead of hard-deleting it — that way Activity Log keeps the trail.
      if (draft_id) {
        try {
          await db.prepare(`
            UPDATE evaluation_drafts
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP
            WHERE id = ? AND owner_id = ?
          `).run(draft_id, qa_id);
        } catch (err) {
          console.error("Failed to mark draft as completed:", err);
        }
      }

      // Extract details for richer notification
      const agent = await db.prepare("SELECT display_name, tl_id FROM users WHERE id = ?").get(agent_id) as any;
      const evaluator = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(qa_id) as any;
      const notes = data?.feedback?.general || 'No specific notes provided';
      const timestamp = new Date().toLocaleString();

      const notificationMsg = `
        Employee: ${agent?.display_name}
        Status: ${status} | Score: ${final_score}%
        Notes: ${notes.substring(0, 100)}${notes.length > 100 ? '...' : ''}
        Evaluator: ${evaluator?.display_name}
        Time: ${timestamp}
      `.trim();

      if (status === 'Sent to Agent') {
        // High score (>= 90): both Agent and TL get notified, no approvals needed.
        await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(agent_id, "New Evaluation Received", notificationMsg, evaluation_id);
        if (agent?.tl_id) {
          await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
            .run(agent.tl_id, "New Evaluation (Score ≥ 90%)", notificationMsg, evaluation_id);
        }
      } else {
        // Low score (< 90): only TL is notified; Agent is intentionally NOT notified
        // and the evaluation is hidden from them until the approval cycle finishes.
        if (agent?.tl_id) {
          await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
            .run(agent.tl_id, "Evaluation Pending Review (Score < 90%)", notificationMsg, evaluation_id);
        }
      }

      res.json({ success: true, id: evaluation_id });
    });

    app.put("/api/evaluations/:id", async (req, res) => {
      const { date, agent_id, qa_id, brand, call_type, final_score, critical_failure, data, status, is_wow, editor_id } = req.body;
      const evaluation_id = req.params.id;

      // Snapshot the row before the update so we can diff it for the QA edit
      // trail (who changed what, when). Skipped silently if the row vanished.
      const before = await db.prepare("SELECT * FROM evaluations WHERE id = ?").get(evaluation_id) as any;

      // Authorization: a QA may only edit calls they created. Supervisors may
      // edit any. Enforced here so the hidden pencil can't be bypassed by
      // calling the API directly. Other flows (no editor_id) are unaffected.
      if (editor_id && before) {
        const editor = await db.prepare("SELECT role FROM users WHERE id = ?").get(editor_id) as any;
        if (editor?.role === 'qa' && Number(before.qa_id) !== Number(editor_id)) {
          return res.status(403).json({ error: "You can only edit calls you created." });
        }
      }

      const newStatus = status || 'completed';
      await db.prepare(`
        UPDATE evaluations
        SET date = ?, agent_id = ?, qa_id = ?, brand = ?, call_type = ?,
            final_score = ?, critical_failure = ?, data = ?, status = ?, is_wow = ?
        WHERE id = ?
      `).run(date, agent_id, qa_id, brand, call_type, final_score, critical_failure ? 1 : 0, JSON.stringify(data), newStatus, is_wow ? 1 : 0, evaluation_id);

      // Record a field-level edit entry when an editor is identified and
      // something actually changed. Resolves question IDs to labels so the
      // supervisor sees readable "what changed" rows.
      if (editor_id && before) {
        try {
          const parseData = (d: any) => { try { return typeof d === 'string' ? JSON.parse(d) : (d || {}); } catch { return {}; } };
          const oldData = parseData(before.data);
          const newData = data || {};

          const changes: any[] = [];
          const pushIfChanged = (field: string, label: string, oldV: any, newV: any) => {
            if (String(oldV ?? '') !== String(newV ?? '')) changes.push({ field, label, old: oldV ?? '', new: newV ?? '' });
          };

          pushIfChanged('final_score', 'Final Score', before.final_score, final_score);
          pushIfChanged('status', 'Status', before.status, newStatus);
          pushIfChanged('brand', 'Brand', before.brand, brand);
          pushIfChanged('call_type', 'Call Type', before.call_type, call_type);
          pushIfChanged('date', 'Date', before.date, date);
          pushIfChanged('critical_failure', 'Critical Failure', before.critical_failure ? 'Yes' : 'No', critical_failure ? 'Yes' : 'No');
          pushIfChanged('is_wow', 'WOW Call', before.is_wow ? 'Yes' : 'No', is_wow ? 'Yes' : 'No');
          pushIfChanged('customer_phone', 'Customer Phone', oldData.customer_phone, newData.customer_phone);
          pushIfChanged('call_duration', 'Call Duration', oldData.call_duration, newData.call_duration);
          pushIfChanged('qa_note', 'QA Note', oldData?.feedback?.general, newData?.feedback?.general);

          // Per-question response changes (Yes / No / N/A).
          const oldResp = oldData.responses || {};
          const newResp = newData.responses || {};
          const qIds = Array.from(new Set([...Object.keys(oldResp), ...Object.keys(newResp)]));
          if (qIds.length) {
            const qRows = await db.prepare("SELECT id, label_en FROM form_settings WHERE field_type = 'eval_question'").all() as any[];
            const labelMap: { [k: string]: string } = {};
            qRows.forEach(r => { labelMap[String(r.id)] = r.label_en; });
            qIds.forEach(qid => {
              if (oldResp[qid] !== newResp[qid]) {
                changes.push({ field: `response:${qid}`, label: labelMap[qid] || `Question #${qid}`, old: oldResp[qid] ?? '—', new: newResp[qid] ?? '—' });
              }
            });
          }

          if (changes.length) {
            const editor = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(editor_id) as any;
            await db.prepare(
              "INSERT INTO evaluation_edits (evaluation_id, editor_id, editor_name, changes) VALUES (?, ?, ?, ?)"
            ).run(evaluation_id, editor_id, editor?.display_name || `User #${editor_id}`, JSON.stringify(changes));
            await db.prepare("UPDATE evaluations SET last_edited_at = CURRENT_TIMESTAMP, last_edited_by = ? WHERE id = ?")
              .run(editor_id, evaluation_id);
          }
        } catch (err) {
          console.error("Failed to record evaluation edit:", err);
        }
      }

      res.json({ success: true });
    });

    // QA edit trail — full change history for one evaluation (supervisor audit).
    app.get("/api/evaluations/:id/edits", async (req, res) => {
      try {
        const rows = await db.prepare(
          "SELECT id, evaluation_id, editor_id, editor_name, changes, created_at FROM evaluation_edits WHERE evaluation_id = ? ORDER BY id DESC"
        ).all(req.params.id) as any[];
        res.json(rows.map(r => ({
          ...r,
          changes: (() => { try { return typeof r.changes === 'string' ? JSON.parse(r.changes) : (r.changes || []); } catch { return []; } })(),
        })));
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Toggle a call's WOW flag — QA + Supervisor only. Lightweight endpoint
    // so the WOW button can flip the badge from anywhere (All Calls list,
    // evaluation detail page, the WOW Calls page itself) without rebuilding
    // the entire evaluation payload.
    app.post("/api/evaluations/:id/wow", async (req, res) => {
      try {
        const { is_wow } = req.body;
        await db.prepare("UPDATE evaluations SET is_wow = ? WHERE id = ?")
          .run(is_wow ? 1 : 0, req.params.id);
        res.json({ success: true, is_wow: !!is_wow });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // -----------------------------------------------------------------
    // Agent-initiated escalation (dispute) — Agent → TL → (Quality | closed)
    // -----------------------------------------------------------------

    // Step 1: the Agent requests a re-review of their own call. Allowed only
    // when the call is visible to them ('Sent to Agent'), scored below 100,
    // and has never been escalated before (agent_escalation_status IS NULL).
    app.post("/api/evaluations/:id/agent-escalate", async (req, res) => {
      try {
        const { user_id, reason } = req.body;
        const evaluation_id = req.params.id;

        const ev = await db.prepare(
          "SELECT agent_id, qa_id, final_score, status, agent_escalation_status FROM evaluations WHERE id = ?"
        ).get(evaluation_id) as any;
        if (!ev) return res.status(404).json({ error: "Evaluation not found" });

        // Must be the agent's own call.
        if (Number(ev.agent_id) !== Number(user_id)) {
          return res.status(403).json({ error: "You can only escalate your own calls." });
        }
        // Eligibility — mirrors the button-visibility rules on the client.
        if (ev.status !== 'Sent to Agent') {
          return res.status(400).json({ error: "This call is not eligible for escalation." });
        }
        if (Number(ev.final_score) >= 100) {
          return res.status(400).json({ error: "Full-score calls cannot be escalated." });
        }
        if (ev.agent_escalation_status) {
          return res.status(400).json({ error: "An escalation request already exists for this call." });
        }

        await db.prepare(
          "UPDATE evaluations SET agent_escalation_status = 'pending', agent_escalation_reason = ?, agent_escalation_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(reason || null, evaluation_id);

        // Use a distinct action ('requested') so the agent's request is never
        // miscounted by the many queries that count action = 'escalated'.
        await db.prepare(
          "INSERT INTO escalation_logs (evaluation_id, user_id, role, action, comment, old_score, new_score) VALUES (?, ?, 'agent', 'requested', ?, ?, ?)"
        ).run(evaluation_id, user_id, reason || '', ev.final_score, ev.final_score);

        // Notify the agent's TL.
        const agent = await db.prepare("SELECT display_name, tl_id FROM users WHERE id = ?").get(ev.agent_id) as any;
        if (agent?.tl_id) {
          await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
            .run(
              agent.tl_id,
              "Agent Escalation Request",
              `${agent.display_name} requested a re-review of evaluation #${evaluation_id} (score ${ev.final_score}%).\nReason: ${reason || '(none)'}`,
              evaluation_id
            );
        }

        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Step 2: the TL decides on a pending agent escalation request.
    //   approve → call enters the normal Quality escalation flow ('Escalated')
    //   reject  → request closed, call stays 'Sent to Agent', reason kept
    app.post("/api/evaluations/:id/agent-escalation-decision", async (req, res) => {
      try {
        const { user_id, action, comment } = req.body; // action: 'approve' | 'reject'
        const evaluation_id = req.params.id;

        const ev = await db.prepare(
          "SELECT agent_id, qa_id, final_score, status, agent_escalation_status FROM evaluations WHERE id = ?"
        ).get(evaluation_id) as any;
        if (!ev) return res.status(404).json({ error: "Evaluation not found" });
        if (ev.agent_escalation_status !== 'pending') {
          return res.status(400).json({ error: "No pending escalation request for this call." });
        }

        const tl = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(user_id) as any;
        const tlName = tl?.display_name || `TL #${user_id}`;
        const actionTime = new Date().toLocaleString();

        if (action === 'approve') {
          // Hand off to the normal Quality review cycle.
          await db.prepare(
            "UPDATE evaluations SET agent_escalation_status = 'approved', agent_escalation_response = ?, status = 'Escalated' WHERE id = ?"
          ).run(comment || null, evaluation_id);

          // Log as a standard TL escalation so Quality picks it up and the
          // audit trail / dashboard stats stay consistent.
          await db.prepare(
            "INSERT INTO escalation_logs (evaluation_id, user_id, role, action, comment, old_score, new_score) VALUES (?, ?, 'tl', 'escalated', ?, ?, ?)"
          ).run(evaluation_id, user_id, comment || 'Approved agent escalation request', ev.final_score, ev.final_score);

          await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
            .run(ev.qa_id, "Evaluation Escalated (Agent request)", `${tlName} approved an agent escalation for evaluation #${evaluation_id} on ${actionTime}. Please review.`, evaluation_id);
          await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
            .run(ev.agent_id, "Escalation Approved", `${tlName} approved your escalation request for evaluation #${evaluation_id}. It has been sent to Quality for review.`, evaluation_id);
        } else {
          // Reject — close the request; the call is unchanged.
          await db.prepare(
            "UPDATE evaluations SET agent_escalation_status = 'rejected', agent_escalation_response = ? WHERE id = ?"
          ).run(comment || null, evaluation_id);

          await db.prepare(
            "INSERT INTO escalation_logs (evaluation_id, user_id, role, action, comment, old_score, new_score) VALUES (?, ?, 'tl', 'rejected', ?, ?, ?)"
          ).run(evaluation_id, user_id, comment || 'Rejected agent escalation request', ev.final_score, ev.final_score);

          await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
            .run(ev.agent_id, "Escalation Rejected", `${tlName} rejected your escalation request for evaluation #${evaluation_id}.\nReason: ${comment || '(none)'}`, evaluation_id);
        }

        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Escalations & Workflow
    app.post("/api/evaluations/:id/tl-action", async (req, res) => {
      const { user_id, action, comment } = req.body; // action: approved / escalated
      const evaluation_id = req.params.id;

      const evaluation = await db.prepare("SELECT agent_id, final_score, qa_id FROM evaluations WHERE id = ?").get(evaluation_id) as any;
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });

      const newStatus = action === 'approved' ? 'Sent to Agent' : 'Escalated';

      // Look up TL identity so the audit trail and notifications carry a human name + timestamp.
      const tl = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(user_id) as any;
      const tlName = tl?.display_name || `TL #${user_id}`;
      const actionTime = new Date().toLocaleString();

      await db.prepare("UPDATE evaluations SET status = ? WHERE id = ?").run(newStatus, evaluation_id);
      await db.prepare("INSERT INTO escalation_logs (evaluation_id, user_id, role, action, comment, old_score, new_score) VALUES (?, ?, 'tl', ?, ?, ?, ?)")
        .run(evaluation_id, user_id, action, comment, evaluation.final_score, evaluation.final_score);

      if (action === 'approved') {
        // Notify the Agent — they now see the evaluation in their list.
        await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(
            evaluation.agent_id,
            "Evaluation Approved",
            `Approved by ${tlName} on ${actionTime}. Score: ${evaluation.final_score}%`,
            evaluation_id
          );
      } else {
        // Escalation: ping the Quality auditor who created the evaluation.
        await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(
            evaluation.qa_id,
            "Evaluation Escalated by TL",
            `${tlName} escalated evaluation #${evaluation_id} on ${actionTime}.\nReason: ${comment || '(no comment)'}`,
            evaluation_id
          );
      }

      res.json({ success: true, status: newStatus });
    });

    app.post("/api/evaluations/:id/qa-action", async (req, res) => {
      const { user_id, action, comment, newData } = req.body; // action: approved / rejected
      const evaluation_id = req.params.id;

      const evaluation = await db.prepare("SELECT agent_id, final_score, qa_id FROM evaluations WHERE id = ?").get(evaluation_id) as any;
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });

      const newStatus = action === 'approved' ? 'Quality Approved' : 'Rejected by Quality';

      if (action === 'approved' && newData) {
        await db.prepare(`
          UPDATE evaluations
          SET final_score = ?, critical_failure = ?, data = ?, status = ?
          WHERE id = ?
        `).run(newData.final_score, newData.critical_failure ? 1 : 0, JSON.stringify(newData.data), newStatus, evaluation_id);

        // Auto-open an Accuracy Case whenever the post-escalation score
        // is different from the original. The TL who escalated this
        // evaluation is recorded as the case's tl_id; the QA whose
        // call was reworked is the qa_id. Supervisors can later adjust
        // qa_share / status from the Accuracy Cases page.
        try {
          const oldScore = Number(evaluation.final_score);
          const newScore = Number(newData.final_score);
          if (Number.isFinite(oldScore) && Number.isFinite(newScore) && oldScore !== newScore) {
            const lastEscalation = await db.prepare(
              `SELECT user_id FROM escalation_logs
               WHERE evaluation_id = ? AND action = 'escalated'
               ORDER BY id DESC LIMIT 1`
            ).get(evaluation_id) as any;
            const tlId = lastEscalation?.user_id || null;
            const delta = newScore - oldScore;
            const direction = delta > 0 ? '+' : '';
            // Severity heuristic: bigger swings = more severe.
            const absDelta = Math.abs(delta);
            const severity = absDelta >= 15 ? 'high' : absDelta >= 7 ? 'medium' : 'low';
            const title = `Score changed after escalation (${oldScore}% → ${newScore}%, ${direction}${delta.toFixed(1)})`;
            const description = `Original score ${oldScore}%, adjusted to ${newScore}% after QA review of TL escalation. QA comment: ${comment || '(none)'}`;
            if (tlId) {
              await db.prepare(
                `INSERT INTO accuracy_cases (qa_id, tl_id, evaluation_id, title, description, severity, qa_share, status)
                 VALUES (?, ?, ?, ?, ?, ?, 1.0, 'open')`
              ).run(evaluation.qa_id, tlId, evaluation_id, title, description, severity);
            }
          }
        } catch (err) {
          console.error('Auto-create accuracy_case failed:', err);
        }
      } else {
        await db.prepare("UPDATE evaluations SET status = ? WHERE id = ?").run(newStatus, evaluation_id);
      }

      await db.prepare("INSERT INTO escalation_logs (evaluation_id, user_id, role, action, comment, old_score, new_score) VALUES (?, ?, 'qa', ?, ?, ?, ?)")
        .run(evaluation_id, user_id, action, comment, evaluation.final_score, action === 'approved' && newData ? newData.final_score : evaluation.final_score);

      // Final recipients for Approved/Rejected: TL and Agent
      const agent = await db.prepare("SELECT tl_id FROM users WHERE id = ?").get(evaluation.agent_id) as any;

      // Notify Agent
      await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
        .run(evaluation.agent_id, `Evaluation ${newStatus}`, `Your evaluation has been ${newStatus.toLowerCase()}.`, evaluation_id);

      // Notify TL
      if (agent && agent.tl_id) {
        await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(agent.tl_id, `Evaluation ${newStatus}`, `Escalation for evaluation ${evaluation_id} has been ${newStatus.toLowerCase()}. Reason: ${comment}`, evaluation_id);
      }

      res.json({ success: true });
    });

    app.post("/api/evaluations/:id/escalation-respond", async (req, res) => {
      const { user_id, role, action, comment, old_score, new_score } = req.body;
      const evaluation_id = req.params.id;

      const evaluation = await db.prepare("SELECT agent_id, final_score, qa_id FROM evaluations WHERE id = ?").get(evaluation_id) as any;
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });

      let newStatus = "";
      if (role === 'tl') {
        newStatus = action === 'approved' ? 'Sent to Agent' : 'Escalated';
      } else {
        // QA acting on a previously-escalated evaluation.
        newStatus = action === 'approved' ? 'Quality Approved' : 'Rejected by Quality';
      }

      await db.prepare("UPDATE evaluations SET status = ? WHERE id = ?").run(newStatus, evaluation_id);
      await db.prepare("INSERT INTO escalation_logs (evaluation_id, user_id, role, action, comment, old_score, new_score) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(evaluation_id, user_id, role, action, comment, old_score ?? evaluation.final_score, new_score ?? evaluation.final_score);

      // Notify everyone affected so the new state is visible without a refresh.
      const actor = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(user_id) as any;
      const actorName = actor?.display_name || `User #${user_id}`;
      const actionTime = new Date().toLocaleString();
      const agentMsg = `${actorName} marked your evaluation as "${newStatus}" on ${actionTime}.\nNote: ${comment || '(none)'}`;

      // Both 'Sent to Agent' and 'Quality Approved' / 'Rejected by Quality' are terminal
      // states that the Agent is allowed to see, so notify them in all three cases.
      if (newStatus === 'Sent to Agent' || newStatus === 'Quality Approved' || newStatus === 'Rejected by Quality') {
        await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(evaluation.agent_id, `Evaluation ${newStatus}`, agentMsg, evaluation_id);

        // Also keep the TL in the loop on QA-side decisions.
        if (role === 'qa') {
          const ag = await db.prepare("SELECT tl_id FROM users WHERE id = ?").get(evaluation.agent_id) as any;
          if (ag?.tl_id) {
            await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
              .run(ag.tl_id, `Evaluation ${newStatus}`, `Quality decided "${newStatus}" on evaluation #${evaluation_id} (${actionTime}).`, evaluation_id);
          }
        }
      } else if (newStatus === 'Escalated') {
        // TL re-escalated → re-notify the QA owner.
        await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(
            evaluation.qa_id,
            "Evaluation Escalated by TL",
            `${actorName} escalated evaluation #${evaluation_id} on ${actionTime}.\nReason: ${comment || '(no comment)'}`,
            evaluation_id
          );
      }

      res.json({ success: true, status: newStatus });
    });

    // Form Settings APIs
    app.get("/api/settings/form", async (req, res) => {
      const settings = await db.prepare("SELECT * FROM form_settings ORDER BY field_type, sort_order ASC").all();
      res.json(settings);
    });

    app.post("/api/settings/form", async (req, res) => {
      const { field_type, label_en, label_ar, value, is_active, sort_order, id } = req.body;
      if (id) {
        await db.prepare("UPDATE form_settings SET field_type=?, label_en=?, label_ar=?, value=?, is_active=?, sort_order=? WHERE id=?")
          .run(field_type, label_en, label_ar, value, is_active ? 1 : 0, sort_order || 0, id);
      } else {
        await db.prepare("INSERT INTO form_settings (field_type, label_en, label_ar, value, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)")
          .run(field_type, label_en, label_ar, value, is_active !== undefined ? (is_active ? 1 : 0) : 1, sort_order || 0);
      }
      res.json({ success: true });
    });

    app.delete("/api/settings/form/:id", async (req, res) => {
      await db.prepare("DELETE FROM form_settings WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    });

    // -----------------------------------------------------------------
    // Draft Management
    //   - QAs save in-progress evaluations as drafts and resume later.
    //   - The owner sees their own drafts; supervisors see everyone's.
    //   - Visibility rule:
    //       role === 'supervisor'  →  all drafts
    //       any other role         →  only drafts where owner_id = user_id
    // -----------------------------------------------------------------
    const buildDraftTitle = (data: any, agentName?: string) => {
      const parts: string[] = [];
      if (agentName) parts.push(agentName);
      if (data?.brand) parts.push(data.brand);
      if (data?.call_type) parts.push(data.call_type);
      return parts.length ? parts.join(' • ') : 'Untitled draft';
    };

    // List drafts. Always filters out 'completed' rows — those are kept
    // for the audit trail but should never appear in the side panel.
    app.get("/api/drafts", async (req, res) => {
      try {
        const { user_id, role } = req.query;
        if (!user_id) return res.status(400).json({ error: "user_id is required" });

        let query = `
          SELECT d.id, d.owner_id, d.agent_id, d.brand, d.call_type, d.title,
                 d.data, d.status, d.created_at, d.updated_at,
                 o.display_name AS owner_name,
                 a.display_name AS agent_name
          FROM evaluation_drafts d
          LEFT JOIN users o ON d.owner_id = o.id
          LEFT JOIN users a ON d.agent_id = a.id
          WHERE d.status = 'draft'
        `;
        const params: any[] = [];
        if (role !== 'supervisor') {
          query += " AND d.owner_id = ?";
          params.push(user_id);
        }
        query += " ORDER BY d.updated_at DESC";

        const rows = await db.prepare(query).all(...params) as any[];

        // Parse `data` so the client doesn't have to.
        const drafts = rows.map(r => {
          let parsed: any = null;
          try { parsed = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; } catch {}
          return { ...r, data: parsed };
        });

        res.json({ count: drafts.length, drafts });
      } catch (e: any) {
        console.error("/api/drafts GET failed:", e);
        res.status(500).json({ error: e.message });
      }
    });

    // Fetch a single draft. Same visibility rules as list.
    app.get("/api/drafts/:id", async (req, res) => {
      try {
        const { user_id, role } = req.query;
        const draftId = req.params.id;
        const row = await db.prepare(`
          SELECT d.*, o.display_name AS owner_name, a.display_name AS agent_name
          FROM evaluation_drafts d
          LEFT JOIN users o ON d.owner_id = o.id
          LEFT JOIN users a ON d.agent_id = a.id
          WHERE d.id = ?
        `).get(draftId) as any;
        if (!row) return res.status(404).json({ error: "Draft not found" });
        if (row.status !== 'draft') return res.status(410).json({ error: "Draft was completed or deleted" });
        if (role !== 'supervisor' && String(row.owner_id) !== String(user_id)) {
          return res.status(403).json({ error: "Forbidden" });
        }
        let parsed: any = null;
        try { parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data; } catch {}
        res.json({ ...row, data: parsed });
      } catch (e: any) {
        console.error("/api/drafts/:id GET failed:", e);
        res.status(500).json({ error: e.message });
      }
    });

    // Create a new draft. Only the owner can create.
    app.post("/api/drafts", async (req, res) => {
      try {
        const { owner_id, agent_id, brand, call_type, data } = req.body;
        if (!owner_id) return res.status(400).json({ error: "owner_id is required" });

        let agentName: string | undefined;
        if (agent_id) {
          const a = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(agent_id) as any;
          agentName = a?.display_name;
        }
        const title = buildDraftTitle({ brand, call_type }, agentName);

        const result = await db.prepare(`
          INSERT INTO evaluation_drafts (owner_id, agent_id, brand, call_type, title, data, status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP)
        `).run(owner_id, agent_id || null, brand || null, call_type || null, title, JSON.stringify(data || {}));

        res.json({ success: true, id: result.lastInsertRowid, title });
      } catch (e: any) {
        console.error("/api/drafts POST failed:", e);
        res.status(500).json({ error: e.message });
      }
    });

    // Update an existing draft. Only the owner (or supervisor) can update.
    app.put("/api/drafts/:id", async (req, res) => {
      try {
        const { user_id, role, agent_id, brand, call_type, data } = req.body;
        const draftId = req.params.id;

        const existing = await db.prepare("SELECT owner_id, status FROM evaluation_drafts WHERE id = ?").get(draftId) as any;
        if (!existing) return res.status(404).json({ error: "Draft not found" });
        if (existing.status !== 'draft') return res.status(410).json({ error: "Draft was completed" });
        if (role !== 'supervisor' && String(existing.owner_id) !== String(user_id)) {
          return res.status(403).json({ error: "Forbidden" });
        }

        let agentName: string | undefined;
        if (agent_id) {
          const a = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(agent_id) as any;
          agentName = a?.display_name;
        }
        const title = buildDraftTitle({ brand, call_type }, agentName);

        await db.prepare(`
          UPDATE evaluation_drafts
          SET agent_id = ?, brand = ?, call_type = ?, title = ?, data = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(agent_id || null, brand || null, call_type || null, title, JSON.stringify(data || {}), draftId);

        res.json({ success: true, title });
      } catch (e: any) {
        console.error("/api/drafts PUT failed:", e);
        res.status(500).json({ error: e.message });
      }
    });

    // Delete one. user_id/role come from the query string so the audit
    // middleware can attribute the action correctly.
    app.delete("/api/drafts/:id", async (req, res) => {
      try {
        const { user_id, role } = req.query;
        const draftId = req.params.id;

        const existing = await db.prepare("SELECT owner_id FROM evaluation_drafts WHERE id = ?").get(draftId) as any;
        if (!existing) return res.status(404).json({ error: "Draft not found" });
        if (role !== 'supervisor' && String(existing.owner_id) !== String(user_id)) {
          return res.status(403).json({ error: "Forbidden" });
        }

        await db.prepare("DELETE FROM evaluation_drafts WHERE id = ?").run(draftId);
        res.json({ success: true });
      } catch (e: any) {
        console.error("/api/drafts/:id DELETE failed:", e);
        res.status(500).json({ error: e.message });
      }
    });

    // Clear all drafts for the caller (or every QA's drafts, if supervisor).
    app.delete("/api/drafts", async (req, res) => {
      try {
        const { user_id, role } = req.query;
        if (!user_id) return res.status(400).json({ error: "user_id is required" });

        let result;
        if (role === 'supervisor') {
          result = await db.prepare("DELETE FROM evaluation_drafts WHERE status = 'draft'").run();
        } else {
          result = await db.prepare("DELETE FROM evaluation_drafts WHERE owner_id = ? AND status = 'draft'").run(user_id);
        }

        res.json({ success: true, deleted: result.changes ?? 0 });
      } catch (e: any) {
        console.error("/api/drafts DELETE-all failed:", e);
        res.status(500).json({ error: e.message });
      }
    });

    // Audit Logs Query & Management API
    app.get("/api/audit-logs", async (req, res) => {
      try {
        const { search, user_name, action_type, status, section, from_date, to_date } = req.query;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        let baseQuery = "FROM audit_logs WHERE 1=1";
        const params: any[] = [];

        if (search) {
          baseQuery += " AND (user_name LIKE ? OR action_type LIKE ? OR details LIKE ? OR section LIKE ?)";
          const pattern = `%${search}%`;
          params.push(pattern, pattern, pattern, pattern);
        }

        if (user_name && user_name !== 'all') {
          baseQuery += " AND user_name = ?";
          params.push(user_name);
        }

        if (action_type && action_type !== 'all') {
          baseQuery += " AND action_type = ?";
          params.push(action_type);
        }

        if (status && status !== 'all') {
          baseQuery += " AND status = ?";
          params.push(status);
        }

        if (section && section !== 'all') {
          baseQuery += " AND section = ?";
          params.push(section);
        }

        if (from_date) {
          baseQuery += " AND created_at >= ?";
          params.push(`${from_date} 00:00:00`);
        }

        if (to_date) {
          baseQuery += " AND created_at <= ?";
          params.push(`${to_date} 23:59:59`);
        }

        const countResult = await db.prepare(`SELECT COUNT(*) as count ${baseQuery}`).get(...params) as { count: number };
        const totalItems = countResult.count;
        const totalPages = Math.ceil(totalItems / limit);

        const query = `
          SELECT *
          ${baseQuery}
          ORDER BY id DESC
          LIMIT ? OFFSET ?
        `;

        const logs = await db.prepare(query).all(...params, limit, offset);

        // Also get unique filters list for dropdown fields
        const usersList = (await db.prepare("SELECT DISTINCT user_name FROM audit_logs WHERE user_name IS NOT NULL AND user_name != 'Guest / System' ORDER BY user_name ASC").all()).map((r: any) => r.user_name);
        const actionsList = (await db.prepare("SELECT DISTINCT action_type FROM audit_logs ORDER BY action_type ASC").all()).map((r: any) => r.action_type);
        const sectionsList = (await db.prepare("SELECT DISTINCT section FROM audit_logs ORDER BY section ASC").all()).map((r: any) => r.section);

        res.json({
          data: logs,
          pagination: {
            totalItems,
            totalPages,
            currentPage: page,
            limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          },
          filters: {
            users: usersList,
            actions: actionsList,
            sections: sectionsList
          }
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Clear logs (restrict to Supervisor)
    app.post("/api/audit-logs/clear", async (req, res) => {
      try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
          return res.status(401).json({ error: "Unauthorized. Missing User ID header." });
        }
        const user = await db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as any;
        if (!user || user.role !== 'supervisor') {
          return res.status(403).json({ error: "Only Super Admin (Supervisor) can clear logs." });
        }

        await db.prepare("DELETE FROM audit_logs").run();
        res.json({ success: true, message: "All audit logs successfully cleared." });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Delete single log entry (restrict to Supervisor)
    app.delete("/api/audit-logs/:id", async (req, res) => {
      try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
          return res.status(401).json({ error: "Unauthorized. Missing User ID header." });
        }
        const user = await db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as any;
        if (!user || user.role !== 'supervisor') {
          return res.status(403).json({ error: "Only Super Admin (Supervisor) can delete a log entry." });
        }

        await db.prepare("DELETE FROM audit_logs WHERE id = ?").run(req.params.id);
        res.json({ success: true, message: "Audit log entry deleted successfully." });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/notifications", async (req, res) => {
      const user_id = req.query.user_id;
      if (!user_id) return res.status(400).json({ error: "user_id required" });
      const notifications = await db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(user_id);
      res.json(notifications);
    });

    app.post("/api/notifications/:id/read", async (req, res) => {
      await db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    });

    app.post("/api/notifications/read-all", async (req, res) => {
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: "user_id required" });
      await db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(user_id);
      res.json({ success: true });
    });

    app.get("/api/escalations/history", async (req, res) => {
      const history = await db.prepare(`
        SELECT l.*, u.display_name as user_name, e.call_type, e.brand, e.date as evaluation_date
        FROM escalation_logs l
        JOIN users u ON l.user_id = u.id
        JOIN evaluations e ON l.evaluation_id = e.id
        ORDER BY l.created_at DESC
      `).all();
      res.json(history);
    });

    app.get("/api/evaluations/:id/escalation-history", async (req, res) => {
      const history = await db.prepare(`
        SELECT l.*, u.display_name as user_name
        FROM escalation_logs l
        JOIN users u ON l.user_id = u.id
        WHERE l.evaluation_id = ?
        ORDER BY l.created_at ASC
      `).all(req.params.id);
      res.json(history);
    });

    // Coaching
    app.get("/api/coaching", async (req, res) => {
      try {
        const { user_id, role } = req.query;
        let query = `
          SELECT c.*, a.display_name as agent_name, t.display_name as tl_name 
          FROM coaching_sessions c
          JOIN users a ON c.agent_id = a.id
          JOIN users t ON c.tl_id = t.id
        `;
        let params: any[] = [];

        if (role === 'agent') {
          query += " WHERE c.agent_id = ?";
          params.push(user_id);
        } else if (role === 'tl') {
          query += " WHERE c.tl_id = ?";
          params.push(user_id);
        }
        // Supervisors see all

        const sessions = await db.prepare(query + " ORDER BY c.created_at DESC").all(...params);
        res.json(sessions);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.post("/api/coaching", async (req, res) => {
      try {
        const { agent_id, tl_id, weaknesses, notes, plan, evaluation_id } = req.body;
        const result = await db.prepare("INSERT INTO coaching_sessions (agent_id, tl_id, weaknesses, notes, plan) VALUES (?, ?, ?, ?, ?)")
          .run(agent_id, tl_id, weaknesses, notes, plan);

        const coaching_id = result.lastInsertRowid;

        // Create notification for the agent
        await db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(agent_id, "New Coaching Session", `Your TL has scheduled a coaching session for you.`, evaluation_id || null);

        res.json({ success: true, id: coaching_id });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // =====================================================================
    // Coaching Requests (new workflow tied to a specific evaluation/call)
    //
    // Lifecycle:
    //   TL creates  → 'Pending Employee Approval'  (Agent must accept)
    //   Agent OK    → 'Approved'                   (waiting for TL to start)
    //   TL starts   → 'In Progress'                (optional intermediate)
    //   TL Done     → 'Completed'
    //
    // Visibility: Agent sees their own; TL sees ones they raised; QA sees all.
    // =====================================================================

    async function logCoachingAudit(
      userId: number | string,
      userName: string | null,
      action: string,
      requestId: number | bigint | string,
      details: string
    ) {
      try {
        await db.prepare(
          "INSERT INTO audit_logs (user_id, user_name, action_type, section, details, status) VALUES (?, ?, ?, 'coaching', ?, 'success')"
        ).run(userId, userName, action, `request_id=${requestId}; ${details}`);
      } catch {
        /* logging never throws */
      }
    }

    app.post("/api/coaching-requests", async (req, res) => {
      try {
        const { evaluation_id, tl_id, tl_comment } = req.body;
        if (!evaluation_id || !tl_id || !tl_comment?.trim()) {
          return res.status(400).json({ error: "evaluation_id, tl_id and tl_comment are required" });
        }

        // Auto-populate from the evaluation: agent, call type, common error.
        const evalRow = await db.prepare(
          "SELECT agent_id, call_type, data FROM evaluations WHERE id = ?"
        ).get(evaluation_id) as any;
        if (!evalRow) return res.status(404).json({ error: "Evaluation not found" });

        let evalData: any = {};
        try {
          evalData = typeof evalRow.data === 'string' ? JSON.parse(evalRow.data) : (evalRow.data || {});
        } catch {
          evalData = {};
        }
        const customerPhone = evalData?.customer_phone || evalData?.phone || '';

        // Build a rich error_description that lists every failed evaluation
        // item (where the QA marked the answer as "No"), the QA's general
        // note, and any common-issue tags. The agent sees this exact text
        // when reviewing the coaching request, so it has to include enough
        // context to make sense without opening the original evaluation.
        const failedLines: string[] = [];
        try {
          const responses = evalData?.responses || {};
          const failedIds = Object.keys(responses).filter(k => responses[k] === 'No');
          if (failedIds.length) {
            const placeholders = failedIds.map(() => '?').join(',');
            const questions = await db.prepare(
              `SELECT id, label_en, value FROM form_settings
               WHERE field_type = 'eval_question' AND id IN (${placeholders})`
            ).all(...failedIds) as any[];
            const byId = new Map<string, any>(questions.map(q => [String(q.id), q]));
            // Preserve the original sort order from the evaluation responses
            for (const fid of failedIds) {
              const q = byId.get(String(fid));
              if (!q) { failedLines.push(`• Question #${fid}`); continue; }
              let cfg: any = {};
              try { cfg = typeof q.value === 'string' ? JSON.parse(q.value) : (q.value || {}); } catch {}
              const tags: string[] = [];
              if (cfg.weight) tags.push(`-${cfg.weight}%`);
              if (cfg.critical) tags.push('CRITICAL');
              failedLines.push(`• ${q.label_en}${tags.length ? ` (${tags.join(' · ')})` : ''}`);
            }
          }
        } catch (err) {
          console.error('Failed to expand failed-items for coaching request:', err);
        }

        const parts: string[] = [];
        // Manual "Mark as Critical" reasons take pride of place — they're
        // the QA's explicit zero-score justification.
        if (evalData?.force_zero_score && Array.isArray(evalData?.critical_failure_reasons) && evalData.critical_failure_reasons.length) {
          parts.push(`Critical Failure reasons:\n${evalData.critical_failure_reasons.map((r: string) => `• ${r}`).join('\n')}`);
        }
        if (failedLines.length) {
          parts.push(`Failed items (${failedLines.length}):\n${failedLines.join('\n')}`);
        }
        if (Array.isArray(evalData?.common_issues) && evalData.common_issues.length) {
          parts.push(`Common issues: ${evalData.common_issues.join(', ')}`);
        }
        const generalNote = evalData?.feedback?.error_description || evalData?.feedback?.general;
        if (generalNote) parts.push(`QA note: ${generalNote}`);
        const errorDesc = parts.join('\n\n');

        const result = await db.prepare(
          `INSERT INTO coaching_requests
            (evaluation_id, tl_id, agent_id, customer_phone, call_type, error_description, tl_comment, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending Employee Approval')`
        ).run(evaluation_id, tl_id, evalRow.agent_id, customerPhone, evalRow.call_type, errorDesc, tl_comment.trim());

        const requestId = result.lastInsertRowid;

        // Notify agent.
        const tl = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(tl_id) as any;
        await db.prepare(
          "INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)"
        ).run(
          evalRow.agent_id,
          "Coaching Request Received",
          `${tl?.display_name || 'Your TL'} requested a coaching session about call #${evaluation_id}.\nReason: ${tl_comment.trim().slice(0, 120)}`,
          evaluation_id
        );

        await logCoachingAudit(tl_id, tl?.display_name || null, 'coaching_request_created', requestId, `evaluation_id=${evaluation_id}; agent_id=${evalRow.agent_id}`);

        res.json({ success: true, id: requestId });
      } catch (e: any) {
        console.error('coaching-requests POST error:', e);
        res.status(500).json({ error: e.message });
      }
    });

    app.get("/api/coaching-requests", async (req, res) => {
      try {
        const { user_id, role, status } = req.query;
        let query = `
          SELECT cr.*,
                 a.display_name AS agent_name,
                 t.display_name AS tl_name,
                 e.brand        AS eval_brand,
                 e.final_score  AS eval_score,
                 e.date         AS eval_date
          FROM coaching_requests cr
          JOIN users a       ON cr.agent_id = a.id
          JOIN users t       ON cr.tl_id    = t.id
          JOIN evaluations e ON cr.evaluation_id = e.id
          WHERE 1=1
        `;
        const params: any[] = [];

        if (role === 'agent') {
          query += " AND cr.agent_id = ?";
          params.push(user_id);
        } else if (role === 'tl') {
          query += " AND cr.tl_id = ?";
          params.push(user_id);
        }
        // qa / supervisor: unrestricted

        if (status && status !== 'all') {
          query += " AND cr.status = ?";
          params.push(status);
        }

        query += " ORDER BY cr.created_at DESC";
        const rows = await db.prepare(query).all(...params);
        res.json(rows);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.get("/api/coaching-requests/:id", async (req, res) => {
      try {
        const row = await db.prepare(`
          SELECT cr.*,
                 a.display_name AS agent_name,
                 t.display_name AS tl_name,
                 e.brand AS eval_brand, e.final_score AS eval_score, e.date AS eval_date
          FROM coaching_requests cr
          JOIN users a       ON cr.agent_id = a.id
          JOIN users t       ON cr.tl_id    = t.id
          JOIN evaluations e ON cr.evaluation_id = e.id
          WHERE cr.id = ?
        `).get(req.params.id);
        if (!row) return res.status(404).json({ error: "Not found" });
        res.json(row);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Agent accepts the coaching request.
    app.post("/api/coaching-requests/:id/approve", async (req, res) => {
      try {
        const { user_id } = req.body;
        const id = req.params.id;
        const row = await db.prepare("SELECT agent_id, tl_id, status FROM coaching_requests WHERE id = ?").get(id) as any;
        if (!row) return res.status(404).json({ error: "Not found" });
        if (String(row.agent_id) !== String(user_id)) {
          return res.status(403).json({ error: "Only the assigned agent can approve this request" });
        }
        if (row.status !== 'Pending Employee Approval') {
          return res.status(400).json({ error: `Cannot approve in state "${row.status}"` });
        }

        await db.prepare(
          "UPDATE coaching_requests SET status = 'Approved', agent_approved_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(id);

        const agent = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(user_id) as any;
        await db.prepare(
          "INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)"
        ).run(
          row.tl_id,
          "Coaching Request Approved",
          `${agent?.display_name || 'The agent'} approved coaching request #${id}. You can start the session.`,
          null
        );

        await logCoachingAudit(user_id, agent?.display_name || null, 'coaching_agent_approved', id, '');

        res.json({ success: true, status: 'Approved' });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // TL starts the actual coaching session.
    app.post("/api/coaching-requests/:id/start", async (req, res) => {
      try {
        const { user_id } = req.body;
        const id = req.params.id;
        const row = await db.prepare("SELECT tl_id, status FROM coaching_requests WHERE id = ?").get(id) as any;
        if (!row) return res.status(404).json({ error: "Not found" });
        if (String(row.tl_id) !== String(user_id)) {
          return res.status(403).json({ error: "Only the TL who created this can start it" });
        }
        if (row.status !== 'Approved') {
          return res.status(400).json({ error: `Cannot start from state "${row.status}"` });
        }

        await db.prepare(
          "UPDATE coaching_requests SET status = 'In Progress', session_started_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(id);

        const tl = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(user_id) as any;
        await logCoachingAudit(user_id, tl?.display_name || null, 'coaching_session_started', id, '');

        res.json({ success: true, status: 'In Progress' });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // TL marks the session complete.
    app.post("/api/coaching-requests/:id/complete", async (req, res) => {
      try {
        const { user_id } = req.body;
        const id = req.params.id;
        const row = await db.prepare("SELECT tl_id, agent_id, status FROM coaching_requests WHERE id = ?").get(id) as any;
        if (!row) return res.status(404).json({ error: "Not found" });
        if (String(row.tl_id) !== String(user_id)) {
          return res.status(403).json({ error: "Only the TL who created this can complete it" });
        }
        if (row.status !== 'Approved' && row.status !== 'In Progress') {
          return res.status(400).json({ error: `Cannot complete from state "${row.status}"` });
        }

        await db.prepare(
          "UPDATE coaching_requests SET status = 'Completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(id);

        const tl = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(user_id) as any;
        await db.prepare(
          "INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)"
        ).run(
          row.agent_id,
          "Coaching Session Completed",
          `${tl?.display_name || 'Your TL'} marked coaching request #${id} as completed.`,
          null
        );

        await logCoachingAudit(user_id, tl?.display_name || null, 'coaching_completed', id, '');

        res.json({ success: true, status: 'Completed' });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Stats & Analytics
    app.get("/api/stats/team", async (req, res) => {
      const { role, id, department, user_id } = req.query;

      let agentsQuery = "SELECT id, display_name, department FROM users WHERE role = 'agent'";
      // Join to agents so we can apply the QA scope on a.department.
      let evalsQuery = "SELECT e.* FROM evaluations e JOIN users a ON e.agent_id = a.id WHERE 1=1";
      let coachingQuery = "SELECT * FROM coaching_sessions";
      const evalsParams: any[] = [];
      const agentsParams: any[] = [];

      // QA scope: lock down both the agent list and the eval list.
      const callerId = user_id || id;
      const qaScope = await buildQAScopeClause(callerId, role, { e: 'e', agentJoin: 'a' });
      evalsQuery += qaScope.clause;
      evalsParams.push(...qaScope.params);

      // TL Team Overview is ALWAYS strictly team-based — we filter both
      // the agent roster and the evaluation list down to agents whose
      // tl_id matches this TL. Brand scope (when configured) layers on top
      // via the qaScope clause above, so a TL with both team links AND
      // assigned brands sees the intersection.
      if (role === 'tl') {
        agentsQuery += " AND tl_id = ?";
        agentsParams.push(callerId);
        evalsQuery += " AND a.tl_id = ?";
        evalsParams.push(callerId);
      }
      if (role === 'qa') {
        const scope = await getQAScope(callerId);
        if (scope) {
          // Brands [] OR Departments [] = explicit deny.
          // Departments null = legacy, no agent-list filter.
          if (scope.brands?.length === 0 || scope.departments?.length === 0) {
            agentsQuery += " AND 1=0";
          } else if (scope.departments && scope.departments.length > 0) {
            const ph = scope.departments.map(() => '?').join(',');
            agentsQuery += ` AND department IN (${ph})`;
            agentsParams.push(...scope.departments);
          }
        }
      }

      const agents = await db.prepare(agentsQuery).all(...agentsParams) as any[];
      const evals = await db.prepare(evalsQuery).all(...evalsParams) as any[];
      const coaching = await db.prepare(coachingQuery).all() as any[];
      
      // Calculate scores per agent
      const teamPerformance = agents.map(agent => {
        const agentEvals = evals.filter(e => e.agent_id === agent.id);
        const avgScore = agentEvals.length > 0 
          ? agentEvals.reduce((acc, curr) => acc + curr.final_score, 0) / agentEvals.length 
          : 0;
        
        return {
          id: agent.id,
          name: agent.display_name,
          score: Math.round(avgScore)
        };
      }).sort((a, b) => b.score - a.score);

      const avgTeamQuality = evals.length > 0 
        ? evals.reduce((acc, curr) => acc + curr.final_score, 0) / evals.length 
        : 0;

      const stats = {
        avgTeamQuality: avgTeamQuality.toFixed(1),
        coachingSessions: coaching.length,
        processCompliance: 96, // Mock for now or calculate based on specific rules
        activeAgents: agents.length,
        teamPerformance
      };

      res.json(stats);
    });

    // Stats & Analytics
    app.get("/api/stats/lob", async (req, res) => {
      try {
        const { department, from_date, to_date, user_id, role } = req.query;

        let agentsQuery = "SELECT id, display_name, department FROM users WHERE role = 'agent'";
        let evalsQuery = "SELECT e.*, a.department, a.display_name as agent_name FROM evaluations e JOIN users a ON e.agent_id = a.id WHERE 1=1";
        let params: any[] = [];
        let agentsParams: any[] = [];

        if (department && department !== 'all') {
          agentsQuery += " AND department = ?";
          evalsQuery += " AND a.department = ?";
          params.push(department);
          agentsParams.push(department);
        }

        if (from_date) {
          evalsQuery += " AND e.date >= ?";
          params.push(from_date);
        }

        if (to_date) {
          evalsQuery += " AND e.date <= ?";
          params.push(to_date);
        }

        // QA scope: even when an explicit department filter is requested,
        // the QA can only ever see their assigned scope.
        const qaScope = await buildQAScopeClause(user_id, role, { e: 'e', agentJoin: 'a' });
        evalsQuery += qaScope.clause;
        params.push(...qaScope.params);

        // Agents see only their own numbers on the LOB Performance Hub —
        // the page lists every agent's evaluations by default, which leaks
        // peers' scores to anyone with the link. Lock down both the
        // evaluation list and the agent roster to just the caller.
        if (role === 'agent') {
          evalsQuery += " AND e.agent_id = ?";
          params.push(user_id);
          agentsQuery += " AND id = ?";
          agentsParams.push(user_id);
        }

        // Legacy TL fallback — no brand list configured = restrict to team.
        if (role === 'tl') {
          const tlBrands = await getTLBrandScope(user_id);
          if (tlBrands === null) {
            evalsQuery += " AND a.tl_id = ?";
            params.push(user_id);
          }
        }
        if (role === 'qa') {
          const scope = await getQAScope(user_id);
          if (scope) {
            if (scope.brands?.length === 0 || scope.departments?.length === 0) {
              agentsQuery += " AND 1=0";
            } else if (scope.departments && scope.departments.length > 0) {
              const ph = scope.departments.map(() => '?').join(',');
              agentsQuery += ` AND department IN (${ph})`;
              agentsParams.push(...scope.departments);
            }
          }
        }

        const agents = await db.prepare(agentsQuery).all(...agentsParams) as any[];
        const evals = await db.prepare(evalsQuery).all(...params) as any[];

        // 1. Top Performers
        const agentStats = agents.map(agent => {
          const agentEvals = evals.filter(e => e.agent_id === agent.id);
          const avgScore = agentEvals.length > 0
            ? agentEvals.reduce((acc, curr) => acc + curr.final_score, 0) / agentEvals.length
            : 0;
          return { id: agent.id, name: agent.display_name, score: Math.round(avgScore), count: agentEvals.length };
        }).filter(a => a.count > 0);

        const topPerformers = [...agentStats].sort((a, b) => b.score - a.score).slice(0, 5);
        
        // 2. Bottom Performers
        const bottomPerformers = [...agentStats].sort((a, b) => a.score - b.score).slice(0, 5);

        // 3. WOW Calls (100% scores)
        const wowCalls = evals.filter(e => e.final_score === 100).slice(0, 10).map(e => ({
          id: e.id,
          agent_name: e.agent_name,
          date: e.date,
          score: e.final_score
        }));

        // 4. Pain Points (Most frequent deductions)
        const deductions: { [key: string]: { label: string, count: number } } = {};
        
        // We need question labels for better display
        const questions = await db.prepare("SELECT value, label_en FROM form_settings WHERE field_type = 'eval_question'").all() as any[];
        const questionMap: { [key: string]: string } = {};
        questions.forEach(q => {
          // The ID in responses might be the setting id, let's map by the JSON value or some identifier if possible
          // Actually EvaluationForm uses q.id.toString() as item.id
        });
        
        // Better way: get all active questions with their IDs
        const qSettings = await db.prepare("SELECT id, label_en FROM form_settings WHERE field_type = 'eval_question'").all() as any[];
        const qIdMap: { [key: string]: string } = {};
        qSettings.forEach(qs => { qIdMap[qs.id.toString()] = qs.label_en; });

        evals.forEach(e => {
          let data: any = {};
          try {
            data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          } catch (err) {}

          if (data && data.responses) {
            Object.keys(data.responses).forEach(qId => {
              if (data.responses[qId] === 'No') {
                const label = qIdMap[qId] || `Attribute ${qId}`;
                if (!deductions[label]) {
                  deductions[label] = { label, count: 0 };
                }
                deductions[label].count++;
              }
            });
          }
        });

        const painPoints = Object.values(deductions)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        res.json({
          topPerformers,
          bottomPerformers,
          wowCalls,
          painPoints,
          summary: {
            avgScore: agentStats.length > 0 ? agentStats.reduce((acc, curr) => acc + curr.score, 0) / agentStats.length : 0,
            totalAudits: evals.length,
            activeAgents: agents.length
          }
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Stats & Analytics
    app.get("/api/stats/drop-point", async (req, res) => {
      try {
        const { user_id, role, from_date, to_date, agent_id } = req.query;
        const today = new Date().toISOString().split('T')[0];

        // Range defaults to "today only" when both bounds are missing.
        // Either bound alone is honored — e.g. from=2026-01-01 alone
        // produces an open-ended range starting that day.
        const effectiveFrom = (from_date as string) || (to_date ? null : today);
        const effectiveTo = (to_date as string) || (from_date ? null : today);

        // QA scope: lock the agent list down too so the per-agent rollups
        // can't reference agents outside the assigned departments.
        const qaScope = await buildQAScopeClause(user_id, role, { e: 'e', agentJoin: 'a' });

        // Build WHERE clause dynamically. We always emit "WHERE 1=1" so the
        // QA scope clause (which starts with " AND …") composes cleanly.
        const whereParams: any[] = [];
        let whereClause = "WHERE 1=1";
        if (effectiveFrom) { whereClause += " AND e.date >= ?"; whereParams.push(effectiveFrom); }
        if (effectiveTo) { whereClause += " AND e.date <= ?"; whereParams.push(effectiveTo); }
        if (agent_id && agent_id !== 'all') {
          whereClause += " AND e.agent_id = ?";
          whereParams.push(agent_id);
        }

        const evals = await db.prepare(`
          SELECT e.*, a.display_name as agent_name
          FROM evaluations e
          JOIN users a ON e.agent_id = a.id
          ${whereClause} ${qaScope.clause}
        `).all(...whereParams, ...qaScope.params) as any[];

        // Get all evaluation questions for mapping
        const qSettings = await db.prepare("SELECT id, label_en FROM form_settings WHERE field_type = 'eval_question'").all() as any[];
        const qIdMap: { [key: string]: string } = {};
        qSettings.forEach(qs => { qIdMap[qs.id.toString()] = qs.label_en; });

        const agentData: { [key: number]: any } = {};

        evals.forEach(e => {
          if (!agentData[e.agent_id]) {
            agentData[e.agent_id] = {
              agent_id: e.agent_id,
              agent_name: e.agent_name,
              total_calls: 0,
              total_score: 0,
              errors: {}
            };
          }

          agentData[e.agent_id].total_calls += 1;
          agentData[e.agent_id].total_score += e.final_score;

          let data: any = {};
          try {
            data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          } catch (err) {}

          // Handle call duration aggregation
          if (data && data.call_duration) {
            const durationArr = data.call_duration.split(':');
            let durationSeconds = 0;
            if (durationArr.length === 2) {
              durationSeconds = (parseInt(durationArr[0]) * 60) + parseInt(durationArr[1]);
            } else if (durationArr.length === 1) {
              durationSeconds = parseInt(durationArr[0]) || 0;
            }
            
            if (!agentData[e.agent_id].total_duration_sec) {
              agentData[e.agent_id].total_duration_sec = 0;
              agentData[e.agent_id].calls_with_duration = 0;
            }
            agentData[e.agent_id].total_duration_sec += durationSeconds;
            agentData[e.agent_id].calls_with_duration += 1;
          }

          if (data && data.responses) {
            Object.keys(data.responses).forEach(qId => {
              if (data.responses[qId] === 'No') {
                const label = qIdMap[qId] || `Attribute ${qId}`;
                if (!agentData[e.agent_id].errors[label]) {
                  agentData[e.agent_id].errors[label] = 0;
                }
                agentData[e.agent_id].errors[label] += 1;
              }
            });
          }
        });

        const result = Object.values(agentData).map(a => {
          const avgSec = a.calls_with_duration > 0 ? a.total_duration_sec / a.calls_with_duration : 0;
          const mins = Math.floor(avgSec / 60);
          const secs = Math.round(avgSec % 60);
          
          return {
            ...a,
            avg_score: a.total_calls > 0 ? (a.total_score / a.total_calls).toFixed(1) : 0,
            avg_duration: `${mins}:${secs.toString().padStart(2, '0')}`,
            error_list: Object.entries(a.errors).map(([label, count]) => ({ label, count })).sort((x: any, y: any) => y.count - x.count)
          };
        });

        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Stats & Analytics
    app.get("/api/stats/dashboard", async (req, res) => {
      try {
        const { user_id, role, from_date, to_date } = req.query;

        // Build a unified base query joining evaluations to the agent so we
        // can apply the QA scope filter consistently (it joins on a.department).
        let evalsQuery = "SELECT e.* FROM evaluations e JOIN users a ON e.agent_id = a.id WHERE 1=1";
        let agentsQuery = "SELECT id, display_name, department FROM users WHERE role = 'agent'";
        let params: any[] = [];

        if (role === 'agent') {
          evalsQuery += " AND e.agent_id = ?";
          params.push(user_id);
        }

        // Optional date-range filter (YYYY-MM-DD; the date column is TEXT so a
        // string comparison sorts correctly). Applies to every headline stat,
        // the top performers, and the escalation breakdown below.
        if (from_date) { evalsQuery += " AND e.date >= ?"; params.push(from_date); }
        if (to_date)   { evalsQuery += " AND e.date <= ?"; params.push(to_date); }
        // TL: legacy fallback handled after the brand scope clause below.

        // QA: restrict to assigned brands + departments. Also restrict the
        // active-agents list to the same department scope so headline counts
        // line up with what the QA can actually audit.
        const qaScope = await buildQAScopeClause(user_id, role, { e: 'e', agentJoin: 'a' });
        evalsQuery += qaScope.clause;
        params.push(...qaScope.params);

        let agentParams: any[] = [];
        if (role === 'qa') {
          const scope = await getQAScope(user_id);
          if (scope) {
            if (scope.brands?.length === 0 || scope.departments?.length === 0) {
              agentsQuery += " AND 1=0";
            } else if (scope.departments && scope.departments.length > 0) {
              const ph = scope.departments.map(() => '?').join(',');
              agentsQuery += ` AND department IN (${ph})`;
              agentParams.push(...scope.departments);
            }
          }
        }

        // Legacy TL fallback — if no brand list configured, behave like the
        // old team-scoped TL: only their direct agents' evaluations.
        if (role === 'tl') {
          const tlBrands = await getTLBrandScope(user_id);
          if (tlBrands === null) {
            evalsQuery += " AND a.tl_id = ?";
            params.push(user_id);
          }
        }

        const evals = await db.prepare(evalsQuery).all(...params) as any[];
        const agents = await db.prepare(agentsQuery).all(...agentParams) as any[];
        
        const avgScore = evals.length > 0 
          ? evals.reduce((acc, curr) => acc + curr.final_score, 0) / evals.length 
          : 0;
        
        const criticalFailures = evals.filter(e => e.critical_failure === 1).length;

        // Escalation breakdown (for the dashboard "Escalations" card).
        // Every 'Quality Approved' / 'Rejected by Quality' row was first escalated
        // by a TL, so the total escalated count is the union of the three states.
        const escalationStats = {
          escalated: evals.filter(e =>
            e.status === 'Escalated' ||
            e.status === 'Quality Approved' ||
            e.status === 'Rejected by Quality'
          ).length,
          pendingQuality: evals.filter(e => e.status === 'Escalated').length,
          qualityApproved: evals.filter(e => e.status === 'Quality Approved').length,
          qualityRejected: evals.filter(e => e.status === 'Rejected by Quality').length,
        };

        // Per-actor breakdown — which TL escalated how many calls, and which QA
        // approved / rejected how many. Read from escalation_logs (the authoritative
        // record of who did what), restricted to the same scope-filtered
        // evaluations above so each role only sees its own numbers.
        let escalationsByTL: any[] = [];
        let responsesByQA: any[] = [];
        const scopedEvalIds = evals.map(e => e.id);
        if (scopedEvalIds.length > 0) {
          const ph = scopedEvalIds.map(() => '?').join(',');
          const logRows = await db.prepare(
            `SELECT el.user_id, el.role, el.action, u.display_name AS name, COUNT(*) AS cnt
               FROM escalation_logs el
               JOIN users u ON el.user_id = u.id
              WHERE el.evaluation_id IN (${ph})
              GROUP BY el.user_id, el.role, el.action, u.display_name`
          ).all(...scopedEvalIds) as any[];

          const tlMap: { [id: number]: { id: number; name: string; escalated: number } } = {};
          const qaMap: { [id: number]: { id: number; name: string; approved: number; rejected: number } } = {};

          logRows.forEach(r => {
            const cnt = Number(r.cnt) || 0;
            if (r.role === 'tl' && r.action === 'escalated') {
              if (!tlMap[r.user_id]) tlMap[r.user_id] = { id: r.user_id, name: r.name, escalated: 0 };
              tlMap[r.user_id].escalated += cnt;
            } else if (r.role === 'qa' && (r.action === 'approved' || r.action === 'rejected')) {
              if (!qaMap[r.user_id]) qaMap[r.user_id] = { id: r.user_id, name: r.name, approved: 0, rejected: 0 };
              if (r.action === 'approved') qaMap[r.user_id].approved += cnt;
              else qaMap[r.user_id].rejected += cnt;
            }
          });

          escalationsByTL = Object.values(tlMap).sort((a, b) => b.escalated - a.escalated);
          responsesByQA = Object.values(qaMap).sort(
            (a, b) => (b.approved + b.rejected) - (a.approved + a.rejected)
          );
        }

        // If it's an agent, topPerformers might not make sense or they see their own history
        // Let's keep top performers for supervisors/TLs, and for agents we show something else
        let topPerformers = [];
        if (role !== 'agent') {
          topPerformers = agents.map(agent => {
            const agentEvals = evals.filter(e => e.agent_id === agent.id);
            const avgAgentScore = agentEvals.length > 0 
              ? agentEvals.reduce((acc, curr) => acc + curr.final_score, 0) / agentEvals.length 
              : 0;
            return {
              id: agent.id,
              name: agent.display_name,
              score: Math.round(avgAgentScore),
              count: agentEvals.length
            };
          })
          .filter(p => p.count > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 4);
        }

        // For agents, calculate their pain points
        let personalPainPoints = [];
        if (role === 'agent') {
          const deductions: { [key: string]: number } = {};
          const qSettings = await db.prepare("SELECT id, label_en FROM form_settings WHERE field_type = 'eval_question'").all() as any[];
          const qIdMap: { [key: string]: string } = {};
          qSettings.forEach(qs => { qIdMap[qs.id.toString()] = qs.label_en; });

          evals.forEach(e => {
            let data: any = {};
            try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) {}
            if (data && data.responses) {
              Object.keys(data.responses).forEach(qId => {
                if (data.responses[qId] === 'No') {
                  const label = qIdMap[qId] || qId;
                  deductions[label] = (deductions[label] || 0) + 1;
                }
              });
            }
          });
          personalPainPoints = Object.entries(deductions).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 5);
        }

        res.json({
          avgScore: avgScore.toFixed(1),
          totalAudits: evals.length,
          criticalFailures,
          activeAgents: role === 'agent' ? 1 : agents.length,
          topPerformers,
          painPoints: personalPainPoints,
          escalations: escalationStats,
          escalationsByTL,
          responsesByQA
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // QA Productivity — how many calls each QA logged within a date window.
    //   start_date / end_date  (YYYY-MM-DD, optional)
    //     - both missing → all time
    //     - only start_date → that single day
    //     - both present → inclusive range
    //   user_id, role          (the caller; QAs only see themselves)
    app.get("/api/stats/qa-calls", async (req, res) => {
      try {
        const { start_date, end_date, user_id, role } = req.query;

        // Build the WHERE on the `date` column (TEXT, YYYY-MM-DD — works as a string compare).
        const conds: string[] = [];
        const params: any[] = [];
        if (start_date) {
          conds.push("e.date >= ?");
          params.push(start_date);
        }
        // When only start_date is provided, treat it as a single day.
        const effectiveEnd = end_date || start_date;
        if (effectiveEnd) {
          conds.push("e.date <= ?");
          params.push(effectiveEnd);
        }

        // A QA only ever sees their own row, regardless of who else exists.
        const restrictToSelf = role === 'qa';
        if (restrictToSelf) {
          conds.push("u.id = ?");
          params.push(user_id);
        }

        const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

        // LEFT JOIN evaluations on qa_id so QAs with zero calls still show up
        // for supervisors/TLs (otherwise the section quietly hides idle users).
        // The date filter is moved into the JOIN's ON clause so a date window
        // with zero matches still surfaces the user with count=0.
        //
        // Filter by created_at (when the call was actually registered) rather
        // than the typed call date, so "calls registered today" reflects the
        // QA's logging activity. created_at::date drops the time component so
        // the whole day is included. All valid rows are backfilled at boot, so
        // created_at is populated; only malformed-date legacy rows lack it.
        // Cast the registration date to text ('YYYY-MM-DD') before comparing to
        // the string params — created_at::date is a DATE type and the driver
        // binds params as text, so a bare `date >= text` comparison errors.
        // Lexicographic text comparison of YYYY-MM-DD equals chronological order.
        const dateJoinConds: string[] = ["e.qa_id = u.id"];
        const joinParams: any[] = [];
        if (start_date) {
          dateJoinConds.push("e.created_at::date::text >= ?");
          joinParams.push(start_date);
        }
        if (effectiveEnd) {
          dateJoinConds.push("e.created_at::date::text <= ?");
          joinParams.push(effectiveEnd);
        }

        // No brand/department scope filter here. This endpoint counts calls a
        // QA personally logged (e.qa_id = u.id), so by definition every row
        // is "their own work" — applying the cross-team scope filter on top
        // would hide a QA's own throughput the moment they touched a brand
        // outside their assigned list, which is exactly what reproduces as
        // a "0 calls today" card on the dashboard for active QAs.
        // Supervisors counting other QAs' throughput also don't want a
        // scoped view here — they want raw productivity numbers.

        const userFilter = restrictToSelf ? "AND u.id = ?" : "";
        const userFilterParams = restrictToSelf ? [user_id] : [];

        const rows = await db.prepare(`
          SELECT u.id, u.display_name, u.username,
                 COUNT(e.id) AS call_count
          FROM users u
          LEFT JOIN evaluations e ON ${dateJoinConds.join(' AND ')}
          WHERE u.role = 'qa' ${userFilter}
          GROUP BY u.id, u.display_name, u.username
          ORDER BY call_count DESC, u.display_name ASC
        `).all(...joinParams, ...userFilterParams) as any[];

        const total = rows.reduce((s, r) => s + Number(r.call_count || 0), 0);

        res.json({
          start_date: start_date || null,
          end_date: effectiveEnd || null,
          total_calls: total,
          qas: rows.map(r => ({
            id: r.id,
            display_name: r.display_name,
            username: r.username,
            call_count: Number(r.call_count || 0),
          })),
        });
      } catch (e: any) {
        console.error("/api/stats/qa-calls failed:", e);
        res.status(500).json({ error: e.message });
      }
    });

    // =================================================================
    // QA KPIs — leaves, accuracy cases, config, and the aggregated score
    // =================================================================

    // ---------- Leaves ----------
    app.get("/api/leaves", async (req, res) => {
      try {
        const { user_id, month } = req.query;
        let q = `SELECT l.*, u.display_name AS user_name, a.display_name AS approved_by_name
                 FROM user_leaves l
                 LEFT JOIN users u ON l.user_id = u.id
                 LEFT JOIN users a ON l.approved_by = a.id
                 WHERE 1=1`;
        const params: any[] = [];
        if (user_id) { q += " AND l.user_id = ?"; params.push(user_id); }
        if (month) {
          q += " AND l.leave_date LIKE ?";
          params.push(`${month}%`);
        }
        q += " ORDER BY l.leave_date DESC";
        const rows = await db.prepare(q).all(...params);
        res.json(rows);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.post("/api/leaves", async (req, res) => {
      try {
        const { user_id, leave_date, leave_type, note, approved_by } = req.body;
        if (!user_id || !leave_date) return res.status(400).json({ error: "user_id and leave_date required" });
        await db.prepare(
          "INSERT INTO user_leaves (user_id, leave_date, leave_type, note, approved_by) VALUES (?, ?, ?, ?, ?)"
        ).run(user_id, leave_date, leave_type || 'annual', note || null, approved_by || null);
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.delete("/api/leaves/:id", async (req, res) => {
      try {
        await db.prepare("DELETE FROM user_leaves WHERE id = ?").run(req.params.id);
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ---------- Accuracy Cases ----------
    app.get("/api/accuracy-cases", async (req, res) => {
      try {
        const { qa_id, tl_id, status, from_date, to_date } = req.query;
        let q = `SELECT c.*, qa.display_name AS qa_name, tl.display_name AS tl_name
                 FROM accuracy_cases c
                 LEFT JOIN users qa ON c.qa_id = qa.id
                 LEFT JOIN users tl ON c.tl_id = tl.id
                 WHERE 1=1`;
        const params: any[] = [];
        if (qa_id) { q += " AND c.qa_id = ?"; params.push(qa_id); }
        if (tl_id) { q += " AND c.tl_id = ?"; params.push(tl_id); }
        if (status && status !== 'all') { q += " AND c.status = ?"; params.push(status); }
        if (from_date) { q += " AND substr(c.created_at, 1, 10) >= ?"; params.push(from_date); }
        if (to_date) { q += " AND substr(c.created_at, 1, 10) <= ?"; params.push(to_date); }
        q += " ORDER BY c.created_at DESC";
        const rows = await db.prepare(q).all(...params);
        res.json(rows);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.post("/api/accuracy-cases", async (req, res) => {
      try {
        const { qa_id, tl_id, evaluation_id, title, description, severity, qa_share } = req.body;
        if (!qa_id || !tl_id || !title) return res.status(400).json({ error: "qa_id, tl_id, title required" });
        const result = await db.prepare(
          `INSERT INTO accuracy_cases (qa_id, tl_id, evaluation_id, title, description, severity, qa_share, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`
        ).run(qa_id, tl_id, evaluation_id || null, title, description || null, severity || 'medium', qa_share ?? 1.0);

        // Notify the QA.
        try {
          const tl = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(tl_id) as any;
          await db.prepare(
            "INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)"
          ).run(
            qa_id,
            "New Accuracy Case Opened",
            `${tl?.display_name || 'A TL'} raised an accuracy case: "${title}" (${severity || 'medium'}).`,
            evaluation_id || null
          );
        } catch {}

        res.json({ success: true, id: result.lastInsertRowid });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.put("/api/accuracy-cases/:id", async (req, res) => {
      try {
        const { title, description, severity, qa_share, status, qa_comment, supervisor_note } = req.body;
        const id = req.params.id;
        const existing = await db.prepare("SELECT id FROM accuracy_cases WHERE id = ?").get(id);
        if (!existing) return res.status(404).json({ error: "Not found" });

        // Build dynamic update — only set fields the caller actually sent.
        const sets: string[] = [];
        const params: any[] = [];
        if (title !== undefined) { sets.push("title = ?"); params.push(title); }
        if (description !== undefined) { sets.push("description = ?"); params.push(description); }
        if (severity !== undefined) { sets.push("severity = ?"); params.push(severity); }
        if (qa_share !== undefined) { sets.push("qa_share = ?"); params.push(qa_share); }
        if (qa_comment !== undefined) { sets.push("qa_comment = ?"); params.push(qa_comment); }
        if (supervisor_note !== undefined) { sets.push("supervisor_note = ?"); params.push(supervisor_note); }
        if (status !== undefined) {
          sets.push("status = ?");
          params.push(status);
          if (status === 'resolved' || status === 'dismissed') {
            sets.push("resolved_at = CURRENT_TIMESTAMP");
          }
        }
        sets.push("updated_at = CURRENT_TIMESTAMP");
        params.push(id);
        await db.prepare(`UPDATE accuracy_cases SET ${sets.join(', ')} WHERE id = ?`).run(...params);
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.delete("/api/accuracy-cases/:id", async (req, res) => {
      try {
        await db.prepare("DELETE FROM accuracy_cases WHERE id = ?").run(req.params.id);
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ---------- KPI Config ----------
    const loadKPIConfig = async (userId: any) => {
      let cfg: any = null;
      if (userId) {
        cfg = await db.prepare("SELECT * FROM qa_kpi_config WHERE user_id = ?").get(userId);
      }
      if (!cfg) {
        cfg = await db.prepare("SELECT * FROM qa_kpi_config WHERE user_id IS NULL").get();
      }
      return cfg || {
        calls_target: 910, duration_hours_per_day: 8, duration_days_per_month: 26,
        escalation_sla_hours: 24, weight_calls: 0.4, weight_duration: 0.1,
        weight_tasks: 0.2, weight_accuracy: 0.3,
      };
    };

    app.get("/api/kpi/config/:user_id", async (req, res) => {
      try {
        const userId = req.params.user_id === 'default' ? null : req.params.user_id;
        const cfg = await loadKPIConfig(userId);
        res.json(cfg);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.put("/api/kpi/config/:user_id", async (req, res) => {
      try {
        const userIdRaw = req.params.user_id;
        const userId = userIdRaw === 'default' ? null : parseInt(userIdRaw, 10);
        const { calls_target, duration_hours_per_day, duration_days_per_month, escalation_sla_hours,
                weight_calls, weight_duration, weight_tasks, weight_accuracy } = req.body;
        const existing = userId
          ? await db.prepare("SELECT id FROM qa_kpi_config WHERE user_id = ?").get(userId) as any
          : await db.prepare("SELECT id FROM qa_kpi_config WHERE user_id IS NULL").get() as any;

        if (existing) {
          await db.prepare(
            `UPDATE qa_kpi_config
             SET calls_target=?, duration_hours_per_day=?, duration_days_per_month=?, escalation_sla_hours=?,
                 weight_calls=?, weight_duration=?, weight_tasks=?, weight_accuracy=?, updated_at=CURRENT_TIMESTAMP
             WHERE id = ?`
          ).run(calls_target, duration_hours_per_day, duration_days_per_month, escalation_sla_hours,
                weight_calls, weight_duration, weight_tasks, weight_accuracy, existing.id);
        } else {
          await db.prepare(
            `INSERT INTO qa_kpi_config (user_id, calls_target, duration_hours_per_day, duration_days_per_month, escalation_sla_hours, weight_calls, weight_duration, weight_tasks, weight_accuracy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(userId, calls_target, duration_hours_per_day, duration_days_per_month, escalation_sla_hours,
                weight_calls, weight_duration, weight_tasks, weight_accuracy);
        }
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ---------- The aggregated KPI calculator ----------
    // Splits one month into the four metrics, each scored 0..100, then
    // blends them by the per-QA (or default) weights.
    // includeDaily=false skips the per-day GROUP BY (used by the
    // leaderboard summary where we only need scores).
    const computeQAKPI = async (qaId: number, month: string, includeDaily: boolean = true) => {
      const monthStart = `${month}-01`;
      const [yr, mo] = month.split('-').map(Number);
      const lastDay = new Date(yr, mo, 0).getDate();
      const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
      const cfg = await loadKPIConfig(qaId);

      // ----- Calls -----
      // Target is now attendance-driven: 35 (config.calls_per_attended_day)
      // per day the QA actually checked in AND out. If they have no
      // attendance records in this month yet, fall back to the static
      // monthly target so legacy QAs don't get a 0 target.
      //
      // The Admin Supervisor can override a specific day's count from
      // the KPI page (qa_kpi_day_overrides table). Pull the overrides
      // for the month once and use them both for the daily array and
      // for the rolled-up callsActual so the score reflects the edits.
      const overrideRows = await db.prepare(
        `SELECT date, override_count FROM qa_kpi_day_overrides
         WHERE qa_id = ? AND date >= ? AND date <= ?`
      ).all(qaId, monthStart, monthEnd) as any[];
      const overrideMap = new Map<string, number>(
        overrideRows.map(r => [r.date, Number(r.override_count)])
      );

      // Always need the per-day actual counts now — they're the base
      // for both the leaderboard total and the chart. Cheap query.
      // Grouped by the registration day (created_at), NOT the typed call
      // date, so a call counts toward the day the QA actually logged it —
      // consistent with the QA Productivity card. ::date::text keeps the
      // YYYY-MM-DD comparison text-based (created_at::date is a DATE type
      // and params bind as text).
      const dailyRows = await db.prepare(
        `SELECT created_at::date::text AS date, COUNT(*) AS c FROM evaluations
         WHERE qa_id = ? AND created_at::date::text >= ? AND created_at::date::text <= ?
         GROUP BY created_at::date::text
         ORDER BY created_at::date::text ASC`
      ).all(qaId, monthStart, monthEnd) as any[];
      const actualMap = new Map<string, number>(
        dailyRows.map((r: any) => [r.date, Number(r.c)])
      );

      // Effective per-day = override (if any) else actual. Total
      // includes every date that has either an actual count or an
      // override (an override of 0 on a day with no calls would still
      // be considered "set" but contributes 0 — harmless).
      const allDates = new Set<string>([...actualMap.keys(), ...overrideMap.keys()]);
      let callsActual = 0;
      const dailyCalls: { date: string; count: number; overridden?: boolean; actual?: number }[] = [];
      const sortedDates = Array.from(allDates).sort();
      for (const date of sortedDates) {
        const actual = actualMap.get(date) || 0;
        const overridden = overrideMap.has(date);
        const count = overridden ? (overrideMap.get(date) || 0) : actual;
        callsActual += count;
        if (includeDaily) {
          dailyCalls.push({ date, count, overridden, actual });
        }
      }

      const attendedRow = await db.prepare(
        `SELECT COUNT(*) AS c FROM attendance_records
         WHERE user_id = ? AND date >= ? AND date <= ?
           AND check_in_at IS NOT NULL AND check_out_at IS NOT NULL`
      ).get(qaId, monthStart, monthEnd) as any;
      const attendedDays = Number(attendedRow?.c || 0);
      const perDayTarget = Number(cfg.calls_per_attended_day) || 35;
      const dynamicTarget = attendedDays * perDayTarget;
      const effectiveCallsTarget = attendedDays > 0 ? dynamicTarget : cfg.calls_target;
      const callsScore = Math.min(100, (callsActual / Math.max(1, effectiveCallsTarget)) * 100);

      // ----- Duration -----
      // Sum (last_seen_at - login_at) for all sessions in the month.
      // The PG-specific EXTRACT trick is wrapped — if it fails, fall back
      // to JS-side calculation by reading rows.
      let actualSeconds = 0;
      try {
        const sessions = await db.prepare(
          `SELECT login_at, last_seen_at FROM user_sessions
           WHERE user_id = ? AND substr(CAST(login_at AS TEXT), 1, 10) >= ? AND substr(CAST(login_at AS TEXT), 1, 10) <= ?`
        ).all(qaId, monthStart, monthEnd) as any[];
        for (const s of sessions) {
          if (!s.login_at) continue;
          const start = new Date(s.login_at).getTime();
          const end = s.last_seen_at ? new Date(s.last_seen_at).getTime() : start;
          if (end > start) actualSeconds += Math.floor((end - start) / 1000);
        }
      } catch {}
      const actualHours = actualSeconds / 3600;

      const leavesRow = await db.prepare(
        `SELECT COUNT(*) AS c FROM user_leaves WHERE user_id = ? AND leave_date >= ? AND leave_date <= ?`
      ).get(qaId, monthStart, monthEnd) as any;
      const leaveDays = Number(leavesRow?.c || 0);
      const effectiveDays = Math.max(0, cfg.duration_days_per_month - leaveDays);
      const targetHours = effectiveDays * cfg.duration_hours_per_day;
      const durationScore = targetHours <= 0 ? 100 : Math.min(100, (actualHours / targetHours) * 100);

      // ----- Tasks (escalations handled within SLA) -----
      // Pair each "escalated" event with the next non-escalated QA action
      // on the same evaluation in one query — previous N+1 ran one inner
      // SELECT per escalation, which was the dominant cost of the KPI
      // endpoint (10 QAs × 50 escalations = 500 round-trips).
      const slaSeconds = cfg.escalation_sla_hours * 3600;
      const escalations = await db.prepare(
        `SELECT el.evaluation_id, el.created_at AS escalated_at,
                (SELECT MIN(el2.created_at) FROM escalation_logs el2
                 WHERE el2.evaluation_id = el.evaluation_id
                   AND el2.user_id = ?
                   AND el2.action <> 'escalated'
                   AND el2.created_at > el.created_at) AS responded_at
         FROM escalation_logs el
         WHERE el.action = 'escalated'
           AND substr(CAST(el.created_at AS TEXT), 1, 10) >= ?
           AND substr(CAST(el.created_at AS TEXT), 1, 10) <= ?`
      ).all(qaId, monthStart, monthEnd) as any[];

      let tasksTotal = 0;
      let tasksOnTime = 0;
      let tasksOverdue = 0;
      for (const esc of escalations) {
        if (!esc.responded_at) continue; // not assigned to this QA, or still pending
        tasksTotal++;
        const dt = (new Date(esc.responded_at).getTime() - new Date(esc.escalated_at).getTime()) / 1000;
        if (dt <= slaSeconds) tasksOnTime++; else tasksOverdue++;
      }
      const tasksScore = tasksTotal === 0 ? 100 : (tasksOnTime / tasksTotal) * 100;

      // ----- Accuracy -----
      // Deduct (severity weight × qa_share) per case opened in the month.
      const sevWeight: Record<string, number> = { low: 2, medium: 5, high: 10 };
      const cases = await db.prepare(
        `SELECT severity, qa_share, status FROM accuracy_cases
         WHERE qa_id = ? AND substr(CAST(created_at AS TEXT), 1, 10) >= ? AND substr(CAST(created_at AS TEXT), 1, 10) <= ?`
      ).all(qaId, monthStart, monthEnd) as any[];
      let deductions = 0;
      const openCases = cases.filter(c => c.status !== 'dismissed');
      for (const c of openCases) {
        const w = sevWeight[c.severity] || 5;
        deductions += w * (Number(c.qa_share) || 1);
      }
      const accuracyScore = Math.max(0, 100 - deductions);

      // ----- Blend -----
      const totalScore =
        callsScore * cfg.weight_calls +
        durationScore * cfg.weight_duration +
        tasksScore * cfg.weight_tasks +
        accuracyScore * cfg.weight_accuracy;

      return {
        qa_id: qaId,
        month,
        config: cfg,
        calls: {
          actual: callsActual,
          target: effectiveCallsTarget,
          attended_days: attendedDays,
          per_day_target: perDayTarget,
          daily: dailyCalls,
          score: Math.round(callsScore * 10) / 10,
          weight: cfg.weight_calls,
        },
        duration: { actual_hours: Math.round(actualHours * 10) / 10, target_hours: targetHours, leave_days: leaveDays, score: Math.round(durationScore * 10) / 10, weight: cfg.weight_duration },
        tasks: { total: tasksTotal, on_time: tasksOnTime, overdue: tasksOverdue, sla_hours: cfg.escalation_sla_hours, score: Math.round(tasksScore * 10) / 10, weight: cfg.weight_tasks },
        accuracy: { cases: openCases.length, deductions: Math.round(deductions * 10) / 10, score: Math.round(accuracyScore * 10) / 10, weight: cfg.weight_accuracy },
        total_score: Math.round(totalScore * 10) / 10,
      };
    };

    // Single QA — used by self-view and detail drill-in.
    app.get("/api/kpi/qa/:user_id", async (req, res) => {
      try {
        const userId = parseInt(req.params.user_id, 10);
        const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
        const result = await computeQAKPI(userId, month);
        res.json(result);
      } catch (e: any) {
        console.error('KPI compute failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // Admin Supervisor override for a single (QA, date). Upserts the
    // row, recomputes the score downstream. Pass count: null to clear
    // the override and revert to the actual evaluation count.
    app.put("/api/kpi/qa/:user_id/day-override", async (req, res) => {
      try {
        const qaId = parseInt(req.params.user_id, 10);
        const { date, count, note, set_by_user_id } = req.body;
        if (!date) return res.status(400).json({ error: "date required" });

        if (count === null || count === undefined || count === '') {
          await db.prepare("DELETE FROM qa_kpi_day_overrides WHERE qa_id = ? AND date = ?")
            .run(qaId, date);
          return res.json({ success: true, cleared: true });
        }
        const c = parseInt(String(count), 10);
        if (!Number.isFinite(c) || c < 0) {
          return res.status(400).json({ error: "count must be a non-negative integer" });
        }

        // Upsert — try update first, then insert.
        const existing = await db.prepare(
          "SELECT id FROM qa_kpi_day_overrides WHERE qa_id = ? AND date = ?"
        ).get(qaId, date) as any;
        if (existing) {
          await db.prepare(
            "UPDATE qa_kpi_day_overrides SET override_count = ?, note = ?, set_by_user_id = ?, set_at = CURRENT_TIMESTAMP WHERE id = ?"
          ).run(c, note || null, set_by_user_id || null, existing.id);
        } else {
          await db.prepare(
            "INSERT INTO qa_kpi_day_overrides (qa_id, date, override_count, note, set_by_user_id) VALUES (?, ?, ?, ?, ?)"
          ).run(qaId, date, c, note || null, set_by_user_id || null);
        }
        res.json({ success: true });
      } catch (e: any) {
        console.error('day-override failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // All QAs — supervisor view. Returns a lean summary per QA.
    app.get("/api/kpi/summary", async (req, res) => {
      try {
        const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
        const qas = await db.prepare("SELECT id, display_name FROM users WHERE role = 'qa'").all() as any[];
        // Promise.all parallelises the per-QA computations against the
        // PG connection pool — was previously sequential and stacked up
        // 10+ seconds of waterfall for ~10 QAs. includeDaily=false also
        // skips the GROUP BY date query that the leaderboard doesn't use.
        const results = await Promise.all(qas.map(async (qa: any) => {
          const r = await computeQAKPI(qa.id, month, false);
          return {
            qa_id: qa.id,
            qa_name: qa.display_name,
            calls_score: r.calls.score,
            duration_score: r.duration.score,
            tasks_score: r.tasks.score,
            accuracy_score: r.accuracy.score,
            total_score: r.total_score,
          };
        }));
        results.sort((a, b) => b.total_score - a.total_score);
        res.json({ month, qas: results });
      } catch (e: any) {
        console.error('KPI summary failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // =================================================================
    // CC Operations — per-TL view for the Call-Center Supervisor.
    //   Lists each TL with rollups: team size, avg team score, coaching
    //   counts, escalation counts + SLA stats. Drill-down endpoint adds
    //   the actual rows.
    //
    //   role === 'cc_supervisor'  →  only TLs whose cc_supervisor_id
    //                                 matches the caller
    //   role === 'supervisor'     →  every TL
    // =================================================================

    const DEFAULT_ESCALATION_SLA_HOURS = 24;

    app.get("/api/cc/tl-ops", async (req, res) => {
      try {
        const { user_id, role, from_date, to_date } = req.query;

        // Pick the TL roster the caller is allowed to see.
        let tlsQuery = "SELECT id, display_name, username FROM users WHERE role = 'tl'";
        const tlsParams: any[] = [];
        if (role === 'cc_supervisor') {
          tlsQuery += " AND cc_supervisor_id = ?";
          tlsParams.push(user_id);
        }
        tlsQuery += " ORDER BY display_name";
        const tls = await db.prepare(tlsQuery).all(...tlsParams) as any[];

        // Date range — default to current month if neither provided.
        const today = new Date();
        const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
        const monthEnd = today.toISOString().split('T')[0];
        const fromD = (from_date as string) || monthStart;
        const toD = (to_date as string) || monthEnd;

        // SLA threshold — pull cc_supervisor's preference if set; for now
        // use the global default.
        const slaHours = DEFAULT_ESCALATION_SLA_HOURS;
        const slaSeconds = slaHours * 3600;

        const results = await Promise.all(tls.map(async (tl: any) => {
          // Team size + avg team score over the window.
          const teamSize = await db.prepare(
            "SELECT COUNT(*) AS c FROM users WHERE role = 'agent' AND tl_id = ?"
          ).get(tl.id) as any;

          const teamScoreRow = await db.prepare(`
            SELECT AVG(e.final_score) AS avg_score, COUNT(*) AS audits
            FROM evaluations e JOIN users a ON e.agent_id = a.id
            WHERE a.tl_id = ? AND e.date >= ? AND e.date <= ?
          `).get(tl.id, fromD, toD) as any;

          // Coaching rollup: split by status + average session duration.
          const coachingRows = await db.prepare(`
            SELECT status, created_at, completed_at, session_started_at
            FROM coaching_requests
            WHERE tl_id = ?
              AND substr(CAST(created_at AS TEXT), 1, 10) >= ?
              AND substr(CAST(created_at AS TEXT), 1, 10) <= ?
          `).all(tl.id, fromD, toD) as any[];
          let coachCompleted = 0, coachPending = 0, coachInProgress = 0;
          let totalSessionSec = 0, sessionsWithDuration = 0;
          for (const c of coachingRows) {
            if (c.status === 'Completed') coachCompleted++;
            else if (c.status === 'In Progress') coachInProgress++;
            else coachPending++;
            if (c.session_started_at && c.completed_at) {
              const dur = (new Date(c.completed_at).getTime() - new Date(c.session_started_at).getTime()) / 1000;
              if (dur > 0) { totalSessionSec += dur; sessionsWithDuration++; }
            }
          }
          const avgSessionMin = sessionsWithDuration
            ? Math.round((totalSessionSec / sessionsWithDuration) / 60)
            : 0;

          // Escalations — only the ones routed back to this TL's team
          // (escalation against an evaluation whose agent reports to them).
          const escalationRows = await db.prepare(`
            SELECT el.created_at AS escalated_at,
                   (SELECT MIN(el2.created_at) FROM escalation_logs el2
                    WHERE el2.evaluation_id = el.evaluation_id
                      AND el2.action <> 'escalated'
                      AND el2.created_at > el.created_at) AS responded_at
            FROM escalation_logs el
            JOIN evaluations e ON el.evaluation_id = e.id
            JOIN users a ON e.agent_id = a.id
            WHERE el.action = 'escalated' AND a.tl_id = ?
              AND substr(CAST(el.created_at AS TEXT), 1, 10) >= ?
              AND substr(CAST(el.created_at AS TEXT), 1, 10) <= ?
          `).all(tl.id, fromD, toD) as any[];

          let escWithinSla = 0, escOverdue = 0, escOpen = 0;
          let totalResponseSec = 0, respondedCount = 0;
          const nowMs = Date.now();
          for (const es of escalationRows) {
            const escMs = new Date(es.escalated_at).getTime();
            if (es.responded_at) {
              const dt = (new Date(es.responded_at).getTime() - escMs) / 1000;
              if (dt <= slaSeconds) escWithinSla++; else escOverdue++;
              totalResponseSec += dt; respondedCount++;
            } else {
              const elapsed = (nowMs - escMs) / 1000;
              if (elapsed > slaSeconds) escOverdue++;
              else escOpen++;
            }
          }
          const avgResponseHours = respondedCount
            ? Math.round((totalResponseSec / respondedCount / 3600) * 10) / 10
            : 0;

          return {
            id: tl.id,
            display_name: tl.display_name,
            username: tl.username,
            team_size: Number(teamSize?.c || 0),
            audits: Number(teamScoreRow?.audits || 0),
            avg_team_score: teamScoreRow?.avg_score
              ? Math.round(Number(teamScoreRow.avg_score) * 10) / 10 : 0,
            coaching: {
              total: coachingRows.length,
              completed: coachCompleted,
              in_progress: coachInProgress,
              pending: coachPending,
              avg_session_minutes: avgSessionMin,
            },
            escalations: {
              total: escalationRows.length,
              within_sla: escWithinSla,
              overdue: escOverdue,
              open: escOpen,
              avg_response_hours: avgResponseHours,
              sla_hours: slaHours,
            },
          };
        }));

        res.json({ from_date: fromD, to_date: toD, sla_hours: slaHours, tls: results });
      } catch (e: any) {
        console.error("/api/cc/tl-ops failed:", e);
        res.status(500).json({ error: e.message });
      }
    });

    // Drill-down — every coaching and escalation row for a single TL,
    // useful for the CC Supervisor's TL detail page.
    app.get("/api/cc/tl-ops/:tl_id", async (req, res) => {
      try {
        const tlId = req.params.tl_id;
        const { from_date, to_date } = req.query;
        const today = new Date();
        const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
        const monthEnd = today.toISOString().split('T')[0];
        const fromD = (from_date as string) || monthStart;
        const toD = (to_date as string) || monthEnd;

        const tl = await db.prepare("SELECT id, display_name, username FROM users WHERE id = ?").get(tlId) as any;
        if (!tl) return res.status(404).json({ error: "TL not found" });

        const coachings = await db.prepare(`
          SELECT cr.id, cr.evaluation_id, cr.status, cr.created_at,
                 cr.agent_approved_at, cr.session_started_at, cr.completed_at,
                 cr.tl_comment, cr.cc_supervisor_note,
                 a.display_name AS agent_name
          FROM coaching_requests cr
          LEFT JOIN users a ON cr.agent_id = a.id
          WHERE cr.tl_id = ?
            AND substr(CAST(cr.created_at AS TEXT), 1, 10) >= ?
            AND substr(CAST(cr.created_at AS TEXT), 1, 10) <= ?
          ORDER BY cr.created_at DESC
        `).all(tlId, fromD, toD) as any[];

        const escalations = await db.prepare(`
          SELECT el.id, el.evaluation_id, el.user_id, el.role, el.action,
                 el.comment, el.created_at, el.cc_supervisor_note,
                 e.final_score, e.brand, e.call_type, e.date AS call_date,
                 a.display_name AS agent_name,
                 (SELECT MIN(el2.created_at) FROM escalation_logs el2
                  WHERE el2.evaluation_id = el.evaluation_id
                    AND el2.action <> 'escalated'
                    AND el2.created_at > el.created_at) AS responded_at
          FROM escalation_logs el
          JOIN evaluations e ON el.evaluation_id = e.id
          JOIN users a ON e.agent_id = a.id
          WHERE el.action = 'escalated' AND a.tl_id = ?
            AND substr(CAST(el.created_at AS TEXT), 1, 10) >= ?
            AND substr(CAST(el.created_at AS TEXT), 1, 10) <= ?
          ORDER BY el.created_at DESC
        `).all(tlId, fromD, toD) as any[];

        res.json({ tl, from_date: fromD, to_date: toD, coachings, escalations });
      } catch (e: any) {
        console.error("/api/cc/tl-ops/:tl_id failed:", e);
        res.status(500).json({ error: e.message });
      }
    });

    // ===== Phase 3: CC Supervisor notes =====
    // Notes live on the related row itself (coaching_requests /
    // escalation_logs) — single text field per row, no separate table.
    try { await db.exec("ALTER TABLE coaching_requests ADD COLUMN IF NOT EXISTS cc_supervisor_note TEXT"); } catch(e) {}
    try { await db.exec("ALTER TABLE escalation_logs ADD COLUMN IF NOT EXISTS cc_supervisor_note TEXT"); } catch(e) {}

    app.post("/api/cc/notes/coaching/:id", async (req, res) => {
      try {
        const { note } = req.body;
        await db.prepare(
          "UPDATE coaching_requests SET cc_supervisor_note = ? WHERE id = ?"
        ).run(note ?? null, req.params.id);
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.post("/api/cc/notes/escalation/:id", async (req, res) => {
      try {
        const { note } = req.body;
        await db.prepare(
          "UPDATE escalation_logs SET cc_supervisor_note = ? WHERE id = ?"
        ).run(note ?? null, req.params.id);
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ===== Phase 3: SLA-breach notifications for cc_supervisor =====
    // Lightweight scan on every cc_supervisor request to /cc/tl-ops:
    // looks for overdue escalations the cc_supervisor hasn't been told
    // about yet (uses a marker in notifications.message to dedupe).
    const scanSlaBreachesForCC = async (ccSupervisorId: any) => {
      try {
        const breached = await db.prepare(`
          SELECT el.id, el.evaluation_id, el.created_at,
                 a.display_name AS agent_name, tl.display_name AS tl_name
          FROM escalation_logs el
          JOIN evaluations e ON el.evaluation_id = e.id
          JOIN users a ON e.agent_id = a.id
          JOIN users tl ON a.tl_id = tl.id
          WHERE el.action = 'escalated'
            AND tl.cc_supervisor_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM escalation_logs el2
              WHERE el2.evaluation_id = el.evaluation_id
                AND el2.action <> 'escalated'
                AND el2.created_at > el.created_at
            )
        `).all(ccSupervisorId) as any[];

        const nowMs = Date.now();
        for (const b of breached) {
          const ageMs = nowMs - new Date(b.created_at).getTime();
          if (ageMs < DEFAULT_ESCALATION_SLA_HOURS * 3600 * 1000) continue;
          const marker = `SLA-ESC-${b.id}`;
          const seen = await db.prepare(
            "SELECT id FROM notifications WHERE user_id = ? AND message LIKE ?"
          ).get(ccSupervisorId, `%${marker}%`) as any;
          if (seen) continue;
          await db.prepare(
            "INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)"
          ).run(
            ccSupervisorId,
            'Escalation SLA Breached',
            `[${marker}] TL ${b.tl_name} has an open escalation on Agent ${b.agent_name} (call #${b.evaluation_id}) past the ${DEFAULT_ESCALATION_SLA_HOURS}h SLA.`,
            b.evaluation_id
          );
        }
      } catch (err) {
        console.error('SLA scan failed:', err);
      }
    };
    // Patch the tl-ops endpoint to also run the scan for cc_supervisors.
    app.use(async (req, _res, next) => {
      if (req.path === '/api/cc/tl-ops' && req.query.role === 'cc_supervisor' && req.query.user_id) {
        scanSlaBreachesForCC(req.query.user_id).catch(() => {});
      }
      next();
    });

    // =================================================================
    // Phase 4 — TL KPIs (per-month scorecard for Team Leaders)
    //   Coachings  60%  — count vs target
    //   Escalations SLA 40%  — % responded within SLA hours
    // =================================================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tl_kpi_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        coaching_target INTEGER DEFAULT 20,
        escalation_sla_hours INTEGER DEFAULT 24,
        weight_coaching REAL DEFAULT 0.6,
        weight_sla REAL DEFAULT 0.4,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try {
      const existing = await db.prepare("SELECT id FROM tl_kpi_config WHERE user_id IS NULL").get();
      if (!existing) {
        await db.prepare(
          "INSERT INTO tl_kpi_config (user_id, coaching_target, escalation_sla_hours, weight_coaching, weight_sla) VALUES (NULL, 20, 24, 0.6, 0.4)"
        ).run();
      }
    } catch (e) { console.error('seed tl_kpi_config defaults failed:', e); }

    const loadTLKPIConfig = async (userId: any) => {
      let cfg: any = null;
      if (userId) {
        cfg = await db.prepare("SELECT * FROM tl_kpi_config WHERE user_id = ?").get(userId);
      }
      if (!cfg) cfg = await db.prepare("SELECT * FROM tl_kpi_config WHERE user_id IS NULL").get();
      return cfg || { coaching_target: 20, escalation_sla_hours: 24, weight_coaching: 0.6, weight_sla: 0.4 };
    };

    const computeTLKPI = async (tlId: number, month: string) => {
      const monthStart = `${month}-01`;
      const [yr, mo] = month.split('-').map(Number);
      const lastDay = new Date(yr, mo, 0).getDate();
      const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
      const cfg = await loadTLKPIConfig(tlId);

      // Coachings: count of coaching_requests where tl_id = TL and any
      // session started in the window.
      const coachingsRow = await db.prepare(`
        SELECT COUNT(*) AS c FROM coaching_requests
        WHERE tl_id = ?
          AND substr(CAST(created_at AS TEXT), 1, 10) >= ?
          AND substr(CAST(created_at AS TEXT), 1, 10) <= ?
      `).get(tlId, monthStart, monthEnd) as any;
      const coachingsTotal = Number(coachingsRow?.c || 0);
      const coachingScore = Math.min(100, (coachingsTotal / Math.max(1, cfg.coaching_target)) * 100);

      // Escalations: % responded within SLA
      const slaSeconds = cfg.escalation_sla_hours * 3600;
      const escs = await db.prepare(`
        SELECT el.created_at,
               (SELECT MIN(el2.created_at) FROM escalation_logs el2
                WHERE el2.evaluation_id = el.evaluation_id
                  AND el2.action <> 'escalated'
                  AND el2.created_at > el.created_at) AS responded_at
        FROM escalation_logs el
        JOIN evaluations e ON el.evaluation_id = e.id
        JOIN users a ON e.agent_id = a.id
        WHERE el.action = 'escalated' AND a.tl_id = ?
          AND substr(CAST(el.created_at AS TEXT), 1, 10) >= ?
          AND substr(CAST(el.created_at AS TEXT), 1, 10) <= ?
      `).all(tlId, monthStart, monthEnd) as any[];
      let within = 0, total = 0;
      for (const e of escs) {
        if (!e.responded_at) continue;
        total++;
        const dt = (new Date(e.responded_at).getTime() - new Date(e.created_at).getTime()) / 1000;
        if (dt <= slaSeconds) within++;
      }
      const slaScore = total === 0 ? 100 : (within / total) * 100;
      const totalScore = coachingScore * cfg.weight_coaching + slaScore * cfg.weight_sla;

      return {
        tl_id: tlId,
        month,
        config: cfg,
        coaching: {
          total: coachingsTotal,
          target: cfg.coaching_target,
          score: Math.round(coachingScore * 10) / 10,
          weight: cfg.weight_coaching,
        },
        escalations: {
          total: escs.length,
          responded: total,
          within_sla: within,
          sla_hours: cfg.escalation_sla_hours,
          score: Math.round(slaScore * 10) / 10,
          weight: cfg.weight_sla,
        },
        total_score: Math.round(totalScore * 10) / 10,
      };
    };

    app.get("/api/kpi/tl/:user_id", async (req, res) => {
      try {
        const tlId = parseInt(req.params.user_id, 10);
        const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
        res.json(await computeTLKPI(tlId, month));
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.get("/api/kpi/tl-summary", async (req, res) => {
      try {
        const { user_id, role } = req.query;
        const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
        let tlsQuery = "SELECT id, display_name FROM users WHERE role = 'tl'";
        const tlsParams: any[] = [];
        if (role === 'cc_supervisor') {
          tlsQuery += " AND cc_supervisor_id = ?";
          tlsParams.push(user_id);
        }
        const tls = await db.prepare(tlsQuery).all(...tlsParams) as any[];
        const results: any[] = [];
        for (const tl of tls) {
          const r = await computeTLKPI(tl.id, month);
          results.push({
            tl_id: tl.id,
            tl_name: tl.display_name,
            coaching_score: r.coaching.score,
            sla_score: r.escalations.score,
            total_score: r.total_score,
          });
        }
        results.sort((a, b) => b.total_score - a.total_score);
        res.json({ month, tls: results });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Advanced Quality Analysis Endpoint / Multi-dimensional metrics
    app.get("/api/stats/analysis", async (req, res) => {
      try {
        const { start_date, end_date, brand, call_type, agent_id, qa_id, status, user_id, role } = req.query;

        let query = `
          SELECT e.*,
                 a.display_name as agent_name,
                 q.display_name as qa_name
          FROM evaluations e
          LEFT JOIN users a ON e.agent_id = a.id
          LEFT JOIN users q ON e.qa_id = q.id
          WHERE 1=1
        `;
        const params: any[] = [];

        // QA scope — keep analysis honest about what this user can see.
        const qaScope = await buildQAScopeClause(user_id, role, { e: 'e', agentJoin: 'a' });
        query += qaScope.clause;
        params.push(...qaScope.params);

        if (start_date) {
          query += " AND e.date >= ?";
          params.push(start_date);
        }
        if (end_date) {
          query += " AND e.date <= ?";
          params.push(end_date);
        }
        if (brand && brand !== 'all') {
          query += " AND e.brand = ?";
          params.push(brand);
        }
        if (call_type && call_type !== 'all') {
          query += " AND e.call_type = ?";
          params.push(call_type);
        }
        if (agent_id && agent_id !== 'all') {
          query += " AND e.agent_id = ?";
          params.push(parseInt(agent_id as string));
        }
        if (qa_id && qa_id !== 'all') {
          query += " AND e.qa_id = ?";
          params.push(parseInt(qa_id as string));
        }
        if (status && status !== 'all') {
          query += " AND e.status = ?";
          params.push(status);
        }

        const evals = await db.prepare(query).all(...params) as any[];

        // Fetch question dictionary for criteria breakdown
        const formConfigQuestions = await db.prepare("SELECT * FROM form_config").all() as any[];
        const formSettingsQuestions = await db.prepare("SELECT * FROM form_settings WHERE field_type = 'eval_question'").all() as any[];

        const qMap: { [key: string]: { label: string; section: string } } = {};
        formConfigQuestions.forEach(q => {
          qMap[q.id.toString()] = { label: q.label, section: q.section || 'General' };
          if (q.label) {
            qMap[q.label] = { label: q.label, section: q.section || 'General' };
          }
        });
        formSettingsQuestions.forEach(q => {
          qMap[q.id.toString()] = { label: q.label_en, section: 'Operational Criteria' };
          if (q.label_en) {
            qMap[q.label_en] = { label: q.label_en, section: 'Operational Criteria' };
          }
        });

        // Initialize Aggregations
        let totalScore = 0;
        let criticalFails = 0;
        let satisfactoryCount = 0; // score >= 85
        let exceptionScoreSum = 0; // excluded critical failure scores
        let exceptionScoreCount = 0;

        const trendMap: { [key: string]: { sum: number; count: number; criticals: number } } = {};
        const brandMap: { [key: string]: { sum: number; count: number } } = {};
        const typeMap: { [key: string]: { sum: number; count: number } } = {};
        const agentMap: { [key: string]: { sum: number; count: number; id: number; criticals: number } } = {};
        const qaMap: { [key: string]: { sum: number; count: number; id: number } } = {};
        const statusMap: { [key: string]: number } = {};
        const criteriaMap: { [key: string]: { yes: number; no: number; na: number; total: number; label: string; section: string } } = {};

        // Loop through all filtered evaluations
        evals.forEach(e => {
          const score = e.final_score;
          const isCritical = e.critical_failure === 1;
          const evDate = e.date || 'Unknown';
          const evBrand = e.brand || 'General';
          const evType = e.call_type || 'General';
          const evAgent = e.agent_name || `Agent #${e.agent_id}`;
          const evQA = e.qa_name || `QA #${e.qa_id}`;
          const evStatus = e.status || 'Pending Review';

          totalScore += score;
          if (isCritical) {
            criticalFails++;
          } else {
            exceptionScoreSum += score;
            exceptionScoreCount++;
          }

          if (score >= 85) {
            satisfactoryCount++;
          }

          // Status dist
          statusMap[evStatus] = (statusMap[evStatus] || 0) + 1;

          // Trend grouping
          if (!trendMap[evDate]) {
            trendMap[evDate] = { sum: 0, count: 0, criticals: 0 };
          }
          trendMap[evDate].sum += score;
          trendMap[evDate].count++;
          if (isCritical) trendMap[evDate].criticals++;

          // Brand grouping
          if (!brandMap[evBrand]) {
            brandMap[evBrand] = { sum: 0, count: 0 };
          }
          brandMap[evBrand].sum += score;
          brandMap[evBrand].count++;

          // Call Type grouping
          if (!typeMap[evType]) {
            typeMap[evType] = { sum: 0, count: 0 };
          }
          typeMap[evType].sum += score;
          typeMap[evType].count++;

          // Agent performance
          if (!agentMap[evAgent]) {
            agentMap[evAgent] = { sum: 0, count: 0, id: e.agent_id, criticals: 0 };
          }
          agentMap[evAgent].sum += score;
          agentMap[evAgent].count++;
          if (isCritical) agentMap[evAgent].criticals++;

          // QA performance
          if (!qaMap[evQA]) {
            qaMap[evQA] = { sum: 0, count: 0, id: e.qa_id };
          }
          qaMap[evQA].sum += score;
          qaMap[evQA].count++;

          // Criteria / Question drill-down performance
          let parsedData: any = {};
          try {
            parsedData = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          } catch (err) {}

          if (parsedData && parsedData.responses) {
            Object.entries(parsedData.responses).forEach(([qId, val]) => {
              if (!criteriaMap[qId]) {
                const meta = qMap[qId] || { label: qId, section: 'General' };
                criteriaMap[qId] = { yes: 0, no: 0, na: 0, total: 0, label: meta.label, section: meta.section };
              }

              if (val === 'Yes') {
                criteriaMap[qId].yes++;
                criteriaMap[qId].total++;
              } else if (val === 'No') {
                criteriaMap[qId].no++;
                criteriaMap[qId].total++;
              } else if (val === 'N/A') {
                criteriaMap[qId].na++;
              }
            });
          }
        });

        // Compute Averages & transform maps to arrays for Recharts
        const count = evals.length;
        const avgScore = count > 0 ? (totalScore / count) : 0;
        const satRate = count > 0 ? (satisfactoryCount / count) * 100 : 0;
        const critRate = count > 0 ? (criticalFails / count) * 100 : 0;
        const mainAvgExcludingCriticals = exceptionScoreCount > 0 ? (exceptionScoreSum / exceptionScoreCount) : 0;

        const trendArray = Object.entries(trendMap)
          .map(([date, v]) => ({
            date,
            score: Math.round(v.sum / v.count),
            count: v.count,
            criticals: v.criticals
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const brandArray = Object.entries(brandMap).map(([name, v]) => ({
          name,
          score: Math.round(v.sum / v.count),
          count: v.count
        }));

        const typeArray = Object.entries(typeMap).map(([name, v]) => ({
          name,
          score: Math.round(v.sum / v.count),
          count: v.count
        }));

        const agentArray = Object.entries(agentMap).map(([name, v]) => ({
          name,
          id: v.id,
          score: Math.round(v.sum / v.count),
          count: v.count,
          criticals: v.criticals
        })).sort((a, b) => b.score - a.score);

        const qaArray = Object.entries(qaMap).map(([name, v]) => ({
          name,
          id: v.id,
          score: Math.round(v.sum / v.count),
          count: v.count
        })).sort((a, b) => b.score - a.score);

        const statusArray = Object.entries(statusMap).map(([name, value]) => ({
          name,
          value
        }));

        const criteriaArray = Object.entries(criteriaMap).map(([id, item]) => {
          const totalValid = item.yes + item.no;
          const complianceRate = totalValid > 0 ? (item.yes / totalValid) * 100 : 100;
          return {
            id,
            label: item.label,
            section: item.section,
            yes: item.yes,
            no: item.no,
            na: item.na,
            total: item.total,
            complianceRate: Math.round(complianceRate)
          };
        }).sort((a, b) => a.complianceRate - b.complianceRate); // weakest first

        // Group filters options for analytics search controls
        const uniqueBrandsList = (await db.prepare("SELECT DISTINCT brand FROM evaluations WHERE brand IS NOT NULL AND brand != ''").all()).map((r: any) => r.brand);
        const uniqueTypesList = (await db.prepare("SELECT DISTINCT call_type FROM evaluations WHERE call_type IS NOT NULL AND call_type != ''").all()).map((r: any) => r.call_type);
        const uniqueAgentsList = await db.prepare("SELECT id, display_name FROM users WHERE role = 'agent'").all() as any[];
        const uniqueQAsList = await db.prepare("SELECT id, display_name FROM users WHERE role = 'qa'").all() as any[];

        res.json({
          summary: {
            totalEvaluations: count,
            averageScore: parseFloat(avgScore.toFixed(1)),
            satisfactoryRate: parseFloat(satRate.toFixed(1)),
            criticalFailCount: criticalFails,
            criticalFailRate: parseFloat(critRate.toFixed(1)),
            averageScoreExcludingCritical: parseFloat(mainAvgExcludingCriticals.toFixed(1))
          },
          trend: trendArray,
          byBrand: brandArray,
          byCallType: typeArray,
          byAgent: agentArray,
          byQA: qaArray,
          statusDistribution: statusArray,
          criteriaCompliance: criteriaArray,
          filters: {
            brands: uniqueBrandsList,
            callTypes: uniqueTypesList,
            agents: uniqueAgentsList,
            qas: uniqueQAsList
          }
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Global Error Handler
    app.use((err: any, req: any, res: any, next: any) => {
      console.error("EXPRESS ERROR:", err);
      res.status(500).json({ error: "Internal Server Error", message: err.message });
    });

    // Decide between Vite dev middleware and serving the prebuilt SPA.
    //
    // Production signals (any of these is enough):
    //   - NODE_ENV === 'production'
    //   - Running on Railway (Railway sets RAILWAY_ENVIRONMENT)
    //   - A prebuilt SPA exists at ./dist/index.html
    //
    // If none of those hold, fall back to the Vite middleware so local
    // `npm run dev` keeps working with HMR.
    const distPath = path.join(process.cwd(), "dist");
    const hasBuiltSpa = (() => {
      try { return require("fs").existsSync(path.join(distPath, "index.html")); }
      catch { return false; }
    })();
    const isProd =
      process.env.NODE_ENV === "production" ||
      !!process.env.RAILWAY_ENVIRONMENT ||
      hasBuiltSpa;

    if (isProd) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    } else {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error("❌ CRITICAL SERVER ERROR:", error);
    process.exit(1);
  }
}

startServer().catch((err) => {
  console.error("❌ UNCAUGHT ASYNC ERROR:", err);
  process.exit(1);
});
