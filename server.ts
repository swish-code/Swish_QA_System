import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cors from "cors";

const JWT_SECRET = "super-secret-key-123";
const DB_PATH = "qualityhub.db";

async function startServer() {
  const app = express();
  const PORT = 3000;

  try {
    const db = new Database(DB_PATH);
    
    db.exec(`
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
    db.exec(`
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

    // Table for dynamic Audit Logs / Activity Trail
    db.exec(`
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
    try { db.exec("ALTER TABLE escalation_logs ADD COLUMN old_score REAL"); } catch(e) {}
    try { db.exec("ALTER TABLE escalation_logs ADD COLUMN new_score REAL"); } catch(e) {}

    // Seed initial form settings if empty or missing evaluation criteria
    try {
      const settingsCount = (db.prepare("SELECT COUNT(*) as count FROM form_settings").get() as any).count;
      const evalCount = (db.prepare("SELECT COUNT(*) as count FROM form_settings WHERE field_type = 'eval_section'").get() as any).count;
      
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
        initialSettings.forEach(s => {
          // Check if already exists to avoid duplicates if partially seeded
          const exists = db.prepare("SELECT id FROM form_settings WHERE field_type = ? AND label_en = ?").get(s.type, s.en);
          if (!exists) {
            insertSetting.run(s.type, s.en, s.ar, s.val);
          }
        });
      }
    } catch (e) {
      console.error("Migration/Seed error for form_settings:", e);
    }

    // Seed Admin User
    const adminExists = db.prepare("SELECT * FROM users WHERE role = 'supervisor'").get();
    if (!adminExists) {
      const hashedPassword = bcrypt.hashSync("admin123", 10);
      db.prepare("INSERT INTO users (display_name, username, password, role, department) VALUES (?, ?, ?, ?, ?)")
        .run("Admin Supervisor", "admin", hashedPassword, "supervisor", "Quality");
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

      res.on('finish', () => {
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
                const u = db.prepare("SELECT display_name FROM users WHERE id = ?").get(userId) as any;
                if (u) userName = u.display_name;
              }
            } catch (err) {
              // Ignore invalid token verification for logging fallback
            }
          }

          // 2. Fallbacks (custom tracking header or payload attributes)
          if (!userId && req.headers['x-user-id']) {
            userId = parseInt(req.headers['x-user-id'] as string);
            const u = db.prepare("SELECT display_name FROM users WHERE id = ?").get(userId) as any;
            if (u) userName = u.display_name;
          }

          if (!userId && req.body && req.body.user_id) {
            userId = parseInt(req.body.user_id);
            const u = db.prepare("SELECT display_name FROM users WHERE id = ?").get(userId) as any;
            if (u) userName = u.display_name;
          }

          if (!userId && req.body && req.body.qa_id) {
            userId = parseInt(req.body.qa_id);
            const u = db.prepare("SELECT display_name FROM users WHERE id = ?").get(userId) as any;
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
          db.prepare(`
            INSERT INTO audit_logs (user_id, user_name, action_type, section, details, ip_address, user_agent, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(actorId, actorName, actionType, section, details, ipClean, userAgent, status);

        } catch (err) {
          console.error("AUDIT LOGGING MIDDLEWARE ERROR:", err);
        }
      });

      next();
    });

    // Health check
    app.get("/api/health", (req, res) => {
      try {
        db.prepare('SELECT 1').get();
        res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
      } catch (error) {
        res.status(500).json({ status: "error", message: "Database connection failed", detail: error instanceof Error ? error.message : String(error) });
      }
    });

    // Auth
    app.post("/api/login", (req, res) => {
      const { username, password } = req.body;
      const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
      res.json({ token, user: { id: user.id, display_name: user.display_name, role: user.role, department: user.department } });
    });

    // Users Management
    app.get("/api/users", (req, res) => {
      const users = db.prepare("SELECT id, display_name, username, role, department, tl_id FROM users").all();
      res.json(users);
    });

    app.post("/api/users", (req, res) => {
      const { display_name, username, password, role, department, tl_id } = req.body;
      const hashedPassword = bcrypt.hashSync(password, 10);
      try {
        db.prepare("INSERT INTO users (display_name, username, password, role, department, tl_id) VALUES (?, ?, ?, ?, ?, ?)")
          .run(display_name, username, hashedPassword, role, department, tl_id || null);
        res.json({ success: true });
      } catch (e) {
        res.status(400).json({ error: "Username already exists" });
      }
    });

    // Form Config
    app.get("/api/forms", (req, res) => {
      const forms = db.prepare("SELECT * FROM form_config").all();
      res.json(forms);
    });

    app.post("/api/forms", (req, res) => {
      const { label, field_type, options, section, required, call_type } = req.body;
      db.prepare("INSERT INTO form_config (label, field_type, options, section, required, call_type) VALUES (?, ?, ?, ?, ?, ?)")
        .run(label, field_type, JSON.stringify(options), section, required ? 1 : 0, call_type);
      res.json({ success: true });
    });

    // Evaluations
    app.get("/api/evaluations", (req, res) => {
      const { user_id, role, agent_id, from_date, to_date, status, search } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 15;
      const offset = (page - 1) * limit;

      let baseQuery = `
        FROM evaluations e
        JOIN users a ON e.agent_id = a.id
        JOIN users q ON e.qa_id = q.id
        WHERE 1=1
      `;
      let params: any[] = [];

      if (role === 'agent') {
        baseQuery += " AND e.agent_id = ?";
        params.push(user_id);
      } else if (role === 'tl') {
        baseQuery += " AND (a.tl_id = ? OR e.qa_id = ?)";
        params.push(user_id, user_id);
      }

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

      // Count total items
      const countResult = db.prepare(`SELECT COUNT(*) as count ${baseQuery}`).get(...params) as { count: number };
      const totalItems = countResult.count;
      const totalPages = Math.ceil(totalItems / limit);

      // Get paginated data
      const query = `
        SELECT e.*, a.display_name as agent_name, q.display_name as qa_name 
        ${baseQuery}
        ORDER BY e.id DESC
        LIMIT ? OFFSET ?
      `;
      const evals = db.prepare(query).all(...params, limit, offset) as any[];
      
      res.json({
        data: evals.map((e) => {
          try {
            return { ...e, data: typeof e.data === 'string' ? JSON.parse(e.data) : (e.data || {}) };
          } catch (err) {
            return { ...e, data: {} };
          }
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

    app.post("/api/evaluations", (req, res) => {
      const { date, agent_id, qa_id, brand, call_type, final_score, critical_failure, data } = req.body;
      
      // Determine initial status based on score
      const status = final_score === 100 ? 'Sent to Agent' : 'Pending Review';
      
      const result = db.prepare("INSERT INTO evaluations (date, agent_id, qa_id, brand, call_type, final_score, critical_failure, data, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(date, agent_id, qa_id, brand, call_type, final_score, critical_failure ? 1 : 0, JSON.stringify(data), status);
      
      const evaluation_id = result.lastInsertRowid;

      // Extract details for richer notification
      const agent = db.prepare("SELECT display_name, tl_id FROM users WHERE id = ?").get(agent_id) as any;
      const evaluator = db.prepare("SELECT display_name FROM users WHERE id = ?").get(qa_id) as any;
      const notes = data?.feedback?.general || 'No specific notes provided';
      const timestamp = new Date().toLocaleString();

      const notificationMsg = `
        Employee: ${agent?.display_name}
        Status: ${status} | Score: ${final_score}%
        Notes: ${notes.substring(0, 100)}${notes.length > 100 ? '...' : ''}
        Evaluator: ${evaluator?.display_name}
        Time: ${timestamp}
      `.trim();

      // Notification logic
      if (status === 'Sent to Agent') {
        // Notify Agent
        db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(agent_id, "New Evaluation Received", notificationMsg, evaluation_id);
      } else {
        // Notify TL if evaluation needs review
        if (agent && agent.tl_id) {
          db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
            .run(agent.tl_id, "Evaluation Pending Review", notificationMsg, evaluation_id);
        }
      }

      // Always notify the agent that an evaluation was performed (even if pending review, maybe? 
      // User said: "Whenever Quality Team submits, a notification should automatically be sent to: The Team Leader AND the employee")
      if (status !== 'Sent to Agent') {
         db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
           .run(agent_id, "Call Evaluated (Awaiting Review)", notificationMsg, evaluation_id);
      }

      res.json({ success: true, id: evaluation_id });
    });

    app.put("/api/evaluations/:id", (req, res) => {
      const { date, agent_id, qa_id, brand, call_type, final_score, critical_failure, data, status } = req.body;
      db.prepare(`
        UPDATE evaluations 
        SET date = ?, agent_id = ?, qa_id = ?, brand = ?, call_type = ?, 
            final_score = ?, critical_failure = ?, data = ?, status = ?
        WHERE id = ?
      `).run(date, agent_id, qa_id, brand, call_type, final_score, critical_failure ? 1 : 0, JSON.stringify(data), status || 'completed', req.params.id);
      res.json({ success: true });
    });

    // Escalations & Workflow
    app.post("/api/evaluations/:id/tl-action", (req, res) => {
      const { user_id, action, comment } = req.body; // action: approved / escalated
      const evaluation_id = req.params.id;
      
      const evaluation = db.prepare("SELECT agent_id, final_score, qa_id FROM evaluations WHERE id = ?").get(evaluation_id) as any;
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });

      const newStatus = action === 'approved' ? 'Sent to Agent' : 'Escalated';
      
      db.prepare("UPDATE evaluations SET status = ? WHERE id = ?").run(newStatus, evaluation_id);
      db.prepare("INSERT INTO escalation_logs (evaluation_id, user_id, role, action, comment, old_score, new_score) VALUES (?, ?, 'tl', ?, ?, ?, ?)")
        .run(evaluation_id, user_id, action, comment, evaluation.final_score, evaluation.final_score);

      // Notifications
      if (action === 'approved') {
        db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(evaluation.agent_id, "Evaluation Approved", `Your evaluation has been approved by your TL. Score: ${evaluation.final_score}%`, evaluation_id);
      } else {
        db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(evaluation.qa_id, "Evaluation Escalated", `Evaluation ${evaluation_id} has been escalated by TL. Reason: ${comment}`, evaluation_id);
      }

      res.json({ success: true, status: newStatus });
    });

    app.post("/api/evaluations/:id/qa-action", (req, res) => {
      const { user_id, action, comment, newData } = req.body; // action: approved / rejected
      const evaluation_id = req.params.id;

      const evaluation = db.prepare("SELECT agent_id, final_score, qa_id FROM evaluations WHERE id = ?").get(evaluation_id) as any;
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });

      const newStatus = action === 'approved' ? 'Quality Approved' : 'Rejected by Quality';
      
      if (action === 'approved' && newData) {
        db.prepare(`
          UPDATE evaluations 
          SET final_score = ?, critical_failure = ?, data = ?, status = ?
          WHERE id = ?
        `).run(newData.final_score, newData.critical_failure ? 1 : 0, JSON.stringify(newData.data), newStatus, evaluation_id);
      } else {
        db.prepare("UPDATE evaluations SET status = ? WHERE id = ?").run(newStatus, evaluation_id);
      }

      db.prepare("INSERT INTO escalation_logs (evaluation_id, user_id, role, action, comment, old_score, new_score) VALUES (?, ?, 'qa', ?, ?, ?, ?)")
        .run(evaluation_id, user_id, action, comment, evaluation.final_score, action === 'approved' && newData ? newData.final_score : evaluation.final_score);

      // Final recipients for Approved/Rejected: TL and Agent
      const agent = db.prepare("SELECT tl_id FROM users WHERE id = ?").get(evaluation.agent_id) as any;
      
      // Notify Agent
      db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
        .run(evaluation.agent_id, `Evaluation ${newStatus}`, `Your evaluation has been ${newStatus.toLowerCase()}.`, evaluation_id);
      
      // Notify TL
      if (agent && agent.tl_id) {
        db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(agent.tl_id, `Evaluation ${newStatus}`, `Escalation for evaluation ${evaluation_id} has been ${newStatus.toLowerCase()}. Reason: ${comment}`, evaluation_id);
      }

      res.json({ success: true });
    });

    app.post("/api/evaluations/:id/escalation-respond", (req, res) => {
      const { user_id, role, action, comment, old_score, new_score } = req.body;
      const evaluation_id = req.params.id;

      const evaluation = db.prepare("SELECT agent_id, final_score, qa_id FROM evaluations WHERE id = ?").get(evaluation_id) as any;
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });

      let newStatus = "";
      if (role === 'tl') {
        newStatus = action === 'approved' ? 'Sent to Agent' : 'Escalated';
      } else {
        newStatus = action === 'approved' ? 'Quality Approved' : 'Rejected by Quality';
      }

      db.prepare("UPDATE evaluations SET status = ? WHERE id = ?").run(newStatus, evaluation_id);
      db.prepare("INSERT INTO escalation_logs (evaluation_id, user_id, role, action, comment, old_score, new_score) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(evaluation_id, user_id, role, action, comment, old_score ?? evaluation.final_score, new_score ?? evaluation.final_score);

      res.json({ success: true });
    });

    // Form Settings APIs
    app.get("/api/settings/form", (req, res) => {
      const settings = db.prepare("SELECT * FROM form_settings ORDER BY field_type, sort_order ASC").all();
      res.json(settings);
    });

    app.post("/api/settings/form", (req, res) => {
      const { field_type, label_en, label_ar, value, is_active, sort_order, id } = req.body;
      if (id) {
        db.prepare("UPDATE form_settings SET field_type=?, label_en=?, label_ar=?, value=?, is_active=?, sort_order=? WHERE id=?")
          .run(field_type, label_en, label_ar, value, is_active ? 1 : 0, sort_order || 0, id);
      } else {
        db.prepare("INSERT INTO form_settings (field_type, label_en, label_ar, value, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)")
          .run(field_type, label_en, label_ar, value, is_active !== undefined ? (is_active ? 1 : 0) : 1, sort_order || 0);
      }
      res.json({ success: true });
    });

    app.delete("/api/settings/form/:id", (req, res) => {
      db.prepare("DELETE FROM form_settings WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    });

    // Audit Logs Query & Management API
    app.get("/api/audit-logs", (req, res) => {
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

        const countResult = db.prepare(`SELECT COUNT(*) as count ${baseQuery}`).get(...params) as { count: number };
        const totalItems = countResult.count;
        const totalPages = Math.ceil(totalItems / limit);

        const query = `
          SELECT * 
          ${baseQuery} 
          ORDER BY id DESC 
          LIMIT ? OFFSET ?
        `;
        
        const logs = db.prepare(query).all(...params, limit, offset);

        // Also get unique filters list for dropdown fields
        const usersList = db.prepare("SELECT DISTINCT user_name FROM audit_logs WHERE user_name IS NOT NULL AND user_name != 'Guest / System' ORDER BY user_name ASC").all().map((r: any) => r.user_name);
        const actionsList = db.prepare("SELECT DISTINCT action_type FROM audit_logs ORDER BY action_type ASC").all().map((r: any) => r.action_type);
        const sectionsList = db.prepare("SELECT DISTINCT section FROM audit_logs ORDER BY section ASC").all().map((r: any) => r.section);

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
    app.post("/api/audit-logs/clear", (req, res) => {
      try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
          return res.status(401).json({ error: "Unauthorized. Missing User ID header." });
        }
        const user = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as any;
        if (!user || user.role !== 'supervisor') {
          return res.status(403).json({ error: "Only Super Admin (Supervisor) can clear logs." });
        }

        db.prepare("DELETE FROM audit_logs").run();
        res.json({ success: true, message: "All audit logs successfully cleared." });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Delete single log entry (restrict to Supervisor)
    app.delete("/api/audit-logs/:id", (req, res) => {
      try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
          return res.status(401).json({ error: "Unauthorized. Missing User ID header." });
        }
        const user = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as any;
        if (!user || user.role !== 'supervisor') {
          return res.status(403).json({ error: "Only Super Admin (Supervisor) can delete a log entry." });
        }

        db.prepare("DELETE FROM audit_logs WHERE id = ?").run(req.params.id);
        res.json({ success: true, message: "Audit log entry deleted successfully." });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/notifications", (req, res) => {
      const user_id = req.query.user_id;
      if (!user_id) return res.status(400).json({ error: "user_id required" });
      const notifications = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(user_id);
      res.json(notifications);
    });

    app.post("/api/notifications/:id/read", (req, res) => {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    });

    app.post("/api/notifications/read-all", (req, res) => {
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: "user_id required" });
      db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(user_id);
      res.json({ success: true });
    });

    app.get("/api/escalations/history", (req, res) => {
      const history = db.prepare(`
        SELECT l.*, u.display_name as user_name, e.call_type, e.brand, e.date as evaluation_date
        FROM escalation_logs l
        JOIN users u ON l.user_id = u.id
        JOIN evaluations e ON l.evaluation_id = e.id
        ORDER BY l.created_at DESC
      `).all();
      res.json(history);
    });

    app.get("/api/evaluations/:id/escalation-history", (req, res) => {
      const history = db.prepare(`
        SELECT l.*, u.display_name as user_name
        FROM escalation_logs l
        JOIN users u ON l.user_id = u.id
        WHERE l.evaluation_id = ?
        ORDER BY l.created_at ASC
      `).all(req.params.id);
      res.json(history);
    });

    // Coaching
    app.get("/api/coaching", (req, res) => {
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

        const sessions = db.prepare(query + " ORDER BY c.created_at DESC").all(...params);
        res.json(sessions);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.post("/api/coaching", (req, res) => {
      try {
        const { agent_id, tl_id, weaknesses, notes, plan, evaluation_id } = req.body;
        const result = db.prepare("INSERT INTO coaching_sessions (agent_id, tl_id, weaknesses, notes, plan) VALUES (?, ?, ?, ?, ?)")
          .run(agent_id, tl_id, weaknesses, notes, plan);
        
        const coaching_id = result.lastInsertRowid;

        // Create notification for the agent
        db.prepare("INSERT INTO notifications (user_id, title, message, evaluation_id) VALUES (?, ?, ?, ?)")
          .run(agent_id, "New Coaching Session", `Your TL has scheduled a coaching session for you.`, evaluation_id || null);

        res.json({ success: true, id: coaching_id });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Stats & Analytics
    app.get("/api/stats/team", (req, res) => {
      const { role, id, department } = req.query;
      
      let agentsQuery = "SELECT id, display_name FROM users WHERE role = 'agent'";
      let evalsQuery = "SELECT * FROM evaluations";
      let coachingQuery = "SELECT * FROM coaching_sessions";
      
      const agents = db.prepare(agentsQuery).all() as any[];
      const evals = db.prepare(evalsQuery).all() as any[];
      const coaching = db.prepare(coachingQuery).all() as any[];
      
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
    app.get("/api/stats/lob", (req, res) => {
      try {
        const { department, from_date, to_date } = req.query;
        
        let agentsQuery = "SELECT id, display_name, department FROM users WHERE role = 'agent'";
        let evalsQuery = "SELECT e.*, a.department, a.display_name as agent_name FROM evaluations e JOIN users a ON e.agent_id = a.id WHERE 1=1";
        let params: any[] = [];

        if (department && department !== 'all') {
          agentsQuery += " AND department = ?";
          evalsQuery += " AND a.department = ?";
          params.push(department);
        }

        if (from_date) {
          evalsQuery += " AND e.date >= ?";
          params.push(from_date);
        }

        if (to_date) {
          evalsQuery += " AND e.date <= ?";
          params.push(to_date);
        }

        const agents = db.prepare(agentsQuery).all(...(department && department !== 'all' ? [department] : [])) as any[];
        const evals = db.prepare(evalsQuery).all(...params) as any[];

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
        const questions = db.prepare("SELECT value, label_en FROM form_settings WHERE field_type = 'eval_question'").all() as any[];
        const questionMap: { [key: string]: string } = {};
        questions.forEach(q => {
          // The ID in responses might be the setting id, let's map by the JSON value or some identifier if possible
          // Actually EvaluationForm uses q.id.toString() as item.id
        });
        
        // Better way: get all active questions with their IDs
        const qSettings = db.prepare("SELECT id, label_en FROM form_settings WHERE field_type = 'eval_question'").all() as any[];
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
    app.get("/api/stats/drop-point", (req, res) => {
      try {
        const today = new Date().toISOString().split('T')[0];
        
        // Get all evaluations for today
        const evals = db.prepare(`
          SELECT e.*, a.display_name as agent_name 
          FROM evaluations e
          JOIN users a ON e.agent_id = a.id
          WHERE e.date = ?
        `).all(today) as any[];

        // Get all evaluation questions for mapping
        const qSettings = db.prepare("SELECT id, label_en FROM form_settings WHERE field_type = 'eval_question'").all() as any[];
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
    app.get("/api/stats/dashboard", (req, res) => {
      try {
        const { user_id, role } = req.query;
        
        let evalsQuery = "SELECT * FROM evaluations";
        let agentsQuery = "SELECT id, display_name FROM users WHERE role = 'agent'";
        let params: any[] = [];
        
        if (role === 'agent') {
          evalsQuery = "SELECT * FROM evaluations WHERE agent_id = ?";
          params.push(user_id);
        } else if (role === 'tl') {
          evalsQuery = "SELECT e.* FROM evaluations e JOIN users a ON e.agent_id = a.id WHERE a.tl_id = ?";
          params.push(user_id);
        }

        const evals = db.prepare(evalsQuery).all(...params) as any[];
        const agents = db.prepare(agentsQuery).all() as any[];
        
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
          const qSettings = db.prepare("SELECT id, label_en FROM form_settings WHERE field_type = 'eval_question'").all() as any[];
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

    // Advanced Quality Analysis Endpoint / Multi-dimensional metrics
    app.get("/api/stats/analysis", (req, res) => {
      try {
        const { start_date, end_date, brand, call_type, agent_id, qa_id, status } = req.query;

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

        const evals = db.prepare(query).all(...params) as any[];

        // Fetch question dictionary for criteria breakdown
        const formConfigQuestions = db.prepare("SELECT * FROM form_config").all() as any[];
        const formSettingsQuestions = db.prepare("SELECT * FROM form_settings WHERE field_type = 'eval_question'").all() as any[];

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
        const uniqueBrandsList = db.prepare("SELECT DISTINCT brand FROM evaluations WHERE brand IS NOT NULL AND brand != ''").all().map((r: any) => r.brand);
        const uniqueTypesList = db.prepare("SELECT DISTINCT call_type FROM evaluations WHERE call_type IS NOT NULL AND call_type != ''").all().map((r: any) => r.call_type);
        const uniqueAgentsList = db.prepare("SELECT id, display_name FROM users WHERE role = 'agent'").all() as any[];
        const uniqueQAsList = db.prepare("SELECT id, display_name FROM users WHERE role = 'qa'").all() as any[];

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

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
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
