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

    const getQAScope = async (userId: any): Promise<{ departments: string[]; brands: string[] } | null> => {
      if (!userId) return null;
      const u = await db.prepare("SELECT role, allowed_departments, allowed_brands FROM users WHERE id = ?").get(userId) as any;
      if (!u || u.role !== 'qa') return null;
      return {
        departments: parseJsonArray(u.allowed_departments),
        brands: parseJsonArray(u.allowed_brands),
      };
    };

    /**
     * TL brand scope — list of brand values this TL is authorized to view.
     * Returns null for non-TLs so callers can short-circuit cleanly.
     */
    const getTLBrandScope = async (userId: any): Promise<string[] | null> => {
      if (!userId) return null;
      const u = await db.prepare("SELECT role, allowed_brands FROM users WHERE id = ?").get(userId) as any;
      if (!u || u.role !== 'tl') return null;
      return parseJsonArray(u.allowed_brands);
    };

    /**
     * Returns a SQL snippet + params that restricts an evaluations query to
     * the caller's allowed scope. `aliases.e` is the evaluations table alias
     * and `aliases.agentJoin` is the joined users table alias (for QA's
     * department filter — TLs only need brand).
     *
     *  - returns { clause: '', params: [] } if the caller has no scope rules
     *  - returns " AND 1=0 " when the caller's arrays are empty, so a
     *    misconfigured account stays blocked instead of leaking data.
     *
     *  Name kept as buildQAScopeClause for backwards-compat with the many
     *  call sites that already use it — the body now also handles TLs.
     */
    const buildQAScopeClause = async (
      userId: any,
      role: any,
      aliases: { e: string; agentJoin: string }
    ): Promise<{ clause: string; params: any[] }> => {
      if (role === 'qa') {
        const scope = await getQAScope(userId);
        if (!scope) return { clause: '', params: [] };
        if (scope.departments.length === 0 || scope.brands.length === 0) {
          return { clause: ' AND 1=0 ', params: [] };
        }
        const brandPh = scope.brands.map(() => '?').join(',');
        const depPh = scope.departments.map(() => '?').join(',');
        const clause = ` AND ${aliases.e}.brand IN (${brandPh}) AND ${aliases.agentJoin}.department IN (${depPh}) `;
        return { clause, params: [...scope.brands, ...scope.departments] };
      }

      if (role === 'tl') {
        const brands = await getTLBrandScope(userId);
        if (!brands) return { clause: '', params: [] };
        // Deny-by-default — a TL with no assigned brands sees nothing.
        if (brands.length === 0) return { clause: ' AND 1=0 ', params: [] };
        const brandPh = brands.map(() => '?').join(',');
        return { clause: ` AND ${aliases.e}.brand IN (${brandPh}) `, params: [...brands] };
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
      res.json({
        token,
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

    // Users Management
    app.get("/api/users", async (req, res) => {
      const users = await db.prepare(
        "SELECT id, display_name, username, role, department, tl_id, allowed_departments, allowed_brands FROM users"
      ).all() as any[];
      // Parse JSON columns so the client gets real arrays.
      res.json(users.map(u => ({
        ...u,
        allowed_departments: parseJsonArray(u.allowed_departments),
        allowed_brands: parseJsonArray(u.allowed_brands),
      })));
    });

    app.post("/api/users", async (req, res) => {
      const { display_name, username, password, role, department, tl_id, allowed_departments, allowed_brands } = req.body;
      const hashedPassword = bcrypt.hashSync(password, 10);
      // QAs store departments + brands. TLs store brands only (their team
      // scope already comes from agent.tl_id). Other roles stay NULL so the
      // existing visibility rules (supervisor/agent) are untouched.
      const depsJson = role === 'qa' ? JSON.stringify(Array.isArray(allowed_departments) ? allowed_departments : []) : null;
      const brandsJson = (role === 'qa' || role === 'tl')
        ? JSON.stringify(Array.isArray(allowed_brands) ? allowed_brands : [])
        : null;
      try {
        await db.prepare(
          "INSERT INTO users (display_name, username, password, role, department, tl_id, allowed_departments, allowed_brands) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(display_name, username, hashedPassword, role, department, tl_id || null, depsJson, brandsJson);
        res.json({ success: true });
      } catch (e) {
        res.status(400).json({ error: "Username already exists" });
      }
    });

    app.put("/api/users/:id", async (req, res) => {
      try {
        const { display_name, username, password, role, department, tl_id, allowed_departments, allowed_brands } = req.body;
        const userId = req.params.id;

        const existing = await db.prepare("SELECT id FROM users WHERE id = ?").get(userId) as any;
        if (!existing) return res.status(404).json({ error: "User not found" });

        const depsJson = role === 'qa' ? JSON.stringify(Array.isArray(allowed_departments) ? allowed_departments : []) : null;
        const brandsJson = (role === 'qa' || role === 'tl')
          ? JSON.stringify(Array.isArray(allowed_brands) ? allowed_brands : [])
          : null;

        if (password && password.length > 0) {
          const hashedPassword = bcrypt.hashSync(password, 10);
          await db.prepare(`
            UPDATE users
            SET display_name = ?, username = ?, password = ?, role = ?, department = ?, tl_id = ?,
                allowed_departments = ?, allowed_brands = ?
            WHERE id = ?
          `).run(display_name, username, hashedPassword, role, department, tl_id || null, depsJson, brandsJson, userId);
        } else {
          await db.prepare(`
            UPDATE users
            SET display_name = ?, username = ?, role = ?, department = ?, tl_id = ?,
                allowed_departments = ?, allowed_brands = ?
            WHERE id = ?
          `).run(display_name, username, role, department, tl_id || null, depsJson, brandsJson, userId);
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
      const { user_id, role, agent_id, from_date, to_date, status, search, coaching_status } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      let baseQuery = `
        FROM evaluations e
        JOIN users a ON e.agent_id = a.id
        JOIN users q ON e.qa_id = q.id
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
        // TL only sees evaluations belonging to their direct team.
        baseQuery += " AND a.tl_id = ?";
        params.push(user_id);
      }

      // QA scope enforcement — restricts to assigned brands + departments.
      // Empty scope = no rows match (deny-by-default).
      const qaScope = await buildQAScopeClause(user_id, role, { e: 'e', agentJoin: 'a' });
      baseQuery += qaScope.clause;
      params.push(...qaScope.params);
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
        SELECT e.*, a.display_name as agent_name, q.display_name as qa_name
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
      const { date, agent_id, qa_id, brand, call_type, final_score, critical_failure, data, draft_id } = req.body;

      // Workflow rule:
      //   score >= 90  → goes straight to Agent + TL (no approval needed)
      //   score <  90  → goes to TL only; Agent does NOT see it until cycle ends
      const status = final_score >= 90 ? 'Sent to Agent' : 'Pending Review';

      const result = await db.prepare("INSERT INTO evaluations (date, agent_id, qa_id, brand, call_type, final_score, critical_failure, data, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(date, agent_id, qa_id, brand, call_type, final_score, critical_failure ? 1 : 0, JSON.stringify(data), status);

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
      const { date, agent_id, qa_id, brand, call_type, final_score, critical_failure, data, status } = req.body;
      await db.prepare(`
        UPDATE evaluations
        SET date = ?, agent_id = ?, qa_id = ?, brand = ?, call_type = ?,
            final_score = ?, critical_failure = ?, data = ?, status = ?
        WHERE id = ?
      `).run(date, agent_id, qa_id, brand, call_type, final_score, critical_failure ? 1 : 0, JSON.stringify(data), status || 'completed', req.params.id);
      res.json({ success: true });
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
      if (role === 'qa') {
        const scope = await getQAScope(callerId);
        if (scope) {
          if (scope.departments.length === 0 || scope.brands.length === 0) {
            agentsQuery += " AND 1=0";
          } else {
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
        if (role === 'qa') {
          const scope = await getQAScope(user_id);
          if (scope) {
            if (scope.departments.length === 0 || scope.brands.length === 0) {
              agentsQuery += " AND 1=0";
            } else {
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
        const { user_id, role } = req.query;

        // Build a unified base query joining evaluations to the agent so we
        // can apply the QA scope filter consistently (it joins on a.department).
        let evalsQuery = "SELECT e.* FROM evaluations e JOIN users a ON e.agent_id = a.id WHERE 1=1";
        let agentsQuery = "SELECT id, display_name, department FROM users WHERE role = 'agent'";
        let params: any[] = [];

        if (role === 'agent') {
          evalsQuery += " AND e.agent_id = ?";
          params.push(user_id);
        } else if (role === 'tl') {
          evalsQuery += " AND a.tl_id = ?";
          params.push(user_id);
        }

        // QA: restrict to assigned brands + departments. Also restrict the
        // active-agents list to the same department scope so headline counts
        // line up with what the QA can actually audit.
        const qaScope = await buildQAScopeClause(user_id, role, { e: 'e', agentJoin: 'a' });
        evalsQuery += qaScope.clause;
        params.push(...qaScope.params);

        let agentParams: any[] = [];
        if (role === 'qa') {
          const scope = await getQAScope(user_id);
          if (scope && (scope.departments.length === 0 || scope.brands.length === 0)) {
            agentsQuery += " AND 1=0";
          } else if (scope && scope.departments.length > 0) {
            const ph = scope.departments.map(() => '?').join(',');
            agentsQuery += ` AND department IN (${ph})`;
            agentParams.push(...scope.departments);
          }
        }

        const evals = await db.prepare(evalsQuery).all(...params) as any[];
        const agents = await db.prepare(agentsQuery).all(...agentParams) as any[];
        
        const avgScore = evals.length > 0 
          ? evals.reduce((acc, curr) => acc + curr.final_score, 0) / evals.length 
          : 0;
        
        const criticalFailures = evals.filter(e => e.critical_failure === 1).length;

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
          painPoints: personalPainPoints
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
        const dateJoinConds: string[] = ["e.qa_id = u.id"];
        const joinParams: any[] = [];
        if (start_date) {
          dateJoinConds.push("e.date >= ?");
          joinParams.push(start_date);
        }
        if (effectiveEnd) {
          dateJoinConds.push("e.date <= ?");
          joinParams.push(effectiveEnd);
        }

        // When the caller is a QA, only count evaluations that fall inside
        // their assigned scope — same rules as everywhere else.
        if (restrictToSelf) {
          const scope = await getQAScope(user_id);
          if (scope) {
            if (scope.brands.length === 0 || scope.departments.length === 0) {
              dateJoinConds.push("1=0");
            } else {
              dateJoinConds.push(`e.brand IN (${scope.brands.map(() => '?').join(',')})`);
              joinParams.push(...scope.brands);
              dateJoinConds.push(`EXISTS (SELECT 1 FROM users a2 WHERE a2.id = e.agent_id AND a2.department IN (${scope.departments.map(() => '?').join(',')}))`);
              joinParams.push(...scope.departments);
            }
          }
        }

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
